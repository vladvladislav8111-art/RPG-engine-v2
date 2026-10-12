import assert from "node:assert/strict";
import { deriveEngineHeatReceipts, npcHeatStateHashV2,
  requireIsolatedHeatWriter, scrubCallerHeatProvenance
} from "../src/npc_heat_receipt_writer.ts";
const allowed = ["npc.vesha", "npc.market"];
const semantic = {
  session:{inworldStart:"Day67 17:21:00",actionSummary:"synthetic"},
  sceneActorIds:["npc.vesha","npc.fake","npc.vesha"],
  socialMemoryEvents:[{operation:"UPSERT" as const,memoryId:"memory.a",
    participants:["npc.vesha","npc.market","player.shura"],
    whoUnderstands:["npc.vesha","player.shura"],
    originEvent:"TEST-TX",source:"SYNTHETIC_SOURCE",
    meaning:"A documented conversation about a real shared task.",
    importance:"IMPORTANT" as const}],
  relationshipEvents:[{operation:"UPSERT" as const,
    relationshipId:"relation.test",actorId:"npc.vesha",towardId:"player.shura",
    evidenceRefs:["memory.a"],
    currentStance:"The NPC understands a practical work obligation after negotiation."}],
};
function derive(s:any=semantic) {
  return deriveEngineHeatReceipts({txId:"TEST-TX",day:67,time:"17:22:00",
    sceneId:"scene.test",knownNpcIds:allowed,semantic:s});
}
Deno.test("only materialized NPCs get source-derived receipts; awareness respected",()=>{
 const v=derive();
 assert.equal(v.length,3);
 assert.equal(v.some(x=>x.actorId==="npc.fake"),false);
 assert.equal(v.some(x=>x.actorId==="npc.market"),false);
 assert.deepEqual(v.map(x=>x.kind).sort(),[
   "MEANINGFUL_RELATIONSHIP_EVENT","MEANINGFUL_RELATIONSHIP_EVENT","SCENE_PRESENCE"]);
 assert.equal(v.filter(x=>x.kind==="MEANINGFUL_RELATIONSHIP_EVENT").length,2);
 assert.ok(v.every(x=>x.txId==="TEST-TX"&&x.sceneId==="scene.test"));
});
Deno.test("retired, touched and unsupported memories do not generate social history",()=>{
 const v=derive({...semantic,sceneActorIds:[],relationshipEvents:[],
    socialMemoryEvents:semantic.socialMemoryEvents.map(x=>({...x,operation:"TOUCH"}))});
 assert.equal(v.length,0);
});
Deno.test("duplicates do not double-grant; within-turn collisions fail closed",()=>{
 const v=derive({...semantic,sceneActorIds:["npc.vesha","npc.vesha"]});
 assert.equal(v.length,3);
 assert.throws(()=>derive({...semantic,sceneActorIds:[],
   socialMemoryEvents:[semantic.socialMemoryEvents[0],{
    ...semantic.socialMemoryEvents[0],meaning:"A different verified memory that conflicts in the same TX."}],
   relationshipEvents:[]}),/COLLISION/);
});
Deno.test("writer cannot be enabled on a live V2 save or without exact isolated workbook",()=>{
 assert.equal(requireIsolatedHeatWriter({enabled:false,workbookId:"live",
   isolatedWorkbookId:"",expectedSaveId:"V2-S0795",saveTo:"V2-S0796"}),false);
 for(const x of [
   {enabled:true,workbookId:"live",isolatedWorkbookId:"live",expectedSaveId:"V2-S0795",saveTo:"V2-S0796"},
   {enabled:true,workbookId:"live",isolatedWorkbookId:"test",expectedSaveId:"TEST-S1",saveTo:"TEST-S2"},
   {enabled:true,workbookId:"live",isolatedWorkbookId:"",expectedSaveId:"TEST-S1",saveTo:"TEST-S2"},
   {enabled:true,workbookId:"test",isolatedWorkbookId:"test",expectedSaveId:"TEST-S1",saveTo:"TEST-S1"},
   {enabled:true,workbookId:"test",isolatedWorkbookId:"test",expectedSaveId:"TEST-S1",saveTo:"TEST-S2",source:"USER_MOCK"}
 ]) assert.throws(()=>requireIsolatedHeatWriter(x),/ISOLATION_GATE/);
 assert.equal(requireIsolatedHeatWriter({enabled:true,workbookId:"test",
   isolatedWorkbookId:"test",expectedSaveId:"TEST-S1",saveTo:"TEST-S2"}),true);
});
Deno.test("caller-provided Heat receipts and integrity metadata are never authoritative",()=>{
 const clean=scrubCallerHeatProvenance({normal:true,
   engineNpcAttentionReceipts:[{eventId:"forged"}],
   engineNpcReceiptDigest:"forged",engineNpcReceiptEpoch:"forged",
   engineNpcReceiptIntegrity:"forged"});
 assert.deepEqual(clean,{normal:true});
 assert.equal(scrubCallerHeatProvenance(["forged"]),null);
});
Deno.test("V2 state checksum covers actual world JSON, save, TX and scene",async()=>{
 const input={saveTo:"TEST-S2",inworldEnd:"Day67 17:22:00",
  sceneId:"scene.test",txId:"TEST-TX",worldAdvancesJson:JSON.stringify({
    engineNpcAttentionReceipts:derive()})};
 const original=await npcHeatStateHashV2(input);
 assert.match(original,/^sha256:[0-9a-f]{64}$/);
 assert.equal(await npcHeatStateHashV2(input),original);
 for(const changed of [
   {...input,txId:"OTHER"}, {...input,sceneId:"other"},
   {...input,saveTo:"TEST-S3"}, {...input,worldAdvancesJson:input.worldAdvancesJson+" "},
   {...input,worldAdvancesJson:JSON.stringify({engineNpcAttentionReceipts:[]})}
 ]) assert.notEqual(await npcHeatStateHashV2(changed),original);
});
Deno.test("more than 48 receipts in one TX fails without writing",()=>{
 const many=Array.from({length:49},(_,i)=>({...semantic.socialMemoryEvents[0],
  memoryId:"memory."+i,participants:["npc.vesha"]}));
 assert.throws(()=>derive({...semantic,sceneActorIds:[],
   socialMemoryEvents:many,relationshipEvents:[]}),/RECEIPT_LIMIT/);
});
