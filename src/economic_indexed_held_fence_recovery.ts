/**
 * EC-06 recovery of a HELD, ambiguous indexed Google projection lock.
 *
 * STAGING ONLY. NO automatic lease expiry, force-unlock, HTTP route,
 * client/operator-supplied proof or Google mutation.
 *
 * A durable Google receipt alone cannot rule out a late in-flight request.
 * A trusted, independently operated quiescence controller MUST attest that
 * the former worker/request has been terminated or drained and ALL external
 * spreadsheet editors/other writers are excluded before release.
 */
import type {AtomicKvStore,KvEntry,KvKey} from "./economic_kv_atomic.ts";
import {indexedEc06Keys} from "./economic_indexed_wholesale_kv.ts";
import {makeIndexedDeltaIntent,type IndexedJournal,type IndexedDeltaTargetAdapter,
  type DeltaTarget,type IndexedDeltaIntent,
} from "./economic_indexed_delta_projection.ts";
import type {GoogleProjectionLock} from "./economic_google_kv_exclusive_fence.ts";

const lockKey=(target:DeltaTarget,id:string):KvKey=>
  ["rpg-v2","ec06","google-unique-writer",target,id];
const auditKey=(target:DeltaTarget,id:string,token:string):KvKey=>
  ["rpg-v2","ec06","google-recovery-audit",target,id,token];
const same=(a:unknown,b:unknown):boolean=>JSON.stringify(a)===JSON.stringify(b);
export type ReviewedIndexedLock={
  status:"RECEIPT_AND_ROWS_VERIFIED"|"NO_RECEIPT_BEFORE_ROWS_VERIFIED";
  target:DeltaTarget;scopeId:string;resourceId:string;
  txId:string;lockToken:string;lockEpoch:number;
  journalHash:string;
  intent:IndexedDeltaIntent;
  originalVersionstamp:string;
};
export type IndependentQuiescenceEvidence={
  workerTerminatedAndNoInflightWrites:true;
  allOtherGoogleWritersExcluded:true;
  resourceId:string;
  incidentProofRef:string;
};
/**
 * This provider must be a trusted SERVICE (manually authorized incident
 * response + independent job/request drain), not a player, GM text, secret
 * header, fabricated callback or a source readback alone.
 */
export interface ExternalQuiescenceVerifier{
  assertStoppedAndExclusive(input:{
    target:DeltaTarget;resourceId:string;
    scopeId:string;formerLockToken:string;
    formerEpoch:number;txId:string;
  }):Promise<IndependentQuiescenceEvidence>;
}
export type IndexedRecoveryAudit={
  schema:"EC06_INDEX_LOCK_RECOVERY_AUDIT_V1";
  scopeId:string;target:DeltaTarget;resourceId:string;
  txId:string;previousToken:string;epoch:number;
  observedState:ReviewedIndexedLock["status"];
  journalHash:string;
  quiescenceProofRef:string;
  /** No economic account/lot mutations are allowed in this recovery CAS. */
  financialWrites:0;
};
export async function reviewHeldIndexedGoogleLock(input:{
  kv:AtomicKvStore;adapter:IndexedDeltaTargetAdapter;
  target:DeltaTarget;scopeId:string;resourceId:string;
  expectedLockToken:string;
}):Promise<ReviewedIndexedLock>{
  const {kv,adapter,target,scopeId,resourceId,expectedLockToken}=input;
  const lock=await kv.get<GoogleProjectionLock>(lockKey(target,resourceId));
  if(!lock.versionstamp||!lock.value||
     lock.value.schema!=="EC06_GOOGLE_LOCK_V1"||
     lock.value.target!==target||lock.value.resourceId!==resourceId||
     lock.value.scopeId!==scopeId||lock.value.state!=="HELD"||
     lock.value.token!==expectedLockToken||!lock.value.pendingIndexedTxId||
     !lock.value.pendingIndexedJournalHash||
     !Number.isSafeInteger(lock.value.epoch)||lock.value.epoch<1)
    throw Error("No exact unrecovered indexed lock; never clear legacy/unknown lock");
  const txId=lock.value.pendingIndexedTxId;
  const [tx,journal,outbox]=await Promise.all([
    kv.get<{schema:string;txId:string;scopeId:string}>(indexedEc06Keys.tx(txId)),
    kv.get<IndexedJournal>(indexedEc06Keys.journal(txId)),
    kv.get<{state:string;txId:string;scopeId:string}>(indexedEc06Keys.outbox(txId)),
  ]);
  if(!tx.value||tx.value.txId!==txId||tx.value.scopeId!==scopeId||
     !["EC06_INDEX_SALE_RECEIPT_V1","EC06_INDEX_WAGE_TX_V1"].includes(tx.value.schema)||
     !journal.value||journal.value.txId!==txId||
     journal.value.scopeId!==scopeId||
     !outbox.value||outbox.value.txId!==txId||
     outbox.value.scopeId!==scopeId||
     !["PENDING_INDEXED_PROJECTION","PROJECTED_INDEXED"].includes(outbox.value.state))
    throw Error("HELD lock is not bound to a committed indexed money/item journal");
  const intent=await makeIndexedDeltaIntent(journal.value);
  if(intent.journalHash!==lock.value.pendingIndexedJournalHash)
    throw Error("HELD lock journal hash diverged; refuse recovery");
  const receipt=await adapter.readReceipt(target,scopeId,txId);
  const rows=await adapter.readRows(target,scopeId,
    intent.mutations.map(m=>({kind:m.kind,id:m.id})));
  if(rows.length!==intent.mutations.length ||
     rows.some((r,i)=>r.kind!==intent.mutations[i].kind||
       r.id!==intent.mutations[i].id))
    throw Error("Cannot independently examine all locked financial/item rows");
  let status:ReviewedIndexedLock["status"];
  if(receipt){
    const expected={
      schema:"EC06_INDEXED_TARGET_RECEIPT_V1",
      target,scopeId,txId,journalHash:intent.journalHash,
      rowIds:intent.mutations.map(m=>m.kind+"/"+m.id),
    };
    if(!same(receipt,expected)||
       !(await adapter.verifyDurableReceipt(target,intent,receipt))||
       rows.some((r,i)=>!same(r.value,intent.mutations[i].after)))
      throw Error("HELD lock has forged receipt or divergent AFTER values");
    status="RECEIPT_AND_ROWS_VERIFIED";
  }else{
    if(rows.some((r,i)=>!same(r.value,intent.mutations[i].before)))
      throw Error("HELD lock without TX receipt has partial/unknown write; quarantine");
    status="NO_RECEIPT_BEFORE_ROWS_VERIFIED";
  }
  return {status,target,scopeId,resourceId,txId,
    lockToken:expectedLockToken,lockEpoch:lock.value.epoch,
    journalHash:intent.journalHash,intent,
    originalVersionstamp:lock.versionstamp,
  };
}

