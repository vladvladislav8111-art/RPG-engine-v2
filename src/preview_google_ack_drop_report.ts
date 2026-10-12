/**
 * Strictly read-only POST-200 lost-ACK forensic test for the pinned TX.
 * Reports the expected intentionally PARTIAL state; cannot retry/repair it.
 */
import {readFixedWriterEvidence,type WriterEvidence}
 from "./preview_writer_e2e.ts";
import {sheetsBatchGet} from "./google.ts";
import {
 TEST_ACK_DROP_TX,TEST_ACK_DROP_TURN,TEST_ACK_DROP_SAVE_TO,
} from "./preview_google_ack_drop.ts";
import {PREVIEW_TEST_TEMP_RUNTIME_ID} from "./preview_test_storage.ts";

const target={txId:TEST_ACK_DROP_TX,turnId:TEST_ACK_DROP_TURN,
 saveTo:TEST_ACK_DROP_SAVE_TO};
type Snapshot={
 versionstamp:string|null;held:boolean;ownerIsFixedTx:boolean;
 cacheState:string;
};
type Source={
 evidence:WriterEvidence;before:Snapshot;after:Snapshot;
 controlStable:boolean;
};
export function assessAckDropForensics(s:Source){
 const {evidence:e,before,after,controlStable}=s;
 const lockStable=before.versionstamp===after.versionstamp &&
   before.cacheState===after.cacheState &&
   before.held===after.held &&
   before.ownerIsFixedTx===after.ownerIsFixedTx;
 const expectedSheets=e.saveId===TEST_ACK_DROP_SAVE_TO &&
   e.worldTime==="17:21:00" && e.copper===12 &&
   e.receiptCount===1 && e.v2ReceiptCount===1 &&
   e.stateDigestValid && e.v2ReceiptActorValid &&
   e.v2EnvelopeValid;
 const docsPending=e.docMarkerCount===0;
 const lockHeld=before.held && after.held &&
   before.ownerIsFixedTx && after.ownerIsFixedTx;
 const cacheRecovery=after.cacheState==="RECOVERY_REQUIRED";
 const status=!controlStable||!lockStable?"UNSTABLE_SOURCE_OR_LOCK_SNAPSHOT":
   !expectedSheets?"SHEETS_OUTCOME_UNCONFIRMED_OR_CONFLICTING":
   !docsPending?"DOC_TX_PRESENT_UNEXPECTED_REVIEW_REQUIRED":
   !lockHeld?"EXPECTED_ORPHAN_LOCK_MISSING_OR_DIFFERENT_OWNER":
   !cacheRecovery?"UNEXPECTED_CACHE_STATE":
   "EXPECTED_PARTIAL_TEST_SHEETS_DURABLE_AND_ORPHAN_LOCK_HELD";
 return {
  schema:"PREVIEW_TEST_POST_200_ACK_DROP_FORENSICS_V1" as const,
  testOnly:true as const,status,
  saveId:e.saveId,worldTime:e.worldTime,
  txJournalRows:e.receiptCount,docTxMarkerCount:e.docMarkerCount,
  copper:e.copper,v2ReceiptValid:e.v2EnvelopeValid&&e.v2ReceiptActorValid&&
   e.v2ReceiptCount===1,sha256Matches:e.stateDigestValid,
  lockHeld:before.held||after.held,
  lockOwnerMatchesTx:lockHeld,
  lockSnapshotStable:lockStable,controlStable,
  recoveryCacheObserved:cacheRecovery,
  googleWritesPerformed:0 as const,kvWritesPerformed:0 as const,
  automaticReplayAllowed:false as const,
  programmaticUnlockAllowed:false as const,
  oldWorkerStoppedVerified:false as const,
  realGoogleNetworkAckFailureProven:false as const,
  note:"Forensics only. Never release an orphan lock or retry without verified process drain and independent manual reconciliation.",
 };
}
type ReadOnlyKv={
 get<T>(key:readonly (string|number|boolean|bigint|Uint8Array)[]):
  Promise<{value:T|null;versionstamp:string|null}>;
 close?:()=>void;
};
async function snapshot(kv:ReadOnlyKv):Promise<Snapshot>{
 const lock=await kv.get<{txId?:unknown;ownerToken?:unknown}>([
  "rpg-v2","semantic-writer-lock",PREVIEW_TEST_TEMP_RUNTIME_ID]);
 const cache=await kv.get<{state?:unknown}>([
  "tx",PREVIEW_TEST_TEMP_RUNTIME_ID,TEST_ACK_DROP_TX]);
 return {
  versionstamp:lock.versionstamp,held:lock.value!==null,
  ownerIsFixedTx:lock.value!==null && lock.value?.txId===TEST_ACK_DROP_TX &&
   typeof lock.value?.ownerToken==="string" && lock.value.ownerToken.length>0,
  cacheState:String(cache.value?.state??"ABSENT"),
 };
}
async function control(){
 const raw=await sheetsBatchGet(PREVIEW_TEST_TEMP_RUNTIME_ID,
  ["CONTROL!B2","CONTROL!B5"]);
 return {
  save:String(raw["CONTROL!B2"]?.[0]?.[0]??""),
  time:String(raw["CONTROL!B5"]?.[0]?.[0]??""),
 };
}
export async function readAckDropForensics(){
 const deno=(globalThis as unknown as {Deno?:{openKv?:()=>Promise<ReadOnlyKv>}}).Deno;
 if(!deno?.openKv)throw Error("TEST_ACK_DROP_FORENSICS_KV_REQUIRED");
 const kv=await deno.openKv();
 try{
  const before=await snapshot(kv);
  const evidence=await readFixedWriterEvidence(target);
  const current=await control();
  const after=await snapshot(kv);
  return assessAckDropForensics({
   evidence,before,after,
   controlStable:evidence.saveId===current.save &&
    evidence.worldTime===current.time,
  });
 }catch{
  return {
   schema:"PREVIEW_TEST_POST_200_ACK_DROP_FORENSICS_V1" as const,
   testOnly:true as const,status:"SOURCE_READ_FAILED_STOP_AND_REVIEW" as const,
   automaticReplayAllowed:false as const,
   programmaticUnlockAllowed:false as const,
   oldWorkerStoppedVerified:false as const,
   googleWritesPerformed:0 as const,kvWritesPerformed:0 as const,
  };
 }finally{kv.close?.();}
}
