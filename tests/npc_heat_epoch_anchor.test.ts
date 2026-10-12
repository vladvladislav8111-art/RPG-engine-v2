import assert from "node:assert/strict";
import {
  signProspectiveTestGenesis,prospectiveGenesisPin,
  verifyProspectiveTestGenesis,type ProspectiveEpochGenesis,
} from "../src/npc_heat_epoch_anchor.ts";
import {signedEpochRecordDigest,type SignedEpochRow}
  from "../src/npc_heat_signed_epoch.ts";
import {signNpcHeatOriginV3} from "../src/npc_heat_origin_v3.ts";

const operatorSecret="TEST_OFFLINE_WITNESS_OPERATOR_DIFFERENT_SECRET_2026";
const rowSecret="TEST_ROW_ORIGIN_SECRET_0123456789_2026_SEPARATE";
const actor="npc.test.anchor",epochId="TEST-EPOCH-ANCHORED";
const workbookId="TEST-OFFLINE-WORKBOOK";
const keyId="test-row-key-2026",operatorKeyId="test-operator-key-2026";
const digest=(v:string)=>"sha256:"+v.repeat(64);
const fields:ProspectiveEpochGenesis={
 epochId,workbookId,priorCommittedSaveId:"TEST-S0",firstSaveTo:"TEST-S1",
 firstTxId:"TEST-TX-0",firstTurnId:"TEST-TURN-0",
 firstInworldStart:"Day60 12:00:00",signingKeyId:keyId,
 baselineControlDigest:digest("a"),baselineNpcMemoryDigest:digest("b"),
 keyRotationPolicy:"NO_ROTATION",
};
async function rows(count=2):Promise<SignedEpochRow[]> {
 const arr:SignedEpochRow[]=[];
 for(let i=0;i<count;i++){
  const txId="TEST-TX-"+i,day=60+i;
  const sceneId="scene.synthetic",ref="memory:synthetic-"+i;
  const kind="MEANINGFUL_RELATIONSHIP_EVENT";
  const previousDigest=arr.length?
    await signedEpochRecordDigest(arr[arr.length-1]):"GENESIS";
  const frame={
   saveTo:"TEST-S"+(i+1),turnId:"TEST-TURN-"+i,txId,
   inworldStart:"Day"+day+" 12:00:00",
   inworldEnd:"Day"+day+" 12:00:00",sceneId,
   source:"ENGINE_FASTPATH",
   worldAdvancesJson:JSON.stringify({
    engineNpcReceiptEpoch:"TEST_ONLY_V3",
    engineNpcReceiptChain:{epochId,sequence:i,previousDigest},
    engineNpcAttentionReceipts:[{
     eventId:[txId,actor,kind,ref].join("|"),txId,actorId:actor,
     kind,sourceRef:ref,sceneId,day,time:"12:00:00",
     committed:true,counterpartIds:["player.shura"],
     meaningfulEvidence:"Synthetic substantive actor interaction proof candidate.",
    }],
   }),
  };
  arr.push({frame,stateHash:await signNpcHeatOriginV3(frame,keyId,rowSecret)});
 }
 return arr;
}
async function fixture(){
 const signed=await signProspectiveTestGenesis(fields,operatorKeyId,operatorSecret);
 const rs=await rows();
 const input={
  anchor:signed,externallyPinnedDigest:await prospectiveGenesisPin(signed),
  operatorSecret,expectedTestWorkbookId:workbookId,
  expectedEpochId:epochId,rowSigningSecret:rowSecret,
  segment:{
   epochId,sourceSaveId:"TEST-S2",snapshotStable:true,
   indexTxIds:rs.map(r=>r.frame.txId),rows:rs,
   keyId,secret:rowSecret,
  },
 };
 return input;
}
Deno.test("separately signed & pinned TEST genesis verifies segment but NEVER promotes NPC",async()=>{
 const p=await fixture(),x=await verifyProspectiveTestGenesis(p);
 assert.equal(x.status,"WITNESSED_CANDIDATE_REQUIRES_EXTERNAL_SOURCE_VERIFICATION");
 assert.equal(x.segmentSignedRows,2);
 assert.equal(x.externallyAuthenticatedOrigin,false);
 assert.equal(x.completePastHistoryAuthenticated,false);
 assert.equal(x.canonicalMemoryIndependentlyCorroborated,false);
 assert.equal(x.allowedAutomaticHeatPromotion,false);
 assert.equal(x.allowedAutomaticKeyPromotion,false);
 assert.equal(x.allowedAutoUnlock,false);
 assert.equal(x.committedWrites,0);
});
Deno.test("independent pin and HMAC reject edited operator witness",async()=>{
 const p=await fixture();
 const bad={...p.anchor,fields:{...p.anchor.fields,
   baselineNpcMemoryDigest:digest("f")}};
 assert.equal((await verifyProspectiveTestGenesis({...p,anchor:bad})).status,
   "OUT_OF_BAND_PIN_MISMATCH");
 const rePinned={...p,anchor:bad,externallyPinnedDigest:await prospectiveGenesisPin(bad)};
 assert.equal((await verifyProspectiveTestGenesis(rePinned)).status,
   "WITNESS_HMAC_MISMATCH");
 assert.equal((await verifyProspectiveTestGenesis({
  ...p,operatorSecret:"different_operator_key_012345678901234567890",
 })).status,"WITNESS_HMAC_MISMATCH");
});
Deno.test("first TX/save/time, workbook and row signing identity are pinned",async()=>{
 const p=await fixture();
 assert.equal((await verifyProspectiveTestGenesis({
  ...p,expectedTestWorkbookId:"V2-PRODUCTION",
 })).status,"WRONG_TEST_SCOPE_OR_SIGNING_KEY_ID");
 const rs=await rows();
 const changed={...rs[0],frame:{...rs[0].frame,turnId:"TEST-FAKE"}};
 assert.equal((await verifyProspectiveTestGenesis({
  ...p,segment:{...p.segment,rows:[changed,rs[1]]},
 })).status,"FIRST_TX_NOT_ANCHORED");
 assert.equal((await verifyProspectiveTestGenesis({
  ...p,segment:{...p.segment,keyId:"test-other-key"},
 })).status,"WRONG_TEST_SCOPE_OR_SIGNING_KEY_ID");
});
Deno.test("missing middle signed TX cannot be accepted as independently continuous",async()=>{
 const p=await fixture();
 const rs=await rows(3);
 assert.match((await verifyProspectiveTestGenesis({
  ...p,segment:{...p.segment,rows:[rs[0],rs[2]],
   indexTxIds:[rs[0].frame.txId,rs[2].frame.txId],sourceSaveId:"TEST-S3"},
 })).status,/SEGMENT_REJECTED_/);
});
Deno.test("no fake genesis or borrowed origin signing key or legacy production save",async()=>{
 await assert.rejects(()=>signProspectiveTestGenesis({
  ...fields,priorCommittedSaveId:"V2-S0795",
 },operatorKeyId,operatorSecret),/INVALID_OR_NOT_INDEPENDENT/);
 await assert.rejects(()=>signProspectiveTestGenesis(
  fields,keyId,operatorSecret),/INVALID_OR_NOT_INDEPENDENT/);
 const p=await fixture();
 assert.equal((await verifyProspectiveTestGenesis({
  ...p,operatorSecret:rowSecret,
 })).status,"INDEPENDENT_OPERATOR_KEY_REQUIRED");
 assert.equal((await verifyProspectiveTestGenesis({
  ...p,externallyPinnedDigest:digest("0"),
 })).status,"OUT_OF_BAND_PIN_MISMATCH");
});
