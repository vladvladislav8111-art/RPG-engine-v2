import assert from "node:assert/strict";
import {
  deriveEngineHeatReceipts, npcHeatStateHashV2,
  requireIsolatedHeatWriter, scrubCallerHeatProvenance,
} from "../src/npc_heat_receipt_writer.ts";

const actors = ["npc.vesha", "npc.market"];
const semantic = {
  session: { inworldStart: "Day67 17:21:00", actionSummary: "synthetic" },
  sceneActorIds: ["npc.vesha", "npc.fake", "npc.vesha"],
  socialMemoryEvents: [{
    operation: "UPSERT" as const, memoryId: "memory.a",
    participants: ["npc.vesha", "npc.market", "player.shura"],
    whoUnderstands: ["npc.vesha", "player.shura"],
    originEvent: "TEST-TX", source: "SYNTHETIC_SOURCE",
    meaning: "A documented conversation about a real shared task.",
    importance: "IMPORTANT" as const,
  }],
  relationshipEvents: [{
    operation: "UPSERT" as const, relationshipId: "relation.test",
    actorId: "npc.vesha", towardId: "player.shura",
    evidenceRefs: ["memory.a"],
    currentStance: "The NPC understands a practical work obligation after negotiation.",
  }],
};
function derive(s: any = semantic) {
  return deriveEngineHeatReceipts({
    txId: "TEST-TX", day: 67, time: "17:22:00",
    sceneId: "scene.test", knownNpcIds: actors, semantic: s,
  });
}
Deno.test("Only materialized NPCs receive semantic receipts; awareness is respected", () => {
  const events = derive();
  assert.equal(events.length, 3);
  assert.equal(events.some(e => e.actorId === "npc.fake"), false);
  assert.equal(events.some(e => e.actorId === "npc.market"), false);
  assert.equal(events.filter(e => e.kind === "MEANINGFUL_RELATIONSHIP_EVENT").length, 2);
  assert.ok(events.every(e => e.txId === "TEST-TX" && e.sceneId === "scene.test"));
});
Deno.test("Retired and touched memories never produce social history", () => {
  const events = derive({
    ...semantic, sceneActorIds: [], relationshipEvents: [],
    socialMemoryEvents: semantic.socialMemoryEvents.map(m => ({ ...m, operation: "TOUCH" })),
  });
  assert.equal(events.length, 0);
});
Deno.test("Exact replay is idempotent; within-TX collisions abort", () => {
  const repeated = derive({
    ...semantic, sceneActorIds: ["npc.vesha", "npc.vesha"],
    socialMemoryEvents: [...semantic.socialMemoryEvents, semantic.socialMemoryEvents[0]],
  });
  assert.equal(repeated.length, 3);
  assert.throws(() => derive({
    ...semantic, sceneActorIds: [], relationshipEvents: [],
    socialMemoryEvents: [
      semantic.socialMemoryEvents[0],
      { ...semantic.socialMemoryEvents[0],
        meaning: "A different meaning for the same memory in the same TX." },
    ],
  }), /COLLISION/);
});
Deno.test("TEST writer gate blocks live saves, wrong workbook and source", () => {
  assert.equal(requireIsolatedHeatWriter({
    enabled: false, workbookId: "live", isolatedWorkbookId: "",
    expectedSaveId: "V2-S0795", saveTo: "V2-S0796",
  }), false);
  for (const fields of [
    { workbookId: "live", isolatedWorkbookId: "live",
      expectedSaveId: "V2-S0795", saveTo: "V2-S0796" },
    { workbookId: "live", isolatedWorkbookId: "test",
      expectedSaveId: "TEST-S1", saveTo: "TEST-S2" },
    { workbookId: "live", isolatedWorkbookId: "",
      expectedSaveId: "TEST-S1", saveTo: "TEST-S2" },
    { workbookId: "test", isolatedWorkbookId: "test",
      expectedSaveId: "TEST-S1", saveTo: "TEST-S1" },
    { workbookId: "test", isolatedWorkbookId: "test",
      expectedSaveId: "TEST-S1", saveTo: "TEST-S2", source: "FAKE" },
  ]) assert.throws(() => requireIsolatedHeatWriter({
    enabled: true, ...fields,
  }), /ISOLATION_GATE/);
  assert.equal(requireIsolatedHeatWriter({
    enabled: true, workbookId: "test", isolatedWorkbookId: "test",
    expectedSaveId: "TEST-S1", saveTo: "TEST-S2",
  }), true);
});
Deno.test("Caller-controlled engine provenance cannot overwrite derived receipt", () => {
  const clean = scrubCallerHeatProvenance({
    normal: true, engineNpcAttentionReceipts: [{eventId: "forged"}],
    engineNpcReceiptDigest: "forged", engineNpcReceiptEpoch: "forged",
    engineNpcReceiptIntegrity: "forged",
    engineNpcReceiptChain: {epochId:"TEST-FAKE",sequence:0,previousDigest:"GENESIS"},
    engineNpcEpochGenesis: "forged",
  });
  assert.deepEqual(clean, {normal: true});
  assert.equal(scrubCallerHeatProvenance(["forged"]), null);
});
Deno.test("V2 state hash covers exact JSON, TX, scene and save ID", async () => {
  const source = {
    saveTo: "TEST-S2", inworldEnd: "Day67 17:22:00", sceneId: "scene.test",
    txId: "TEST-TX",
    worldAdvancesJson: JSON.stringify({engineNpcAttentionReceipts: derive()}),
  };
  const expected = await npcHeatStateHashV2(source);
  assert.match(expected, /^sha256:[0-9a-f]{64}$/);
  assert.equal(await npcHeatStateHashV2(source), expected);
  for (const other of [
    { ...source, saveTo: "TEST-S3" }, { ...source, sceneId: "other" },
    { ...source, txId: "other" },
    { ...source, worldAdvancesJson: source.worldAdvancesJson + " " },
    { ...source, worldAdvancesJson: "{}" },
  ]) assert.notEqual(await npcHeatStateHashV2(other), expected);
});
Deno.test("Unbounded NPC receipt batches fail before the writer manifest", () => {
  const many = Array.from({ length: 49 }, (_, i) =>
    ({ ...semantic.socialMemoryEvents[0],
      memoryId: "memory." + i, participants: ["npc.vesha"] }));
  assert.throws(() => derive({
    ...semantic, sceneActorIds: [], relationshipEvents: [], socialMemoryEvents: many,
  }), /RECEIPT_LIMIT/);
});
