import { config } from "./config.ts";
import { sheetsBatchGet } from "./google.ts";
import {
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
import { hash32 } from "./rng.ts";
import { makeTurnToken } from "./turn_token.ts";
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

function rowToScalars(row: unknown[]): Scalar[] {
  return row.map((v) => (v == null ? "" : v) as Scalar);
}

function visibleBand(stars: number): string {
  if (stars <= 2) return "familiarity";
  if (stars <= 4) return "practical use";
  if (stars <= 6) return "confident command";
  if (stars <= 8) return "expert";
  return "mastery";
}

const GENERIC_TABLES = new Set<StructuredRuntimeTable>([
  "INVENTORY_CURRENT",
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
  if ((input.docAppends?.length ?? 0) > 0) {
    throw new Error("semantic fast path does not support docAppends; mutate structured current state instead");
  }
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
  for (const item of semantic.rowUpserts ?? []) touched.add(item.table as RuntimeTableName);
  for (const item of semantic.rowUpdates ?? []) touched.add(item.table as RuntimeTableName);

  const ranges = [...touched].map((t) => TABLES[t].range);
  const sheets = await sheetsBatchGet(config.files.TEMP_RUNTIME, ranges);

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
      manifest: { spreadsheetId: config.files.TEMP_RUNTIME, sheetWrites: [], docAppends: [] },
      outcomes: { learning: [], resources: [], pendingChoices: [] },
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
  if (semantic.elapsedSeconds != null || c.worldDay != null) patchControl("world_day", resolvedDay);
  if (semantic.elapsedSeconds != null || c.worldTime != null) patchControl("world_time", resolvedTime);
  if (c.locationId != null) patchControl("current_location_id", c.locationId);
  if (c.locationDisplay != null) patchControl("current_location_display", c.locationDisplay);
  if (c.sceneId != null) patchControl("current_scene_id", c.sceneId);
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

  const readResource = (resource: string): number => {
    const i = findDataRow(resourceRows, "Resource", resource);
    if (i < 0) throw new Error(`unknown resource: ${resource}`);
    return asNumber(resourceRows[i + 1]?.[headerIndex(resourceRows, "Current")], resource);
  };

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

  const competenceRows = sheets[TABLES.COMPETENCES.range] ?? [];
  const specRows = sheets[TABLES.SPECIALIZATIONS.range] ?? [];
  const pendingRows = sheets[TABLES.PENDING_CHOICES.range] ?? [];
  const learningOutcomes: unknown[] = [];
  const pendingChoices: unknown[] = [];

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
    const advanced = advanceCompetence(oldLevel, oldXp, delta);
    setByHeader(competenceRows, row, "Level", advanced.newLevel);
    setByHeader(competenceRows, row, "Carried XP", advanced.newXp);
    if (advanced.nextThreshold != null) setByHeader(competenceRows, row, "Next threshold", advanced.nextThreshold);
    setByHeader(competenceRows, row, "Last delta", `+${delta} — ${event.reason ?? event.band}`);
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
    setByHeader(progressionRows, erow, "Notes", event.reason ?? "");
    appendRow("PROGRESSION_EVENTS", progressionRows, erow);
    learningOutcomes.push({ competenceId: event.competenceId, ...advanced, specialization: specializationOutcome });
  }

  const genericRows = new Map<StructuredRuntimeTable, unknown[][]>();
  for (const item of [...(semantic.rowUpserts ?? []), ...(semantic.rowUpdates ?? [])]) {
    ensureGenericTable(item.table);
    if (!genericRows.has(item.table)) genericRows.set(item.table, sheets[TABLES[item.table].range] ?? []);
  }

  for (const item of semantic.rowUpdates ?? []) {
    const rows = genericRows.get(item.table)!;
    const i = findDataRow(rows, keyHeaderFor(item.table), item.key);
    if (i < 0) throw new Error(`row update target missing: ${item.table}/${item.key}`);
    const row = cloneRow(rows, i);
    for (const [field, value] of Object.entries(item.patch)) setByHeader(rows, row, field, value);
    writeRow(item.table as RuntimeTableName, rows, i, row);
  }

  for (const item of semantic.rowUpserts ?? []) {
    const rows = genericRows.get(item.table)!;
    const keyHeader = keyHeaderFor(item.table);
    let i = findDataRow(rows, keyHeader, item.key);
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
      docAppends: [],
    },
    outcomes: {
      generalXp: generalXpOutcomes,
      learning: learningOutcomes,
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
