import assert from "node:assert/strict";
import { projectNpcHeatContextShadow } from "../src/npc_heat_context_adapter.ts";
const base = {
  saveId: "V2-S0795", worldDay: "67", worldTime: "17:21:00",
  resolvedActorIds: ["npc.vesha", "npc.merchant", "npc.dormant"],
  routedSceneActorIds: ["npc.merchant"],
  explicitlyRequestedActorIds: ["npc.vesha", "npc.dormant"],
  current: [
    {"NPC ID": "npc.vesha", "Importance": "KEY"},
    {"NPC ID": "npc.merchant", "Importance": "RECURRING"},
  ],
  activityRules: [{"NPC ID": "npc.vesha"}],
};
Deno.test("get_turn_context Heat shadow keeps verified KEY at tier five without event inference", () => {
  const p = projectNpcHeatContextShadow(base);
  assert.equal(p.summary.mode, "READ_ONLY_SHADOW_NO_PRUNING");
  assert.equal(p.summary.sourceSaveId, "V2-S0795");
  assert.equal(p.actors["npc.vesha"].earnedTier, 5);
  assert.equal(p.actors["npc.vesha"].activeTier, 5);
  assert.equal(p.actors["npc.vesha"].reason, "COMMITTED_KEY_ALWAYS_FULL");
  assert.equal(p.actors["npc.vesha"].historyReceiptsVerified, false);
});
Deno.test("scene presence floor is not a fake committed historical contact", () => {
  const p = projectNpcHeatContextShadow(base);
  const actor = p.actors["npc.merchant"];
  assert.equal(actor.scenePresenceFloor, 1);
  assert.equal(actor.earnedTier, 0);
  assert.equal(actor.activeTier, 0);
  assert.equal(actor.fullActorContextRequired, true);
  assert.equal(actor.reason, "CONTROL_MATCHED_SCENE_PARTICIPANT_FULL");
  assert.equal(p.summary.verifiedSceneParticipantCount, 1);
});
Deno.test("direct remote actor retains full context and never gets fabricated scene presence", () => {
  const p = projectNpcHeatContextShadow({
    ...base, routedSceneActorIds: [], explicitlyRequestedActorIds: ["npc.merchant"],
  });
  const actor = p.actors["npc.merchant"];
  assert.equal(actor.scenePresenceFloor, 0);
  assert.equal(actor.reason, "DIRECTLY_REQUESTED_ACTOR_FULL");
});
Deno.test("missing current actor remains a source gap, not a new KEY or a dead NPC", () => {
  const p = projectNpcHeatContextShadow(base);
  const actor = p.actors["npc.dormant"];
  assert.equal(actor.activeTier, null);
  assert.equal(actor.reason, "DORMANT_OR_UNRESOLVED_FULL_GATE");
  assert.equal(actor.fullActorContextRequired, true);
  assert.equal(p.summary.missingCurrentCount, 1);
});
Deno.test("social memory text cannot create meaningful days without verified TX receipts", () => {
  const p = projectNpcHeatContextShadow({...base,
    current: [...base.current, {"NPC ID": "npc.dormant", "Importance": "LOCAL",
      "Social memory": "six meaningful encounters with Shura"}],
  });
  assert.equal(p.actors["npc.dormant"].earnedTier, 0);
  assert.equal(p.summary.verifiedHeatEventReceiptsLoaded, 0);
  assert.equal(p.summary.sourceReceiptsRequiredForTiers2To4, true);
  assert.equal(p.summary.promotionAutomatic, false);
});
Deno.test("bad world clock fails closed without breaking actor context", () => {
  const p = projectNpcHeatContextShadow({...base,worldTime: "99:99:99"});
  assert.equal(p.summary.clockValidated, false);
  assert.equal(p.actors["npc.vesha"].activeTier, null);
  assert.equal(p.actors["npc.vesha"].fullActorContextRequired, true);
  assert.equal(p.actors["npc.vesha"].warning, "INVALID_OR_MISSING_SAVE_CLOCK");
});
Deno.test("invalid and duplicate actor IDs do not enter the projection", () => {
  const p = projectNpcHeatContextShadow({...base,
    resolvedActorIds: ["npc.vesha","npc.vesha","player.shura","npc.invalid!"],
  });
  assert.equal(p.summary.actorCount, 1);
  assert.deepEqual(Object.keys(p.actors), ["npc.vesha"]);
});
Deno.test("existing KEY activity rule must be reviewed but cannot revoke KEY", () => {
  const p = projectNpcHeatContextShadow({...base, activityRules: []});
  assert.equal(p.actors["npc.vesha"].earnedTier, 5);
  assert.equal(p.actors["npc.vesha"].warning, "KEY_ACTIVITY_RULE_MISSING_REVIEW_REQUIRED");
});
Deno.test("shadow integration never authorizes reducing context or writing", () => {
  const p = projectNpcHeatContextShadow(base);
  assert.equal(p.summary.readRoutingApplied, false);
  assert.equal(p.summary.fullNpcContextGatePreserved, true);
  assert.equal(p.summary.extraGoogleReads, 0);
  assert.equal(p.summary.semanticWrites, 0);
  assert.ok(Object.values(p.actors).every(x=>x.fullActorContextRequired));
});
