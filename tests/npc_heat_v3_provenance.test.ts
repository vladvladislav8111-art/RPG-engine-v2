import assert from "node:assert/strict";
import {signNpcHeatOriginV3,verifyNpcHeatOriginV3,type NpcHeatOriginFrame} from "../src/npc_heat_origin_v3.ts";
import {auditNpcHeatJournalIncludingTestV2} from "../src/npc_heat_v2_reader.ts";
import {config} from "../src/config.ts";
const secret="TEST_ONLY_HMAC_2026_LONG_RANDOMISH_KEY_987654321";
const kid="test-2026-10";
const frame:NpcHeatOriginFrame={
 saveTo:"TEST-S5",turnId:"TEST-TURN",txId:"TEST-SIGNED-TX",
 inworldStart:"Day67 17:21:00",inworldEnd:"Day67 17:22:00",
 sceneId:"scene.test",source:"ENGINE_FASTPATH",
 worldAdvancesJson:JSON.stringify({
  engineNpcReceiptEpoch:"TEST_ONLY_V3",
  engineNpcAttentionReceipts:[{
   eventId:"TEST-SIGNED-TX|npc.synthetic|SCENE_PRESENCE|scene:scene.test",
   actorId:"npc.synthetic",txId:"TEST-SIGNED-TX",kind:"SCENE_PRESENCE",
   sourceRef:"scene:scene.test",sceneId:"scene.test",
   day:67,time:"17:22:00",committed:true,
  }],
 }),
};
const h=["Save ID","Turn ID","TX ID","Inworld start","Inworld end",
 "Scene ID","Action summary","Deltas JSON","New canon JSON",
 "World advances JSON","Notes","Committed at","Ruleset version",
 "State hash","Source","Version"];
async function row(){
 const r:unknown[]=Array(16).fill("");
 r[0]=frame.saveTo;r[1]=frame.turnId;r[2]=frame.txId;
 r[3]=frame.inworldStart;r[4]=frame.inworldEnd;r[5]=frame.sceneId;
 r[9]=frame.worldAdvancesJson;r[13]=await signNpcHeatOriginV3(frame,kid,secret);
 r[14]=frame.source;r[15]=3;return r;
}
function packet(r:unknown[]){
 return {sourceSaveId:"TEST-S5",worldDay:67,worldTime:"17:23:00",
 stableAfterRead:true,requestedActorIds:["npc.synthetic"],
 index:[["TX ID"],[frame.txId]],header:h,rowStart:2,rows:[r]};
}
Deno.test("V3 HMAC separates keys and binds TX, time, scene, turn and exact JSON",async()=>{
 const s=await signNpcHeatOriginV3(frame,kid,secret);
 assert.match(s,/^hmac-sha256:test-2026-10:[a-f0-9]{64}$/);
 assert.equal(await verifyNpcHeatOriginV3(frame,s,kid,secret),true);
 assert.equal(await verifyNpcHeatOriginV3(frame,s,"different-key-id",secret),false);
 assert.equal(await verifyNpcHeatOriginV3(frame,s,kid,"different-long-test-key-012345678901"),false);
 const fields=[
  {saveTo:"TEST-S6"},{turnId:"TEST-DIFFERENT"},{txId:"TEST-OTHER"},
  {inworldStart:"Day67 17:21:01"},{inworldEnd:"Day67 17:22:01"},
  {sceneId:"scene.other"},{worldAdvancesJson:frame.worldAdvancesJson+" "},
 ];
 for(const changed of fields)
   assert.equal(await verifyNpcHeatOriginV3({...frame,...changed},s,kid,secret),false);
 await assert.rejects(()=>signNpcHeatOriginV3({...frame,saveTo:"V2-S0795"},kid,secret),/SOURCE_INVALID/);
 await assert.rejects(()=>signNpcHeatOriginV3({...frame,worldAdvancesJson:"{}"},kid,secret),/EPOCH_INVALID/);
 await assert.rejects(()=>signNpcHeatOriginV3(frame,kid,"short"),/KEY_MISSING_OR_INVALID/);
});
Deno.test("V3 signed journal remains a candidate; tampering fails closed",async()=>{
 const old={secret:config.npcHeatTestHmacKey,id:config.npcHeatTestHmacKeyId};
 try {
  config.npcHeatTestHmacKey=secret;config.npcHeatTestHmacKeyId=kid;
  const original=await row();
  const valid=await auditNpcHeatJournalIncludingTestV2(packet(original));
  assert.equal(valid.testV3HmacMatches,1);
  assert.equal(valid.testV3FullHistoryAuthenticated,false);
  assert.equal(valid.verifiedForTierPromotion,false);
  assert.equal(valid.historyComplete,false);
  assert.equal(valid.receipts.length,1);
  for(const [col,val] of [
   [1,"OTHER-TURN"],[3,"Day67 17:20:00"],
   [4,"Day67 17:22:01"],[5,"scene.other"],
   [9,frame.worldAdvancesJson+" "],
   [13,"hmac-sha256:"+kid+":"+"0".repeat(64)],
  ] as const){
   const changed=[...original];changed[col]=val;
   const result=await auditNpcHeatJournalIncludingTestV2(packet(changed));
   assert.equal(result.status,"TEST_V3_HMAC_MISMATCH");
   assert.equal(result.receipts.length,0);
  }
  config.npcHeatTestHmacKey="";
  const missing=await auditNpcHeatJournalIncludingTestV2(packet(original));
  assert.equal(missing.status,"TEST_V3_PROVENANCE_KEY_NOT_CONFIGURED");
 } finally {
  config.npcHeatTestHmacKey=old.secret;config.npcHeatTestHmacKeyId=old.id;
 }
});
