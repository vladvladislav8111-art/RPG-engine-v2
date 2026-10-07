import { config } from "./config.ts";
import { sheetsBatchGet } from "./google.ts";
import {
  PREGEN_TABLES,
  TABLES,
  type RuntimeTableName,
  cloneRow,
  findDataRow,
  headerIndex,
  headers,
  rowRange,
  setByHeader,
} from "./schema.ts";
import {
  MILESTONE_LEVELS,
  RULESET_VERSION,
  advanceClock,
  advanceCompetence,
  advanceGeneralXp,
  computeCompetenceAward,
  computeGeneralXpAward,
  computeSpecializationProgress,
  nextStarThreshold,
} from "./rules.ts";
import {
  ACTION_PROFILES,
  deriveStaminaBaseMax,
  resolveExertion,
  resolveInjurySimulation,
  resolveRest,
} from "./physiology.ts";
import { hash32 } from "./rng.ts";
import { computeSurvivalChange, survivalStaminaModifiers, type SurvivalActivity } from "./survival.ts";
import { makeTurnToken } from "./turn_token.ts";
import { validateChatEventShape, validateRelationshipEventShape } from "./social_context.ts";
import type {
  CommitRequest,
  Scalar,
  SemanticCommitPlan,
  StructuredRuntimeTable,
} from "./types.ts";

type SheetWrite = { range: string; values: Scalar[][] };

function firstCell(values: Record<string, unknown[][]>, range: string): unknown {
  return values[range]?.[0]?.[0] ?? null;
}

function dataRowOneBased(dataIndex: number): number {
  return dataIndex + 2;
}

function nextRowOneBased(rows: unknown[][], keyHeader?: string): number {
  if (!rows.length) return 2;
  if (keyHeader) {
    const k = headerIndex(rows, keyHeader);
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i]?.[k] ?? "") === "") return i + 1;
    }
  }
  return rows.length + 1;
}

function asNumber(value: unknown, label: string): number {
  const n = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`${label} is not numeric: ${String(value)}`);
  return n;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToScalars(row: unknown[]): Scalar[] {
  return row.map((v) => (v == null ? "" : v) as Scalar);
}

function competenceThresholdForRow(rows: unknown[][], row: unknown[]): number | null {
  const value = Number(row[headerIndex(rows, "Next threshold")] ?? NaN);
  return Number.isFinite(value) ? value : null;
}

function visibleBand(stars: number): string {
  if (stars <= 2) return "familiarity";
  if (stars <= 4) return "practical use";
  if (stars <= 6) return "confident command";
  if (stars <= 8) return "expert";
  return "mastery";
}

const ADAPTATION_UNITS = {
  trace: 1,
  useful: 4,
  substantial: 10,
  major: 25,
  exceptional: 50,
} as const;

function adaptationThreshold(value: number): number {
  return Math.round(100 * Math.pow(2, value - 5));
}

function storageCapacityL(rows: unknown[][]): number | null {
  if (!rows.length) return null;
  const i = findDataRow(rows, "Module ID", "system.storage.unlock_500l");
  if (i < 0) return null;
  const row = cloneRow(rows, i);
  const status = String(row[headerIndex(rows, "Status")] ?? "").toUpperCase();
  if (!status.includes("ACTIVE")) return null;
  const cfg = String(row[headerIndex(rows, "Current configuration")] ?? "");
  const liters = cfg.match(/capacity\s*([0-9]+(?:[.,][0-9]+)?)\s*L/i);
  if (liters) return Number(liters[1].replace(",", "."));
  const cubic = cfg.match(/capacity\s*([0-9]+(?:[.,][0-9]+)?)\s*m(?:³|3)/i);
  if (cubic) return Number(cubic[1].replace(",", ".")) * 1000;
  return null;
}

function assertStructuredFields(rows: unknown[][], table: string, fields: string[]): void {
  const allowed = new Set(headers(rows));
  for (const field of fields) {
    if (!allowed.has(field)) {
      throw new Error(`unknown field '${field}' for ${table}; allowed headers: ${[...allowed].join(", ")}`);
    }
  }
}

const GENERIC_TABLES = new Set<StructuredRuntimeTable>([
  "OPPORTUNITIES_CURRENT",
  "PROJECTS_CURRENT",
  "NPC_CURRENT",
  "NPC_KNOWLEDGE",
  "PLAYER_LANGUAGE",
  "PLAYER_LEXICON",
  "PLAYER_GRAMMAR",
  "SERVICES_CURRENT",
  "MAP_KNOWLEDGE_CURRENT",
  "ENTITY_INDEX",
  "MILESTONES",
  "WORLD_CLOCKS",
  "WEATHER_CURRENT",
  "BODY_INJURIES_CURRENT",
  "ACTIVE_CONTEXT",
]);

function ensureGenericTable(name: string): asserts name is StructuredRuntimeTable {
  if (!GENERIC_TABLES.has(name as StructuredRuntimeTable)) {
    throw new Error(`semantic table not allowed: ${name}`);
  }
}

function keyHeaderFor(table: StructuredRuntimeTable): string {
  return TABLES[table].keyHeader;
}

