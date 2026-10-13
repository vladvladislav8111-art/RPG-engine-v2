import { cacheGet, cacheSet } from "./cache.ts";
import { loadBoundedActorTables, loadBoundedArchiveRows, scanActorContextIndex } from "./bounded_context.ts";
import { config } from "./config.ts";
import { docsGet, fileModifiedTime, sheetsBatchGet } from "./google.ts";
import { PREGEN_TABLES, TABLES } from "./schema.ts";
import { RULESET_VERSION } from "./rules.ts";
import { survivalBand } from "./survival.ts";
import { makeTurnToken } from "./turn_token.ts";
import { buildSelarinLocalContext } from "./local_context.ts";
import { CONTINUITY_SPARSE_RANGES, continuityFromSparseRanges, worldClocksFromSparseRanges } from "./world_continuity.ts";
import { buildWorldActionDocket } from "./world_scheduler.ts";
import { ACHIEVEMENT_CATALOG_COUNTS } from "./world_sim_v3/achievement_catalog.ts";
import { resolveSceneActorIds } from "./scene_routing.ts";
import { buildNpcBehavioralContext } from "./npc_behavior.ts";
import { buildTurnBrief, contactActorIdsForRequest } from "./turn_dispatcher.ts";
import { buildTurnTriage } from "./turn_triage.ts";
import { planNpcInitiativeV4 } from "./npc_initiative_v4.ts";
import { reviewNpcRoutineCadence } from "./npc_cadence_review.ts";
import { shouldLoadSceneActors, sourceReadBudgetNotice } from "./context_hotpath_budget.ts";
import { buildSystemNotificationCenter } from "./system_notification_center.ts";
import { projectNpcHeatContextShadow } from "./npc_heat_context_adapter.ts";
import { planNpcHeatJournalWindow } from "./npc_heat_journal_audit.ts";
import { auditNpcHeatJournalIncludingTestV2 } from "./npc_heat_v2_reader.ts";
import { chooseMemoryRoute } from "./context_memory_router.ts";
import { planIndependentWorldTick } from "./world_tick_dispatcher.ts";
import { buildNpcAutonomyPlan } from "./npc_autonomy_planner.ts";
import { bridgeTurnIntegrationPlan } from "./bridge_integration.ts";
import { actorSnapshotFreshness, evaluateNpcContextGate, filterByParticipants, filterRelationships, recentActorChat, recordsContainingActorId, resolveActorRefs, selectNpcCurrentRows } from "./social_context.ts";
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

