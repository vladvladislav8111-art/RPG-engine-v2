import assert from "node:assert/strict";
import {
  assessFixedRecovery,collectFixedRecovery,fixedRecoveryGate,
} from "../src/preview_google_recovery.ts";
import {PREVIEW_TEST_DOC_IDS,PREVIEW_TEST_TEMP_RUNTIME_ID} from "../src/preview_test_storage.ts";
import {TEST_E2E_TX} from "../src/preview_writer_e2e.ts";
import {PREVIEW_GOOGLE_RECOVERY_PAGE} from "../src/preview_google_recovery_ui.ts";
import {handleHttpRequest} from "../src/http.ts";
const sheet=PREVIEW_TEST_TEMP_RUNTIME_ID;
const input={
 timeline:"preview/test-recovery",tempId:sheet,testWorkbookId:sheet,
 docs:{...PREVIEW_TEST_DOC_IDS},allowWrites:false,rawWrites:false,
 writerEnabled:false,kvEnabled:true,
};
const complete={
 saveId:"TEST-S3",worldTime:"17:21:00",receiptCount:1,
 docMarkerCount:1,copper:11,stateDigestValid:true,
 v2ReceiptCount:1,v2ReceiptActorValid:true,v2EnvelopeValid:true,
};
const noLock={
 lockHeld:false,lockOwnerMatchesFixedTx:false,
 versionstamp:null,txCacheState:"COMMITTED" as const,
};
const held={
 lockHeld:true,lockOwnerMatchesFixedTx:true,
 versionstamp:"0100",txCacheState:"RECOVERY_REQUIRED" as const,
};
Deno.test("read-only forensic gate needs strict preview, pinned Docs and disabled writers",()=>{
 assert.equal(fixedRecoveryGate(input),true);
 for(const bad of [
  {timeline:"production"},{tempId:"real-save"},
  {testWorkbookId:"real-save"},{docs:{...PREVIEW_TEST_DOC_IDS,LIVE_SESSION_LOG:"production"}},
  {allowWrites:true},{rawWrites:true},{writerEnabled:true},{kvEnabled:false},
 ])assert.equal(fixedRecoveryGate({...input,...bad}),false);
 assert.equal(PREVIEW_GOOGLE_RECOVERY_PAGE.includes(sheet),false);
 assert.equal(PREVIEW_GOOGLE_RECOVERY_PAGE.includes("RUNTIME_API_KEY"),false);
});
Deno.test("complete old TEST-S3 receipt is observation only, NEVER retry or KV unlock",()=>{
 const result=assessFixedRecovery({
  evidence:complete,before:noLock,after:noLock,controlStable:true,
 });
 assert.equal(result.status,"CONSISTENT_TEST_RECEIPT");
 assert.equal(result.completeSavedTransactionObserved,true);
 assert.equal(result.programmaticUnlockAllowed,false);
 assert.equal(result.automaticRetryAllowed,false);
 assert.equal(result.olderWorkerConfirmedStopped,false);
 assert.equal(result.historyFullProven,false);
 assert.equal(result.googleWritesPerformed,0);
 assert.equal(result.kvWritesPerformed,0);
});
Deno.test("complete durable Sheets+Docs after lost ACK remains blocked under held KV",()=>{
 const result=assessFixedRecovery({
  evidence:complete,before:held,after:held,controlStable:true,
 });
 assert.equal(result.status,"COMPLETE_RECEIPT_BUT_LOCK_HELD");
 assert.equal(result.lockHeld,true);
 assert.equal(result.lockOwnerMatchesTx,true);
 assert.equal(result.programmaticUnlockAllowed,false);
 assert.equal(result.automaticRetryAllowed,false);
});
Deno.test("partial or conflicting Google state never becomes complete",()=>{
 const cases=[
  {receiptCount:0},{receiptCount:2},{docMarkerCount:0},
  {docMarkerCount:2},{copper:12},{stateDigestValid:false},
  {v2ReceiptActorValid:false},{v2EnvelopeValid:false},
  {saveId:"TEST-S2"},{worldTime:"17:22:00"},
 ];
 for(const broken of cases){
  const result=assessFixedRecovery({
   evidence:{...complete,...broken},
   before:noLock,after:noLock,controlStable:true,
  });
  assert.equal(result.status,"INCOMPLETE_OR_CONFLICTING_GOOGLE_STATE");
  assert.equal(result.completeSavedTransactionObserved,false);
  assert.equal(result.programmaticUnlockAllowed,false);
 }
});
Deno.test("recovery fails closed on changed KV owner or source snapshot",()=>{
 const other={...held,lockOwnerMatchesFixedTx:false};
 const mismatch=assessFixedRecovery({
  evidence:complete,before:held,after:other,controlStable:true,
 });
 assert.equal(mismatch.status,"UNKNOWN_LOCK_OWNER_BLOCKED");
 const race=assessFixedRecovery({
  evidence:complete,before:noLock,after:held,controlStable:true,
 });
 assert.equal(race.status,"UNSTABLE_READONLY_SNAPSHOT");
 const sourceChanged=assessFixedRecovery({
  evidence:complete,before:noLock,after:noLock,controlStable:false,
 });
 assert.equal(sourceChanged.status,"UNSTABLE_READONLY_SNAPSHOT");
 for(const result of [mismatch,race,sourceChanged])
  assert.equal(result.automaticRetryAllowed,false);
});
Deno.test("scoped cache state cannot override invalid receipts or held lock",()=>{
 const cachePending={...noLock,txCacheState:"RECOVERY_REQUIRED" as const};
 const r=assessFixedRecovery({
  evidence:complete,before:cachePending,after:cachePending,controlStable:true,
 });
 assert.equal(r.status,"COMPLETE_RECEIPT_UNCERTAIN_CACHE");
 const stillLocked=assessFixedRecovery({
  evidence:complete,before:held,after:held,controlStable:true,
 });
 assert.equal(stillLocked.status,"COMPLETE_RECEIPT_BUT_LOCK_HELD");
});
Deno.test("read-only recovery uses only KV get, not atomic/write/delete",async()=>{
 const requests:string[]=[];
 const kv={
  get:async <T>(key:readonly (string|number|boolean|bigint|Uint8Array)[]):Promise<{
    value:T|null;versionstamp:string|null;
  }>=>{
   requests.push(key.join("|"));
   if(String(key[1])==="semantic-writer-lock")
    return {value:null,versionstamp:null};
   return {value:{state:"COMMITTED"} as T,versionstamp:"0100"};
  },
  atomic:()=>{throw Error("FORBIDDEN_KV_MUTATOR");},
  set:()=>{throw Error("FORBIDDEN_KV_SET");},
  delete:()=>{throw Error("FORBIDDEN_KV_DELETE");},
 };
 let reads=0;
 const output=await collectFixedRecovery({
  kv,
  getEvidence:async()=>{reads++;return complete;},
  getControl:async()=>{reads++;return {saveId:"TEST-S3",worldTime:"17:21:00"};},
 });
 assert.equal(output.status,"CONSISTENT_TEST_RECEIPT");
 assert.equal(reads,2);
 assert.equal(requests.length,4);
 assert.ok(requests.every(s=>s.includes(sheet) && !s.includes("V2-S0795")));
 assert.equal(output.googleWritesPerformed,0);
});
Deno.test("non Preview may never use authenticated recovery report route",async()=>{
 for(const path of ["/preview/google-recovery","/preview/google-recovery/report"]){
  const resp=await handleHttpRequest(new Request("https://test.invalid"+path));
  assert.equal(resp.status,404);
 }
});
