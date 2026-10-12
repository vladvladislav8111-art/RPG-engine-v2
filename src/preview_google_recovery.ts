/**
 * TEST-only forensic snapshot after a potentially ambiguous Google ACK.
 * No KV mutators, Google writers or authorization to retry/clear a lock.
 *
 * Only the fixed previously committed TEST-S2 -> TEST-S3 TX is supported.
 * Output is a bounded observation, never proof a paused writer has stopped.
 */
import { config } from "./config.ts";
import {
  readFixedWriterEvidence, TEST_E2E_TX, TEST_E2E_TO,
  type WriterEvidence,
} from "./preview_writer_e2e.ts";
import { testPreviewTimeline, PREVIEW_TEST_TEMP_RUNTIME_ID,
  testDocsPinned } from "./preview_test_storage.ts";
import type { DocKey } from "./types.ts";

export function fixedRecoveryGate(input:{
  timeline:string;tempId:string;testWorkbookId:string;
  docs:Record<DocKey,string>;allowWrites:boolean;rawWrites:boolean;
  writerEnabled:boolean;kvEnabled:boolean;
}):boolean {
  return testPreviewTimeline(input.timeline) &&
    input.tempId===PREVIEW_TEST_TEMP_RUNTIME_ID &&
    input.testWorkbookId===PREVIEW_TEST_TEMP_RUNTIME_ID &&
    testDocsPinned(input.docs) &&
    input.allowWrites===false && input.rawWrites===false &&
    input.writerEnabled===false && input.kvEnabled===true;
}
type KvSnapshot = {
  lockHeld:boolean;
  lockOwnerMatchesFixedTx:boolean;
  txCacheState:"COMMITTING"|"SHEET_COMMITTED_DOCS_PENDING"|"RECOVERY_REQUIRED"|"COMMITTED"|"ABSENT"|"OTHER";
  versionstamp:string|null;
};
export type FixedRecoveryEvidence = {
  evidence:WriterEvidence;
  before:KvSnapshot;
  after:KvSnapshot;
  controlStable:boolean;
};
const exactCommit = (e:WriterEvidence) =>
  e.saveId===TEST_E2E_TO &&
  e.worldTime==="17:21:00" &&
  e.receiptCount===1 && e.docMarkerCount===1 &&
  e.copper===11 && e.stateDigestValid &&
  e.v2ReceiptCount===1 && e.v2ReceiptActorValid &&
  e.v2EnvelopeValid;

