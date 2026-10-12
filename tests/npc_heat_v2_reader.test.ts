import assert from "node:assert/strict";
import { auditNpcHeatJournalIncludingTestV2 } from "../src/npc_heat_v2_reader.ts";
import { npcHeatStateHashV2 } from "../src/npc_heat_receipt_writer.ts";
import { hash32 } from "../src/rng.ts";
const headers = ["Save ID","Turn ID","TX ID","Inworld start","Inworld end",
  "Scene ID","Action summary","Deltas JSON","New canon JSON",
  "World advances JSON","Notes","Committed at","Ruleset version",
  "State hash","Source","Version"];
const tx="TEST-V2-A",scene="scene.test",end="Day67 17:22:00",save="TEST-S2";
const receipt = {actorId:"npc.synthetic", txId:tx,sourceRef:"scene:"+scene,
  sceneId:scene,day:67,time:"17:22:00",kind:"SCENE_PRESENCE",committed:true,
  eventId:tx+"|npc.synthetic|SCENE_PRESENCE|scene:"+scene};
async function sampleRow() {
  const row: unknown[] = Array(16).fill("");
  row[0]=save;row[1]="TEST-TURN-V2";row[2]=tx;
  row[3]="Day67 17:21:00";row[4]=end;row[5]=scene;
  row[9]=JSON.stringify({
    engineNpcReceiptEpoch:"TEST_ONLY_V2",
    engineNpcAttentionReceipts:[receipt],
  });
  row[13]=await npcHeatStateHashV2({
    saveTo:save,inworldEnd:end,sceneId:scene,txId:tx,
    worldAdvancesJson:String(row[9]),
  });
  row[14]="ENGINE_FASTPATH";row[15]=2;
  return row;
}
function input(rows:unknown[][]){
  return {sourceSaveId:save,worldDay:67,worldTime:"17:23:00",
    stableAfterRead:true,requestedActorIds:["npc.synthetic"],
    index:[["TX ID"],[tx]],header:headers,rowStart:2,rows};
}
Deno.test("V2 valid digest and actor receipt remain candidates, never earned heat", async()=>{
  const row=await sampleRow();
  const p=await auditNpcHeatJournalIncludingTestV2(input([row]));
  assert.equal(p.status,"COMPLETE_WINDOW_NOT_FULL_HISTORY");
  assert.equal(p.testV2DigestMatches,1);
  assert.equal(p.receipts.length,1);
  assert.equal(p.verifiedForTierPromotion,false);
  assert.equal(p.contentHashAuthenticated,false);
  assert.equal(p.testV2CryptographicallyAuthenticated,false);
  assert.equal(p.historyComplete,false);
  assert.equal(p.semanticWrites,0);
});
Deno.test("V2 modified JSON, TX, scene, inworld end or hash fails closed",async()=>{
  const row=await sampleRow();
  const cases=[
    {col:9,value:String(row[9])+" "},
    {col:2,value:"TEST-V2-B"},
    {col:5,value:"scene.other"},
    {col:4,value:"Day67 17:21:55"},
    {col:13,value:"sha256:"+"0".repeat(64)},
  ];
  for(const test of cases) {
    const altered=[...row];altered[test.col]=test.value;
    const p=await auditNpcHeatJournalIncludingTestV2(input([altered]));
    assert.notEqual(p.status,"COMPLETE_WINDOW_NOT_FULL_HISTORY");
    assert.equal(p.receipts.length,0);
    assert.equal(p.verifiedForTierPromotion,false);
  }
});
Deno.test("V2 scope and epoch mismatch cannot grant historical evidence",async()=>{
  const row=await sampleRow();
  const tampered=[...row];tampered[0]="V2-S0795";
  let p=await auditNpcHeatJournalIncludingTestV2(input([tampered]));
  assert.equal(p.status,"TEST_V2_SOURCE_SCOPE_OR_SCHEMA_INVALID");
  const epoch=[...row]; epoch[9]=JSON.stringify({
    engineNpcReceiptEpoch:"ANY_OTHER_EPOCH",
    engineNpcAttentionReceipts:[receipt]});
  epoch[13]=await npcHeatStateHashV2({
    saveTo:save,inworldEnd:end,sceneId:scene,txId:tx,
    worldAdvancesJson:String(epoch[9])});
  p=await auditNpcHeatJournalIncludingTestV2(input([epoch]));
  assert.equal(p.status,"TEST_V2_RECEIPT_EPOCH_MISMATCH");
  assert.equal(p.testV2DigestMatches,0);
});
Deno.test("legacy v1 remains supported with no V2 upgrade",async()=>{
  const r=await sampleRow();r[15]=1;
  r[13]=hash32([save,end,scene,tx].join("|")).toString(16);
  const p=await auditNpcHeatJournalIncludingTestV2(input([r]));
  assert.equal(p.testV2DigestMatches,0);
  assert.equal(p.receipts.length,1);
  assert.equal(p.verifiedForTierPromotion,false);
});
Deno.test("V2 valid checksum cannot override contradictory receipt actors or scene",async()=>{
  const r=await sampleRow();
  r[9]=JSON.stringify({engineNpcReceiptEpoch:"TEST_ONLY_V2",
    engineNpcAttentionReceipts:[{...receipt,actorId:"npc.other"}]});
  r[13]=await npcHeatStateHashV2({
    saveTo:save,inworldEnd:end,sceneId:scene,txId:tx,
    worldAdvancesJson:String(r[9])});
  const p=await auditNpcHeatJournalIncludingTestV2(input([r]));
  assert.equal(p.testV2DigestMatches,1);
  assert.equal(p.status,"MALFORMED_OR_CROSS_TX_RECEIPT");
  assert.equal(p.receipts.length,0);
});
