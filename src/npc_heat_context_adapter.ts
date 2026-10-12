/**
 * Source-conservative NPC Context Heat integration for get_turn_context.
 *
 * This adapter only consumes rows ALREADY selected by getTurnContext.
 * It never treats a social memory, scene hint, or free-text origin as a
 * committed session-event receipt. Until SESSION_LOG proofs are bound by TX,
 * non-KEY actors cannot earn heat tiers from invented interaction history.
 * The returned projection NEVER filters live NPC read surfaces.
 */
import { planNpcContextHeat } from "./npc_attention_ladder.ts";

type RuntimeRecord = Record<string, unknown>;
type LoadedActor = {
  schema: "NPC_HEAT_CONTEXT_SHADOW_ACTOR_V1";
  actorId: string;
  sourceSaveId: string;
  source: "NPC_CURRENT" | "NO_CURRENT_ACTOR_ROW";
  historyReceiptsVerified: false;
  historyComplete: false;
  earnedTier: number | null;
  profileTier: number | null;
  activeTier: number | null;
  /** Non-earned priority from current CONTROL-matched scene routing only. */
  scenePresenceFloor: 0 | 1;
  /** Controls FULL source retention; this is not proof of trust or affection. */
  fullActorContextRequired: true;
  reason: string;
  independentActivityRulePresent: boolean;
  warning: string | null;
};

export type HeatShadowRequest = {
  saveId: unknown;
  worldDay: unknown;
  worldTime: unknown;
  resolvedActorIds: readonly string[];
  routedSceneActorIds: readonly string[];
  explicitlyRequestedActorIds: readonly string[];
  current: readonly RuntimeRecord[];
  activityRules: readonly RuntimeRecord[];
};

export function projectNpcHeatContextShadow(input: HeatShadowRequest) {
  const saveId = String(input.saveId ?? "").trim();
  const dayText = String(input.worldDay ?? "").trim();
  const time = String(input.worldTime ?? "").trim();
  const day = /^\d+$/.test(dayText) ? Number(dayText) : NaN;
  const nowIsValid = Boolean(saveId) && Number.isSafeInteger(day) && day >= 1 &&
    /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time);
  const scene = new Set(input.routedSceneActorIds);
  const directlyRequested = new Set(input.explicitlyRequestedActorIds);
  const current = new Map(input.current
    .filter((row) => String(row["NPC ID"] ?? "").trim())
    .map((row) => [String(row["NPC ID"]).trim(), row] as const));
  const rules = new Set(input.activityRules.map((row) => String(row["NPC ID"] ?? "").trim()));
  const actors: Record<string, LoadedActor> = {};
  let existingKeys = 0;
  let scenePresent = 0;
  let noCurrentRows = 0;
  const ids = [...new Set(input.resolvedActorIds.filter((id) =>
    /^npc\.[a-z0-9_.-]+$/i.test(id)))];
  for (const actorId of ids) {
    const row = current.get(actorId) ?? null;
    const inScene = scene.has(actorId);
    if (inScene) scenePresent++;
    if (!row) noCurrentRows++;
    const importance = String(row?.["Importance"] ?? "").trim();
    const existingKey = Boolean(row) && importance.toUpperCase() === "KEY";
    if (existingKey) existingKeys++;
    const activityRulePresent = rules.has(actorId);
    let projection: ReturnType<typeof planNpcContextHeat> | null = null;
    if (nowIsValid && row) {
      // ZERO event receipts here: metadata, relationships and social memories
      // alone must never be promoted to signed committed interaction evidence.
      projection = planNpcContextHeat({
        actorId, importance, nowDay: day, nowTime: time, events: [],
        historyComplete: false, durableIdentityAvailable: false,
        independentLifeRuleAvailable: activityRulePresent,
      });
    }
    actors[actorId] = {
      schema: "NPC_HEAT_CONTEXT_SHADOW_ACTOR_V1",
      actorId, sourceSaveId: saveId,
      source: row ? "NPC_CURRENT" : "NO_CURRENT_ACTOR_ROW",
      historyReceiptsVerified: false, historyComplete: false,
      earnedTier: projection?.earnedTier ?? null,
      profileTier: projection?.profileTier ?? null,
      activeTier: projection?.activeTier ?? null,
      scenePresenceFloor: inScene ? 1 : 0,
      fullActorContextRequired: true,
      reason: !row ? "DORMANT_OR_UNRESOLVED_FULL_GATE"
        : existingKey ? "COMMITTED_KEY_ALWAYS_FULL" : inScene
        ? "CONTROL_MATCHED_SCENE_PARTICIPANT_FULL"
        : directlyRequested.has(actorId) ? "DIRECTLY_REQUESTED_ACTOR_FULL"
        : "HISTORY_UNVERIFIED_DO_NOT_PRUNE",
      independentActivityRulePresent: activityRulePresent,
      warning: !nowIsValid ? "INVALID_OR_MISSING_SAVE_CLOCK"
        : !row ? "NPC_CURRENT_MISSING_DO_NOT_INFER_HISTORY"
        : !existingKey ? "HEAT_HISTORY_NOT_YET_SOURCE_ATTESTED"
        : activityRulePresent ? null : "KEY_ACTIVITY_RULE_MISSING_REVIEW_REQUIRED",
    };
  }
  return {
    summary: {
      schema: "NPC_HEAT_CONTEXT_SHADOW_V1" as const,
      mode: "READ_ONLY_SHADOW_NO_PRUNING" as const,
      sourceSaveId: saveId,
      clockValidated: nowIsValid,
      actorCount: ids.length, sourceBackedKeyCount: existingKeys,
      verifiedSceneParticipantCount: scenePresent, missingCurrentCount: noCurrentRows,
      verifiedHeatEventReceiptsLoaded: 0 as const,
      sourceReceiptsRequiredForTiers2To4: true as const,
      readRoutingApplied: false as const,
      fullNpcContextGatePreserved: true as const,
      extraGoogleReads: 0 as const,
      semanticWrites: 0 as const,
      promotionAutomatic: false as const,
      scope: "Advisory heat with existing KEY and CONTROL-matched scene presence; not a relationship score",
    },
    actors,
  };
}
