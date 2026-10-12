import assert from "node:assert/strict";
import {assessAckDropForensics} from "../src/preview_google_ack_drop_report.ts";
import {handleHttpRequest} from "../src/http.ts";
import {PREVIEW_GOOGLE_RECOVERY_PAGE} from "../src/preview_google_recovery_ui.ts";
const evidence={
 saveId:"TEST-S4",worldTime:"17:21:00",receiptCount:1,
 docMarkerCount:0,copper:12,stateDigestValid:true,
 v2ReceiptCount:1,v2ReceiptActorValid:true,v2EnvelopeValid:true,
};
const lock={
 versionstamp:"0000000001" as string|null,held:true,ownerIsFixedTx:true,
 cacheState:"RECOVERY_REQUIRED",
};
const pack=(change:Partial<typeof evidence>={},
 changes:Partial<typeof lock>={},prev:Partial<typeof lock>={},
 controlStable=true)=>({
 evidence:{...evidence,...change},
 before:{...lock,...prev},after:{...lock,...changes},controlStable,
});
Deno.test("after durable TEST Sheets and missing Docs, orphan lock is NEVER automatically cleared",()=>{
 const result=assessAckDropForensics(pack());
 assert.equal(result.status,
  "EXPECTED_PARTIAL_TEST_SHEETS_DURABLE_AND_ORPHAN_LOCK_HELD");
 assert.equal(result.txJournalRows,1);
 assert.equal(result.docTxMarkerCount,0);
 assert.equal(result.copper,12);
 assert.equal(result.lockHeld,true);
 assert.equal(result.lockOwnerMatchesTx,true);
 assert.equal(result.recoveryCacheObserved,true);
 assert.equal(result.sha256Matches,true);
 assert.equal(result.googleWritesPerformed,0);
 assert.equal(result.kvWritesPerformed,0);
 assert.equal(result.automaticReplayAllowed,false);
 assert.equal(result.programmaticUnlockAllowed,false);
 assert.equal(result.oldWorkerStoppedVerified,false);
 assert.equal(result.realGoogleNetworkAckFailureProven,false);
});
Deno.test("partial or conflicting Google Sheets records remain uncertain",()=>{
 const bad=[
  {saveId:"TEST-S3"},{worldTime:"17:22:00"},{copper:13},
  {receiptCount:0},{receiptCount:2},{stateDigestValid:false},
  {v2ReceiptActorValid:false},{v2EnvelopeValid:false},
 ];
 for(const change of bad){
  const out=assessAckDropForensics(pack(change));
  assert.equal(out.status,"SHEETS_OUTCOME_UNCONFIRMED_OR_CONFLICTING");
  assert.equal(out.automaticReplayAllowed,false);
 }
});
Deno.test("unexpected Doc marker cannot be treated as expected lost ACK",()=>{
 for(const marker of [1,2]){
  const out=assessAckDropForensics(pack({docMarkerCount:marker}));
  assert.equal(out.status,"DOC_TX_PRESENT_UNEXPECTED_REVIEW_REQUIRED");
  assert.equal(out.programmaticUnlockAllowed,false);
 }
});
Deno.test("missing or mismatching lock and recovery cache are never safe",()=>{
 for(const change of [
  {held:false,ownerIsFixedTx:false,versionstamp:null,cacheState:"COMMITTED"},
  {ownerIsFixedTx:false},
 ]){
  const out=assessAckDropForensics(pack({},change,change));
  assert.equal(out.status,"EXPECTED_ORPHAN_LOCK_MISSING_OR_DIFFERENT_OWNER");
  assert.equal(out.automaticReplayAllowed,false);
 }
 const cache=assessAckDropForensics(pack({},{cacheState:"COMMITTED"},{cacheState:"COMMITTED"}));
 assert.equal(cache.status,"UNEXPECTED_CACHE_STATE");
});
Deno.test("cross-read KV owner or cache changes and Control drift fail closed",()=>{
 const swapped=assessAckDropForensics(pack({},{ownerIsFixedTx:false}));
 assert.equal(swapped.status,"UNSTABLE_SOURCE_OR_LOCK_SNAPSHOT");
 const cacheRace=assessAckDropForensics(pack({},{cacheState:"COMMITTED"}));
 assert.equal(cacheRace.status,"UNSTABLE_SOURCE_OR_LOCK_SNAPSHOT");
 const clock=assessAckDropForensics(pack({}, {}, {}, false));
 assert.equal(clock.status,"UNSTABLE_SOURCE_OR_LOCK_SNAPSHOT");
});
Deno.test("safe preview report UI contains no TEST IDs or embedded secrets",()=>{
 assert.match(PREVIEW_GOOGLE_RECOVERY_PAGE,
  /\/preview\/google-recovery\/ack-drop/);
 assert.equal(PREVIEW_GOOGLE_RECOVERY_PAGE.includes("RUNTIME_API_KEY"),false);
 assert.equal(PREVIEW_GOOGLE_RECOVERY_PAGE.includes(
  "1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8"),false);
});
Deno.test("readonly ack-drop report is inaccessible in Production",async()=>{
 const response=await handleHttpRequest(new Request(
  "https://synthetic.invalid/preview/google-recovery/ack-drop"));
 assert.equal(response.status,404);
});
