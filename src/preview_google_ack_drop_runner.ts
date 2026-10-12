/**
 * Intentionally injects a post-200 synthetic ACK drop for one isolated TX.
 * This MUST leave a permanent KV lock. Does not clear/retry/complete Docs.
 */
import {config} from "./config.ts";
import {commitTurn,prepareCommit} from "./commit.ts";
import {readFixedWriterEvidence,type WriterEvidence,fixedWriterE2EGate} from "./preview_writer_e2e.ts";
import {testDocsPinned,PREVIEW_TEST_TEMP_RUNTIME_ID} from "./preview_test_storage.ts";
import {
 TEST_ACK_DROP_TX,TEST_ACK_DROP_TURN,TEST_ACK_DROP_SAVE_FROM,
 TEST_ACK_DROP_SAVE_TO,TEST_ACK_DROP_ERROR,
} from "./preview_google_ack_drop.ts";
import type {CommitRequest,DocKey} from "./types.ts";

const workbook=PREVIEW_TEST_TEMP_RUNTIME_ID;
const time="17:21:00";
const actor="npc.test.only";
export const ACK_DROP_REQUEST:CommitRequest={
 turnId:TEST_ACK_DROP_TURN,txId:TEST_ACK_DROP_TX,
 expectedSaveId:TEST_ACK_DROP_SAVE_FROM,saveTo:TEST_ACK_DROP_SAVE_TO,
 docAppends:[{documentKey:"LIVE_TRANSACTION_ARCHIVE",
 text:"Synthetic LOST-ACK scenario; deliberately not appended due to the injected failure."}],
 semantic:{
  elapsedSeconds:0,sceneActorIds:[actor],
  resourceDeltas:[{resource:"Money copper",delta:1}],
  session:{
   inworldStart:"Day67 "+time,sceneId:"scene.test_only",
   actionSummary:"Single TEST-only post-Sheets ACK loss, no Docs append",
   source:"ENGINE_FASTPATH",
  },
 },
};

export function ackDropGate(c:{
 timeline:string;tempId:string;isolatedId:string;
 docs:Record<DocKey,string>;allowWrites:boolean;allowRawCommits:boolean;
 writerEnabled:boolean;kvEnabled:boolean;ackFlag:boolean;hmacSecret:string;
}):boolean {
 return c.ackFlag===true && c.hmacSecret==="" &&
  fixedWriterE2EGate({
   timeline:c.timeline,workbookId:c.tempId,isolatedWorkbookId:c.isolatedId,
   docs:c.docs,allowWrites:c.allowWrites,allowRawCommits:c.allowRawCommits,
   testWriterEnabled:c.writerEnabled,kvEnabled:c.kvEnabled,
  }) && testDocsPinned(c.docs);
}
const target={
 txId:TEST_ACK_DROP_TX,turnId:TEST_ACK_DROP_TURN,saveTo:TEST_ACK_DROP_SAVE_TO,
};
function isCompletePartial(e:WriterEvidence){
 return e.saveId===TEST_ACK_DROP_SAVE_TO && e.worldTime===time &&
 e.copper===12 && e.receiptCount===1 && e.docMarkerCount===0 &&
 e.stateDigestValid && e.v2ReceiptCount===1 &&
 e.v2ReceiptActorValid && e.v2EnvelopeValid;
}
function isCleanBefore(previous:WriterEvidence,newTx:WriterEvidence){
 return previous.saveId===TEST_ACK_DROP_SAVE_FROM &&
 previous.worldTime===time && previous.copper===11 &&
 previous.receiptCount===1 && previous.docMarkerCount===1 &&
 previous.stateDigestValid && previous.v2ReceiptActorValid &&
 previous.v2EnvelopeValid &&
 newTx.receiptCount===0 && newTx.docMarkerCount===0;
}
async function readLock(){
 const deno=(globalThis as unknown as {
  Deno?:{openKv?:()=>Promise<{
   get<T>(key:readonly (string|number|boolean|bigint|Uint8Array)[]):
    Promise<{value:T|null;versionstamp:string|null}>;
   close?:()=>void;
  }>};
 }).Deno;
 if(!deno?.openKv)throw Error("TEST_ACK_DROP_SHARED_KV_REQUIRED");
 const kv=await deno.openKv();
 try{
  const lock=await kv.get<{txId?:unknown;ownerToken?:unknown}>([
   "rpg-v2","semantic-writer-lock",workbook,
  ]);
  const cache=await kv.get<{state?:unknown}>([
   "tx",workbook,TEST_ACK_DROP_TX,
  ]);
  return {
   held:lock.value!==null,
   exactTx:lock.value?.txId===TEST_ACK_DROP_TX &&
    typeof lock.value?.ownerToken==="string" &&
    lock.value.ownerToken.length>0,
   cacheRecoveryRequired:cache.value?.state==="RECOVERY_REQUIRED",
  };
 }finally{kv.close?.();}
}
/**
 * Remote TEST only: Google Sheets actually commits, writer intentionally throws
 * after it receives 200 and before it can ACK or append Docs. Postmortem uses
 * only reads. No second request is allowed to resume this TX automatically.
 */
export async function runAckDropTest(){
 const current=await readFixedWriterEvidence();
 const next=await readFixedWriterEvidence(target);
 if(!isCleanBefore(current,next))
  throw Error("TEST_ACK_DROP_NOT_AT_EXACT_TEST_S3_BASELINE");
 const existing=await readLock();
 if(existing.held)throw Error("TEST_ACK_DROP_EXISTING_KV_LOCK_BLOCKS_START");
 const prep=await prepareCommit({...ACK_DROP_REQUEST,dryRun:true});
 if(("alreadyCommitted" in prep && prep.alreadyCommitted) ||
    !prep.validation?.every((v:{pass:boolean})=>v.pass))
  throw Error("TEST_ACK_DROP_PREPARE_NOT_CLEAN");
 let injected=false;
 try {
  await commitTurn(ACK_DROP_REQUEST);
 }catch(error){
  if(String(error).includes(TEST_ACK_DROP_ERROR))injected=true;
  else throw error;
 }
 if(!injected)throw Error("TEST_ACK_DROP_INJECTION_NOT_OBSERVED");
 // Diagnostics never remove lock. If another Google read fails we still leave
 // the durable lock held, and return an error requiring manual reconciliation.
 const after=await readFixedWriterEvidence(target);
 const lock=await readLock();
 return {
  testOnly:true,ackDiscardSimulated:true,
  postSheets200Injected:true,googleSheetsPersisted:isCompletePartial(after),
  saveId:after.saveId,txJournalRows:after.receiptCount,
  docTxMarkerCount:after.docMarkerCount,
  moneyCopper:after.copper,sha256ContentMatches:after.stateDigestValid,
  lockHeld:lock.held,lockOwnerMatchesTx:lock.exactTx,
  cacheRecoveryRequired:lock.cacheRecoveryRequired,
  status:isCompletePartial(after)&&lock.held&&lock.exactTx&&lock.cacheRecoveryRequired?
    "EXPECTED_PARTIAL_DURABLE_TEST_STATE_REQUIRES_OPERATOR_REVIEW":
    "UNCONFIRMED_DURABLE_OUTCOME_STOP_AND_RECONCILE",
  automaticRetryAllowed:false,programmaticUnlockAllowed:false,
  olderWorkerConfirmedStopped:false,productionTouched:false,
  actualNetworkAckLossProven:false,
 };
}