export async function prepareSemanticCommit(input: CommitRequest & { semantic: SemanticCommitPlan }) {
  const started = performance.now();
  const semantic = input.semantic;
  const touched = new Set<RuntimeTableName>([
    "CONTROL",
    "PLAYER_RESOURCES",
    "PLAYER_CONDITIONS",
    "COMPETENCES",
    "SPECIALIZATIONS",
    "PENDING_CHOICES",
    "PROGRESSION_EVENTS",
    "SESSION_LOG",
  ]);
  if ((semantic.choiceResolutions?.length ?? 0) > 0) touched.add("MILESTONES");
  if ((semantic.generalXpEvents?.length ?? 0) > 0) touched.add("CHARACTERISTICS");
  if (semantic.control?.sceneId != null || semantic.control?.locationId != null) touched.add("ACTIVE_CONTEXT");
  if ((semantic.exertionEvents?.length ?? 0) > 0 || (semantic.restEvents?.length ?? 0) > 0 || (semantic.injuryEvents?.length ?? 0) > 0 || (semantic.adaptationEvents?.length ?? 0) > 0) {
    touched.add("CHARACTERISTICS");
  }
  if ((semantic.adaptationEvents?.length ?? 0) > 0) touched.add("CHARACTERISTIC_ADAPTATION");
  if ((semantic.inventoryEvents?.length ?? 0) > 0) {
    touched.add("INVENTORY_CURRENT");
    touched.add("SYSTEM_MODULES_CURRENT");
  }
  if ((semantic.relationshipEvents?.length ?? 0) > 0) touched.add("NPC_RELATIONSHIPS_CURRENT");
  if ((semantic.socialMemoryEvents?.length ?? 0) > 0) touched.add("SOCIAL_MEMORY_CURRENT");
  if ((semantic.threadEvents?.length ?? 0) > 0) touched.add("OPEN_THREADS_CURRENT");
  if ((semantic.chatEvents?.length ?? 0) > 0) touched.add("SYSTEM_CHAT_LOG");
  if ((semantic.injuryEvents ?? []).some((e) => e.simulationOnly !== true)) touched.add("BODY_INJURIES_CURRENT");
  for (const item of semantic.rowUpserts ?? []) touched.add(item.table as RuntimeTableName);
  for (const item of semantic.rowUpdates ?? []) touched.add(item.table as RuntimeTableName);
  for (const item of semantic.rowDeletes ?? []) touched.add(item.table as RuntimeTableName);

  const ranges = [...touched].map((t) => TABLES[t].range);
  const sheets = await sheetsBatchGet(config.files.TEMP_RUNTIME, ranges);
  const inventoryTemplateRows = (semantic.inventoryEvents?.length ?? 0) > 0
    ? (await sheetsBatchGet(config.files.GM_PREGEN, [PREGEN_TABLES.COMMON_OBJECT_TEMPLATES]))[PREGEN_TABLES.COMMON_OBJECT_TEMPLATES] ?? []
    : [];

  const controlRows = sheets[TABLES.CONTROL.range] ?? [];
  const saveIndex = findDataRow(controlRows, "Key", "save_id");
  if (saveIndex < 0) throw new Error("CONTROL save_id missing");
  const saveRow = cloneRow(controlRows, saveIndex);
  const currentSave = String(saveRow[headerIndex(controlRows, "Value")] ?? "");
  if (currentSave !== input.expectedSaveId) {
    throw new Error(`save precondition failed: expected ${input.expectedSaveId}, got ${currentSave}`);
  }

  const controlValue = (key: string) => {
    const i = findDataRow(controlRows, "Key", key);
    return i < 0 ? null : cloneRow(controlRows, i)[headerIndex(controlRows, "Value")] ?? null;
  };
  const token = makeTurnToken({
    saveId: currentSave,
    worldDay: controlValue("world_day"),
    worldTime: controlValue("world_time"),
    locationId: controlValue("current_location_id"),
    sceneId: controlValue("current_scene_id"),
  });
  if (semantic.turnToken && semantic.turnToken !== token) {
    throw new Error(`turn token stale: expected current ${token}, got ${semantic.turnToken}`);
  }

  const currentDay = asNumber(controlValue("world_day"), "world_day");
  const currentTime = String(controlValue("world_time") ?? "");
  let resolvedDay = semantic.control?.worldDay ?? currentDay;
  let resolvedTime = semantic.control?.worldTime ?? currentTime;
  if (semantic.elapsedSeconds != null) {
    if (!Number.isFinite(semantic.elapsedSeconds) || semantic.elapsedSeconds < 0) {
      throw new Error("elapsedSeconds must be a finite non-negative number");
    }
    const advancedClock = advanceClock(currentDay, currentTime, semantic.elapsedSeconds);
    if (semantic.control?.worldDay != null && semantic.control.worldDay !== advancedClock.day) {
      throw new Error("control.worldDay conflicts with elapsedSeconds");
    }
    if (semantic.control?.worldTime != null && semantic.control.worldTime !== advancedClock.time) {
      throw new Error("control.worldTime conflicts with elapsedSeconds");
    }
    resolvedDay = advancedClock.day;
    resolvedTime = advancedClock.time;
  }
  const resolvedInworldEnd = semantic.session.inworldEnd ?? `Day${resolvedDay} ${resolvedTime}`;

  const sessionRows = sheets[TABLES.SESSION_LOG.range] ?? [];
  const txCol = headerIndex(sessionRows, "TX ID");
  const priorTx = sessionRows.slice(1).find((r) => String(r[txCol] ?? "") === input.txId);
  if (priorTx) {
    return {
      turnId: input.turnId,
      txId: input.txId,
      dryRun: input.dryRun ?? false,
      semantic: true,
      alreadyCommitted: true,
      elapsedMs: Math.round(performance.now() - started),
      turnToken: token,
      manifest: {
        spreadsheetId: config.files.TEMP_RUNTIME,
        sheetWrites: [],
        docAppends: (input.docAppends ?? []).map((d) => ({ ...d, txMarker: `[TX:${input.txId}]` })),
      },
      outcomes: { learning: [], adaptation: [], resources: [], pendingChoices: [] },
    };
  }

  const dirty = new Map<string, Scalar[][]>();
  const writeRow = (table: RuntimeTableName, rows: unknown[][], dataIndex: number, row: unknown[]) => {
    rows[dataIndex + 1] = row;
    dirty.set(rowRange(table, dataRowOneBased(dataIndex), headers(rows).length), [rowToScalars(row)]);
  };
  const appendRow = (table: RuntimeTableName, rows: unknown[][], row: unknown[]) => {
    const rowNo = nextRowOneBased(rows, TABLES[table].keyHeader);
    const dataIndex = rowNo - 2;
    while (rows.length < rowNo - 1) rows.push([]);
    rows[rowNo - 1] = row;
    dirty.set(rowRange(table, rowNo, headers(rows).length), [rowToScalars(row)]);
    return dataIndex;
  };
  const patchControl = (key: string, value: Scalar) => {
    const rows = controlRows;
    const i = findDataRow(rows, "Key", key);
    if (i < 0) throw new Error(`CONTROL key missing: ${key}`);
    const row = cloneRow(rows, i);
    setByHeader(rows, row, "Value", value);
    writeRow("CONTROL", rows, i, row);
  };

  const c = semantic.control ?? {};
  const activeContextRows = sheets[TABLES.ACTIVE_CONTEXT.range] ?? [];
  const patchActiveContext = (slot: string, pointer: Scalar) => {
    if (!activeContextRows.length) return;
    const i = findDataRow(activeContextRows, "Slot", slot);
    if (i < 0) return;
    const row = cloneRow(activeContextRows, i);
    setByHeader(activeContextRows, row, "Pointer", pointer);
    writeRow("ACTIVE_CONTEXT", activeContextRows, i, row);
  };

  if (semantic.elapsedSeconds != null || c.worldDay != null) patchControl("world_day", resolvedDay);
  if (semantic.elapsedSeconds != null || c.worldTime != null) patchControl("world_time", resolvedTime);
  if (c.locationId != null) {
    const locationChanged = String(controlValue("current_location_id") ?? "") !== c.locationId;
    patchControl("current_location_id", c.locationId);
    patchActiveContext("location", c.locationId);
    if (locationChanged) {
      // Parent settlement/region are derived routing hints. Blank them on actual
      // movement rather than carry a stale pointer from the previous location.
      patchActiveContext("settlement", "");
      patchActiveContext("region_pack", "");
      patchActiveContext("default_turn_tags", "");
    }
  }
  if (c.locationDisplay != null) patchControl("current_location_display", c.locationDisplay);
  if (c.sceneId != null) {
    const sceneChanged = String(controlValue("current_scene_id") ?? "") !== c.sceneId;
    patchControl("current_scene_id", c.sceneId);
    patchActiveContext("scene", c.sceneId);
    if (sceneChanged) patchActiveContext("default_turn_tags", "");
  }
  if (c.explorationPace != null) patchControl("exploration_pace", c.explorationPace);
  if (c.explorationStance != null) patchControl("exploration_stance", c.explorationStance);

  const resourceRows = sheets[TABLES.PLAYER_RESOURCES.range] ?? [];
  const resourceOutcomes: unknown[] = [];
  const applyResource = (resource: string, next: number) => {
    if (next < 0) throw new Error(`resource would become negative: ${resource}=${next}`);
    const i = findDataRow(resourceRows, "Resource", resource);
    if (i < 0) throw new Error(`unknown resource: ${resource}`);
    const row = cloneRow(resourceRows, i);
    const old = asNumber(row[headerIndex(resourceRows, "Current")], resource);
    setByHeader(resourceRows, row, "Current", next);
    writeRow("PLAYER_RESOURCES", resourceRows, i, row);
    resourceOutcomes.push({ resource, old, next, delta: next - old });
  };
  const applyResourceMax = (resource: string, nextMax: number) => {
    if (nextMax < 0) throw new Error(`resource max would become negative: ${resource}=${nextMax}`);
    const i = findDataRow(resourceRows, "Resource", resource);
    if (i < 0) throw new Error(`unknown resource: ${resource}`);
    const row = cloneRow(resourceRows, i);
    const maxIx = headerIndex(resourceRows, "Max/Threshold");
    const oldMaxRaw = row[maxIx];
    const oldMax = String(oldMaxRaw ?? "").trim() === "" ? null : asNumber(oldMaxRaw, `${resource} max`);
    setByHeader(resourceRows, row, "Max/Threshold", nextMax);
    writeRow("PLAYER_RESOURCES", resourceRows, i, row);
    resourceOutcomes.push({ resource, oldMax, nextMax, maxDelta: oldMax == null ? null : nextMax - oldMax });
  };

  for (const item of semantic.resourceSets ?? []) applyResource(item.resource, item.value);
  for (const item of semantic.resourceDeltas ?? []) {
    const i = findDataRow(resourceRows, "Resource", item.resource);
    if (i < 0) throw new Error(`unknown resource: ${item.resource}`);
    const row = cloneRow(resourceRows, i);
    const old = asNumber(row[headerIndex(resourceRows, "Current")], item.resource);
    applyResource(item.resource, old + item.delta);
  }

  const progressionRows = sheets[TABLES.PROGRESSION_EVENTS.range] ?? [];
  const generalXpOutcomes: unknown[] = [];
  const exertionOutcomes: unknown[] = [];
  const restOutcomes: unknown[] = [];
  const injuryOutcomes: unknown[] = [];

  const competenceRows = sheets[TABLES.COMPETENCES.range] ?? [];
  const specRows = sheets[TABLES.SPECIALIZATIONS.range] ?? [];
  const characteristicRows = sheets[TABLES.CHARACTERISTICS.range] ?? [];
  const adaptationRows = sheets[TABLES.CHARACTERISTIC_ADAPTATION.range] ?? [];
  const bodyRows = sheets[TABLES.BODY_INJURIES_CURRENT.range] ?? [];

  const readResource = (resource: string): number => {
    const i = findDataRow(resourceRows, "Resource", resource);
    if (i < 0) throw new Error(`unknown resource: ${resource}`);
    return asNumber(resourceRows[i + 1]?.[headerIndex(resourceRows, "Current")], resource);
  };

  const readCharacteristic = (name: string): number => {
    const i = findDataRow(characteristicRows, "Characteristic", name);
    if (i < 0) throw new Error(`unknown characteristic: ${name}`);
    return asNumber(characteristicRows[i + 1]?.[headerIndex(characteristicRows, "Value")], name);
  };

  const competenceLevel = (competenceId?: string): number => {
    if (!competenceId) return 0;
    const i = findDataRow(competenceRows, "Competence ID", competenceId);
    if (i < 0) return 0;
    return asNumber(competenceRows[i + 1]?.[headerIndex(competenceRows, "Level")], "competence level");
  };

  const specializationStars = (competenceId?: string, specialization?: string): number => {
    if (!competenceId || !specialization || !specRows.length) return 0;
    const cix = headerIndex(specRows, "Competence ID");
    const six = headerIndex(specRows, "Specialization");
    const starIx = headerIndex(specRows, "Stars");
    const hit = specRows.slice(1).find((r) =>
      String(r[cix] ?? "") === competenceId && String(r[six] ?? "") === specialization
    );
    return hit ? asNumber(hit[starIx], "specialization stars") : 0;
  };

  const survivalOutcomes: unknown[] = [];
  if (semantic.elapsedSeconds != null || semantic.survival) {
    const elapsedMinutes = Math.max(0, Number(semantic.elapsedSeconds ?? 0) / 60);
    let inferredActivity: SurvivalActivity = "normal";
    if (!semantic.survival?.segments?.length && !semantic.survival?.defaultActivity) {
      const rests = semantic.restEvents ?? [];
      const exertions = semantic.exertionEvents ?? [];
      const usefulSleepMinutes = rests
        .filter((r) => r.restId === "rest.full" && r.usefulSleep !== false)
        .reduce((sum, r) => sum + r.durationMinutes, 0);
      const restMinutes = rests.reduce((sum, r) => sum + r.durationMinutes, 0);
      const exertionMinutes = exertions.reduce((sum, e) => sum + Math.max(0, e.durationMinutes ?? 0), 0);
      if (elapsedMinutes > 0 && usefulSleepMinutes >= elapsedMinutes * 0.8) inferredActivity = "sleep";
      else if (elapsedMinutes > 0 && restMinutes >= elapsedMinutes * 0.8 && exertionMinutes === 0) inferredActivity = "rest";
      else if (exertionMinutes >= elapsedMinutes * 0.5 && exertions.length) {
        const ids = exertions.map((e) => e.actionId.toLocaleLowerCase()).join(" ");
        inferredActivity = /sprint|heavy|haul|carry|climb/.test(ids)
          ? "heavy"
          : /walk|travel|march|hike/.test(ids)
          ? "travel"
          : "work";
      }
    }

    const survival = computeSurvivalChange({
      satiety: readResource("Satiety"),
      hydration: readResource("Hydration"),
      elapsedSeconds: semantic.elapsedSeconds ?? 0,
      segments: semantic.survival?.segments,
      defaultActivity: semantic.survival?.defaultActivity ?? inferredActivity,
      foodIntakes: semantic.survival?.foodIntakes,
      waterLiters: semantic.survival?.waterLiters,
      heatMultiplier: semantic.survival?.heatMultiplier,
    });
    applyResource("Satiety", survival.newSatiety);
    applyResource("Hydration", survival.newHydration);
    survivalOutcomes.push(survival);
  }

  for (const event of semantic.exertionEvents ?? []) {
    const profile = ACTION_PROFILES[event.actionId];
    if (!profile) throw new Error(`unknown stamina action profile: ${event.actionId}`);
    const endurance = readCharacteristic("Endurance");
    const level = readResource("General Level");
    const baseMax = deriveStaminaBaseMax(level, endurance);
    const result = resolveExertion({
      actionId: event.actionId,
      durationMinutes: event.durationMinutes,
      count: event.count,
      current: readResource("Stamina"),
      ceiling: readResource("Stamina Ceiling"),
      baseMax,
      endurance,
      competenceLevel: competenceLevel(profile.competenceId),
      specializationStars: specializationStars(profile.competenceId, profile.specialization),
      loadMultiplier: event.loadMultiplier,
      environmentMultiplier: event.environmentMultiplier,
      conditionMultiplier:
        (event.conditionMultiplier ?? 1) *
        survivalStaminaModifiers(readResource("Satiety"), readResource("Hydration")).exertionCost,
      recoveryMultiplier:
        (event.recoveryMultiplier ?? 1) *
        survivalStaminaModifiers(readResource("Satiety"), readResource("Hydration")).recovery,
      explicitEfficiencyMultiplier: event.explicitEfficiencyMultiplier,
      explicitCeilingMultiplier:
        (event.explicitCeilingMultiplier ?? 1) *
        survivalStaminaModifiers(readResource("Satiety"), readResource("Hydration")).ceilingLoss,
    });
    if (result.overexertionDeficit > 0 && event.allowForcedExertion !== true) {
      throw new Error(`exertion exceeds available Stamina by ${result.overexertionDeficit}; resolve forced exertion consequence explicitly`);
    }
    applyResource("Stamina Ceiling", result.newCeiling);
    applyResource("Stamina", result.newCurrent);
    exertionOutcomes.push({ ...result, reason: event.reason ?? null });
  }

  for (const event of semantic.restEvents ?? []) {
    const endurance = readCharacteristic("Endurance");
    const level = readResource("General Level");
    const baseMax = deriveStaminaBaseMax(level, endurance);
    const result = resolveRest({
      restId: event.restId,
      durationMinutes: event.durationMinutes,
      current: readResource("Stamina"),
      ceiling: readResource("Stamina Ceiling"),
      baseMax,
      endurance,
      recoveryMultiplier:
        (event.recoveryMultiplier ?? 1) *
        survivalStaminaModifiers(readResource("Satiety"), readResource("Hydration")).recovery,
      usefulSleep: event.usefulSleep,
    });
    applyResource("Stamina Ceiling", result.newCeiling);
    applyResource("Stamina", result.newCurrent);
    restOutcomes.push({ ...result, reason: event.reason ?? null });
  }

  for (let injuryIndex = 0; injuryIndex < (semantic.injuryEvents ?? []).length; injuryIndex++) {
    const event = semantic.injuryEvents![injuryIndex];
    const endurance = readCharacteristic("Endurance");
    const result = resolveInjurySimulation({
      seed: event.seed,
      weaponForce: event.weaponForce,
      hitQuality: event.hitQuality,
      location: event.location,
      armorMitigation: event.armorMitigation,
      endurance,
      tags: event.tags,
      toxin: event.toxin,
    });
    injuryOutcomes.push({ ...result, simulationOnly: event.simulationOnly === true, reason: event.reason ?? null });

    if (event.simulationOnly === true) continue;

    const oldHp = readResource("HP");
    applyResource("HP", Math.max(0, oldHp - result.hpLoss));

    const injuryId = event.injuryId ?? `injury.${input.txId}.${injuryIndex + 1}`;
    const row = Array(headers(bodyRows).length).fill("");
    setByHeader(bodyRows, row, "Injury ID", injuryId);
    setByHeader(bodyRows, row, "Entity ID", event.targetEntityId ?? "player.shura");
    setByHeader(bodyRows, row, "Location", event.location);
    setByHeader(bodyRows, row, "Severity", result.severity);
    setByHeader(bodyRows, row, "Tags", (event.tags ?? []).join(";"));
    setByHeader(bodyRows, row, "HP Loss", result.hpLoss);
    setByHeader(bodyRows, row, "Bleeding", result.bleeding);
    setByHeader(bodyRows, row, "Pain", result.severity === "SUPERFICIAL" ? "minor" : result.severity === "LIGHT" ? "low" : result.severity === "SERIOUS" ? "moderate" : result.severity === "SEVERE" ? "high" : "extreme");
    setByHeader(bodyRows, row, "Shock", result.severity === "SUPERFICIAL" ? "none" : result.severity === "LIGHT" ? "low" : result.severity === "SERIOUS" ? "moderate" : result.severity === "SEVERE" ? "high" : "very high");
    setByHeader(
      bodyRows,
      row,
      "Functional consequence",
      result.criticalStructureHit
        ? `critical structure: ${result.criticalStructure}`
        : result.severity === "SUPERFICIAL"
        ? "local nuisance"
        : result.severity === "LIGHT"
        ? "local impairment possible"
        : "location-dependent functional impairment likely",
    );
    setByHeader(bodyRows, row, "Toxin", result.toxin ? JSON.stringify(result.toxin) : "");
    setByHeader(bodyRows, row, "Status", "ACTIVE");
    setByHeader(bodyRows, row, "Created at", resolvedInworldEnd);
    setByHeader(bodyRows, row, "Last updated", resolvedInworldEnd);
    setByHeader(bodyRows, row, "Source TX", input.txId);
    setByHeader(bodyRows, row, "Version", 1);
    appendRow("BODY_INJURIES_CURRENT", bodyRows, row);
  }

  for (let eventIndex = 0; eventIndex < (semantic.generalXpEvents ?? []).length; eventIndex++) {
    const event = semantic.generalXpEvents![eventIndex];
    const oldLevel = readResource("General Level");
    const oldXp = readResource("General XP");
    const delta = computeGeneralXpAward({
      level: oldLevel,
      exactOverride: event.exactXpOverride,
      effectiveThreatRating: event.effectiveThreatRating,
      contribution: event.contribution,
      complexityBonus: event.complexityBonus,
      thresholdFraction: event.thresholdFraction,
    });
    const advanced = advanceGeneralXp(oldLevel, oldXp, delta);

    applyResource("General Level", advanced.newLevel);
    applyResource("General XP", advanced.newXp);
    if (advanced.newLevel !== oldLevel) {
      const endurance = readCharacteristic("Endurance");
      const derivedMax = deriveStaminaBaseMax(advanced.newLevel, endurance);
      applyResourceMax("HP", derivedMax);
      applyResourceMax("Stamina", derivedMax);
    }
    if (advanced.characteristicPointsGranted) {
      applyResource("Free Characteristic Points", readResource("Free Characteristic Points") + advanced.characteristicPointsGranted);
    }
    if (advanced.skillPointsGranted) {
      applyResource("Free Skill Points", readResource("Free Skill Points") + advanced.skillPointsGranted);
    }
    if (advanced.classPointsGranted) {
      applyResource("Free Class Points", readResource("Free Class Points") + advanced.classPointsGranted);
    }

    const erow = Array(headers(progressionRows).length).fill("");
    setByHeader(progressionRows, erow, "TX ID", `${input.txId}#general${eventIndex + 1}`);
    setByHeader(progressionRows, erow, "Inworld time", resolvedInworldEnd);
    setByHeader(progressionRows, erow, "Event type", `general_xp:${event.sourceType}`);
    setByHeader(progressionRows, erow, "Modifiers JSON", JSON.stringify({
      effectiveThreatRating: event.effectiveThreatRating ?? null,
      contribution: event.contribution ?? null,
      complexityBonus: event.complexityBonus ?? null,
      thresholdFraction: event.thresholdFraction ?? null,
      sourceRef: event.sourceRef ?? null,
    }));
    setByHeader(progressionRows, erow, "Old XP", oldXp);
    setByHeader(progressionRows, erow, "Delta", delta);
    setByHeader(progressionRows, erow, "New XP", advanced.newXp);
    setByHeader(progressionRows, erow, "Old level", oldLevel);
    setByHeader(progressionRows, erow, "New level", advanced.newLevel);
    setByHeader(progressionRows, erow, "Notes", event.reason);
    appendRow("PROGRESSION_EVENTS", progressionRows, erow);
    generalXpOutcomes.push({ sourceType: event.sourceType, sourceRef: event.sourceRef ?? null, ...advanced });
  }

  const adaptationOutcomes: unknown[] = [];
  for (let eventIndex = 0; eventIndex < (semantic.adaptationEvents ?? []).length; eventIndex++) {
    const event = semantic.adaptationEvents![eventIndex];
    const ai = findDataRow(adaptationRows, "Characteristic", event.characteristic);
    if (ai < 0) throw new Error(`unknown adaptation characteristic: ${event.characteristic}`);
    const ci = findDataRow(characteristicRows, "Characteristic", event.characteristic);
    if (ci < 0) throw new Error(`unknown characteristic: ${event.characteristic}`);

    const arow = cloneRow(adaptationRows, ai);
    const crow = cloneRow(characteristicRows, ci);
    const currentValue = asNumber(crow[headerIndex(characteristicRows, "Value")], `${event.characteristic} value`);
    const ledgerValue = asNumber(arow[headerIndex(adaptationRows, "Current Value")], `${event.characteristic} ledger value`);
    if (currentValue !== ledgerValue) {
      throw new Error(`characteristic/adaptation ledger mismatch for ${event.characteristic}: ${currentValue} vs ${ledgerValue}`);
    }

    const oldProgress = asNumber(arow[headerIndex(adaptationRows, "Hidden Progress")], `${event.characteristic} hidden progress`);
    const storedThreshold = asNumber(arow[headerIndex(adaptationRows, "Next Threshold")], `${event.characteristic} threshold`);
    const expectedThreshold = adaptationThreshold(currentValue);
    if (storedThreshold !== expectedThreshold) {
      throw new Error(`adaptation threshold mismatch for ${event.characteristic}: stored=${storedThreshold}, expected=${expectedThreshold}`);
    }

    const rawUnits = event.exactUnitsOverride ?? ADAPTATION_UNITS[event.band];
    const requestedUnits = Math.max(0, Math.round(event.secondary ? rawUnits * 0.4 : rawUnits));
    let eventUnits = requestedUnits;
    const dailyDayIx = headerIndex(adaptationRows, "Daily Day");
    const dailyUnitsIx = headerIndex(adaptationRows, "Daily Units");
    const priorDailyDay = Number(arow[dailyDayIx] ?? 0) || 0;
    let priorDailyUnits = Number(arow[dailyUnitsIx] ?? 0) || 0;
    if (priorDailyDay !== resolvedDay) priorDailyUnits = 0;

    if (event.band !== "exceptional") {
      eventUnits = Math.min(eventUnits, Math.max(0, 25 - priorDailyUnits));
    }
    if (eventUnits === 0) {
      adaptationOutcomes.push({
        characteristic: event.characteristic,
        band: event.band,
        secondary: event.secondary === true,
        requestedUnits: rawUnits,
        appliedUnits: 0,
        oldProgress,
        newProgress: oldProgress,
        oldValue: currentValue,
        newValue: currentValue,
        nextThreshold: expectedThreshold,
        dailyUnits: priorDailyUnits,
        cappedByDailyLimit: requestedUnits > 0 && event.band !== "exceptional",
        reason: event.reason,
      });
      continue;
    }
    const newDailyUnits = priorDailyUnits + eventUnits;
    let newProgress = oldProgress + eventUnits;
    let newValue = currentValue;
    let naturalGain = 0;
    if (eventUnits > 0 && newProgress >= expectedThreshold) {
      newProgress -= expectedThreshold;
      newValue += 1;
      naturalGain = 1;
    }
    const newThreshold = adaptationThreshold(newValue);

    setByHeader(adaptationRows, arow, "Current Value", newValue);
    setByHeader(adaptationRows, arow, "Hidden Progress", newProgress);
    setByHeader(adaptationRows, arow, "Next Threshold", newThreshold);
    setByHeader(
      adaptationRows,
      arow,
      "Cumulative Units Through Current",
      asNumber(arow[headerIndex(adaptationRows, "Cumulative Units Through Current")], "cumulative adaptation") + eventUnits,
    );
    setByHeader(
      adaptationRows,
      arow,
      "Natural Gains This Audit",
      (Number(arow[headerIndex(adaptationRows, "Natural Gains This Audit")] ?? 0) || 0) + naturalGain,
    );
    setByHeader(adaptationRows, arow, "Last Updated World Time", resolvedInworldEnd);
    const priorEvidence = String(arow[headerIndex(adaptationRows, "Evidence Summary")] ?? "").trim();
    const evidence = event.evidence ?? event.reason;
    const suffix = `${resolvedInworldEnd}: ${evidence}; +${eventUnits} ${event.band.toUpperCase()}${event.secondary ? " secondary" : ""} adaptation.`;
    setByHeader(adaptationRows, arow, "Evidence Summary", priorEvidence ? `${priorEvidence} ${suffix}` : suffix);
    setByHeader(adaptationRows, arow, "Daily Day", resolvedDay);
    setByHeader(adaptationRows, arow, "Daily Units", newDailyUnits);
    writeRow("CHARACTERISTIC_ADAPTATION", adaptationRows, ai, arow);

    if (newValue !== currentValue) {
      setByHeader(characteristicRows, crow, "Value", newValue);
      writeRow("CHARACTERISTICS", characteristicRows, ci, crow);
      if (event.characteristic === "Endurance") {
        const derivedMax = deriveStaminaBaseMax(readResource("General Level"), newValue);
        applyResourceMax("HP", derivedMax);
        applyResourceMax("Stamina", derivedMax);
      } else if (event.characteristic === "Intelligence") {
        applyResourceMax("Mana", 10 * newValue);
      }
    }

    adaptationOutcomes.push({
      characteristic: event.characteristic,
      band: event.band,
      secondary: event.secondary === true,
      requestedUnits: rawUnits,
      appliedUnits: eventUnits,
      oldProgress,
      newProgress,
      oldValue: currentValue,
      newValue,
      nextThreshold: newThreshold,
      dailyUnits: newDailyUnits,
      cappedByDailyLimit: event.band !== "exceptional" && eventUnits < requestedUnits,
      reason: event.reason,
    });
  }

  const conditionRows = sheets[TABLES.PLAYER_CONDITIONS.range] ?? [];
  for (const item of semantic.conditions ?? []) {
    const i = findDataRow(conditionRows, "Condition ID", item.conditionId);
    if (i < 0) throw new Error(`unknown condition: ${item.conditionId}`);
    const row = cloneRow(conditionRows, i);
    setByHeader(conditionRows, row, "Value", item.value);
    if (item.unit != null) setByHeader(conditionRows, row, "Unit/grade", item.unit);
    if (item.notes != null) setByHeader(conditionRows, row, "Current notes", item.notes);
    if (item.updatedAt != null) setByHeader(conditionRows, row, "Last updated", item.updatedAt);
    writeRow("PLAYER_CONDITIONS", conditionRows, i, row);
  }

  const inventoryRows = sheets[TABLES.INVENTORY_CURRENT.range] ?? [];
  const inventoryOutcomes: unknown[] = [];
  for (const event of semantic.inventoryEvents ?? []) {
    if (event.qtyDelta != null && event.qtySet != null) {
      throw new Error(`inventory event cannot set both qtyDelta and qtySet: ${event.itemId}`);
    }

    const existingIndex = findDataRow(inventoryRows, "Item ID", event.itemId);
    const existingRow = existingIndex >= 0 ? cloneRow(inventoryRows, existingIndex) : null;
    const currentQty = existingRow
      ? asNumber(existingRow[headerIndex(inventoryRows, "Qty")], `${event.itemId} quantity`)
      : 0;
    const nextQty = event.qtySet != null
      ? event.qtySet
      : event.qtyDelta != null
      ? currentQty + event.qtyDelta
      : currentQty;

    if (!Number.isFinite(nextQty) || nextQty < 0) {
      throw new Error(`inventory quantity would become invalid: ${event.itemId}=${nextQty}`);
    }

    const currentTemplateId = existingRow ? String(existingRow[headerIndex(inventoryRows, "Template ID")] ?? "").trim() : "";
    const templateId = event.templateId ?? currentTemplateId;
    if (!templateId) throw new Error(`inventory templateId required: ${event.itemId}`);
    const templateIndex = findDataRow(inventoryTemplateRows, "Template ID", templateId);
    if (templateIndex < 0) throw new Error(`unknown inventory template: ${templateId}`);
    const templateRow = cloneRow(inventoryTemplateRows, templateIndex);
    const templateItem = String(templateRow[headerIndex(inventoryTemplateRows, "Item")] ?? "");
    const templateUnit = String(templateRow[headerIndex(inventoryTemplateRows, "Unit")] ?? "");

    if (event.unit != null && templateUnit && event.unit !== templateUnit) {
      throw new Error(`inventory unit/template mismatch for ${event.itemId}: ${event.unit} vs ${templateUnit}`);
    }

    if (existingIndex < 0 && nextQty <= 0) {
      throw new Error(`new inventory row requires positive quantity: ${event.itemId}`);
    }

    if (existingIndex >= 0 && nextQty === 0) {
      writeRow("INVENTORY_CURRENT", inventoryRows, existingIndex, Array(headers(inventoryRows).length).fill(""));
      inventoryOutcomes.push({
        itemId: event.itemId,
        templateId,
        oldQty: currentQty,
        newQty: 0,
        removedFromCurrent: true,
        reason: event.reason ?? null,
      });
      continue;
    }

    const row = existingRow ?? Array(headers(inventoryRows).length).fill("");
    if (!existingRow) {
      if (!event.location || !event.custodian) {
        throw new Error(`new inventory row requires location and custodian: ${event.itemId}`);
      }
      setByHeader(inventoryRows, row, "Item ID", event.itemId);
      setByHeader(inventoryRows, row, "Item", event.item ?? templateItem);
      setByHeader(inventoryRows, row, "Unit", event.unit ?? templateUnit);
      setByHeader(inventoryRows, row, "Location/container", event.location);
      setByHeader(inventoryRows, row, "Custodian", event.custodian);
      setByHeader(inventoryRows, row, "Condition/known notes", event.conditionNotes ?? "");
      setByHeader(inventoryRows, row, "Tags", event.tags ?? "inventory");
      setByHeader(inventoryRows, row, "Version", 1);
    } else {
      if (event.item != null) setByHeader(inventoryRows, row, "Item", event.item);
      if (event.unit != null) setByHeader(inventoryRows, row, "Unit", event.unit);
      if (event.location != null) setByHeader(inventoryRows, row, "Location/container", event.location);
      if (event.custodian != null) setByHeader(inventoryRows, row, "Custodian", event.custodian);
      if (event.conditionNotes != null) setByHeader(inventoryRows, row, "Condition/known notes", event.conditionNotes);
      if (event.tags != null) setByHeader(inventoryRows, row, "Tags", event.tags);
      const oldVersion = Number(row[headerIndex(inventoryRows, "Version")] ?? 0) || 0;
      setByHeader(inventoryRows, row, "Version", oldVersion + 1);
    }

    setByHeader(inventoryRows, row, "Qty", nextQty);
    setByHeader(inventoryRows, row, "Template ID", templateId);
    if (event.massKgOverride !== undefined) {
      setByHeader(inventoryRows, row, "Mass kg override", event.massKgOverride ?? "");
    }
    if (event.volumeLOverride !== undefined) {
      setByHeader(inventoryRows, row, "Volume L override", event.volumeLOverride ?? "");
    }
    setByHeader(inventoryRows, row, "Last updated", event.lastUpdated ?? resolvedInworldEnd);

    if (existingIndex >= 0) writeRow("INVENTORY_CURRENT", inventoryRows, existingIndex, row);
    else appendRow("INVENTORY_CURRENT", inventoryRows, row);

    inventoryOutcomes.push({
      itemId: event.itemId,
      templateId,
      oldQty: currentQty,
      newQty: nextQty,
      delta: nextQty - currentQty,
      removedFromCurrent: false,
      location: row[headerIndex(inventoryRows, "Location/container")],
      custodian: row[headerIndex(inventoryRows, "Custodian")],
      reason: event.reason ?? null,
    });
  }

  const systemModuleRows = sheets[TABLES.SYSTEM_MODULES_CURRENT.range] ?? [];
  let inventorySummary: unknown = null;
  if ((semantic.inventoryEvents?.length ?? 0) > 0) {
    const templateById = new Map<string, unknown[]>();
    for (let i = 1; i < inventoryTemplateRows.length; i++) {
      const row = inventoryTemplateRows[i] ?? [];
      const id = String(row[headerIndex(inventoryTemplateRows, "Template ID")] ?? "").trim();
      if (id) templateById.set(id, row);
    }

    const trackedItemIds = new Set<string>();
    for (const row of inventoryRows.slice(1)) {
      const id = String(row?.[headerIndex(inventoryRows, "Item ID")] ?? "").trim();
      if (id) trackedItemIds.add(id);
    }

    let knownMassKg = 0;
    let knownTopLevelStorageVolumeL = 0;
    const unknownMassItemIds: string[] = [];
    const unknownTopLevelStorageVolumeItemIds: string[] = [];

    for (const row of inventoryRows.slice(1)) {
      const itemId = String(row?.[headerIndex(inventoryRows, "Item ID")] ?? "").trim();
      if (!itemId) continue;
      const qty = asNumber(row[headerIndex(inventoryRows, "Qty")], `${itemId} quantity`);
      const templateId = String(row?.[headerIndex(inventoryRows, "Template ID")] ?? "").trim();
      const tpl = templateById.get(templateId);
      const massOverrideRaw = row?.[headerIndex(inventoryRows, "Mass kg override")];
      const volumeOverrideRaw = row?.[headerIndex(inventoryRows, "Volume L override")];
      const massOverride = String(massOverrideRaw ?? "").trim() === "" ? null : asNumber(massOverrideRaw, `${itemId} mass override`);
      const volumeOverride = String(volumeOverrideRaw ?? "").trim() === "" ? null : asNumber(volumeOverrideRaw, `${itemId} volume override`);
      const unitMassKg = massOverride ?? (tpl ? numberOrNull(tpl[headerIndex(inventoryTemplateRows, "Mass kg")]) : null);
      const unitVolumeL = volumeOverride ?? (tpl ? numberOrNull(tpl[headerIndex(inventoryTemplateRows, "Occupied volume L")]) : null);

      if (unitMassKg == null) unknownMassItemIds.push(itemId);
      else knownMassKg += unitMassKg * qty;

      const location = String(row?.[headerIndex(inventoryRows, "Location/container")] ?? "");
      const containerCandidate = location.split("/")[0]?.trim() ?? "";
      const nested = trackedItemIds.has(containerCandidate);
      if (location.includes("System Storage") && !nested) {
        if (unitVolumeL == null) unknownTopLevelStorageVolumeItemIds.push(itemId);
        else knownTopLevelStorageVolumeL += unitVolumeL * qty;
      }
    }

    const capacityL = storageCapacityL(systemModuleRows);
    if (capacityL != null && knownTopLevelStorageVolumeL > capacityL + 1e-9) {
      throw new Error(
        `System Storage known occupied volume exceeds capacity: ${knownTopLevelStorageVolumeL.toFixed(3)}L > ${capacityL.toFixed(3)}L`,
      );
    }

    inventorySummary = {
      rows: trackedItemIds.size,
      knownMassKg,
      unknownMassItemIds,
      storageCapacityL: capacityL,
      knownTopLevelStorageVolumeL,
      knownRemainingStorageVolumeL: capacityL == null ? null : capacityL - knownTopLevelStorageVolumeL,
      unknownTopLevelStorageVolumeItemIds,
      capacityCheckComplete: capacityL != null && unknownTopLevelStorageVolumeItemIds.length === 0,
      knownCapacityExceeded: capacityL != null && knownTopLevelStorageVolumeL > capacityL + 1e-9,
    };
  }

  const pendingRows = sheets[TABLES.PENDING_CHOICES.range] ?? [];
  const learningOutcomes: unknown[] = [];
  const pendingChoices: unknown[] = [];
  const choiceResolutionOutcomes: unknown[] = [];

  for (let resolutionIndex = 0; resolutionIndex < (semantic.choiceResolutions ?? []).length; resolutionIndex++) {
    const resolution = semantic.choiceResolutions![resolutionIndex];
    const choiceIndex = findDataRow(pendingRows, "Choice ID", resolution.choiceId);
    if (choiceIndex < 0) throw new Error(`pending choice not found: ${resolution.choiceId}`);
    const choiceRow = cloneRow(pendingRows, choiceIndex);
    const status = String(choiceRow[headerIndex(pendingRows, "Status")] ?? "");
    if (!status.startsWith("PENDING")) throw new Error(`choice is not pending: ${resolution.choiceId} status=${status}`);
    const parentId = String(choiceRow[headerIndex(pendingRows, "Parent ID")] ?? "");
    const competenceIndex = findDataRow(competenceRows, "Competence ID", parentId);
    if (competenceIndex < 0) throw new Error(`choice parent competence missing: ${parentId}`);
    const competenceRow = cloneRow(competenceRows, competenceIndex);
    const pendingId = String(competenceRow[headerIndex(competenceRows, "Pending milestone")] ?? "");
    if (pendingId && pendingId !== resolution.choiceId) {
      throw new Error(`competence pending milestone mismatch: ${pendingId} vs ${resolution.choiceId}`);
    }

    // PENDING_CHOICES is hot state only. The selected result is persisted
    // in MILESTONES / PROGRESSION_EVENTS / SESSION_LOG, so free the row
    // immediately instead of accumulating RESOLVED tombstones.
    writeRow("PENDING_CHOICES", pendingRows, choiceIndex, Array(headers(pendingRows).length).fill(""));

    const oldLevel = asNumber(competenceRow[headerIndex(competenceRows, "Level")], "competence level");
    const oldXp = asNumber(competenceRow[headerIndex(competenceRows, "Carried XP")], "competence XP");
    const deferred = Number(competenceRow[headerIndex(competenceRows, "Deferred XP")] ?? 0) || 0;
    setByHeader(competenceRows, competenceRow, "Pending milestone", "");
    setByHeader(competenceRows, competenceRow, "Deferred XP", 0);

    let released = null;
    if (deferred > 0) {
      released = advanceCompetence(oldLevel, oldXp, deferred);
      setByHeader(competenceRows, competenceRow, "Level", released.newLevel);
      setByHeader(competenceRows, competenceRow, "Carried XP", released.newXp);
      setByHeader(competenceRows, competenceRow, "Deferred XP", released.deferredXp ?? 0);
      if (released.nextThreshold != null) setByHeader(competenceRows, competenceRow, "Next threshold", released.nextThreshold);

      for (const level of released.milestoneLevels) {
        const nextChoiceId = `choice.${parentId}.lv${level}`;
        if (findDataRow(pendingRows, "Choice ID", nextChoiceId) < 0) {
          const prow = Array(headers(pendingRows).length).fill("");
          setByHeader(pendingRows, prow, "Choice ID", nextChoiceId);
          setByHeader(pendingRows, prow, "Choice type", "MILESTONE");
          setByHeader(pendingRows, prow, "Parent ID", parentId);
          setByHeader(pendingRows, prow, "Trigger level", level);
          setByHeader(pendingRows, prow, "Status", "PENDING_GENERATION");
          setByHeader(pendingRows, prow, "Options JSON", "[]");
          setByHeader(pendingRows, prow, "Created at", resolvedInworldEnd);
          setByHeader(pendingRows, prow, "TX ID", input.txId);
          setByHeader(pendingRows, prow, "Version", 1);
          appendRow("PENDING_CHOICES", pendingRows, prow);
          setByHeader(competenceRows, competenceRow, "Pending milestone", nextChoiceId);
          pendingChoices.push({ choiceId: nextChoiceId, competenceId: parentId, triggerLevel: level });
        }
      }

      const erow = Array(headers(progressionRows).length).fill("");
      setByHeader(progressionRows, erow, "TX ID", `${input.txId}#release${resolutionIndex + 1}`);
      setByHeader(progressionRows, erow, "Inworld time", resolvedInworldEnd);
      setByHeader(progressionRows, erow, "Competence ID", parentId);
      setByHeader(progressionRows, erow, "Event type", "deferred_xp_release");
      setByHeader(progressionRows, erow, "Old XP", oldXp);
      setByHeader(progressionRows, erow, "Delta", deferred);
      setByHeader(progressionRows, erow, "New XP", released.newXp);
      setByHeader(progressionRows, erow, "Old level", oldLevel);
      setByHeader(progressionRows, erow, "New level", released.newLevel);
      setByHeader(progressionRows, erow, "Notes", `choice ${resolution.choiceId} resolved as ${resolution.selectedOption}`);
      appendRow("PROGRESSION_EVENTS", progressionRows, erow);
    }

    setByHeader(competenceRows, competenceRow, "Last TX", input.txId);
    writeRow("COMPETENCES", competenceRows, competenceIndex, competenceRow);
    choiceResolutionOutcomes.push({
      choiceId: resolution.choiceId,
      selectedOption: resolution.selectedOption,
      releasedDeferredXp: deferred,
      progression: released,
    });
  }

  for (let eventIndex = 0; eventIndex < (semantic.learningEvents ?? []).length; eventIndex++) {
    const event = semantic.learningEvents![eventIndex];
    const i = findDataRow(competenceRows, "Competence ID", event.competenceId);
    if (i < 0) throw new Error(`unknown competence: ${event.competenceId}`);
    const row = cloneRow(competenceRows, i);
    const oldLevel = asNumber(row[headerIndex(competenceRows, "Level")], "competence level");
    const oldXp = asNumber(row[headerIndex(competenceRows, "Carried XP")], "competence XP");
    const delta = computeCompetenceAward({
      band: event.band,
      productiveMinutes: event.productiveMinutes,
      modifiers: event.modifiers,
      exactOverride: event.exactXpOverride,
    });
    const pendingBefore = String(row[headerIndex(competenceRows, "Pending milestone")] ?? "").trim();
    const oldDeferred = Number(row[headerIndex(competenceRows, "Deferred XP")] ?? 0) || 0;
    const advanced = pendingBefore
      ? {
          oldLevel,
          newLevel: oldLevel,
          oldXp,
          newXp: oldXp,
          delta,
          deferredXp: delta,
          nextThreshold: competenceThresholdForRow(competenceRows, row),
          crossedLevels: [] as number[],
          milestoneLevels: [] as number[],
        }
      : advanceCompetence(oldLevel, oldXp, delta);
    const newDeferred = oldDeferred + (advanced.deferredXp ?? 0);
    setByHeader(competenceRows, row, "Level", advanced.newLevel);
    setByHeader(competenceRows, row, "Carried XP", advanced.newXp);
    setByHeader(competenceRows, row, "Deferred XP", newDeferred);
    if (advanced.nextThreshold != null) setByHeader(competenceRows, row, "Next threshold", advanced.nextThreshold);
    setByHeader(
      competenceRows,
      row,
      "Last delta",
      pendingBefore || (advanced.deferredXp ?? 0) > 0
        ? `+${delta} awarded; ${advanced.deferredXp ?? delta} deferred pending milestone — ${event.reason ?? event.band}`
        : `+${delta} — ${event.reason ?? event.band}`,
    );
    setByHeader(competenceRows, row, "Last TX", input.txId);

    let specializationOutcome: unknown = null;
    if (event.specialization) {
      const cix = headerIndex(specRows, "Competence ID");
      const six = headerIndex(specRows, "Specialization");
      const specDataIndex = specRows.slice(1).findIndex((r) =>
        String(r[cix] ?? "") === event.competenceId && String(r[six] ?? "") === event.specialization
      );
      if (specDataIndex < 0) {
        throw new Error(`unknown specialization: ${event.competenceId}/${event.specialization}`);
      }
      {
        const srow = cloneRow(specRows, specDataIndex);
        let stars = asNumber(srow[headerIndex(specRows, "Stars")], "specialization stars");
        let progress = Number(srow[headerIndex(specRows, "Internal progress")] ?? 0) || 0;
        const sdelta = computeSpecializationProgress({
          quality: event.specializationQuality,
          productiveMinutes: event.productiveMinutes,
          repetition: event.modifiers?.repetition,
          exactOverride: event.exactSpecializationProgressOverride,
        });
        progress += sdelta;
        const oldStars = stars;
        let threshold = nextStarThreshold(stars);
        while (threshold != null && stars < 10 && progress >= threshold) {
          progress -= threshold;
          stars += 1;
          threshold = nextStarThreshold(stars);
        }
        setByHeader(specRows, srow, "Stars", stars);
        setByHeader(specRows, srow, "Visible band", visibleBand(stars));
        setByHeader(specRows, srow, "Internal progress", progress);
        setByHeader(specRows, srow, "Next star threshold", threshold ?? 0);
        setByHeader(specRows, srow, "Growth reasons", event.reason ?? event.band);
        setByHeader(specRows, srow, "Last TX", input.txId);
        writeRow("SPECIALIZATIONS", specRows, specDataIndex, srow);
        specializationOutcome = { specialization: event.specialization, oldStars, stars, progressDelta: sdelta, progress };
      }
    }

    const newChoiceIds: string[] = [];
    for (const level of advanced.milestoneLevels) {
      if (!MILESTONE_LEVELS.has(level)) continue;
      const choiceId = `choice.${event.competenceId}.lv${level}`;
      const existing = findDataRow(pendingRows, "Choice ID", choiceId);
      if (existing < 0) {
        const prow = Array(headers(pendingRows).length).fill("");
        setByHeader(pendingRows, prow, "Choice ID", choiceId);
        setByHeader(pendingRows, prow, "Choice type", "MILESTONE");
        setByHeader(pendingRows, prow, "Parent ID", event.competenceId);
        setByHeader(pendingRows, prow, "Trigger level", level);
        setByHeader(pendingRows, prow, "Status", "PENDING_GENERATION");
        setByHeader(pendingRows, prow, "Options JSON", "[]");
        setByHeader(pendingRows, prow, "Created at", resolvedInworldEnd);
        setByHeader(pendingRows, prow, "TX ID", input.txId);
        setByHeader(pendingRows, prow, "Version", 1);
        appendRow("PENDING_CHOICES", pendingRows, prow);
        pendingChoices.push({ choiceId, competenceId: event.competenceId, triggerLevel: level });
        newChoiceIds.push(choiceId);
      }
    }

    if (newChoiceIds.length) setByHeader(competenceRows, row, "Pending milestone", newChoiceIds.join(";"));
    writeRow("COMPETENCES", competenceRows, i, row);

    const erow = Array(headers(progressionRows).length).fill("");
    setByHeader(progressionRows, erow, "TX ID", `${input.txId}#learn${eventIndex + 1}`);
    setByHeader(progressionRows, erow, "Inworld time", resolvedInworldEnd);
    setByHeader(progressionRows, erow, "Competence ID", event.competenceId);
    setByHeader(progressionRows, erow, "Specialization", event.specialization ?? "");
    setByHeader(progressionRows, erow, "Event type", "learning");
    setByHeader(progressionRows, erow, "Band", event.band);
    setByHeader(progressionRows, erow, "Productive minutes", event.productiveMinutes);
    setByHeader(progressionRows, erow, "Modifiers JSON", JSON.stringify(event.modifiers ?? {}));
    setByHeader(progressionRows, erow, "Old XP", oldXp);
    setByHeader(progressionRows, erow, "Delta", delta);
    setByHeader(progressionRows, erow, "New XP", advanced.newXp);
    setByHeader(progressionRows, erow, "Old level", oldLevel);
    setByHeader(progressionRows, erow, "New level", advanced.newLevel);
    setByHeader(
      progressionRows,
      erow,
      "Notes",
      `${event.reason ?? ""}${pendingBefore || (advanced.deferredXp ?? 0) > 0 ? ` | deferredXP=${advanced.deferredXp ?? delta}; totalDeferred=${newDeferred}` : ""}`,
    );
    appendRow("PROGRESSION_EVENTS", progressionRows, erow);
    learningOutcomes.push({
      competenceId: event.competenceId,
      ...advanced,
      deferredTotal: newDeferred,
      pendingBefore: pendingBefore || null,
      specialization: specializationOutcome,
    });
  }

  const encodeIds = (values?: string[]) => [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))].join(";");

  const relationshipRows = sheets[TABLES.NPC_RELATIONSHIPS_CURRENT.range] ?? [];
  const relationshipOutcomes: unknown[] = [];
  for (const event of semantic.relationshipEvents ?? []) {
    validateRelationshipEventShape(event);
    const operation = event.operation ?? "UPSERT";
    const index = findDataRow(relationshipRows, "Relationship ID", event.relationshipId);

    if (operation === "RETIRE") {
      if (index >= 0) {
        writeRow("NPC_RELATIONSHIPS_CURRENT", relationshipRows, index, Array(headers(relationshipRows).length).fill(""));
      }
      relationshipOutcomes.push({ relationshipId: event.relationshipId, operation, removedFromCurrent: index >= 0 });
      continue;
    }

    const row = index >= 0 ? cloneRow(relationshipRows, index) : Array(headers(relationshipRows).length).fill("");
    if (index >= 0) {
      const existingActor = String(row[headerIndex(relationshipRows, "Actor ID")] ?? "");
      const existingToward = String(row[headerIndex(relationshipRows, "Toward ID")] ?? "");
      if ((existingActor && existingActor !== event.actorId) || (existingToward && existingToward !== event.towardId)) {
        throw new Error(`relationship endpoint mutation forbidden: ${event.relationshipId}`);
      }
    }

    setByHeader(relationshipRows, row, "Relationship ID", event.relationshipId);
    setByHeader(relationshipRows, row, "Actor ID", event.actorId);
    setByHeader(relationshipRows, row, "Toward ID", event.towardId);
    if (event.trust != null) setByHeader(relationshipRows, row, "Trust", event.trust);
    if (event.respect != null) setByHeader(relationshipRows, row, "Respect", event.respect);
    if (event.warmth != null) setByHeader(relationshipRows, row, "Warmth", event.warmth);
    if (event.fear != null) setByHeader(relationshipRows, row, "Fear", event.fear);
    if (event.tension != null) setByHeader(relationshipRows, row, "Tension", event.tension);
    if (event.obligationDebt != null) setByHeader(relationshipRows, row, "Obligation/debt", event.obligationDebt);
    if (event.economicInterest != null) setByHeader(relationshipRows, row, "Economic interest", event.economicInterest);
    if (event.valueCompatibility != null) setByHeader(relationshipRows, row, "Value compatibility", event.valueCompatibility);
    if (event.currentStance != null) setByHeader(relationshipRows, row, "Current stance", event.currentStance);
    if (event.evidenceRefs != null) setByHeader(relationshipRows, row, "Evidence refs", encodeIds(event.evidenceRefs));
    setByHeader(relationshipRows, row, "Last changed", event.lastChanged ?? resolvedInworldEnd);
    setByHeader(relationshipRows, row, "Last evaluated", event.lastEvaluated ?? resolvedInworldEnd);
    setByHeader(relationshipRows, row, "Status", event.status ?? "ACTIVE");
    if (event.notes != null) setByHeader(relationshipRows, row, "Notes", event.notes);

    if (index >= 0) writeRow("NPC_RELATIONSHIPS_CURRENT", relationshipRows, index, row);
    else appendRow("NPC_RELATIONSHIPS_CURRENT", relationshipRows, row);
    relationshipOutcomes.push({
      relationshipId: event.relationshipId,
      operation,
      actorId: event.actorId,
      towardId: event.towardId,
      status: row[headerIndex(relationshipRows, "Status")],
    });
  }

  const socialMemoryRows = sheets[TABLES.SOCIAL_MEMORY_CURRENT.range] ?? [];
  const socialMemoryOutcomes: unknown[] = [];
  for (const event of semantic.socialMemoryEvents ?? []) {
    const operation = event.operation ?? "UPSERT";
    const index = findDataRow(socialMemoryRows, "Memory ID", event.memoryId);

    if (operation === "RETIRE") {
      if (index >= 0) {
        writeRow("SOCIAL_MEMORY_CURRENT", socialMemoryRows, index, Array(headers(socialMemoryRows).length).fill(""));
      }
      socialMemoryOutcomes.push({ memoryId: event.memoryId, operation, removedFromCurrent: index >= 0 });
      continue;
    }

    if (operation === "TOUCH" && index < 0) {
      throw new Error(`social memory TOUCH target missing: ${event.memoryId}`);
    }

    if (index < 0 && operation === "UPSERT") {
      if (!(event.participants?.length)) throw new Error(`new social memory requires participants: ${event.memoryId}`);
      if (!event.originEvent?.trim()) throw new Error(`new social memory requires originEvent: ${event.memoryId}`);
      if (!event.meaning?.trim()) throw new Error(`new social memory requires meaning: ${event.memoryId}`);
    }

    const row = index >= 0 ? cloneRow(socialMemoryRows, index) : Array(headers(socialMemoryRows).length).fill("");
    const recurrenceIndex = headerIndex(socialMemoryRows, "Recurrence");
    const oldRecurrence = Number(row[recurrenceIndex] ?? 0) || 0;
    const recurrenceDelta = event.recurrenceDelta ?? 1;
    if (!Number.isFinite(recurrenceDelta) || recurrenceDelta < 0) {
      throw new Error(`social memory recurrenceDelta must be non-negative: ${event.memoryId}`);
    }

    setByHeader(socialMemoryRows, row, "Memory ID", event.memoryId);
    if (event.participants?.length) setByHeader(socialMemoryRows, row, "Participants", encodeIds(event.participants));
    if (event.originEvent != null) setByHeader(socialMemoryRows, row, "Origin event", event.originEvent);
    if (event.meaning != null) setByHeader(socialMemoryRows, row, "Meaning", event.meaning);
    if (event.whoUnderstands?.length) setByHeader(socialMemoryRows, row, "Who understands", encodeIds(event.whoUnderstands));
    else if (index < 0 && event.participants?.length) setByHeader(socialMemoryRows, row, "Who understands", encodeIds(event.participants));
    if (event.emotionalTone != null) setByHeader(socialMemoryRows, row, "Emotional tone", event.emotionalTone);
    setByHeader(socialMemoryRows, row, "Recurrence", oldRecurrence + recurrenceDelta);
    setByHeader(socialMemoryRows, row, "Last used", event.lastUsed ?? resolvedInworldEnd);
    setByHeader(socialMemoryRows, row, "Status", "ACTIVE");
    if (event.importance != null || index < 0) setByHeader(socialMemoryRows, row, "Importance", event.importance ?? "ROUTINE");
    if (event.source != null) setByHeader(socialMemoryRows, row, "Source", event.source);
    if (event.tags != null) setByHeader(socialMemoryRows, row, "Tags", encodeIds(event.tags));
    if (event.notes != null) setByHeader(socialMemoryRows, row, "Notes", event.notes);

    if (index >= 0) writeRow("SOCIAL_MEMORY_CURRENT", socialMemoryRows, index, row);
    else appendRow("SOCIAL_MEMORY_CURRENT", socialMemoryRows, row);
    socialMemoryOutcomes.push({
      memoryId: event.memoryId,
      operation,
      recurrence: oldRecurrence + recurrenceDelta,
      importance: row[headerIndex(socialMemoryRows, "Importance")],
    });
  }

  const threadRows = sheets[TABLES.OPEN_THREADS_CURRENT.range] ?? [];
  const threadOutcomes: unknown[] = [];
  const hasThreadPromotionEvidence = (event: NonNullable<SemanticCommitPlan["threadEvents"]>[number]): boolean => {
    const target = event.promoteTarget ?? "NONE";
    if (target === "NONE") return true;
    const ref = event.promoteRef?.trim();
    if (!ref) return false;
    if (target === "SOCIAL_MEMORY") {
      return (semantic.socialMemoryEvents ?? []).some((memory) =>
        memory.memoryId === ref && (memory.operation ?? "UPSERT") !== "RETIRE"
      );
    }
    if (target === "NPC_KNOWLEDGE") {
      return [...(semantic.rowUpserts ?? []), ...(semantic.rowUpdates ?? [])].some((row) =>
        row.table === "NPC_KNOWLEDGE" && row.key === ref
      );
    }
    if (target === "CANON") {
      return (input.docAppends ?? []).some((doc) => doc.documentKey === ref);
    }
    return false;
  };
  for (const event of semantic.threadEvents ?? []) {
    const index = findDataRow(threadRows, "Thread ID", event.threadId);
    if (event.operation === "RESOLVE" || event.operation === "EXPIRE") {
      if (!hasThreadPromotionEvidence(event)) {
        throw new Error(`thread promotion missing atomic destination evidence: ${event.threadId} -> ${event.promoteTarget ?? "NONE"} / ${event.promoteRef ?? ""}`);
      }
      if (index >= 0) {
        writeRow("OPEN_THREADS_CURRENT", threadRows, index, Array(headers(threadRows).length).fill(""));
      }
      threadOutcomes.push({
        threadId: event.threadId,
        operation: event.operation,
        removedFromCurrent: index >= 0,
        promoteTarget: event.promoteTarget ?? "NONE",
      });
      continue;
    }

    if (event.operation === "OPEN" && index >= 0) {
      throw new Error(`thread already open; use UPDATE: ${event.threadId}`);
    }
    if (event.operation === "UPDATE" && index < 0) {
      throw new Error(`thread UPDATE target missing: ${event.threadId}`);
    }
    if (event.operation === "OPEN") {
      if (!(event.participants?.length)) throw new Error(`new thread requires participants: ${event.threadId}`);
      if (!event.topic?.trim()) throw new Error(`new thread requires topic: ${event.threadId}`);
      if (!event.summary?.trim()) throw new Error(`new thread requires summary: ${event.threadId}`);
    }

    const row = index >= 0 ? cloneRow(threadRows, index) : Array(headers(threadRows).length).fill("");
    setByHeader(threadRows, row, "Thread ID", event.threadId);
    if (event.participants?.length) setByHeader(threadRows, row, "Participants", encodeIds(event.participants));
    if (event.topic != null) setByHeader(threadRows, row, "Topic", event.topic);
    if (event.summary != null) setByHeader(threadRows, row, "Summary", event.summary);
    if (event.openedAt != null || index < 0) setByHeader(threadRows, row, "Opened at", event.openedAt ?? resolvedInworldEnd);
    setByHeader(threadRows, row, "Last touched", event.lastTouched ?? resolvedInworldEnd);
    if (event.waitingOn != null) setByHeader(threadRows, row, "Waiting on", event.waitingOn);
    if (event.triggerDue != null) setByHeader(threadRows, row, "Trigger/due", event.triggerDue);
    setByHeader(threadRows, row, "Status", "OPEN");
    if (event.importance != null || index < 0) setByHeader(threadRows, row, "Importance", event.importance ?? "ROUTINE");
    if (event.promoteTarget != null || index < 0) setByHeader(threadRows, row, "Promote target", event.promoteTarget ?? "NONE");
    if (event.source != null) setByHeader(threadRows, row, "Source", event.source);
    if (event.tags != null) setByHeader(threadRows, row, "Tags", encodeIds(event.tags));
    if (event.notes != null) setByHeader(threadRows, row, "Notes", event.notes);

    if (index >= 0) writeRow("OPEN_THREADS_CURRENT", threadRows, index, row);
    else appendRow("OPEN_THREADS_CURRENT", threadRows, row);
    threadOutcomes.push({ threadId: event.threadId, operation: event.operation, status: "OPEN" });
  }

  const chatRows = sheets[TABLES.SYSTEM_CHAT_LOG.range] ?? [];
  const chatOutcomes: unknown[] = [];
  for (const event of semantic.chatEvents ?? []) {
    validateChatEventShape(event);
    const index = findDataRow(chatRows, "Message ID", event.messageId);
    if (index >= 0) {
      const existing = cloneRow(chatRows, index);
      const same =
        String(existing[headerIndex(chatRows, "Sender ID")] ?? "") === event.senderId &&
        String(existing[headerIndex(chatRows, "Receiver ID")] ?? "") === event.receiverId &&
        String(existing[headerIndex(chatRows, "Text")] ?? "") === event.text;
      if (!same) throw new Error(`chat message ID collision: ${event.messageId}`);
      chatOutcomes.push({ messageId: event.messageId, alreadyPresent: true });
      continue;
    }
    const row = Array(headers(chatRows).length).fill("");
    setByHeader(chatRows, row, "Message ID", event.messageId);
    setByHeader(chatRows, row, "Channel ID", event.channelId);
    setByHeader(chatRows, row, "Timestamp", event.timestamp ?? resolvedInworldEnd);
    setByHeader(chatRows, row, "Sender ID", event.senderId);
    setByHeader(chatRows, row, "Receiver ID", event.receiverId);
    setByHeader(chatRows, row, "Direction", event.direction);
    setByHeader(chatRows, row, "Text", event.text);
    setByHeader(chatRows, row, "Delivery", event.delivery ?? "DELIVERED");
    setByHeader(chatRows, row, "Read status", event.readStatus ?? "UNREAD");
    setByHeader(chatRows, row, "Notes", event.notes ?? "");
    appendRow("SYSTEM_CHAT_LOG", chatRows, row);
    chatOutcomes.push({ messageId: event.messageId, alreadyPresent: false });
  }

  const genericRows = new Map<StructuredRuntimeTable, unknown[][]>();
  for (const item of [...(semantic.rowUpserts ?? []), ...(semantic.rowUpdates ?? []), ...(semantic.rowDeletes ?? [])]) {
    ensureGenericTable(item.table);
    if (!genericRows.has(item.table)) genericRows.set(item.table, sheets[TABLES[item.table].range] ?? []);
  }

  for (const item of semantic.rowDeletes ?? []) {
    const rows = genericRows.get(item.table)!;
    const i = findDataRow(rows, keyHeaderFor(item.table), item.key);
    if (i < 0) continue;
    writeRow(item.table as RuntimeTableName, rows, i, Array(headers(rows).length).fill(""));
  }

  for (const item of semantic.rowUpdates ?? []) {
    const rows = genericRows.get(item.table)!;
    const i = findDataRow(rows, keyHeaderFor(item.table), item.key);
    if (i < 0) throw new Error(`row update target missing: ${item.table}/${item.key}`);
    assertStructuredFields(rows, item.table, Object.keys(item.patch));
    const row = cloneRow(rows, i);
    for (const [field, value] of Object.entries(item.patch)) setByHeader(rows, row, field, value);
    writeRow(item.table as RuntimeTableName, rows, i, row);
  }

  for (const item of semantic.rowUpserts ?? []) {
    const rows = genericRows.get(item.table)!;
    const keyHeader = keyHeaderFor(item.table);
    let i = findDataRow(rows, keyHeader, item.key);
    assertStructuredFields(rows, item.table, Object.keys(item.values));
    if (i >= 0) {
      const row = cloneRow(rows, i);
      setByHeader(rows, row, keyHeader, item.key);
      for (const [field, value] of Object.entries(item.values)) setByHeader(rows, row, field, value);
      writeRow(item.table as RuntimeTableName, rows, i, row);
    } else {
      const row = Array(headers(rows).length).fill("");
      setByHeader(rows, row, keyHeader, item.key);
      for (const [field, value] of Object.entries(item.values)) setByHeader(rows, row, field, value);
      appendRow(item.table as RuntimeTableName, rows, row);
    }
  }

  patchControl("save_id", input.saveTo);
  patchControl("state", "ACTIVE_COMMITTED");

  const sessionRow = Array(headers(sessionRows).length).fill("");
  setByHeader(sessionRows, sessionRow, "Save ID", input.saveTo);
  setByHeader(sessionRows, sessionRow, "Turn ID", input.turnId);
  setByHeader(sessionRows, sessionRow, "TX ID", input.txId);
  setByHeader(sessionRows, sessionRow, "Inworld start", semantic.session.inworldStart);
  setByHeader(sessionRows, sessionRow, "Inworld end", resolvedInworldEnd);
  setByHeader(sessionRows, sessionRow, "Scene ID", semantic.session.sceneId ?? c.sceneId ?? String(controlValue("current_scene_id") ?? ""));
  setByHeader(sessionRows, sessionRow, "Action summary", semantic.session.actionSummary);
  setByHeader(sessionRows, sessionRow, "Deltas JSON", JSON.stringify(semantic.session.deltas ?? {}));
  setByHeader(sessionRows, sessionRow, "New canon JSON", JSON.stringify(semantic.session.newCanon ?? {}));
  setByHeader(sessionRows, sessionRow, "World advances JSON", JSON.stringify(semantic.session.worldAdvances ?? {}));
  setByHeader(sessionRows, sessionRow, "Notes", semantic.session.notes ?? "");
  setByHeader(sessionRows, sessionRow, "Committed at", new Date().toISOString());
  setByHeader(sessionRows, sessionRow, "Ruleset version", RULESET_VERSION);
  setByHeader(
    sessionRows,
    sessionRow,
    "State hash",
    hash32([input.saveTo, resolvedInworldEnd, semantic.session.sceneId ?? c.sceneId ?? "", input.txId].join("|")).toString(16),
  );
  setByHeader(sessionRows, sessionRow, "Source", semantic.session.source ?? "ENGINE_FASTPATH");
  setByHeader(sessionRows, sessionRow, "Version", 1);
  appendRow("SESSION_LOG", sessionRows, sessionRow);

  const postResources: Record<string, Scalar> = {};
  const rName = headerIndex(resourceRows, "Resource");
  const rValue = headerIndex(resourceRows, "Current");
  for (const row of resourceRows.slice(1)) {
    const name = String(row[rName] ?? "");
    if (name) postResources[name] = (row[rValue] ?? null) as Scalar;
  }

  return {
    turnId: input.turnId,
    txId: input.txId,
    dryRun: input.dryRun ?? false,
    semantic: true,
    alreadyCommitted: false,
    elapsedMs: Math.round(performance.now() - started),
    turnToken: token,
    validation: [{ type: "save_id", pass: true }, ...(semantic.turnToken ? [{ type: "turn_token", pass: true }] : [])],
    manifest: {
      spreadsheetId: config.files.TEMP_RUNTIME,
      sheetWrites: [...dirty.entries()].map(([range, values]) => ({ range, values })) as SheetWrite[],
      docAppends: (input.docAppends ?? []).map((d) => ({ ...d, txMarker: `[TX:${input.txId}]` })),
    },
    outcomes: {
      exertion: exertionOutcomes,
      rest: restOutcomes,
      injury: injuryOutcomes,
      survival: survivalOutcomes,
      generalXp: generalXpOutcomes,
      choiceResolutions: choiceResolutionOutcomes,
      learning: learningOutcomes,
      adaptation: adaptationOutcomes,
      inventory: inventoryOutcomes,
      inventorySummary,
      relationships: relationshipOutcomes,
      socialMemory: socialMemoryOutcomes,
      threads: threadOutcomes,
      chat: chatOutcomes,
      resources: resourceOutcomes,
      pendingChoices,
    },
    postState: {
      saveId: input.saveTo,
      worldDay: semantic.elapsedSeconds != null || c.worldDay != null ? resolvedDay : controlValue("world_day"),
      worldTime: semantic.elapsedSeconds != null || c.worldTime != null ? resolvedTime : controlValue("world_time"),
      locationId: c.locationId ?? controlValue("current_location_id"),
      sceneId: c.sceneId ?? controlValue("current_scene_id"),
      resources: postResources,
    },
  };
}
