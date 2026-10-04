import { cacheGet, cacheSet } from "./cache.ts";
import { config } from "./config.ts";
import { docsGet, fileModifiedTime, sheetsBatchGet } from "./google.ts";
import type { DocKey, SheetLookup, TurnContextRequest } from "./types.ts";

function findControl(values: unknown[][], key: string): unknown {
  return values.find((row) => String(row[0] ?? "") === key)?.[1] ?? null;
}

function rowsToObjects(values: unknown[][]): Array<Record<string, unknown>> {
  if (!values.length) return [];
  const headers = values[0].map((v) => String(v ?? ""));
  return values.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? null])));
}

function resourceMap(values: unknown[][]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of values.slice(1)) if (row[2]) out[String(row[2])] = row[3] ?? null;
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
    const rows = (await sheetsBatchGet(spreadsheetId, [`${lookup.sheet}!${lookup.range}`]))[`${lookup.sheet}!${lookup.range}`] ?? [];
    return { rows: matchingRows(rows, lookup.query), revision: null, cache: "MISS" };
  }

  const revision = await fileModifiedTime(spreadsheetId);
  const a1 = `${lookup.sheet}!${lookup.range}`;
  const key = ["sheet", "GM_PREGEN", revision ?? "none", a1] as const;
  const cached = await cacheGet<{ rows: unknown[][] }>(key);
  if (cached) return { rows: matchingRows(cached.rows, lookup.query), revision, cache: "HIT" };
  const rows = (await sheetsBatchGet(spreadsheetId, [a1]))[a1] ?? [];
  await cacheSet(key, { rows });
  return { rows: matchingRows(rows, lookup.query), revision, cache: "MISS" };
}

export async function getTurnContext(input: TurnContextRequest) {
  const started = performance.now();
  const tags = input.tags ?? [];
  const actorIds = input.actorIds ?? [];
  const lookups = input.lookups ?? [];
  const docQueries = input.docQueries ?? [];
  const needsCompetences = input.turnClass !== "MICRO" || tags.some((t) => ["WORK", "LANGUAGE", "SKILL", "COMBAT", "MAGIC", "CRAFT", "SURVIVAL"].includes(t.toUpperCase()));

  const baseRanges = [
    "CONTROL!A1:D12",
    "PLAYER_RESOURCES!A1:D20",
    "PLAYER_CONDITIONS!A1:F12",
    "ACTIVE_CONTEXT!A1:H15",
    ...(needsCompetences ? ["COMPETENCES!A1:H25"] : []),
  ];

  const npcNeeded = actorIds.length > 0;
  const uniqueDocKeys = Array.from(new Set([
    ...(npcNeeded ? ["LIVE_NPCS_KNOWLEDGE_SOCIAL" as DocKey] : []),
    ...docQueries.map((q) => q.documentKey),
  ]));

  const [base, lookupResults, docs] = await Promise.all([
    sheetsBatchGet(config.files.TEMP_RUNTIME, baseRanges),
    Promise.all(lookups.map(cachedLookup)),
    Promise.all(uniqueDocKeys.map(async (key) => [key, await cachedDoc(key)] as const)),
  ]);

  const control = base["CONTROL!A1:D12"] ?? [];
  const docMap = new Map(docs);
  const actors: Record<string, string | null> = {};
  const npcText = docMap.get("LIVE_NPCS_KNOWLEDGE_SOCIAL")?.text ?? "";
  for (const id of actorIds) actors[id] = npcText.split(/\r?\n/).find((line) => line.includes(id)) ?? null;

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

  return {
    turnId: input.turnId,
    elapsedMs: Math.round(performance.now() - started),
    packet: {
      saveId: String(findControl(control, "save_id") ?? ""),
      worldDay: findControl(control, "world_day"),
      worldTime: findControl(control, "world_time"),
      locationId: findControl(control, "current_location_id"),
      locationDisplay: findControl(control, "current_location_display"),
      sceneId: findControl(control, "current_scene_id"),
      resources: resourceMap(base["PLAYER_RESOURCES!A1:D20"] ?? []),
      conditions: rowsToObjects(base["PLAYER_CONDITIONS!A1:F12"] ?? []),
      competences: needsCompetences ? rowsToObjects(base["COMPETENCES!A1:H25"] ?? []) : [],
      actors,
      lookups: lookups.map((lookup, i) => ({ ...lookup, ...lookupResults[i] })),
      docs: queriedDocs,
      readPlan: [
        "TEMP:CONTROL+RESOURCES+CONDITIONS+ACTIVE_CONTEXT",
        ...(needsCompetences ? ["TEMP:COMPETENCES"] : []),
        ...(npcNeeded ? ["DOC:LIVE_NPCS_KNOWLEDGE_SOCIAL(exact ids)"] : []),
        ...lookups.map((l) => `${l.source}:${l.sheet}`),
        ...docQueries.map((d) => `DOC:${d.documentKey}`),
      ],
    },
  };
}
