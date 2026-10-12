import { config } from "./config.ts";
import { docsGet, sheetsBatchGet } from "./google.ts";
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
import {
  requireIsolatedHeatWriter, scrubCallerHeatProvenance,
  deriveEngineHeatReceipts, npcHeatStateHashV2,
} from "./npc_heat_receipt_writer.ts";
import { signNpcHeatOriginV3 } from "./npc_heat_origin_v3.ts";
import { computeSurvivalChange, survivalStaminaModifiers, type SurvivalActivity } from "./survival.ts";
import { makeTurnToken } from "./turn_token.ts";
import { resolveSelarinWeatherRecords, sheetObjects } from "./weather.ts";
import { validateChatEventShape, validateRelationshipEventShape } from "./social_context.ts";
import { worldContinuityReview } from "./world_continuity.ts";
import { reviewWorldProcesses } from "./world_process.ts";
import { validateWorkDemand } from "./work_demand.ts";
import { validateRumorTransmission } from "./world_information.ts";
import { validateMajorWorldEvent } from "./world_events.ts";
import { auditMaterialTransformation } from "./physical_integrity.ts";
import { parseCanonicalSpecializations, runtimeDomainForCompetence, validateSpecializationAcquisition } from "./specialization_catalog.ts";
import { materialRefsInCanon, permanentMaterialLocksInCanon, passportToSheetRecord, validatePhysicalPassport } from "./physical_passport.ts";
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
  "NPC_ACTIVITY_RULES", // V4 source-gated per-NPC activity materialization (semantic writer only)
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
  // Fail before any Google access when an experimental writer is misrouted.
  const testHeatWriter = requireIsolatedHeatWriter({
    enabled: config.npcHeatTestWriterEnabled,
    workbookId: config.files.TEMP_RUNTIME,
    isolatedWorkbookId: config.npcHeatTestWorkbookId,
    expectedSaveId: input.expectedSaveId,
    saveTo: input.saveTo,
    source: semantic.session.source,
  });
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
  if ((semantic.specializationUnlockEvents?.length ?? 0) > 0) {
    touched.add("NPC_CURRENT");
    touched.add("ACTIVE_CONTEXT");
  }
  if ((semantic.generalXpEvents?.length ?? 0) > 0) touched.add("CHARACTERISTICS");
  if (semantic.control?.sceneId != null || semantic.control?.locationId != null || semantic.sceneActorIds != null) touched.add("ACTIVE_CONTEXT");
  if ((semantic.exertionEvents?.length ?? 0) > 0 || (semantic.restEvents?.length ?? 0) > 0 || (semantic.injuryEvents?.length ?? 0) > 0 || (semantic.adaptationEvents?.length ?? 0) > 0) {
    touched.add("CHARACTERISTICS");
  }
  if ((semantic.adaptationEvents?.length ?? 0) > 0) touched.add("CHARACTERISTIC_ADAPTATION");
  if ((semantic.inventoryEvents?.length ?? 0) > 0 || (semantic.materialTransformations?.length ?? 0) > 0 || (semantic.physicalPassportEvents?.length ?? 0) > 0) {
    touched.add("INVENTORY_CURRENT");
    touched.add("SYSTEM_MODULES_CURRENT");
  }
  if ((semantic.relationshipEvents?.length ?? 0) > 0) touched.add("NPC_RELATIONSHIPS_CURRENT");
  if (testHeatWriter) touched.add("NPC_CURRENT");
  if ((semantic.socialMemoryEvents?.length ?? 0) > 0) touched.add("SOCIAL_MEMORY_CURRENT");
  if ((semantic.threadEvents?.length ?? 0) > 0) touched.add("OPEN_THREADS_CURRENT");
  if ((semantic.chatEvents?.length ?? 0) > 0) touched.add("SYSTEM_CHAT_LOG");
  if ((semantic.injuryEvents ?? []).some((e) => e.simulationOnly !== true)) touched.add("BODY_INJURIES_CURRENT");
  for (const item of semantic.rowUpserts ?? []) touched.add(item.table as RuntimeTableName);
  for (const item of semantic.rowUpdates ?? []) touched.add(item.table as RuntimeTableName);
  for (const item of semantic.rowDeletes ?? []) touched.add(item.table as RuntimeTableName);
  if ((semantic.worldProcessEvents?.length ?? 0) > 0) touched.add("WORLD_CLOCKS");
  if ((semantic.physicalPassportEvents?.length ?? 0) > 0 || (semantic.materialTransformations?.length ?? 0) > 0) touched.add("PHYSICAL_PASSPORTS_CURRENT");
  if ((semantic.majorWorldEvents?.length ?? 0) > 0) {
    touched.add("WORLD_CLOCKS");
    touched.add("NPC_CURRENT");
  }
  if ((semantic.rumorRelayEvents?.length ?? 0) > 0) {
    touched.add("NPC_KNOWLEDGE");
    touched.add("NPC_CURRENT");
    touched.add("WORLD_CLOCKS");
  }
  if ((semantic.workDemandEvents?.length ?? 0) > 0) {
    touched.add("WORLD_CLOCKS");
    touched.add("NPC_CURRENT");
    touched.add("OPPORTUNITIES_CURRENT");
  }
  if ((semantic.elapsedSeconds ?? 0) > 0) {
    touched.add("WEATHER_CURRENT");
    touched.add("OPPORTUNITIES_CURRENT");
  }
  if ((semantic.elapsedSeconds ?? 0) > 0 || (semantic.offscreenNpcEvents?.length ?? 0) > 0) {
    touched.add("NPC_CURRENT");
    touched.add("NPC_ACTIVITY_RULES");
    touched.add("WORLD_CLOCKS");
  }

  const ranges = [...touched].map((t) => TABLES[t].range);
  const sheets = await sheetsBatchGet(config.files.TEMP_RUNTIME, ranges);
  const gmTemplates = [
    ...(((semantic.inventoryEvents?.length ?? 0) > 0 || (semantic.materialTransformations?.length ?? 0) > 0 || (semantic.physicalPassportEvents?.length ?? 0) > 0) ? [PREGEN_TABLES.COMMON_OBJECT_TEMPLATES] : []),
    ...((semantic.workDemandEvents?.length ?? 0) > 0 ? [PREGEN_TABLES.SELARIN_JOB_TEMPLATES] : []),
    ...((semantic.rumorRelayEvents?.length ?? 0) > 0 ? [PREGEN_TABLES.SELARIN_RUMOR_CHANNELS] : []),
    ...((semantic.majorWorldEvents?.length ?? 0) > 0 ? [PREGEN_TABLES.SELARIN_MAJOR_EVENT_TEMPLATES] : []),
    ...((semantic.specializationUnlockEvents?.length ?? 0) > 0 ? [PREGEN_TABLES.CANON_SPECIALIZATION_REGISTRY] : []),
  ];
  const templateData = gmTemplates.length
    ? await sheetsBatchGet(config.files.GM_PREGEN, gmTemplates) : {};
  const inventoryTemplateRows = templateData[PREGEN_TABLES.COMMON_OBJECT_TEMPLATES] ?? [];
  const workTemplateRows = templateData[PREGEN_TABLES.SELARIN_JOB_TEMPLATES] ?? [];
  const rumorChannelRows = templateData[PREGEN_TABLES.SELARIN_RUMOR_CHANNELS] ?? [];
  const majorEventTemplateRows = templateData[PREGEN_TABLES.SELARIN_MAJOR_EVENT_TEMPLATES] ?? [];
  const canonicalSpecializationRows = templateData[PREGEN_TABLES.CANON_SPECIALIZATION_REGISTRY] ?? [];

  const controlRows = sheets[TABLES.CONTROL.range] ?? [];
  const saveIndex = findDataRow(controlRows, "Key", "save_id");
  if (saveIndex < 0) throw new Error("CONTROL save_id missing");
  const saveRow = cloneRow(controlRows, saveIndex);
  const currentSave = String(saveRow[headerIndex(controlRows, "Value")] ?? "");

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

  // Durable idempotency must be checked before optimistic save/turn-token guards:
  // after a successful commit the current save/token have intentionally changed.
  const sessionRows = sheets[TABLES.SESSION_LOG.range] ?? [];
  const txCol = headerIndex(sessionRows, "TX ID");
  const priorTx = sessionRows.slice(1).find((r) => String(r[txCol] ?? "") === input.txId);
  if (priorTx) {
    const priorSave = String(priorTx[headerIndex(sessionRows, "Save ID")] ?? "");
    const priorTurn = String(priorTx[headerIndex(sessionRows, "Turn ID")] ?? "");
    if (priorSave !== input.saveTo || priorTurn !== input.turnId) {
      throw new Error(
        `tx id collision: ${input.txId} already belongs to turn ${priorTurn} / save ${priorSave}`,
      );
    }
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

  if (currentSave !== input.expectedSaveId) {
    throw new Error(`save precondition failed: expected ${input.expectedSaveId}, got ${currentSave}`);
  }
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
  const worldAutomationOutcomes: Record<string, unknown> = { weather: null, opportunities: [], keyNpcAdvances: [], clocksNeedingReview: [] };
  if ((semantic.elapsedSeconds ?? 0) > 0) {
    const opportunityRows = sheets[TABLES.OPPORTUNITIES_CURRENT.range] ?? [];
    const targetAbs = resolvedDay * 1440 + Number(resolvedTime.slice(0,2)) * 60 + Number(resolvedTime.slice(3,5));
    if (opportunityRows.length) {
      const h = (name:string) => headerIndex(opportunityRows,name);
      for (let i=0;i<opportunityRows.length-1;i++) {
        const row=cloneRow(opportunityRows,i);
        const policy=String(row[h("Lifecycle Policy")]??"").toUpperCase();
        let lifecycle=String(row[h("Lifecycle State")]??"").toUpperCase();
        if (!policy || ["RESOLVED","EXPIRED","FILLED","CANCELLED","COMPLETED"].some(x=>lifecycle.includes(x))) continue;
        const availableDay=Number(row[h("Available Day")]??NaN), availableTime=String(row[h("Available Time")]??"");
        const expiresDay=Number(row[h("Expires Day")]??NaN), expiresTime=String(row[h("Expires Time")]??"");
        let changed=false, transition="";
        if (policy==="SCHEDULED_LEAD" && lifecycle==="SCHEDULED" && Number.isFinite(availableDay) && /^\d{2}:\d{2}/.test(availableTime)) {
          const a=availableDay*1440+Number(availableTime.slice(0,2))*60+Number(availableTime.slice(3,5));
          if(targetAbs>=a){ setByHeader(opportunityRows,row,"Lifecycle State","AVAILABLE"); lifecycle="AVAILABLE"; changed=true; transition="AVAILABLE"; }
        }
        if (policy==="HARD_DEADLINE" && Number.isFinite(expiresDay) && /^\d{2}:\d{2}/.test(expiresTime)) {
          const e=expiresDay*1440+Number(expiresTime.slice(0,2))*60+Number(expiresTime.slice(3,5));
          if(targetAbs>=e){
            setByHeader(opportunityRows,row,"Lifecycle State","EXPIRED");
            setByHeader(opportunityRows,row,"State","EXPIRED / DEADLINE PASSED");
            setByHeader(opportunityRows,row,"Slots Remaining",0);
            changed=true; transition="EXPIRED";
          }
        }
        const slots=Number(row[h("Slots Remaining")]??NaN);
        if(Number.isFinite(slots)&&slots<=0&&!["RESOLVED","EXPIRED"].includes(lifecycle)&&policy!=="RESOLVED"){
          setByHeader(opportunityRows,row,"Lifecycle State","FILLED");
          changed=true; transition=transition||"FILLED";
        }
        if(changed){
          setByHeader(opportunityRows,row,"Last Lifecycle Check",`Day${resolvedDay} ${resolvedTime}`);
          writeRow("OPPORTUNITIES_CURRENT",opportunityRows,i,row);
          (worldAutomationOutcomes.opportunities as unknown[]).push({offerId:row[h("Offer ID")],transition});
        }
      }
    }

    const resolvedLocation = String(c.locationId ?? controlValue("current_location_id") ?? "");
    if (resolvedLocation.startsWith("loc.ilyrian.selarin")) {
      const preg = await sheetsBatchGet(config.files.GM_PREGEN,[PREGEN_TABLES.SELARIN_WEATHER_PROFILE,PREGEN_TABLES.SELARIN_WEATHER_FRONTS]);
      const weatherRows=sheets[TABLES.WEATHER_CURRENT.range]??[];
      const profileObjects=sheetObjects(preg[PREGEN_TABLES.SELARIN_WEATHER_PROFILE]??[]);
      const frontObjects=sheetObjects(preg[PREGEN_TABLES.SELARIN_WEATHER_FRONTS]??[]);
      let weatherObjects=sheetObjects(weatherRows);
      let bootstrapped=false;
      if(!weatherObjects.some(r=>String(r["Weather ID"]??"")==="weather.selarin.current")){
        const startLocation=String(controlValue("current_location_id")??"");
        const bootstrapDay=startLocation.startsWith("loc.ilyrian.selarin")?currentDay:resolvedDay;
        const bootstrapTime=startLocation.startsWith("loc.ilyrian.selarin")?currentTime:resolvedTime;
        const bootstrap=resolveSelarinWeatherRecords({
          profileRows:profileObjects,frontRows:frontObjects,currentRows:[],
          targetDay:bootstrapDay,targetTime:bootstrapTime,
        });
        weatherObjects=[bootstrap.record];
        bootstrapped=true;
      }
      const resolved=resolveSelarinWeatherRecords({
        profileRows:profileObjects,
        frontRows:frontObjects,
        currentRows:weatherObjects,
        targetDay:resolvedDay,targetTime:resolvedTime,
      });
      resolved.initialized=bootstrapped;
      let wi=findDataRow(weatherRows,"Weather ID","weather.selarin.current");
      const wr=wi>=0?cloneRow(weatherRows,wi):Array(headers(weatherRows).length).fill("");
      for(const [k,v] of Object.entries(resolved.record)) setByHeader(weatherRows,wr,k,v as Scalar);
      if(wi>=0) writeRow("WEATHER_CURRENT",weatherRows,wi,wr); else appendRow("WEATHER_CURRENT",weatherRows,wr);
      worldAutomationOutcomes.weather={initialized:resolved.initialized,transitions:resolved.transitions,frontId:resolved.record["Front ID"]};
    }
  }
  // Key NPCs may not silently skip elapsed world time. A semantic offscreen
  // resolution is required; merely restamping a row would erase real history.
  // An authorized zero-elapsed reconciliation can also catch up NPCs to the
  // existing committed world clock without changing Shura's day or scene.
  if ((semantic.elapsedSeconds ?? 0) > 0 || (semantic.offscreenNpcEvents?.length ?? 0) > 0) {
    const npcRows = sheets[TABLES.NPC_CURRENT.range] ?? [];
    const activityRows = sheets[TABLES.NPC_ACTIVITY_RULES.range] ?? [];
    const clockRows = sheets[TABLES.WORLD_CLOCKS.range] ?? [];
    const objects = (rows: unknown[][]) => {
      if (!rows.length) return [] as Record<string, unknown>[];
      const names = headers(rows);
      return rows.slice(1).map((row) =>
        Object.fromEntries(names.map((name, i) => [name, row[i] ?? null]))
      );
    };
    const review = worldContinuityReview({
      worldDay: resolvedDay,
      worldTime: resolvedTime,
      npcCurrent: objects(npcRows),
      activityRules: objects(activityRows),
      worldClocks: objects(clockRows),
    });
    worldAutomationOutcomes.clocksNeedingReview = review.activeClocksOverdue;
    const events = semantic.offscreenNpcEvents ?? [];
    const provided = new Map(events.map((event) => [event.actorId, event]));
    if (provided.size !== events.length) throw new Error("duplicate offscreenNpcEvents actorId");
    const due = review.keyNpcDue.filter((a) => a.reason !== "ACTIVITY_RULE_MISSING");
    for (const item of due) {
      if (!provided.has(item.actorId)) {
        throw new Error(`key NPC offscreen advance required before committing time: ${item.actorId} (${item.ageMinutes ?? "unknown"} minutes). Provide semantic.offscreenNpcEvents with causal summary.`);
      }
    }
    const npcAdvances: unknown[] = [];
    for (const event of events) {
      if (event.currentGoal.trim().length < 12 || event.elapsedSummary.trim().length < 24) {
        throw new Error(`offscreenNpcEvents needs substantive currentGoal and elapsedSummary: ${event.actorId}`);
      }
      const ni = findDataRow(npcRows, "NPC ID", event.actorId);
      const ai = findDataRow(activityRows, "NPC ID", event.actorId);
      if (ni < 0 || ai < 0) throw new Error(`missing key NPC or activity rule: ${event.actorId}`);
      const npc = cloneRow(npcRows, ni);
      const activity = cloneRow(activityRows, ai);
      if (String(activity[headerIndex(activityRows, "State")] ?? "").toUpperCase() !== "ACTIVE") {
        throw new Error(`cannot tick inactive NPC: ${event.actorId}`);
      }
      const previousLocation = String(npc[headerIndex(npcRows, "Current/last-known location")] ?? "");
      if (event.locationId && event.locationId !== previousLocation && !event.travelEvidence?.trim()) {
        throw new Error(`offscreen travel requires causal travelEvidence: ${event.actorId}`);
      }
      setByHeader(npcRows, npc, "Current goal/activity", `${resolvedInworldEnd}: ${event.currentGoal.trim()}`);
      setByHeader(npcRows, npc, "Last updated", resolvedInworldEnd);
      if (event.locationId) setByHeader(npcRows, npc, "Current/last-known location", event.locationId);
      setByHeader(activityRows, activity, "Last activity tick", resolvedInworldEnd);
      writeRow("NPC_CURRENT", npcRows, ni, npc);
      writeRow("NPC_ACTIVITY_RULES", activityRows, ai, activity);
      npcAdvances.push({
        actorId: event.actorId,
        from: review.keyNpcDue.find((x) => x.actorId === event.actorId)?.lastActivityTick ?? null,
        to: resolvedInworldEnd,
        elapsedSummary: event.elapsedSummary.trim(),
        currentGoal: event.currentGoal.trim(),
        locationId: event.locationId ?? previousLocation,
        travelEvidence: event.travelEvidence ?? null,
      });
    }
    worldAutomationOutcomes.keyNpcAdvances = npcAdvances;
  }

  // Every relevant ACTIVE clock must advance for a causal reason. Event-based
  // watches and unfinished staffed commissions are not daily clock events.
  // This check is part of semantic prepare/commit, never a hidden time tick.
  const clockRows = sheets[TABLES.WORLD_CLOCKS.range] ?? [];
  const clockObjects = clockRows.slice(1).map((row) =>
    Object.fromEntries(headers(clockRows).map((field, i) => [field, row[i] ?? null]))
  );
  const processReview = reviewWorldProcesses({
    worldDay: resolvedDay,
    worldTime: resolvedTime,
    rows: clockObjects,
  });
  worldAutomationOutcomes.clocksNeedingReview = processReview.activeClocksOverdue;
  const processEvents = semantic.worldProcessEvents ?? [];
  const processProvided = new Set(processEvents.map((e) => e.processId));
  if (processProvided.size !== processEvents.length) throw new Error("duplicate worldProcessEvents processId");
  if ((semantic.elapsedSeconds ?? 0) > 0) {
    for (const due of processReview.activeClocksOverdue) {
      if (!processProvided.has(due.processId)) {
        throw new Error(`world process due for causal resolution: ${due.processId} (${due.reason}). Supply semantic.worldProcessEvents or do not advance time.`);
      }
    }
  }
  const processAdvances: unknown[] = [];
  for (const event of processEvents) {
    if (!event.processId?.trim() || event.currentActivity?.trim().length < 36 ||
        event.causalBasis?.trim().length < 36 || event.nextMilestone?.trim().length < 18) {
      throw new Error(`worldProcessEvents needs processId, meaningful activity, causalBasis and nextMilestone: ${event.processId ?? ""}`);
    }
    const index = findDataRow(clockRows, "Process ID", event.processId);
    if (index < 0) throw new Error(`worldProcessEvents unknown process: ${event.processId}`);
    const row = cloneRow(clockRows, index);
    const oldState = String(row[headerIndex(clockRows, "State")] ?? "");
    if (!oldState.toUpperCase().startsWith("ACTIVE")) {
      throw new Error(`worldProcessEvents cannot advance inactive process: ${event.processId}`);
    }
    if ([...(semantic.rowUpserts ?? []), ...(semantic.rowUpdates ?? []), ...(semantic.rowDeletes ?? [])]
      .some((change) => change.table === "WORLD_CLOCKS" && change.key === event.processId)) {
      throw new Error(`cannot write WORLD_CLOCKS both generically and by worldProcessEvents: ${event.processId}`);
    }
    const state = event.state?.trim() || oldState;
    if (/^(COMPLETED|CLOSED|RESOLVED|EXPIRED)/i.test(state) &&
        event.causalBasis.trim().length < 80) {
      throw new Error(`closing a world process needs specific causal closure evidence: ${event.processId}`);
    }
    setByHeader(clockRows, row, "Current activity", event.currentActivity.trim());
    setByHeader(clockRows, row, "Next milestone/window", event.nextMilestone.trim());
    setByHeader(clockRows, row, "Last advanced", `Day${resolvedDay} ${resolvedTime}`);
    if (event.state != null) setByHeader(clockRows, row, "State", state);
    if (event.visibility != null) setByHeader(clockRows, row, "Visibility", event.visibility);
    writeRow("WORLD_CLOCKS", clockRows, index, row);
    processAdvances.push({
      processId: event.processId,
      oldState,
      newState: state,
      causalBasis: event.causalBasis.trim(),
      activity: event.currentActivity.trim(),
      nextMilestone: event.nextMilestone.trim(),
      at: `Day${resolvedDay} ${resolvedTime}`,
    });
  }
  worldAutomationOutcomes.worldProcessAdvances = processAdvances;

  // Demand exists only if a named, live employer faces a bounded workload.
  // Candidate rows in GM PREGEN or a synthetic daily board seed are never paid work.
  const workDemandOutcomes: unknown[] = [];
  if ((semantic.workDemandEvents?.length ?? 0) > 0) {
    const offerRows = sheets[TABLES.OPPORTUNITIES_CURRENT.range] ?? [];
    const npcRows = sheets[TABLES.NPC_CURRENT.range] ?? [];
    const rowsToRecords = (rows: unknown[][]) => rows.slice(1).map((row) =>
      Object.fromEntries(headers(rows).map((field, index) => [field, row[index] ?? null]))
    );
    const templates = rowsToRecords(workTemplateRows);
    const npcs = rowsToRecords(npcRows);
    const liveClocks = rowsToRecords(clockRows);
    for (const demand of semantic.workDemandEvents ?? []) {
      const record = validateWorkDemand(
        demand, templates, liveClocks, npcs, rowsToRecords(offerRows),
        resolvedDay, resolvedTime,
      );
      const newRow = Array(headers(offerRows).length).fill("");
      for (const [field, value] of Object.entries(record)) {
        setByHeader(offerRows, newRow, field, value as Scalar);
      }
      appendRow("OPPORTUNITIES_CURRENT", offerRows, newRow);
      workDemandOutcomes.push({
        offerId: demand.offerId,
        employerId: demand.employerId,
        sourceProcessId: demand.sourceProcessId,
        templateId: demand.templateId,
        payC: demand.payC,
        slots: demand.slots,
        expiresDay: demand.expiresDay,
        expiresTime: demand.expiresTime,
        evidence: demand.materializedDemand,
      });
    }
  }
  worldAutomationOutcomes.workDemand = workDemandOutcomes;

  // An NPC hears only from an existing informed sender on an actual channel.
  // No free GM-truth broadcasts or spontaneous Shura-facing notifications.
  const rumorOutcomes: unknown[] = [];
  if ((semantic.rumorRelayEvents?.length ?? 0) > 0) {
    const known = sheets[TABLES.NPC_KNOWLEDGE.range] ?? [];
    const npcs = sheets[TABLES.NPC_CURRENT.range] ?? [];
    const records = (rows: unknown[][]) => rows.slice(1).map((row) =>
      Object.fromEntries(headers(rows).map((field, i) => [field, row[i] ?? null]))
    );
    for (const rumor of semantic.rumorRelayEvents ?? []) {
      const rowData = validateRumorTransmission({
        event: rumor,
        channels: records(rumorChannelRows),
        npcKnowledge: records(known),
        npcCurrent: records(npcs),
        worldClocks: records(clockRows),
        currentDay: resolvedDay,
        currentTime: resolvedTime,
      });
      const row = Array(headers(known).length).fill("");
      for (const [field, value] of Object.entries(rowData)) {
        setByHeader(known, row, field, value as Scalar);
      }
      appendRow("NPC_KNOWLEDGE", known, row);
      rumorOutcomes.push({
        factId: rumor.factId,
        senderNpcId: rumor.senderNpcId,
        receiverNpcId: rumor.receiverNpcId,
        channelId: rumor.channelId,
        relayEnd: rumor.relayEnd,
      });
    }
  }
  worldAutomationOutcomes.rumorRelays = rumorOutcomes;

  // A pregen event candidate cannot become reality without a live source,
  // named actors and measurable physical/social consequences.
  const majorEventOutcomes: unknown[] = [];
  if ((semantic.majorWorldEvents?.length ?? 0) > 0) {
    const npcRows = sheets[TABLES.NPC_CURRENT.range] ?? [];
    const records = (rows: unknown[][]) => rows.slice(1).map((row) =>
      Object.fromEntries(headers(rows).map((field, i) => [field, row[i] ?? null]))
    );
    for (const event of semantic.majorWorldEvents ?? []) {
      const newRecord = validateMajorWorldEvent({
        event,
        templates: records(majorEventTemplateRows),
        clocks: records(clockRows),
        npcs: records(npcRows),
        worldDay: resolvedDay,
        worldTime: resolvedTime,
      });
      const row = Array(headers(clockRows).length).fill("");
      for (const [field, value] of Object.entries(newRecord)) {
        setByHeader(clockRows, row, field, value as Scalar);
      }
      appendRow("WORLD_CLOCKS", clockRows, row);
      majorEventOutcomes.push({
        processId: event.processId,
        templateId: event.templateId,
        sourceProcessId: event.sourceProcessId,
        actors: event.participatingNpcIds,
        startDay: event.startDay,
        durationHours: event.durationHours,
        trigger: event.causalTrigger,
      });
    }
  }
  worldAutomationOutcomes.majorEvents = majorEventOutcomes;

  const activeContextRows = sheets[TABLES.ACTIVE_CONTEXT.range] ?? [];
  const patchActiveContext = (slot: string, pointer: Scalar) => {
    if (!activeContextRows.length) return;
    const i = findDataRow(activeContextRows, "Slot", slot);
    if (i < 0) return;
    const row = cloneRow(activeContextRows, i);
    setByHeader(activeContextRows, row, "Pointer", pointer);
    writeRow("ACTIVE_CONTEXT", activeContextRows, i, row);
  };

  if ((semantic.elapsedSeconds ?? 0) > 0 || c.worldDay != null) patchControl("world_day", resolvedDay);
  if ((semantic.elapsedSeconds ?? 0) > 0 || c.worldTime != null) patchControl("world_time", resolvedTime);
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
      patchActiveContext("participating_npc", "");
      patchActiveContext("active_clock", "");
    }
  }
  if (c.locationDisplay != null) patchControl("current_location_display", c.locationDisplay);
  if (c.sceneId != null) {
    const sceneChanged = String(controlValue("current_scene_id") ?? "") !== c.sceneId;
    patchControl("current_scene_id", c.sceneId);
    patchActiveContext("scene", c.sceneId);
    if (sceneChanged) {
      patchActiveContext("default_turn_tags", "");
      patchActiveContext("participating_npc", "");
      patchActiveContext("active_clock", "");
    }
  }
  if (semantic.sceneActorIds != null) {
    const actorIds = [...new Set(semantic.sceneActorIds)];
    if (actorIds.some((id) => !/^npc\.[a-z0-9_.-]+$/i.test(id))) {
      throw new Error("sceneActorIds must contain stable NPC IDs");
    }
    patchActiveContext("participating_npc", actorIds.join(";"));
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
  if ((semantic.elapsedSeconds ?? 0) > 0 || semantic.survival) {
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
  const physicalAudits: unknown[] = [];
  if ((semantic.materialTransformations?.length ?? 0) > 0) {
    const toRecords = (rows: unknown[][]) => rows.slice(1).map((row) =>
      Object.fromEntries(headers(rows).map((field, i) => [field, row[i] ?? null]))
    );
    const consumedIds = new Set<string>();
    const producedIds = new Set<string>();
    for (const transformation of semantic.materialTransformations ?? []) {
      for (const id of transformation.sourceItemIds) {
        if (consumedIds.has(id)) throw new Error("material source consumed more than once: " + id);
        consumedIds.add(id);
      }
      for (const id of transformation.productItemIds) {
        if (producedIds.has(id)) throw new Error("material product output duplicated: " + id);
        producedIds.add(id);
      }
      physicalAudits.push(auditMaterialTransformation({
        transformation,
        inventoryBefore: toRecords(inventoryRows),
        objectTemplates: toRecords(inventoryTemplateRows),
        events: semantic.inventoryEvents ?? [],
      }));
    }
  }
  worldAutomationOutcomes.materialConservation = physicalAudits;
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
    if (existingRow && event.templateId != null && event.templateId !== currentTemplateId) {
      throw new Error("existing physical instance cannot mutate its template identity: " + event.itemId + "; consume/source and instantiate new output instead");
    }
    if (existingRow && event.massKgOverride !== undefined && event.massKgOverride !== Number(existingRow[headerIndex(inventoryRows, "Mass kg override")]) && (event.reason?.length ?? 0) < 35) {
      throw new Error("revising measured unit mass requires specific real measurement/processing evidence: " + event.itemId);
    }
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

  // Store GM-known physical dimensions BEFORE sale/use as immutable per-instance
  // facts. Canonical material properties remain permanent canon, not this cache.
  // Migration adds PHYSICAL_PASSPORTS_CURRENT before the bundled engine deploy.
  const physicalPassportOutcomes: unknown[] = [];
  if ((semantic.physicalPassportEvents?.length ?? 0) > 0) {
    const physicalRows = sheets[TABLES.PHYSICAL_PASSPORTS_CURRENT.range] ?? [];
    if (!physicalRows.length ||
        !headers(physicalRows).includes("Material canon ref")) {
      throw new Error("PHYSICAL_PASSPORTS_CURRENT schema migration required before passport registration");
    }
    const { text: canonText } = await docsGet(config.files.LIVE_CANON_INDEX);
    const canonRefs = materialRefsInCanon(canonText);
    const materialLocks = permanentMaterialLocksInCanon(canonText);
    const physicalExisting = new Map(
      physicalRows.slice(1).filter((row) => String(row[0] ?? "")).map((row): [string, import("./physical_passport.ts").PhysicalPassport] => [
        String(row[0]), {} as import("./physical_passport.ts").PhysicalPassport,
      ]),
    );
    for (const event of semantic.physicalPassportEvents ?? []) {
      const result = validatePhysicalPassport(event, canonRefs, physicalExisting, 0.03, materialLocks);
      const index = findDataRow(inventoryRows, "Item ID", event.itemId);
      if (index < 0) throw new Error("cannot register physical passport without live owned inventory: " + event.itemId);
      const item = cloneRow(inventoryRows, index);
      const custody = String(item[headerIndex(inventoryRows, "Custodian")] ?? "");
      const location = String(item[headerIndex(inventoryRows, "Location/container")] ?? "");
      if (custody !== event.custodian || location !== event.location) {
        throw new Error("passport custody does not match live inventory: " + event.itemId);
      }
      const massRaw = item[headerIndex(inventoryRows, "Mass kg override")];
      const existingMass = String(massRaw ?? "").trim() === "" ? null : asNumber(massRaw, "item mass");
      if (existingMass != null && Math.abs(existingMass - event.measuredMassKg) > Math.max(0.001, event.measuredMassKg * 0.03)) {
        throw new Error("physical passport measured unit mass conflicts with live inventory: " + event.itemId);
      }
      if (existingMass == null) {
        setByHeader(inventoryRows, item, "Mass kg override", event.measuredMassKg);
        writeRow("INVENTORY_CURRENT", inventoryRows, index, item);
      }
      const row = Array(headers(physicalRows).length).fill("");
      const record = passportToSheetRecord(event, input.txId);
      for (const [field,value] of Object.entries(record)) {
        setByHeader(physicalRows, row, field, value);
      }
      appendRow("PHYSICAL_PASSPORTS_CURRENT", physicalRows, row);
      physicalExisting.set(event.itemId,event);
      physicalPassportOutcomes.push(result);
    }
  }
  if ((semantic.materialTransformations?.length ?? 0) > 0) {
    const passportRows = sheets[TABLES.PHYSICAL_PASSPORTS_CURRENT.range] ?? [];
    const available = new Set(passportRows.slice(1).map((row) => String(row[0] ?? "")));
    const registeredThisTurn = new Set((semantic.physicalPassportEvents ?? []).map((p) => p.itemId));
    for (const transformation of semantic.materialTransformations ?? []) {
      for (const sourceId of transformation.sourceItemIds) {
        if (!available.has(sourceId)) {
          throw new Error("physical source has no pre-existing immutable passport: " + sourceId);
        }
      }
      for (const productId of transformation.productItemIds) {
        if (!registeredThisTurn.has(productId)) {
          throw new Error("every fabricated product requires a new dimensioned passport in the same commit: " + productId);
        }
      }
    }
  }
  worldAutomationOutcomes.physicalPassports = physicalPassportOutcomes;

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

  // Newly possible specialties are not implicitly owned. Creation and the first
  // learning award happen inside the SAME validated semantic transaction.
  // No historic practice is back-credited, and no class/milestone is selected.
  const specializationUnlockOutcomes: unknown[] = [];
  const catalog = (semantic.specializationUnlockEvents?.length ?? 0) > 0
    ? parseCanonicalSpecializations(canonicalSpecializationRows)
    : [];
  const npcForWitness = sheets[TABLES.NPC_CURRENT.range] ?? [];
  const npcHeaders = npcForWitness[0]?.map((x) => String(x ?? "")) ?? [];
  const observerIdColumn = npcHeaders.indexOf("NPC ID");
  const observerLocationColumn = npcHeaders.indexOf("Current/last-known location");
  const activeCols = activeContextRows[0]?.map((x) => String(x ?? "")) ?? [];
  const slotIx = activeCols.indexOf("Slot");
  const pointerIx = activeCols.indexOf("Pointer");
  const activeParticipantIds = semantic.sceneActorIds ??
    (slotIx >= 0 && pointerIx >= 0
      ? activeContextRows.slice(1).filter((row) =>
          String(row[slotIx] ?? "").startsWith("participating_npc")
        ).map((row) => String(row[pointerIx] ?? ""))
      : []);
  const activeParticipants = new Set(activeParticipantIds);
  const seenObservers = observerIdColumn >= 0 && observerLocationColumn >= 0
    ? npcForWitness.slice(1).filter((row) =>
        String(row[observerLocationColumn] ?? "") ===
          String(semantic.control?.locationId ?? controlValue("current_location_id") ?? "") &&
        activeParticipants.has(String(row[observerIdColumn] ?? ""))
      ).map((row) => String(row[observerIdColumn] ?? ""))
    : [];
  for (const proposal of semantic.specializationUnlockEvents ?? []) {
    const specCompetenceIndex = headerIndex(specRows, "Competence ID");
    const specNameIndex = headerIndex(specRows, "Specialization");
    const known = specRows.slice(1).filter((row) => row[specCompetenceIndex] && row[specNameIndex])
      .map((row) => ({
        competenceId: String(row[specCompetenceIndex]),
        runtimeName: String(row[specNameIndex]),
      }));
    const entry = validateSpecializationAcquisition({
      catalog, proposal,
      learningEvents: semantic.learningEvents ?? [],
      elapsedSeconds: Number(semantic.elapsedSeconds ?? 0),
      presentObserverNpcIds: seenObservers,
      existingSpecializations: known,
    });
    if (findDataRow(competenceRows, "Competence ID", entry.competenceId) < 0) {
      throw new Error("Cannot unlock for unknown parent competence: " + entry.competenceId);
    }
    const newRow = Array(headers(specRows).length).fill("");
    setByHeader(specRows, newRow, "Competence ID", entry.competenceId);
    setByHeader(specRows, newRow, "Specialization", entry.runtimeName);
    setByHeader(specRows, newRow, "Stars", 0);
    setByHeader(specRows, newRow, "Visible band", "introductory practice");
    setByHeader(specRows, newRow, "Domain", runtimeDomainForCompetence(entry.competenceId));
    setByHeader(specRows, newRow, "Internal progress", 0);
    setByHeader(specRows, newRow, "Next star threshold", nextStarThreshold(0) ?? 20);
    setByHeader(specRows, newRow, "Growth reasons",
      "Acquired from current verified practice: " + proposal.trainingEvidence +
        " | ref=" + proposal.evidenceRef + " | chosen direction=" + proposal.playerIntent);
    setByHeader(specRows, newRow, "Last TX", input.txId);
    appendRow("SPECIALIZATIONS", specRows, newRow);
    specializationUnlockOutcomes.push({
      assetId: entry.assetId, specialization: entry.runtimeName,
      parent: entry.competenceId, initialStars: 0, evidenceRef: proposal.evidenceRef,
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
  const gmWorldAdvances = semantic.session.worldAdvances;
  // Reserved proof fields can only be engine-authored; ordinary legacy
  // gameplay otherwise stays on the existing v1 hash and schema.
  const sanitizedAdvance = scrubCallerHeatProvenance(gmWorldAdvances);
  const worldAdvanceLog: Record<string, unknown> = sanitizedAdvance
    ? { ...sanitizedAdvance, engineContinuity: worldAutomationOutcomes }
    : { gmWorldAdvances: gmWorldAdvances ?? {}, engineContinuity: worldAutomationOutcomes };
  if (testHeatWriter) {
    const currentRows = sheets[TABLES.NPC_CURRENT.range] ?? [];
    const npcColumn = headerIndex(currentRows, "NPC ID");
    const knownNpcIds = currentRows.slice(1)
      .map(row => String(row[npcColumn] ?? "").trim()).filter(Boolean);
    const receipts = deriveEngineHeatReceipts({
      txId: input.txId, day: resolvedDay, time: resolvedTime,
      sceneId: String(semantic.session.sceneId ?? c.sceneId ??
        controlValue("current_scene_id") ?? ""),
      knownNpcIds, semantic,
    });
    worldAdvanceLog.engineNpcAttentionReceipts = receipts;
    worldAdvanceLog.engineNpcReceiptEpoch =
      config.npcHeatTestHmacKey ? "TEST_ONLY_V3" : "TEST_ONLY_V2";
  }
  const worldAdvancesJson = JSON.stringify(worldAdvanceLog);
  setByHeader(sessionRows, sessionRow, "World advances JSON", worldAdvancesJson);
  setByHeader(sessionRows, sessionRow, "Notes", semantic.session.notes ?? "");
  setByHeader(sessionRows, sessionRow, "Committed at", new Date().toISOString());
  setByHeader(sessionRows, sessionRow, "Ruleset version", RULESET_VERSION);
  const stateHash = testHeatWriter && config.npcHeatTestHmacKey
    ? await signNpcHeatOriginV3({
      saveTo: input.saveTo,turnId:input.turnId,txId:input.txId,
      inworldStart:semantic.session.inworldStart,
      inworldEnd:resolvedInworldEnd,
      sceneId:String(semantic.session.sceneId ?? c.sceneId ??
        controlValue("current_scene_id") ?? ""),
      source:semantic.session.source ?? "ENGINE_FASTPATH",
      worldAdvancesJson,
    },config.npcHeatTestHmacKeyId,config.npcHeatTestHmacKey)
    : testHeatWriter
    ? await npcHeatStateHashV2({
      saveTo: input.saveTo, inworldEnd: resolvedInworldEnd,
      sceneId: String(semantic.session.sceneId ?? c.sceneId ??
        controlValue("current_scene_id") ?? ""),
      txId: input.txId, worldAdvancesJson,
    })
    : hash32([input.saveTo, resolvedInworldEnd,
      semantic.session.sceneId ?? c.sceneId ?? "", input.txId].join("|")).toString(16);
  setByHeader(sessionRows, sessionRow, "State hash", stateHash);
  setByHeader(sessionRows, sessionRow, "Source", semantic.session.source ?? "ENGINE_FASTPATH");
  setByHeader(sessionRows, sessionRow, "Version", testHeatWriter ? (config.npcHeatTestHmacKey ? 3 : 2) : 1);
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
      specializationUnlocks: specializationUnlockOutcomes,
      adaptation: adaptationOutcomes,
      inventory: inventoryOutcomes,
      inventorySummary,
      relationships: relationshipOutcomes,
      socialMemory: socialMemoryOutcomes,
      threads: threadOutcomes,
      chat: chatOutcomes,
      resources: resourceOutcomes,
      pendingChoices,
      worldAutomation: worldAutomationOutcomes,
    },
    postState: {
      saveId: input.saveTo,
      worldDay: (semantic.elapsedSeconds ?? 0) > 0 || c.worldDay != null ? resolvedDay : controlValue("world_day"),
      worldTime: (semantic.elapsedSeconds ?? 0) > 0 || c.worldTime != null ? resolvedTime : controlValue("world_time"),
      locationId: c.locationId ?? controlValue("current_location_id"),
      sceneId: c.sceneId ?? controlValue("current_scene_id"),
      resources: postResources,
    },
  };
}