/**
 * Release is deliberately difficult: operator quiescence attestation, fresh
 * Google reads, unchanged KV ownership, and durable CAS recovery audit.
 * A later normal outbox worker must still project any missing target.
 */
export async function releaseReviewedIndexedGoogleLock(input:{
  kv:AtomicKvStore;adapter:IndexedDeltaTargetAdapter;
  quiescenceVerifier:ExternalQuiescenceVerifier;
  target:DeltaTarget;scopeId:string;resourceId:string;
  expectedLockToken:string;
}):Promise<IndexedRecoveryAudit>{
  const {kv,quiescenceVerifier,target,scopeId,resourceId,expectedLockToken}=input;
  const first=await reviewHeldIndexedGoogleLock(input);
  const evidence=await quiescenceVerifier.assertStoppedAndExclusive({
    target,resourceId,scopeId,formerLockToken:expectedLockToken,
    formerEpoch:first.lockEpoch,txId:first.txId,
  });
  if(evidence?.workerTerminatedAndNoInflightWrites!==true||
     evidence.allOtherGoogleWritersExcluded!==true||
     evidence.resourceId!==resourceId||
     !/^proof\.[a-z0-9._-]{5,}$/i.test(evidence.incidentProofRef))
    throw Error("Independent operator-controlled request drain is not evidenced");
  const fresh=await reviewHeldIndexedGoogleLock(input);
  if(fresh.originalVersionstamp!==first.originalVersionstamp||
     fresh.status!==first.status||fresh.journalHash!==first.journalHash||
     fresh.lockEpoch!==first.lockEpoch)
    throw Error("Google or KV target moved during manual quiescence inspection");
  const key=lockKey(target,resourceId);
  const current=await kv.get<GoogleProjectionLock>(key);
  if(!current.value||current.versionstamp!==fresh.originalVersionstamp||
     current.value.state!=="HELD"||
     current.value.token!==expectedLockToken)
    throw Error("HELD KV writer changed during incident recovery");
  const audit:IndexedRecoveryAudit={
    schema:"EC06_INDEX_LOCK_RECOVERY_AUDIT_V1",
    scopeId,target,resourceId,txId:fresh.txId,
    previousToken:expectedLockToken,epoch:fresh.lockEpoch,
    observedState:fresh.status,journalHash:fresh.journalHash,
    quiescenceProofRef:evidence.incidentProofRef,financialWrites:0,
  };
  const released:GoogleProjectionLock={
    ...current.value,state:"RELEASED",
    lastVerifiedProjectionRef:"proof.ec06.recovery."+fresh.txId+"."+fresh.journalHash,
  };
  const ok=await kv.atomic()
    .check({key,versionstamp:current.versionstamp})
    .check({key:auditKey(target,resourceId,expectedLockToken),versionstamp:null})
    .set(key,released)
    .set(auditKey(target,resourceId,expectedLockToken),audit)
    .commit();
  if(!ok.ok)throw Error("Concurrent recovery attempt failed; re-inspect before any write");
  return audit;
}
