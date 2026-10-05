import { cacheGet, cacheSet } from "./cache.ts";
import { config } from "./config.ts";
import { docsGet, fileModifiedTime, sheetsBatchGet } from "./google.ts";
import { PREGEN_TABLES, TABLES } from "./schema.ts";
import { RULESET_VERSION } from "./rules.ts";
import { survivalBand } from "./survival.ts";
import { makeTurnToken } from "./turn_token.ts";
import { parseTarenLexicon, proposeTarenLexeme } from "./taren.ts";
import type { DocKey, SheetLookup, TurnContextRequest } from "./types.ts";

function findControl(values: unknown[][], key: string): unknown {
  return values.find((row) => String(row[0] ?? "") === key)?.[1] ?? null;
}

function rowsToObjects(values: unknown[][]): Array<Record<string, unknown>> {
  if (!values.length) return [];
  const headers = values[0].map((v) => String(v ?? ""));
  return values.slice(1)
    .filter((row) => row.some((v) => String(v ?? "") !== ""))
    .map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? null])));
}

function resourceMap(values: unknown[][]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of values.slice(1)) if (row[2]) out[String(row[2])] = row[3] ?? null;
  return out;
}

// Read maxima and XP thresholds from the same authoritative rows as current values.
// Missing or non-numeric cells stay unknown; never infer a cap from Current.
export function resourceDetailsMap(values: unknown[][]): Record<string, { current: number | null; max?: number | null; threshold?: number | null }> {
  const out: Record<string, { current: number | null; max?: number | null; threshold?: number | null }> = {};
  const numberOrNull = (value: unknown): number | null => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    if (typeof value === "string" && !value.trim()) return null;
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  };
  for (const row of rowsToObjects(values)) {
    const name = String(row["Resource"] ?? "").trim();
    if (!name) continue;
    const current = numberOrNull(row["Current"]);
    const cap = numberOrNull(row["Max/Threshold"]);
    out[name] = name === "General XP" ? { current, threshold: cap } : { current, max: cap };
  }
  return out;
}