export function assessFixedRecovery(input:FixedRecoveryEvidence){
  const {evidence:e,before,after,controlStable}=input;
  const sameLock=before.versionstamp===after.versionstamp &&
    before.lockHeld===after.lockHeld &&
    before.lockOwnerMatchesFixedTx===after.lockOwnerMatchesFixedTx;
  const lockHeld=before.lockHeld||after.lockHeld;
  const inconsistentLockOwner=lockHeld &&
    !(before.lockOwnerMatchesFixedTx && after.lockOwnerMatchesFixedTx);
  const stable=controlStable && sameLock;
  const complete=exactCommit(e);
  const cacheUncertain=[
    "COMMITTING","SHEET_COMMITTED_DOCS_PENDING","RECOVERY_REQUIRED",
    "OTHER",
  ].includes(after.txCacheState);
  const state=!stable?"UNSTABLE_READONLY_SNAPSHOT"
    :inconsistentLockOwner?"UNKNOWN_LOCK_OWNER_BLOCKED"
    :!complete?"INCOMPLETE_OR_CONFLICTING_GOOGLE_STATE"
    :lockHeld?"COMPLETE_RECEIPT_BUT_LOCK_HELD"
    :cacheUncertain?"COMPLETE_RECEIPT_UNCERTAIN_CACHE"
    :"CONSISTENT_TEST_RECEIPT";
  return {
    schema:"PREVIEW_TEST_GOOGLE_RECOVERY_READ_ONLY_V1" as const,
    testOnly:true as const,
    targetTx:TEST_E2E_TX,
    status:state,
    completeSavedTransactionObserved:complete,
    lockHeld,lockOwnerMatchesTx:!lockHeld?null:
      before.lockOwnerMatchesFixedTx && after.lockOwnerMatchesFixedTx,
    controlStable,kvLockSnapshotStable:sameLock,
    journalTxRows:e.receiptCount,docTxMarkers:e.docMarkerCount,
    copperExactlyOnce:e.copper===11,
    v2ReceiptValid:e.v2EnvelopeValid&&e.v2ReceiptActorValid&&e.v2ReceiptCount===1,
    stateHashVerified:e.stateDigestValid,
    cacheState:after.txCacheState,
    googleWritesPerformed:0 as const,kvWritesPerformed:0 as const,
    automaticRetryAllowed:false as const,
    programmaticUnlockAllowed:false as const,
    olderWorkerConfirmedStopped:false as const,
    historyFullProven:false as const,
    warning:"Read-only snapshot cannot prove a paused Deno writer has terminated. NEVER unlock, retry, or rotate TX from this report.",
  };
}
type DenoKvReadOnly={
  get<T>(key:readonly (string|number|boolean|bigint|Uint8Array)[]):
    Promise<{value:T|null;versionstamp:string|null}>;
  close?:()=>void;
};
async function readSnapshots(kv:DenoKvReadOnly):Promise<KvSnapshot> {
  const lock=await kv.get<{ownerToken?:unknown;txId?:unknown}>([
    "rpg-v2","semantic-writer-lock",PREVIEW_TEST_TEMP_RUNTIME_ID,
  ]);
  const cache=await kv.get<{state?:unknown}>([
    "tx",PREVIEW_TEST_TEMP_RUNTIME_ID,TEST_E2E_TX,
  ]);
  const states=["COMMITTING","SHEET_COMMITTED_DOCS_PENDING",
    "RECOVERY_REQUIRED","COMMITTED"];
  const val=cache.value?.state;
  const txCacheState=!cache.value?"ABSENT":
    typeof val==="string" && states.includes(val)
      ? val as KvSnapshot["txCacheState"]:"OTHER";
  return {
    lockHeld:lock.value!==null,
    lockOwnerMatchesFixedTx:lock.value!==null &&
      lock.value?.txId===TEST_E2E_TX &&
      typeof lock.value?.ownerToken==="string" &&
      lock.value.ownerToken.length>0,
    versionstamp:lock.versionstamp,
    txCacheState,
  };
}
export async function collectFixedRecovery(input:{
  kv:DenoKvReadOnly;
  getEvidence:()=>Promise<WriterEvidence>;
  getControl:()=>Promise<{saveId:string;worldTime:string}>;
}){
  const before=await readSnapshots(input.kv);
  const evidence=await input.getEvidence();
  const control=await input.getControl();
  const after=await readSnapshots(input.kv);
  return assessFixedRecovery({
    evidence,before,after,
    controlStable:control.saveId===evidence.saveId &&
      control.worldTime===evidence.worldTime,
  });
}
/** Never exposes raw Google errors, Google IDs, KV tokens or secret state. */
export async function readFixedRecovery(){
  const deno=(globalThis as unknown as {
    Deno?:{openKv?:()=>Promise<DenoKvReadOnly>};
  }).Deno;
  if(!deno?.openKv)throw Error("PREVIEW_RECOVERY_KV_REQUIRED");
  const kv=await deno.openKv();
  try {
    const {sheetsBatchGet}=await import("./google.ts");
    return await collectFixedRecovery({
      kv,getEvidence:readFixedWriterEvidence,
      getControl:async()=>{
        const raw=await sheetsBatchGet(PREVIEW_TEST_TEMP_RUNTIME_ID,
          ["CONTROL!B2","CONTROL!B5"]);
        return {
          saveId:String(raw["CONTROL!B2"]?.[0]?.[0]??""),
          worldTime:String(raw["CONTROL!B5"]?.[0]?.[0]??""),
        };
      },
    });
  }catch {
    return {
      schema:"PREVIEW_TEST_GOOGLE_RECOVERY_READ_ONLY_V1" as const,
      status:"SOURCE_READ_FAILED_STOP_AND_RECONCILE" as const,
      testOnly:true as const,googleWritesPerformed:0 as const,
      kvWritesPerformed:0 as const,automaticRetryAllowed:false as const,
      programmaticUnlockAllowed:false as const,
      olderWorkerConfirmedStopped:false as const,
      historyFullProven:false as const,
    };
  }finally {kv.close?.();}
}