function numberOrNull(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function storageCapacityL(records: Array<Record<string, unknown>>): number | null {
  const active = records.find((r) =>
    String(r["Module ID"] ?? "") === "system.storage.unlock_500l" &&
    String(r["Status"] ?? "").toUpperCase().includes("ACTIVE")
  );
  if (!active) return null;
  const cfg = String(active["Current configuration"] ?? "");
  const liters = cfg.match(/capacity\s*([0-9]+(?:[.,][0-9]+)?)\s*L/i);
  if (liters) return Number(liters[1].replace(",", "."));
  const cubic = cfg.match(/capacity\s*([0-9]+(?:[.,][0-9]+)?)\s*m(?:³|3)/i);
  if (cubic) return Number(cubic[1].replace(",", ".")) * 1000;
  return null;
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

async function cachedPregenBatch(
  requests: Array<{ key: string; range: string }>,
): Promise<Array<{ key: string; range: string; rows: unknown[][]; revision: string | null; cache: "HIT" | "MISS" }>> {
  if (!requests.length) return [];
  const revision = await fileModifiedTime(config.files.GM_PREGEN);
  const uniqueRanges = [...new Set(requests.map((r) => r.range))];
  const cachedEntries = await Promise.all(uniqueRanges.map(async (range) => {
    const cacheKey = ["sheet", "GM_PREGEN", revision ?? "none", range] as const;
    const cached = await cacheGet<{ rows: unknown[][] }>(cacheKey);
    return { range, cacheKey, cached };
  }));
  const misses = cachedEntries.filter((entry) => !entry.cached).map((entry) => entry.range);
  const fresh = misses.length
    ? await sheetsBatchGet(config.files.GM_PREGEN, misses)
    : {};
  const resolved = new Map<string, { rows: unknown[][]; cache: "HIT" | "MISS" }>();
  await Promise.all(cachedEntries.map(async (entry) => {
    if (entry.cached) {
      resolved.set(entry.range, { rows: entry.cached.rows, cache: "HIT" });
      return;
    }
    const rows = fresh[entry.range] ?? [];
    await cacheSet(entry.cacheKey, { rows });
    resolved.set(entry.range, { rows, cache: "MISS" });
  }));
  return requests.map((request) => ({
    ...request,
    rows: resolved.get(request.range)?.rows ?? [],
    revision,
    cache: resolved.get(request.range)?.cache ?? "MISS",
  }));
}

function hasAny(tags: Set<string>, wanted: string[]): boolean {
  return wanted.some((x) => tags.has(x));
}

function relevantCompetenceIds(tags: Set<string>): Set<string> | null {
  const ids = new Set<string>();
  if (hasAny(tags, ["LANGUAGE", "SOCIAL", "SERVICES", "ECONOMY"])) ids.add("competence.society.communication");
  if (hasAny(tags, ["RESEARCH", "STUDY", "READ", "WRITE", "DRAFT", "ENGINEERING"])) ids.add("competence.knowledge.research");
  if (hasAny(tags, ["ART", "DRAW", "ILLUSTRATION"])) ids.add("competence.art.visual_expression");
  if (hasAny(tags, ["DRAFT", "ENGINEERING", "BLUEPRINT", "BOWYER"])) ids.add("competence.engineering.design");
  if (hasAny(tags, ["COMBAT", "WEAPON", "ARCHERY"])) ids.add("competence.combat.melee");
  if (hasAny(tags, ["CRAFT", "BUILD", "REPAIR", "COOK", "BOWYER", "BOWMAKING"])) ids.add("competence.crafting.practical_creation");
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
  if (key === "commonObjectTemplates") {
    return records.map((r) => ({
      templateId: r["Template ID"],
      category: r["Category"],
      item: r["Item"],
      unit: r["Unit"],
      massKg: numberOrNull(r["Mass kg"]),
      occupiedVolumeL: numberOrNull(r["Occupied volume L"]),
      capacityL: numberOrNull(r["Capacity L"]),
      longAwkward: r["Long/Awkward"],
      consumable: r["Consumable"],
      durability: r["Durability class"],
      instantiationRule: r["Instantiation rule"],
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
  // The current scene actors are derived routing hints, bounded to the latest
  // authoritative CONTROL scene/location. The cache cannot override the save.
  const sceneRouting = await sheetsBatchGet(config.files.TEMP_RUNTIME, [
    "CONTROL!A1:D12", "ACTIVE_CONTEXT!A1:F15", "SYSTEM_CONTACTS_CURRENT!A1:J200",
  ]);
  const routingControlRows = sceneRouting["CONTROL!A1:D12"] ?? [];
  const routedSceneActorIds = resolveSceneActorIds(
    routingControlRows, sceneRouting["ACTIVE_CONTEXT!A1:F15"] ?? [],
  );
  const routeSaveId = String(findControl(routingControlRows, "save_id") ?? "");
  const tagSet = new Set((input.tags ?? []).map((t) => t.toUpperCase()));
  const wantsSystemInbox = ["SYSTEM_INBOX", "INBOX", "NOTIFICATIONS", "ALERTS"].some(t => tagSet.has(t));
  const sourceContacts = rowsToObjects(sceneRouting["SYSTEM_CONTACTS_CURRENT!A1:J200"] ?? []);
  const sceneLoadPolicy = shouldLoadSceneActors({
    turnClass: input.turnClass, tags: input.tags ?? [],
    explicitActorIds: input.actorIds, actorRefs: input.actorRefs,
    requireNpcContextGate: input.requireNpcContextGate,
  });
  const sceneActorsForContext = sceneLoadPolicy.loadSceneActors ? routedSceneActorIds : [];
  const contactRoutingTags = wantsSystemInbox ? [...(input.tags ?? []), "CONTACTS"] : input.tags ?? [];
  const requestedActorIds = [...new Set([
    ...(input.actorIds ?? []), ...sceneActorsForContext,
    ...contactActorIdsForRequest(contactRoutingTags, sourceContacts),
  ])];
  const actorRefs = input.actorRefs ?? [];
  const memoryRoute = chooseMemoryRoute({turnClass:input.turnClass,tags:input.tags??[],
    actorIds:requestedActorIds,actorRefs,
    docQueriesCount:input.docQueries?.length??0,lookupsCount:input.lookups?.length??0});
  const explicitActorRequest = requestedActorIds.length > 0 || actorRefs.length > 0;
  const requireNpcContextGate = input.requireNpcContextGate ?? explicitActorRequest;
  const recentChatLimit = Math.max(0, Math.min(20, Math.floor(input.recentChatLimit ?? 8)));
  const lookups = input.lookups ?? [];
  const docQueries = input.docQueries ?? [];
  const needsInventory = hasAny(tagSet, ["ITEM", "INVENTORY", "PURCHASE", "SALE", "CONSUME", "COMBAT", "CRAFT", "SURVIVAL", "STORAGE", "EQUIPMENT"]);
  const needsLocalWorldContext = hasAny(tagSet, [
    "SERVICES", "SOCIAL", "ECONOMY", "WORK", "JOB", "BOARD", "TRAVEL", "MAP", "EXPLORATION",
    "LAW", "WEAPON", "MAGIC", "RELIGION", "TEMPLE", "FOOD", "MEAL", "EAT", "SHOP", "LODGING",
    "REST", "SLEEP", "COURIER", "MESSAGE", "BATH", "HYGIENE", "FACTION", "POLITICS", "AREA_PREP",
    "GUILD", "CRAFT", "NPC", "DIVINE", "GOD", "PRAYER", "EIRAN", "VEIRA", "SEREN", "SELVARA",
    "NERETH", "LORVEN", "KHARAD", "ULMAR", "SCENE", "AMBIENT", "RUMOR", "REPUTATION", "CRIME",
    "THREAT", "OBSERVE", "LOOK",
  ]);

  const needsCompetences = input.turnClass !== "MICRO" || hasAny(tagSet, ["WORK", "LANGUAGE", "SKILL", "COMBAT", "MAGIC", "CRAFT", "SURVIVAL", "STUDY", "ART", "DRAW", "DRAFT", "ENGINEERING", "BOWYER"]);
  const runtimeRanges = new Set<string>([
    "CONTROL!A1:D12",
    "PLAYER_RESOURCES!A1:E20",
    "PLAYER_CONDITIONS!A1:F100",
    ...(needsCompetences ? [TABLES.COMPETENCES.range] : []),
  ]);

  const boundedActorNames = new Set<keyof typeof TABLES>([
    "NPC_CURRENT",
    "NPC_KNOWLEDGE",
    "NPC_RELATIONSHIPS_CURRENT",
    "SOCIAL_MEMORY_CURRENT",
    "OPEN_THREADS_CURRENT",
    "NPC_ACTIVITY_RULES",
    "SYSTEM_CHAT_LOG",
  ]);
  const structuredNames: Array<keyof typeof TABLES> = [];
  const addStructured = (name: keyof typeof TABLES) => {
    if (!(explicitActorRequest && boundedActorNames.has(name))) {
      runtimeRanges.add(TABLES[name].range);
    }
    if (!structuredNames.includes(name)) structuredNames.push(name);
  };
  addStructured("PENDING_CHOICES"); // Preexisting hot-state milestones; never decide for Shura.
  if (wantsSystemInbox) addStructured("PROGRESSION_EVENTS"); // Only explicit Inbox requests.

  if (hasAny(tagSet, ["SKILL", "WORK", "LANGUAGE", "COMBAT", "MAGIC", "CRAFT", "SURVIVAL", "STUDY", "TRAINING", "SPECIALIZATION", "DEXTERITY", "HANDS", "ART", "DRAW", "ILLUSTRATION", "DRAFT", "ENGINEERING", "BOWYER"])) {
    addStructured("SPECIALIZATIONS");
    addStructured("MILESTONES");
    addStructured("PENDING_CHOICES");
  }
  if (needsInventory) {
    addStructured("INVENTORY_CURRENT");
    addStructured("SYSTEM_MODULES_CURRENT");
  }
  if (hasAny(tagSet, ["CRAFT", "MATERIAL", "MATERIAL_PASSPORT", "PHYSICAL", "ENGINEERING"])) {
    addStructured("PHYSICAL_PASSPORTS_CURRENT");
  }
  if (hasAny(tagSet, ["SERVICES", "SOCIAL", "ECONOMY", "LANGUAGE", "WORK"])) {
    addStructured("SERVICES_CURRENT");
    addStructured("OPPORTUNITIES_CURRENT");
  }
  if (hasAny(tagSet, ["PROJECT", "CRAFT", "STUDY", "LANGUAGE"])) addStructured("PROJECTS_CURRENT");
  if (explicitActorRequest || hasAny(tagSet, ["NPC", "SOCIAL", "SERVICES"])) addStructured("NPC_CURRENT");
  if (explicitActorRequest) {
    addStructured("NPC_KNOWLEDGE");
    addStructured("NPC_RELATIONSHIPS_CURRENT");
    addStructured("SOCIAL_MEMORY_CURRENT");
    addStructured("OPEN_THREADS_CURRENT");
    addStructured("NPC_ACTIVITY_RULES");
    addStructured("WORLD_CLOCKS");
  }
  if (explicitActorRequest && recentChatLimit > 0) addStructured("SYSTEM_CHAT_LOG");
  if (hasAny(tagSet, ["LANGUAGE", "READ", "WRITE", "STUDY"])) {
    addStructured("PLAYER_LANGUAGE");
    addStructured("PLAYER_LEXICON");
    addStructured("PLAYER_GRAMMAR");
  }
  if (hasAny(tagSet, ["TRAVEL", "MAP", "EXPLORATION"])) addStructured("MAP_KNOWLEDGE_CURRENT");
  if (hasAny(tagSet, ["COMBAT", "INJURY", "POISON", "MEDICINE"])) addStructured("BODY_INJURIES_CURRENT");
  if (hasAny(tagSet, ["PHYSICAL", "BODY", "COMBAT", "INJURY", "POISON", "REST", "TRAVEL", "WORK", "SURVIVAL"])) addStructured("CHARACTERISTICS");
  if (hasAny(tagSet, ["CHARACTERISTIC", "PROGRESSION", "TRAINING", "PHYSICAL", "BODY"])) addStructured("CHARACTERISTIC_ADAPTATION");
  if (hasAny(tagSet, ["WORLD", "CLOCK", "WAIT", "REST", "TRAVEL", "WORK", "STUDY", "CRAFT"])) addStructured("WORLD_CLOCKS");
  if (hasAny(tagSet, ["WEATHER", "TRAVEL", "EXPLORATION", "SURVIVAL"])) addStructured("WEATHER_CURRENT");
  if (needsLocalWorldContext) {
    addStructured("WORLD_CLOCKS");
    addStructured("WEATHER_CURRENT");
  }
  if (hasAny(tagSet, ["RELIGION", "DIVINE", "GOD", "PRAYER", "TEMPLE", "EIRAN", "VEIRA", "SEREN", "SELVARA", "NERETH", "LORVEN", "KHARAD", "MARESS", "VAAR", "ULMAR"])) addStructured("DIVINE_ATTENTION_CURRENT");

  const pregenRequests: Array<{ key: string; range: string }> = [];
  const requestPregen = (key: string, range: string) => {
    if (!pregenRequests.some((p) => p.key === key)) pregenRequests.push({ key, range });
  };
  if (explicitActorRequest) {
    requestPregen("npcIdentityIndex", PREGEN_TABLES.NPC_IDENTITY_INDEX);
    requestPregen("archiveRegistry", PREGEN_TABLES.ARCHIVE_REGISTRY);
  }
  // The small faction seed index is always used by worldActionDocket,
  // including dialogue/quiet turns where the player never requests WORLD tags.
  // Dormant seeds never become live events merely by being read.
  requestPregen("factionProcessSeeds", PREGEN_TABLES.FACTION_PROCESS_SEEDS);
  if (hasAny(tagSet, ["SKILL", "TRAINING", "SPECIALIZATION", "DEXTERITY", "HANDS"])) {
    requestPregen("canonicalSpecializations", PREGEN_TABLES.CANON_SPECIALIZATION_REGISTRY);
  }
  if (hasAny(tagSet, ["MAP", "AREA_PREP", "EXPLORATION", "LOOK", "SCENE"])) {
    requestPregen("nearbyLocalAssets", PREGEN_TABLES.LOCATIONS);
  }
  if (hasAny(tagSet, ["THREAT", "CRIME", "WORLDGEN", "AREA_PREP"])) {
    requestPregen("humanThreatProfiles", PREGEN_TABLES.HUMAN_THREAT_PROFILES);
  }
  if (needsInventory) {
    requestPregen("commonObjectTemplates", PREGEN_TABLES.COMMON_OBJECT_TEMPLATES);
  }
  if (hasAny(tagSet, ["SERVICES", "SOCIAL", "ECONOMY", "LANGUAGE", "WORK"])) {
    requestPregen("districtPacks", PREGEN_TABLES.DISTRICT_PACKS);
    requestPregen("serviceDirectory", PREGEN_TABLES.SERVICE_DIRECTORY);
  }
  if (hasAny(tagSet, ["PHYSICAL", "BODY", "COMBAT", "TRAVEL", "WORK", "TRAINING", "SURVIVAL"])) {
    requestPregen("actionStaminaProfiles", PREGEN_TABLES.ACTION_STAMINA_PROFILES);
  }
  if (hasAny(tagSet, ["LANGUAGE", "READ", "WRITE", "STUDY"]) || input.includeWorldLanguage || (input.languageConcepts?.length ?? 0) > 0) {
    requestPregen("languageMeta", PREGEN_TABLES.TAREN_LANGUAGE_META);
    requestPregen("languageGrammar", PREGEN_TABLES.TAREN_GRAMMAR);
    requestPregen("languageDerivation", PREGEN_TABLES.TAREN_DERIVATION);
    if (input.includeWorldLanguage || (input.languageConcepts?.length ?? 0) > 0) {
      requestPregen("languageLexicon", PREGEN_TABLES.TAREN_LEXICON);
    }
  }

  if (needsLocalWorldContext) {
    requestPregen("districtPacks", PREGEN_TABLES.DISTRICT_PACKS);
    requestPregen("serviceDirectory", PREGEN_TABLES.SERVICE_DIRECTORY);
    requestPregen("mapEdges", PREGEN_TABLES.MAP_EDGES);
    requestPregen("economyAnchors", PREGEN_TABLES.ECONOMY_ANCHORS);
    requestPregen("factions", PREGEN_TABLES.FACTIONS);
    requestPregen("selarinFastIndex", PREGEN_TABLES.SELARIN_FAST_INDEX);
    requestPregen("selarinLaws", PREGEN_TABLES.SELARIN_CIVIC_LAW_INDEX);
    requestPregen("selarinNpcPool", PREGEN_TABLES.SELARIN_NPC_POOL);
    requestPregen("selarinJobBoards", PREGEN_TABLES.SELARIN_JOB_BOARDS);
    requestPregen("selarinJobTemplates", PREGEN_TABLES.SELARIN_JOB_TEMPLATES);
    requestPregen("selarinCulture", PREGEN_TABLES.SELARIN_CULTURE);
    requestPregen("selarinDeityAttention", PREGEN_TABLES.SELARIN_DEITY_ATTENTION);
    requestPregen("selarinFood", PREGEN_TABLES.SELARIN_FOOD);
    requestPregen("selarinInfrastructure", PREGEN_TABLES.SELARIN_INFRASTRUCTURE);
    requestPregen("selarinDistrictPulse", PREGEN_TABLES.SELARIN_DISTRICT_PULSE);
    requestPregen("selarinPulsePhases", PREGEN_TABLES.SELARIN_PULSE_PHASES);
    requestPregen("selarinAmbientEvents", PREGEN_TABLES.SELARIN_AMBIENT_EVENTS);
    requestPregen("selarinRiskEcology", PREGEN_TABLES.SELARIN_RISK_ECOLOGY);
    requestPregen("selarinRumorChannels", PREGEN_TABLES.SELARIN_RUMOR_CHANNELS);
    requestPregen("selarinSocialNetwork", PREGEN_TABLES.SELARIN_SOCIAL_NETWORK);
    requestPregen("selarinCalendar", PREGEN_TABLES.SELARIN_CALENDAR);
    requestPregen("selarinServiceHours", PREGEN_TABLES.SELARIN_SERVICE_HOURS);
    requestPregen("selarinNpcRoutines", PREGEN_TABLES.SELARIN_NPC_ROUTINES);
    requestPregen("selarinPulseOverlays", PREGEN_TABLES.SELARIN_PULSE_OVERLAYS);
    requestPregen("selarinWeatherProfile", PREGEN_TABLES.SELARIN_WEATHER_PROFILE);
    requestPregen("selarinWeatherFronts", PREGEN_TABLES.SELARIN_WEATHER_FRONTS);
    requestPregen("selarinMajorEventTemplates", PREGEN_TABLES.SELARIN_MAJOR_EVENT_TEMPLATES);
  }

  const uniqueDocKeys = Array.from(new Set(docQueries.map((q) => q.documentKey)));

  const [base, lookupResults, docs, pregens, actorIndexScan, continuityRanges] = await Promise.all([
    sheetsBatchGet(config.files.TEMP_RUNTIME, [...runtimeRanges]),
    Promise.all(lookups.map(cachedLookup)),
    Promise.all(uniqueDocKeys.map(async (key) => [key, await cachedDoc(key)] as const)),
    cachedPregenBatch(pregenRequests),
    explicitActorRequest ? scanActorContextIndex(config.files.TEMP_RUNTIME) : Promise.resolve(null),
    sheetsBatchGet(config.files.TEMP_RUNTIME, CONTINUITY_SPARSE_RANGES),
  ]);

  const control = base["CONTROL!A1:D12"] ?? [];
  const saveId = String(findControl(control, "save_id") ?? "");
  if (routeSaveId && routeSaveId !== saveId) throw new Error("context scene routing snapshot changed during read; retry");
  const worldDay = findControl(control, "world_day");
  const worldTime = findControl(control, "world_time");
  const locationId = String(findControl(control, "current_location_id") ?? "");
  const locationDisplay = findControl(control, "current_location_display");
  const sceneId = findControl(control, "current_scene_id");
  const turnToken = makeTurnToken({ saveId, worldDay, worldTime, locationId, sceneId });
  const worldContinuity = continuityFromSparseRanges(continuityRanges, worldDay, worldTime);
  const clockAgendaSeeds = rowsToObjects(pregens.find((p) => p.key === "factionProcessSeeds")?.rows ?? []);
  const worldActionDocket = buildWorldActionDocket({
    worldDay: Number(worldDay),
    worldTime: String(worldTime),
    clocks: worldClocksFromSparseRanges(continuityRanges),
    factionSeeds: clockAgendaSeeds,
  });
  const prospectiveWorldTickPlan = input.plannedElapsedSeconds != null ||
    hasAny(tagSet, ["WORLD","WAIT","REST","SLEEP","TRAVEL","WORK","CRAFT","NPC_LIFE"])
    ? planIndependentWorldTick({saveId,worldDay:Number(worldDay),worldTime:String(worldTime),
       elapsedSeconds:input.plannedElapsedSeconds??0,sparse:continuityRanges}) : null;
  const prospectiveNpcCadence = prospectiveWorldTickPlan !== null
    ? reviewNpcRoutineCadence({
        worldDay: Number(worldDay), worldTime: String(worldTime),
        elapsedSeconds: input.plannedElapsedSeconds ?? 0, sparse: continuityRanges,
      }) : null;

  const rawNpcCurrent = explicitActorRequest
    ? rowsToObjects(actorIndexScan?.npcReferenceRows ?? [])
    : rowsToObjects(base[TABLES.NPC_CURRENT.range] ?? []);
  const identityPregenRows = rowsToObjects(
    pregens.find((p) => p.key === "npcIdentityIndex")?.rows ?? [],
  );
  const actorResolution = resolveActorRefs(rawNpcCurrent, actorRefs, identityPregenRows);
  const resolvedActorIds = [...new Set([
    ...requestedActorIds,
    ...actorResolution.filter((r) => r.status === "RESOLVED").flatMap((r) => r.actorIds),
  ])];
  const activeNpcIds = new Set(rawNpcCurrent.map((r) => String(r["NPC ID"] ?? "")).filter(Boolean));
  const identityNpcIds = new Set(identityPregenRows.map((r) => String(r["NPC ID"] ?? "")).filter(Boolean));
  const dormantActorIds = resolvedActorIds.filter((id) => !activeNpcIds.has(id) && identityNpcIds.has(id));
  const boundedActorLoad = explicitActorRequest && actorIndexScan
    ? await loadBoundedActorTables(
        config.files.TEMP_RUNTIME,
        actorIndexScan,
        resolvedActorIds,
        recentChatLimit,
      )
    : null;

  const archiveRegistryRows = rowsToObjects(
    pregens.find((p) => p.key === "archiveRegistry")?.rows ?? [],
  );
  const canonicalNpcArchive = archiveRegistryRows.find((r) =>
    String(r["Archive ID"] ?? "") === "archive.npc_memory.current" &&
    String(r["Status"] ?? "").toUpperCase() === "ACTIVE"
  ) ?? null;
  let dormantArchiveRows: Array<Record<string, unknown>> = [];
  let dormantArchiveError: string | null = null;
  const archiveReadPlan: string[] = [];
  if (dormantActorIds.length && canonicalNpcArchive) {
    const archiveFileId = String(canonicalNpcArchive["Drive file ID"] ?? "").trim();
    const archiveSheet = String(canonicalNpcArchive["Sheet/resource"] ?? "").trim();
    if (archiveFileId && archiveSheet) {
      try {
        const archiveData = await loadBoundedArchiveRows(
          archiveFileId,
          archiveSheet,
          dormantActorIds,
        );
        const wanted = new Set(dormantActorIds);
        dormantArchiveRows = rowsToObjects(archiveData.rows).filter((r) =>
          wanted.has(String(r["NPC ID"] ?? "")) &&
          String(r["Active"] ?? "TRUE").toUpperCase() !== "FALSE"
        );
        archiveReadPlan.push(
          `ARCHIVE:${String(canonicalNpcArchive["Archive ID"] ?? "npc_memory")}:BOUNDED`,
          ...archiveData.readPlan,
        );
      } catch (error) {
        dormantArchiveError = error instanceof Error ? error.message : String(error);
      }
    } else {
      dormantArchiveError = "canonical NPC archive registry row is missing file or sheet";
    }
  }

  const structured: Record<string, unknown> = {};
  for (const name of structuredNames) {
    const boundedRows = (
      boundedActorLoad?.tables as Record<string, unknown[][] | undefined> | undefined
    )?.[name];
    let records = rowsToObjects(
      (explicitActorRequest && boundedActorNames.has(name) && boundedRows)
        ? boundedRows
        : (base[TABLES[name].range] ?? []),
    );
    if (name === "NPC_CURRENT") {
      records = selectNpcCurrentRows(records, locationId, resolvedActorIds, explicitActorRequest);
    } else if (["SERVICES_CURRENT", "OPPORTUNITIES_CURRENT", "MAP_KNOWLEDGE_CURRENT"].includes(name)) {
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
    if ((name === "NPC_KNOWLEDGE" || name === "NPC_ACTIVITY_RULES") && explicitActorRequest) {
      const wanted = new Set(resolvedActorIds);
      records = records.filter((r) => wanted.has(String(r["NPC ID"] ?? "")));
    }
    if (name === "NPC_RELATIONSHIPS_CURRENT") {
      records = filterRelationships(records, resolvedActorIds);
    }
    if (name === "SOCIAL_MEMORY_CURRENT" || name === "OPEN_THREADS_CURRENT") {
      records = filterByParticipants(records, resolvedActorIds);
    }
    if (name === "SYSTEM_CHAT_LOG") {
      const grouped = recentActorChat(records, resolvedActorIds, recentChatLimit);
      records = Object.values(grouped).flat().filter((row, i, all) => all.indexOf(row) === i);
    }
    structured[name] = records;
  }

  const pregen: Record<string, unknown> = {};
  const rawPregenRecords: Record<string, Array<Record<string, unknown>>> = Object.fromEntries(
    pregens.map((p) => [p.key, rowsToObjects(p.rows)]),
  );
  const localSupportKeys = new Set([
    "mapEdges", "economyAnchors", "factions", "selarinFastIndex", "selarinLaws",
    "selarinNpcPool", "selarinJobBoards", "selarinJobTemplates", "selarinCulture",
    "selarinDeityAttention", "selarinFood", "selarinInfrastructure",
    "selarinDistrictPulse", "selarinPulsePhases", "selarinAmbientEvents", "selarinRiskEcology",
    "selarinRumorChannels", "selarinSocialNetwork", "selarinCalendar", "selarinServiceHours",
    "selarinNpcRoutines", "selarinPulseOverlays", "selarinWeatherProfile", "selarinWeatherFronts", "selarinMajorEventTemplates",
  ]);
  let languageLexiconRows: unknown[][] = [];
  for (const p of pregens) {
    let records = rowsToObjects(p.rows);
    if (p.key === "districtPacks" || p.key === "serviceDirectory") records = filterByLocation(records, locationId);
    if (p.key === "nearbyLocalAssets") {
      // Present only already canonical places in this district; other
      // neighborhoods/hidden interior sites remain undisclosed GM data.
      records = records.filter((row) =>
        String(row["Parent"] ?? "") === locationId ||
        String(row["Location ID"] ?? "") === locationId);
    }
    if (p.key === "npcIdentityIndex") {
      const wanted = new Set(resolvedActorIds);
      records = records.filter((r) => wanted.has(String(r["NPC ID"] ?? "")));
    }
    if (p.key === "archiveRegistry") {
      records = records.filter((r) => String(r["Status"] ?? "").toUpperCase() === "ACTIVE");
    }
    if (p.key === "factionProcessSeeds") {
      records = records.filter((r) => !String(r["Status"] ?? "").toUpperCase().startsWith("RETIRED"));
    }
    if (p.key === "commonObjectTemplates") {
      const inventory = (structured.INVENTORY_CURRENT as Array<Record<string, unknown>> | undefined) ?? [];
      const usedTemplateIds = new Set(inventory.map((r) => String(r["Template ID"] ?? "")).filter(Boolean));
      records = records.filter((r) => usedTemplateIds.has(String(r["Template ID"] ?? "")));
    }
    if (p.key === "languageLexicon") languageLexiconRows = p.rows;
    if (!localSupportKeys.has(p.key) && (p.key !== "languageLexicon" || input.includeWorldLanguage)) {
      pregen[p.key] = { data: compactPregenRecords(p.key, records), revision: p.revision, cache: p.cache };
    }
  }

  const localContext = needsLocalWorldContext
    ? buildSelarinLocalContext({
        locationId,
        tags: tagSet,
        worldDay,
        worldTime,
        rows: {
          districtPacks: rawPregenRecords.districtPacks ?? [],
          serviceDirectory: rawPregenRecords.serviceDirectory ?? [],
          mapEdges: rawPregenRecords.mapEdges ?? [],
          economyAnchors: rawPregenRecords.economyAnchors ?? [],
          factions: rawPregenRecords.factions ?? [],
          selarinFastIndex: rawPregenRecords.selarinFastIndex ?? [],
          selarinLaws: rawPregenRecords.selarinLaws ?? [],
          selarinNpcPool: rawPregenRecords.selarinNpcPool ?? [],
          selarinJobBoards: rawPregenRecords.selarinJobBoards ?? [],
          selarinJobTemplates: rawPregenRecords.selarinJobTemplates ?? [],
          selarinCulture: rawPregenRecords.selarinCulture ?? [],
          selarinDeityAttention: rawPregenRecords.selarinDeityAttention ?? [],
          selarinFood: rawPregenRecords.selarinFood ?? [],
          selarinInfrastructure: rawPregenRecords.selarinInfrastructure ?? [],
          selarinDistrictPulse: rawPregenRecords.selarinDistrictPulse ?? [],
          selarinPulsePhases: rawPregenRecords.selarinPulsePhases ?? [],
          selarinAmbientEvents: rawPregenRecords.selarinAmbientEvents ?? [],
          selarinRiskEcology: rawPregenRecords.selarinRiskEcology ?? [],
          selarinRumorChannels: rawPregenRecords.selarinRumorChannels ?? [],
          selarinSocialNetwork: rawPregenRecords.selarinSocialNetwork ?? [],
          selarinCalendar: rawPregenRecords.selarinCalendar ?? [],
          selarinServiceHours: rawPregenRecords.selarinServiceHours ?? [],
          selarinNpcRoutines: rawPregenRecords.selarinNpcRoutines ?? [],
          selarinPulseOverlays: rawPregenRecords.selarinPulseOverlays ?? [],
          selarinWeatherProfile: rawPregenRecords.selarinWeatherProfile ?? [],
          selarinWeatherFronts: rawPregenRecords.selarinWeatherFronts ?? [],
          selarinMajorEventTemplates: rawPregenRecords.selarinMajorEventTemplates ?? [],
        },
        live: {
          worldClocks: (structured.WORLD_CLOCKS as Array<Record<string, unknown>> | undefined) ?? [],
          weather: (structured.WEATHER_CURRENT as Array<Record<string, unknown>> | undefined) ?? [],
          npcCurrent: (structured.NPC_CURRENT as Array<Record<string, unknown>> | undefined) ?? [],
          opportunities: (structured.OPPORTUNITIES_CURRENT as Array<Record<string, unknown>> | undefined) ?? [],
        },
      })
    : null;

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

  const inventoryRows = (structured.INVENTORY_CURRENT as Array<Record<string, unknown>> | undefined) ?? [];
  const templateData =
    ((pregen.commonObjectTemplates as { data?: Array<Record<string, unknown>> } | undefined)?.data) ?? [];
  const templateById = new Map(templateData.map((r) => [String(r["templateId"] ?? ""), r]));
  const trackedItemIds = new Set(inventoryRows.map((r) => String(r["Item ID"] ?? "")).filter(Boolean));
  const inventoryResolved = inventoryRows.map((r) => {
    const qty = numberOrNull(r["Qty"]) ?? 0;
    const templateId = String(r["Template ID"] ?? "");
    const tpl = templateById.get(templateId);
    const massOverride = numberOrNull(r["Mass kg override"]);
    const volumeOverride = numberOrNull(r["Volume L override"]);
    const unitMassKg = massOverride ?? numberOrNull(tpl?.["massKg"]);
    const unitVolumeL = volumeOverride ?? numberOrNull(tpl?.["occupiedVolumeL"]);
    const location = String(r["Location/container"] ?? "");
    const containerCandidate = location.split("/")[0]?.trim() ?? "";
    const containedInItemId = trackedItemIds.has(containerCandidate) ? containerCandidate : null;
    return {
      itemId: r["Item ID"],
      item: r["Item"],
      qty,
      unit: r["Unit"],
      templateId,
      unitMassKg,
      unitVolumeL,
      totalMassKg: unitMassKg == null ? null : unitMassKg * qty,
      totalVolumeL: unitVolumeL == null ? null : unitVolumeL * qty,
      massSource: massOverride != null ? "override" : unitMassKg != null ? "template" : "unknown",
      volumeSource: volumeOverride != null ? "override" : unitVolumeL != null ? "template" : "unknown",
      location,
      custodian: r["Custodian"],
      containedInItemId,
    };
  });
  const knownMassKg = inventoryResolved.reduce((sum, r) => sum + (r.totalMassKg ?? 0), 0);
  const topLevelStorageRows = inventoryResolved.filter((r) =>
    r.location.includes("System Storage") && !r.containedInItemId
  );
  const knownTopLevelStorageVolumeL = topLevelStorageRows.reduce((sum, r) => sum + (r.totalVolumeL ?? 0), 0);
  const storageModules =
    (structured.SYSTEM_MODULES_CURRENT as Array<Record<string, unknown>> | undefined) ?? [];
  const storageCapacity = storageCapacityL(storageModules);
  const unknownTopLevelStorageVolumeItemIds =
    topLevelStorageRows.filter((r) => r.totalVolumeL == null).map((r) => r.itemId);
  const inventorySummary = {
    rows: inventoryResolved.length,
    knownMassKg,
    unknownMassItemIds: inventoryResolved.filter((r) => r.totalMassKg == null).map((r) => r.itemId),
    storageCapacityL: storageCapacity,
    knownTopLevelStorageVolumeL,
    knownRemainingStorageVolumeL: storageCapacity == null ? null : storageCapacity - knownTopLevelStorageVolumeL,
    unknownTopLevelStorageVolumeItemIds,
    capacityCheckComplete: storageCapacity != null && unknownTopLevelStorageVolumeItemIds.length === 0,
    knownCapacityExceeded: storageCapacity != null && knownTopLevelStorageVolumeL > storageCapacity + 1e-9,
    note: "Nested contents contribute mass but not duplicate top-level occupied volume; unknown template dimensions remain unknown rather than guessed.",
  };

  const actorCurrent = (structured.NPC_CURRENT as Array<Record<string, unknown>> | undefined) ?? [];
  const actorKnowledge = (structured.NPC_KNOWLEDGE as Array<Record<string, unknown>> | undefined) ?? [];
  const relationshipRows = (structured.NPC_RELATIONSHIPS_CURRENT as Array<Record<string, unknown>> | undefined) ?? [];
  const actorChatRows = (structured.SYSTEM_CHAT_LOG as Array<Record<string, unknown>> | undefined) ?? [];
  const socialMemoryRows = (structured.SOCIAL_MEMORY_CURRENT as Array<Record<string, unknown>> | undefined) ?? [];
  const openThreadRows = (structured.OPEN_THREADS_CURRENT as Array<Record<string, unknown>> | undefined) ?? [];
  const activityRuleRows = (structured.NPC_ACTIVITY_RULES as Array<Record<string, unknown>> | undefined) ?? [];
  const worldClockRows = (structured.WORLD_CLOCKS as Array<Record<string, unknown>> | undefined) ?? [];
  const actorRecentChat = recentActorChat(actorChatRows, resolvedActorIds, recentChatLimit);
  const heatShadow = projectNpcHeatContextShadow({
    saveId, worldDay, worldTime, resolvedActorIds, routedSceneActorIds,
    explicitlyRequestedActorIds: [
      ...(input.actorIds ?? []),
      ...actorResolution.filter((r) => r.status === "RESOLVED").flatMap((r) => r.actorIds),
    ],
    current: actorCurrent,
    activityRules: activityRuleRows,
  });
  // On-demand historical receipt review. Never invoked on ordinary gameplay:
  // its existing checksum does not authenticate World advances JSON contents.
  let npcHeatJournalAudit: Record<string, unknown> | null = null;
  if (tagSet.has("NPC_HEAT_AUDIT")) {
    const explicit = new Set([...(input.actorIds ?? []),
      ...actorResolution.filter(r => r.status === "RESOLVED").flatMap(r => r.actorIds)]);
    const scope = resolvedActorIds.filter(id => explicit.has(id) && /^npc\.[a-z0-9_.-]+$/i.test(id));
    if (!scope.length || scope.length > 12) {
      npcHeatJournalAudit = {
        schema:"NPC_HEAT_JOURNAL_AUDIT_V1",status:"ACTOR_SCOPE_REQUIRED_OR_EXCEEDED",
        mode:"READ_ONLY_UNAUTHENTICATED_CANDIDATES",historyComplete:false,
        verifiedForTierPromotion:false,contentHashAuthenticated:false,semanticWrites:0,
      };
    } else {
      try {
        const indexRanges=["SESSION_LOG!C1:C5000","SESSION_LOG!A1:P1"];
        const journalIndex=await sheetsBatchGet(config.files.TEMP_RUNTIME,indexRanges);
        const txIndex=journalIndex[indexRanges[0]] ?? [];
        const window=planNpcHeatJournalWindow(txIndex);
        if (!window.endRow) {
          npcHeatJournalAudit = {
            schema:"NPC_HEAT_JOURNAL_AUDIT_V1",status:"NO_COMMITTED_TX_ROWS",
            mode:"READ_ONLY_UNAUTHENTICATED_CANDIDATES",historyComplete:false,
            verifiedForTierPromotion:false,contentHashAuthenticated:false,semanticWrites:0,
          };
        } else {
          const sliceRange=`SESSION_LOG!A${window.startRow}:P${window.endRow}`;
          const snapshot=await sheetsBatchGet(config.files.TEMP_RUNTIME,
            [sliceRange,"CONTROL!A1:D12"]);
          const freshControl=snapshot["CONTROL!A1:D12"] ?? [];
          const stable=String(findControl(freshControl,"save_id")??"")===saveId &&
            String(findControl(freshControl,"world_day")??"")===String(worldDay) &&
            String(findControl(freshControl,"world_time")??"")===String(worldTime) &&
            String(findControl(freshControl,"current_scene_id")??"")===String(sceneId);
          const audited=await auditNpcHeatJournalIncludingTestV2({
            sourceSaveId:saveId,worldDay:Number(worldDay),worldTime:String(worldTime),
            stableAfterRead:stable,requestedActorIds:scope,index:txIndex,
            header:journalIndex[indexRanges[1]]?.[0]??[],rowStart:window.startRow,
            rows:snapshot[sliceRange]??[],
          });
          // Only aggregate proof diagnostics leave this module; never expose
          // private GM evidence or use tentative receipts to award Heat.
          const { receipts: _untrustedReceipts, ...summary } = audited;
          npcHeatJournalAudit={...summary,
            actorScopeCount:scope.length,windowStart:window.startRow,
            windowEnd:window.endRow,truncated:window.truncated,
            readRoutingApplied:false,proposedHeatTierChanges:0};
        }
      } catch {
        npcHeatJournalAudit = {
          schema:"NPC_HEAT_JOURNAL_AUDIT_V1",
          mode:"READ_ONLY_UNAUTHENTICATED_CANDIDATES",
          status:"SOURCE_UNAVAILABLE_OR_INVALID",
          historyComplete:false,verifiedForTierPromotion:false,
          contentHashAuthenticated:false,semanticWrites:0,
        };
      }
    }
  }
  const actors: Record<string, unknown> = {};
  const actorContextGate: Record<string, unknown> = {};
  const knowledgeLoaded = structuredNames.includes("NPC_KNOWLEDGE");
  const relationshipsLoaded = structuredNames.includes("NPC_RELATIONSHIPS_CURRENT");
  const socialMemoryLoaded = structuredNames.includes("SOCIAL_MEMORY_CURRENT");
  const openThreadsLoaded = structuredNames.includes("OPEN_THREADS_CURRENT");
  const recentChatLoaded = structuredNames.includes("SYSTEM_CHAT_LOG");
  const activityRulesLoaded = structuredNames.includes("NPC_ACTIVITY_RULES");
  for (const id of resolvedActorIds) {
    const current = actorCurrent.find((r) => String(r["NPC ID"] ?? "") === id) ?? null;
    const activityRule = activityRuleRows.find((r) => String(r["NPC ID"] ?? "") === id) ?? null;
    const activeWorldClocks = recordsContainingActorId(worldClockRows, id);
    const freshness = actorSnapshotFreshness({ worldDay, worldTime, current, activityRule });
    const durableIdentity =
      identityPregenRows.find((r) => String(r["NPC ID"] ?? "") === id) ?? null;
    const archivedKnowledge = dormantArchiveRows.filter((r) => String(r["NPC ID"] ?? "") === id);
    actors[id] = {
      current,
      contextHeat: heatShadow.actors[id] ?? null,
      initiativePlan: planNpcInitiativeV4({
        actorId: id, current, activityRule,
        relationshipToShura: relationshipRows.find(r =>
          String(r["Actor ID"] ?? "") === id && String(r["Toward ID"] ?? "") === "player.shura") ?? null,
        knowledge: actorKnowledge.filter(r => String(r["NPC ID"] ?? "") === id),
        observedStimuli: [], // Historical committed TX receipts are not loaded.
        socialMemories: filterByParticipants(socialMemoryRows, [id]),
        openThreads: filterByParticipants(openThreadRows, [id]),
        elapsedSeconds: input.plannedElapsedSeconds ?? 0,
        verifiedCoPresenceWithShura: sceneActorsForContext.includes(id),
        verifiedLiveCommunicationChannel: sourceContacts.some(r =>
          String(r["Peer Actor ID"] ?? "") === id &&
          String(r["Owner Actor ID"] ?? "") === "player.shura" &&
          String(r["Status"] ?? "").toUpperCase() === "ACTIVE" &&
          String(r["Consent"] ?? "").toUpperCase() === "TRUE"),
        discretionaryWindowConfirmed: false,
      }),
      durableIdentity,
      knowledge: actorKnowledge.filter((r) => String(r["NPC ID"] ?? "") === id),
      relationships: filterRelationships(relationshipRows, [id]),
      socialMemory: filterByParticipants(socialMemoryRows, [id]),
      openThreads: filterByParticipants(openThreadRows, [id]),
      recentChat: actorRecentChat[id] ?? [],
      archivedKnowledge,
      rematerialization: dormantActorIds.includes(id)
        ? {
            required: true,
            archiveId: canonicalNpcArchive?.["Archive ID"] ?? null,
            archivedFactCount: archivedKnowledge.length,
            archiveError: dormantArchiveError,
            rule: "derive current activity/location causally; archived facts are evidence, not present-state truth",
          }
        : null,
      autonomy: { activityRule, activeWorldClocks, freshness },
      independentLifePlan: buildNpcAutonomyPlan({
        actorId:id,worldDay:Number(worldDay),worldTime:String(worldTime),current,activityRule,
        knownFacts:actorKnowledge.filter(r=>String(r["NPC ID"]??"")===id),
        directedRelationships:filterRelationships(relationshipRows,[id]),
        socialMemory:filterByParticipants(socialMemoryRows,[id]),
        openThreads:filterByParticipants(openThreadRows,[id]),activeWorldClocks,
      }),
      behavioralContext: buildNpcBehavioralContext({
        actorId: id,
        current,
        knowledge: actorKnowledge.filter((r) => String(r["NPC ID"] ?? "") === id),
        relationships: filterRelationships(relationshipRows, [id]),
        memories: filterByParticipants(socialMemoryRows, [id]),
        openThreads: filterByParticipants(openThreadRows, [id]),
        recentChat: actorRecentChat[id] ?? [],
        activeWorldClocks,
        activityRule,
      }),
    };
    actorContextGate[id] = evaluateNpcContextGate({
      actorId: id,
      current,
      knowledgeLoaded,
      relationshipsLoaded,
      socialMemoryLoaded,
      openThreadsLoaded,
      recentChatLoaded,
      recentChatLimit,
      activityRuleLoaded: activityRulesLoaded,
      activityRule,
      eligibleForOffscreenAdvance: freshness.eligibleForOffscreenAdvance,
      requiresOffscreenAdvance: freshness.requiresOffscreenAdvance,
    });
  }
  const gateGlobalBlockers: string[] = [];
  if (requireNpcContextGate) {
    if (!explicitActorRequest) gateGlobalBlockers.push("explicit_actor_required");
    if (!resolvedActorIds.length) gateGlobalBlockers.push("no_actor_resolved");
    for (const unresolved of actorResolution.filter((r) => r.status !== "RESOLVED")) {
      gateGlobalBlockers.push(`actor_ref_${unresolved.status.toLocaleLowerCase()}:${unresolved.ref}`);
    }
  }
  const gateActorsReady = Object.values(actorContextGate).every((value) =>
    Boolean((value as { ready?: boolean }).ready)
  );
  const npcContextGate = {
    required: requireNpcContextGate,
    readyForSubstantiveReply:
      !requireNpcContextGate || (gateGlobalBlockers.length === 0 && gateActorsReady),
    blockers: gateGlobalBlockers,
    actors: actorContextGate,
  };

  const pendingChoiceRows =
    (structured.PENDING_CHOICES as Array<Record<string, unknown>> | undefined) ?? [];
  const gmTurnBrief = buildTurnBrief({
    turnClass: input.turnClass, tags: input.tags ?? [],
    contacts: sourceContacts, pendingChoices: pendingChoiceRows,
    recentChatByActor: actorRecentChat, actorIdsLoaded: resolvedActorIds,
    worldAgenda: worldActionDocket.items,
  });
  const gmTurnTriage = buildTurnTriage({
    turnClass: input.turnClass, tags: input.tags ?? [],
    memory: memoryRoute, worldPlan: prospectiveWorldTickPlan,
    npcRoutineCadence: prospectiveNpcCadence,
    actorContextRequired: requireNpcContextGate,
    actorContextReady: npcContextGate.readyForSubstantiveReply,
    pendingChoices: pendingChoiceRows,
  });
  const systemNotifications = wantsSystemInbox ? buildSystemNotificationCenter({
    pendingChoices: pendingChoiceRows,
    progressEvents: (structured.PROGRESSION_EVENTS as Array<Record<string, unknown>> | undefined) ?? [],
    contacts: sourceContacts, chatEvents: actorChatRows,
    worldAgenda: worldActionDocket.items, currentDay: Number(worldDay),
    ackSourceReady: false, maxItems: 25,
  }) : null;
  const contextReadBudget = sourceReadBudgetNotice({
    turnClass: input.turnClass, tags: input.tags ?? [],
    sceneActorsConsidered: routedSceneActorIds.length,
    sceneActorsLoaded: sceneActorsForContext.length,
    actorIndexApproxCells: actorIndexScan?.approxCellsRead ?? 0,
    actorExactApproxCells: boundedActorLoad?.approxCellsRead ?? 0,
    targetedDocQueries: docQueries.length,
  });

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
      worldContinuity,
      worldActionDocket,
      npcRoutineCadence: prospectiveNpcCadence,
      gmTurnBrief,
      gmTurnTriage,
      systemNotifications,
      contextReadBudget,
      bridgeIntegration:bridgeTurnIntegrationPlan({
        saveId,turnClass:input.turnClass,
        memoryDepth:memoryRoute.depth,missingSources:memoryRoute.missingSources,
        plannedElapsedSeconds:input.plannedElapsedSeconds??0,
        keyNpcDue:prospectiveWorldTickPlan?.keyNpcDueCount ??
          worldContinuity.keyNpcDue.filter(x=>x.reason!=="ACTIVITY_RULE_MISSING").length,
        worldProcessDue:prospectiveWorldTickPlan?.processDueCount ??
          worldContinuity.activeClocksOverdue.length,
        npcContextReady:npcContextGate.readyForSubstantiveReply,
      }),
      memoryRoute:{
        ...memoryRoute,
        actualSourceReads:{
          actorBounded:boundedActorLoad!=null,
          actorCount:resolvedActorIds.length,
          archivedActorLookups:archiveReadPlan.length,
          canonRegistryRequests:pregenRequests.length,
          targetedDocQueries:docQueries.length,
          targetedSheetLookups:lookups.length,
        },
        deepNpcContextReady:npcContextGate.readyForSubstantiveReply,
        autoSourceRouting:true,
      },
      worldTickPlan:prospectiveWorldTickPlan,
      worldSimulationV3: { enabled: config.worldSimV3Enabled, mode: "READ_ONLY_PROPOSALS", maxBatchJobs: 12, achievementCandidates: ACHIEVEMENT_CATALOG_COUNTS.achievements, titleCandidates: ACHIEVEMENT_CATALOG_COUNTS.titles, committed: false },
      survival: {
        satiety: { current: satiety, max: Number((resourceDetails["Satiety"] as any)?.max ?? 100), band: survivalBand(satiety) },
        hydration: { current: hydration, max: Number((resourceDetails["Hydration"] as any)?.max ?? 100), band: survivalBand(hydration) },
      },
      conditions: rowsToObjects(base["PLAYER_CONDITIONS!A1:F100"] ?? []),
      competences: needsCompetences ? rowsToObjects(base[TABLES.COMPETENCES.range] ?? []) : [],
      structured,
      pregen,
      localContext,
      inventoryResolved,
      inventorySummary,
      languageLookup,
      actors,
      actorContext: {
        requestedActorIds,
        routedSceneActorIds,
        sceneLoadPolicy,
        requestedActorRefs: actorRefs,
        resolvedActorIds,
        resolution: actorResolution,
        unresolvedRefs: actorResolution.filter((r) => r.status !== "RESOLVED"),
        dormantRefs: actorResolution.filter((r) => r.status === "RESOLVED" && r.materialization === "DORMANT"),
        rematerializationRequiredActorIds: dormantActorIds,
        rematerializationPackets: Object.fromEntries(dormantActorIds.map((id) => [
          id,
          {
            durableIdentity: identityPregenRows.find((r) => String(r["NPC ID"] ?? "") === id) ?? null,
            archivedKnowledge: dormantArchiveRows.filter((r) => String(r["NPC ID"] ?? "") === id),
            archiveId: canonicalNpcArchive?.["Archive ID"] ?? null,
            archiveError: dormantArchiveError,
          },
        ])),
        contextGate: npcContextGate,
        heatIntegration: heatShadow.summary,
        heatJournalAudit: npcHeatJournalAudit,
        boundedReadStats: explicitActorRequest
          ? {
              indexApproxCells: actorIndexScan?.approxCellsRead ?? 0,
              exactApproxCells: boundedActorLoad?.approxCellsRead ?? 0,
              exactRangeCount: boundedActorLoad?.exactRangeCount ?? 0,
              strategy: "fresh narrow-column index scan + exact-row batch reads; no persisted duplicate context index",
            }
          : null,
      },
      lookups: lookups.map((lookup, i) => ({ ...lookup, ...lookupResults[i] })),
      docs: queriedDocs,
      readPlan: [
        "TEMP:CORE",
        "TEMP:SCENE_ROUTING",
        "TEMP:WORLD_CONTINUITY_SPARSE",
        ...(needsCompetences ? ["TEMP:COMPETENCES"] : []),
        ...(actorIndexScan?.readPlan ?? []),
        ...(boundedActorLoad?.readPlan ?? []),
        ...structuredNames.map((n) =>
          explicitActorRequest && boundedActorNames.has(n)
            ? `TEMP:${n}:BOUNDED`
            : `TEMP:${n}`
        ),
        ...pregenRequests.map((p) => `GM_PREGEN:${p.key}`),
        ...archiveReadPlan,
        ...lookups.map((l) => `${l.source}:${l.sheet}`),
        ...docQueries.map((d) => `DOC:${d.documentKey}`),
      ],
    },
  };
}