function matchingRows(rows: unknown[][], query?: string): unknown[][] {
  if (!query || !rows.length) return rows;
  const q = query.toLocaleLowerCase();
  return [rows[0], ...rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").toLocaleLowerCase().includes(q)))];
}

async function cachedDoc(key: DocKey): Promise<{ text: string; revision: string | null; cache: "HIT" | "MISS" }> {
  const fileId = config.files[key];
  const revision = await fileModifiedTime(fileId);
  const cacheKey = ["doc", key, revision ?? "none"] as const;
  const cached = await cacheGet<{ text: string }>(cacheKey);
  if (cached) return { text: cached.text, revision, cache: "HIT" };
  const doc = await docsGet(fileId);
  await cacheSet(cacheKey, { text: doc.text });
  return { text: doc.text, revision, cache: "MISS" };
}

async function cachedLookup(lookup: SheetLookup): Promise<{ rows: unknown[][]; revision: string | null; cache: "HIT" | "MISS" }> {
  const spreadsheetId = lookup.source === "GM_PREGEN" ? config.files.GM_PREGEN : config.files.TEMP_RUNTIME;
  if (lookup.source === "TEMP_RUNTIME") {
    const a1 = `${lookup.sheet}!${lookup.range}`;
    const rows = (await sheetsBatchGet(spreadsheetId, [a1]))[a1] ?? [];
    return { rows: matchingRows(rows, lookup.query), revision: null, cache: "MISS" };
  }
  const a1 = `${lookup.sheet}!${lookup.range}`;
  const result = await cachedPregen(a1);
  return { rows: matchingRows(result.rows, lookup.query), revision: result.revision, cache: result.cache };
}

async function cachedPregen(a1: string): Promise<{ rows: unknown[][]; revision: string | null; cache: "HIT" | "MISS" }> {
  const revision = await fileModifiedTime(config.files.GM_PREGEN);
  const key = ["sheet", "GM_PREGEN", revision ?? "none", a1] as const;
  const cached = await cacheGet<{ rows: unknown[][] }>(key);
  if (cached) return { rows: cached.rows, revision, cache: "HIT" };
  const rows = (await sheetsBatchGet(config.files.GM_PREGEN, [a1]))[a1] ?? [];
  await cacheSet(key, { rows });
  return { rows, revision, cache: "MISS" };
}

function hasAny(tags: Set<string>, wanted: string[]): boolean {
  return wanted.some((x) => tags.has(x));
}

function relevantCompetenceIds(tags: Set<string>): Set<string> | null {
  const ids = new Set<string>();
  if (hasAny(tags, ["LANGUAGE", "SOCIAL", "SERVICES", "ECONOMY"])) ids.add("competence.society.communication");
  if (hasAny(tags, ["RESEARCH", "STUDY", "READ", "WRITE"])) ids.add("competence.knowledge.research");
  if (hasAny(tags, ["COMBAT", "WEAPON", "ARCHERY"])) ids.add("competence.combat.melee");
  if (hasAny(tags, ["CRAFT", "BUILD", "REPAIR", "COOK"])) ids.add("competence.crafting.practical_creation");
  if (hasAny(tags, ["SURVIVAL", "TRAVEL", "HUNT", "TRACK"])) ids.add("competence.survival.general");
  if (hasAny(tags, ["MAGIC", "MANA"])) ids.add("competence.magic.perception");
  if (hasAny(tags, ["BODY", "PHYSICAL", "TRAVEL"])) ids.add("competence.body.physical_conditioning");
  if (tags.has("SKILL") && ids.size === 0) return null;
  return ids.size ? ids : null;
}

function compactPregenRecords(key: string, records: Array<Record<string, unknown>>): unknown {
  if (key === "languageMeta") {
    return Object.fromEntries(records.map((r) => [String(r["Key"] ?? ""), r["Value"] ?? null]).filter(([k]) => k));
  }
  if (key === "languageGrammar") {
    return records.filter((r) => String(r["Status"] ?? "") === "ACTIVE").map((r) => ({
      id: r["Grammar ID"],
      category: r["Category"],
      form: r["Form/pattern"],
      meaning: r["Meaning/function"],
      position: r["Position"],
      productive: r["Productive"],
      playerKnown: r["Player-known by T0275"],
      register: r["Register"],
    }));
  }
  if (key === "languageDerivation") {
    return records.filter((r) => String(r["Status"] ?? "") === "ACTIVE").map((r) => ({
      id: r["Rule ID"],
      type: r["Type"],
      input: r["Input"],
      output: r["Output pattern"],
      meaning: r["Meaning"],
      productivity: r["Productivity"],
      repair: r["Phonological repair"],
      collision: r["Collision policy"],
    }));
  }
  if (key === "serviceDirectory") {
    return records.map((r) => ({
      id: r["Service ID"],
      location: r["Location"],
      provider: r["Provider class"],
      service: r["Service"],
      price: r["Price model"],
      duration: r["Typical duration"],
      availability: r["Availability rule"],
      requirements: r["Requirements"],
      risk: r["Risk"],
      tags: r["Tags"],
    }));
  }
  if (key === "districtPacks") {
    return records.map((r) => ({
      packId: r["Pack ID"],
      location: r["Location ID"],
      status: r["Materialization state"] ?? r["Status"],
      institutions: r["Institutions/services"] ?? r["Institutions"],
      economy: r["Economy anchors"],
      notes: r["Notes"],
    }));
  }
  return records;
}

function filterByLocation(records: Array<Record<string, unknown>>, locationId: string): Array<Record<string, unknown>> {
  if (!locationId) return records;
  const locationHeaders = ["Location", "Location/start", "District/location", "Current/last-known location", "Location / anchor"];
  return records.filter((r) =>
    locationHeaders.some((h) => String(r[h] ?? "").includes(locationId)) ||
    !locationHeaders.some((h) => h in r)
  );
}

export async function getTurnContext(input: TurnContextRequest) {
  const started = performance.now();
  const tagSet = new Set((input.tags ?? []).map((t) => t.toUpperCase()));
  const actorIds = input.actorIds ?? [];
  const lookups = input.lookups ?? [];
  const docQueries = input.docQueries ?? [];

  const needsCompetences = input.turnClass !== "MICRO" || hasAny(tagSet, ["WORK", "LANGUAGE", "SKILL", "COMBAT", "MAGIC", "CRAFT", "SURVIVAL", "STUDY"]);
  const runtimeRanges = new Set<string>([
    "CONTROL!A1:D12",
    "PLAYER_RESOURCES!A1:E20",
    "PLAYER_CONDITIONS!A1:F100",
    ...(needsCompetences ? [TABLES.COMPETENCES.range] : []),
  ]);

  const structuredNames: Array<keyof typeof TABLES> = [];
  const addStructured = (name: keyof typeof TABLES) => {
    runtimeRanges.add(TABLES[name].range);
    if (!structuredNames.includes(name)) structuredNames.push(name);
  };

  if (hasAny(tagSet, ["SKILL", "WORK", "LANGUAGE", "COMBAT", "MAGIC", "CRAFT", "SURVIVAL", "STUDY"])) {
    addStructured("SPECIALIZATIONS");
    addStructured("MILESTONES");
    addStructured("PENDING_CHOICES");
  }
  if (hasAny(tagSet, ["ITEM", "PURCHASE", "COMBAT", "CRAFT", "SURVIVAL", "STORAGE", "EQUIPMENT"])) addStructured("INVENTORY_CURRENT");
  if (hasAny(tagSet, ["SERVICES", "SOCIAL", "ECONOMY", "LANGUAGE", "WORK"])) {
    addStructured("SERVICES_CURRENT");
    addStructured("OPPORTUNITIES_CURRENT");
  }
  if (hasAny(tagSet, ["PROJECT", "CRAFT", "STUDY", "LANGUAGE"])) addStructured("PROJECTS_CURRENT");
  if (actorIds.length || hasAny(tagSet, ["NPC", "SOCIAL", "SERVICES"])) addStructured("NPC_CURRENT");
  if (actorIds.length) addStructured("NPC_KNOWLEDGE");
  if (hasAny(tagSet, ["LANGUAGE", "READ", "WRITE", "STUDY"])) {
    addStructured("PLAYER_LANGUAGE");
    addStructured("PLAYER_LEXICON");
    addStructured("PLAYER_GRAMMAR");
  }
  if (hasAny(tagSet, ["TRAVEL", "MAP", "EXPLORATION"])) addStructured("MAP_KNOWLEDGE_CURRENT");
  if (hasAny(tagSet, ["COMBAT", "INJURY", "POISON", "MEDICINE"])) addStructured("BODY_INJURIES_CURRENT");
  if (hasAny(tagSet, ["PHYSICAL", "BODY", "COMBAT", "INJURY", "POISON", "REST", "TRAVEL", "WORK", "SURVIVAL"])) addStructured("CHARACTERISTICS");
  if (hasAny(tagSet, ["WORLD", "CLOCK", "WAIT", "REST", "TRAVEL", "WORK", "STUDY", "CRAFT"])) addStructured("WORLD_CLOCKS");
  if (hasAny(tagSet, ["WEATHER", "TRAVEL", "EXPLORATION", "SURVIVAL"])) addStructured("WEATHER_CURRENT");

  const pregenRequests: Array<{ key: string; range: string }> = [];
  if (hasAny(tagSet, ["SERVICES", "SOCIAL", "ECONOMY", "LANGUAGE", "WORK"])) {
    pregenRequests.push({ key: "districtPacks", range: PREGEN_TABLES.DISTRICT_PACKS });
    pregenRequests.push({ key: "serviceDirectory", range: PREGEN_TABLES.SERVICE_DIRECTORY });
  }
  if (hasAny(tagSet, ["LANGUAGE", "READ", "WRITE", "STUDY"]) || input.includeWorldLanguage || (input.languageConcepts?.length ?? 0) > 0) {
    pregenRequests.push({ key: "languageMeta", range: PREGEN_TABLES.TAREN_LANGUAGE_META });
    pregenRequests.push({ key: "languageGrammar", range: PREGEN_TABLES.TAREN_GRAMMAR });
    pregenRequests.push({ key: "languageDerivation", range: PREGEN_TABLES.TAREN_DERIVATION });
    if (input.includeWorldLanguage || (input.languageConcepts?.length ?? 0) > 0) {
      pregenRequests.push({ key: "languageLexicon", range: PREGEN_TABLES.TAREN_LEXICON });
    }
  }

  const uniqueDocKeys = Array.from(new Set(docQueries.map((q) => q.documentKey)));

  const [base, lookupResults, docs, pregens] = await Promise.all([
    sheetsBatchGet(config.files.TEMP_RUNTIME, [...runtimeRanges]),
    Promise.all(lookups.map(cachedLookup)),
    Promise.all(uniqueDocKeys.map(async (key) => [key, await cachedDoc(key)] as const)),
    Promise.all(pregenRequests.map(async (p) => ({ ...p, ...(await cachedPregen(p.range)) }))),
  ]);

  const control = base["CONTROL!A1:D12"] ?? [];
  const saveId = String(findControl(control, "save_id") ?? "");
  const worldDay = findControl(control, "world_day");
  const worldTime = findControl(control, "world_time");
  const locationId = String(findControl(control, "current_location_id") ?? "");
  const locationDisplay = findControl(control, "current_location_display");
  const sceneId = findControl(control, "current_scene_id");
  const turnToken = makeTurnToken({ saveId, worldDay, worldTime, locationId, sceneId });

  const structured: Record<string, unknown> = {};
  for (const name of structuredNames) {
    let records = rowsToObjects(base[TABLES[name].range] ?? []);
    if (["SERVICES_CURRENT", "OPPORTUNITIES_CURRENT", "NPC_CURRENT", "MAP_KNOWLEDGE_CURRENT"].includes(name)) {
      records = filterByLocation(records, locationId);
    }
    if (name === "WORLD_CLOCKS") records = records.filter((r) => String(r["State"] ?? "").toUpperCase().includes("ACTIVE"));
    if (name === "SPECIALIZATIONS" || name === "MILESTONES") {
      const relevant = relevantCompetenceIds(tagSet);
      if (relevant) {
        const field = name === "SPECIALIZATIONS" ? "Competence ID" : "Parent competence";
        records = records.filter((r) => relevant.has(String(r[field] ?? "")));
      }
    }
    if (name === "PROJECTS_CURRENT") {
      records = records.filter((r) => {
        const tags = String(r["Tags"] ?? "").toUpperCase().split(/[;,]/).map((x) => x.trim()).filter(Boolean);
        const state = String(r["Current state"] ?? "").toUpperCase();
        return !state.startsWith("COMPLETED") || tags.some((t) => tagSet.has(t));
      });
    }
    if (name === "NPC_CURRENT" && actorIds.length) records = records.filter((r) => actorIds.includes(String(r["NPC ID"] ?? "")));
    if (name === "NPC_KNOWLEDGE" && actorIds.length) records = records.filter((r) => actorIds.includes(String(r["NPC ID"] ?? "")));
    structured[name] = records;
  }

  const pregen: Record<string, unknown> = {};
  let languageLexiconRows: unknown[][] = [];
  for (const p of pregens) {
    let records = rowsToObjects(p.rows);
    if (p.key === "districtPacks" || p.key === "serviceDirectory") records = filterByLocation(records, locationId);
    if (p.key === "languageLexicon") languageLexiconRows = p.rows;
    if (p.key !== "languageLexicon" || input.includeWorldLanguage) {
      pregen[p.key] = { data: compactPregenRecords(p.key, records), revision: p.revision, cache: p.cache };
    }
  }

  const languageConcepts = (input.languageConcepts ?? []).map((q) => q.trim()).filter(Boolean);
  let languageLookup: unknown[] = [];
  if (languageConcepts.length && languageLexiconRows.length) {
    const lexicon = parseTarenLexicon(languageLexiconRows);
    const playerLexicon =
      (structured.PLAYER_LEXICON as Array<Record<string, unknown>> | undefined) ?? [];
    const knownByForm = new Map(
      playerLexicon.map((r) => [String(r["Form"] ?? "").normalize("NFC"), r]),
    );
    languageLookup = languageConcepts.map((concept) => {
      const proposal = proposeTarenLexeme(lexicon, concept);
      const known = knownByForm.get(proposal.lexeme.form.normalize("NFC"));
      return {
        concept,
        ...proposal,
        lexeme: {
          ...proposal.lexeme,
          playerKnown: Boolean(known),
          playerKnownMeaning: known?.["Known meaning"] ?? null,
          playerConfidence: known?.["Confidence"] ?? null,
        },
      };
    });
  }

  const actorCurrent = (structured.NPC_CURRENT as Array<Record<string, unknown>> | undefined) ?? [];
  const actorKnowledge = (structured.NPC_KNOWLEDGE as Array<Record<string, unknown>> | undefined) ?? [];
  const actors: Record<string, unknown> = {};
  for (const id of actorIds) {
    actors[id] = {
      current: actorCurrent.find((r) => String(r["NPC ID"] ?? "") === id) ?? null,
      knowledge: actorKnowledge.filter((r) => String(r["NPC ID"] ?? "") === id),
    };
  }

  const docMap = new Map(docs);
  const queriedDocs = docQueries.map((q) => {
    const doc = docMap.get(q.documentKey)!;
    const needle = q.query.toLocaleLowerCase();
    return {
      documentKey: q.documentKey,
      query: q.query,
      matches: doc.text.split(/\r?\n/).filter((line) => line.toLocaleLowerCase().includes(needle)).slice(0, q.maxMatches ?? 5),
      revision: doc.revision,
      cache: doc.cache,
    };
  });

  const resources = resourceMap(base["PLAYER_RESOURCES!A1:E20"] ?? []);
  const resourceDetails = resourceDetailsMap(base["PLAYER_RESOURCES!A1:E20"] ?? []);
  const satiety = Number((resourceDetails["Satiety"] as any)?.current ?? 0);
  const hydration = Number((resourceDetails["Hydration"] as any)?.current ?? 0);

  return {
    turnId: input.turnId,
    elapsedMs: Math.round(performance.now() - started),
    packet: {
      saveId,
      turnToken,
      rulesetVersion: RULESET_VERSION,
      worldDay,
      worldTime,
      locationId,
      locationDisplay,
      sceneId,
      resources,
      resourceDetails,
      survival: {
        satiety: { current: satiety, max: Number((resourceDetails["Satiety"] as any)?.max ?? 100), band: survivalBand(satiety) },
        hydration: { current: hydration, max: Number((resourceDetails["Hydration"] as any)?.max ?? 100), band: survivalBand(hydration) },
      },
      conditions: rowsToObjects(base["PLAYER_CONDITIONS!A1:F100"] ?? []),
      competences: needsCompetences ? rowsToObjects(base[TABLES.COMPETENCES.range] ?? []) : [],
      structured,
      pregen,
      languageLookup,
      actors,
      lookups: lookups.map((lookup, i) => ({ ...lookup, ...lookupResults[i] })),
      docs: queriedDocs,
      readPlan: [
        "TEMP:CORE",
        ...(needsCompetences ? ["TEMP:COMPETENCES"] : []),
        ...structuredNames.map((n) => `TEMP:${n}`),
        ...pregenRequests.map((p) => `GM_PREGEN:${p.key}`),
        ...lookups.map((l) => `${l.source}:${l.sheet}`),
        ...docQueries.map((d) => `DOC:${d.documentKey}`),
      ],
    },
  };
}
