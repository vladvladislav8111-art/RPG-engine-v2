/**
 * EC-06 staging-only ordered projection coordinator.
 *
 * The caller must supply an INTERNAL, authorized Google adapter that performs
 * idempotent write/read-back, produces real durable receipts and never exposes
 * this interface as client-supplied proof. No production projector is wired.
 *
 * This coordinator cannot make Google Sheets/Docs mutually atomic. It
 * remembers incomplete projections and retries them without replaying
 * money/item settlement in primary KV.
 */
import {
  ackEconomicProjection, ec06Keys, type AtomicKvStore,
  type EconomicProjectionOutbox, type EconomicTxReceipt,
} from "./economic_kv_atomic.ts";
import {
  assertProjectionOrder, verifyProjectionReceipts,
  type ImmutableEconomicTxJournal, type ProjectionCheckpoint,
  type ProjectionVerification,
} from "./economic_projection_journal.ts";

type Target = "TEMP_RUNTIME" | "LIVE_TRANSACTION_ARCHIVE";
const TARGETS:readonly Target[]=["TEMP_RUNTIME","LIVE_TRANSACTION_ARCHIVE"];
export interface VerifiedEconomicProjectionAdapter {
  /** Read the persistent revision/tx marker from the actual external target. */
  readCheckpoint(target:Target,scopeId:string):Promise<ProjectionCheckpoint>;
  /** Only apply the *immutable* TX delta, conditional on beforeRevision. */
  applyJournal(target:Target,journal:ImmutableEconomicTxJournal):Promise<void>;
  /** After application, read a real durable exact-TX receipt from the target. */
  readReceipt(target:Target,scopeId:string,txId:string):Promise<ProjectionVerification|null>;
  /** Must be determined by actual readback evidence, not caller text. */
  isIndependentVerifiedReceipt(receipt:ProjectionVerification):Promise<boolean>;
}

function checkReceipt(journal:ImmutableEconomicTxJournal,r:ProjectionVerification,target:Target){
  if(r.target!==target||r.txId!==journal.txId||r.scopeId!==journal.scopeId||
     r.afterRevision!==journal.afterRevision){
    throw Error("Projection receipt does not match exact immutable transaction");
  }
}

/**
 * Run only on a due PENDING outbox. Idempotent per target and refuses
 * untrusted receipts, out-of-order replay, and data divergence.
 * A crash after one target update leaves the primary outbox PENDING;
 * next run reads its durable receipt instead of replaying the sale.
 */
export async function reconcileEconomicProjectionStaging(input:{
  kv:AtomicKvStore;
  adapter:VerifiedEconomicProjectionAdapter;
  scopeId:string;
  txId:string;
}):Promise<{
  readonly state:"PROJECTED"|"ALREADY_PROJECTED";
  readonly outbox:EconomicProjectionOutbox;
}>{
  const {kv,adapter,scopeId,txId}=input;
  const [txEntry,outboxEntry,journalEntry]=await Promise.all([
    kv.get<EconomicTxReceipt>(ec06Keys.tx(scopeId,txId)),
    kv.get<EconomicProjectionOutbox>(ec06Keys.outbox(scopeId,txId)),
    kv.get<ImmutableEconomicTxJournal>(ec06Keys.journal(scopeId,txId)),
  ]);
  const tx=txEntry.value,outbox=outboxEntry.value,journal=journalEntry.value;
  if(!tx||!outbox||!journal||journal.schema!=="EC06_JOURNAL_V1"||
    tx.scopeId!==scopeId||tx.txId!==txId||
    outbox.scopeId!==scopeId||outbox.txId!==txId||
    outbox.journalTxId!==txId||
    tx.beforeRevision!==journal.beforeRevision||
    tx.afterRevision!==journal.afterRevision||
    outbox.primaryRevision!==journal.afterRevision){
    throw Error("Cannot project: incomplete or inconsistent immutable KV TX/outbox/journal");
  }
  if(outbox.state==="PROJECTED") return {state:"ALREADY_PROJECTED",outbox};
  if(outbox.state!=="PENDING_PROJECTION")throw Error("Unknown projection state");

  const receipts:ProjectionVerification[]=[];
  for(const target of TARGETS){
    let r=await adapter.readReceipt(target,scopeId,txId);
    if(r===null){
      const checkpoint=await adapter.readCheckpoint(target,scopeId);
      assertProjectionOrder(journal,checkpoint);
      await adapter.applyJournal(target,journal);
      r=await adapter.readReceipt(target,scopeId,txId);
    }
    if(!r)throw Error("Projection did not leave a durable verifiable receipt for "+target);
    checkReceipt(journal,r,target);
    if(!(await adapter.isIndependentVerifiedReceipt(r))){
      throw Error("Projection lacks independent source-verifiable receipt: "+target);
    }
    receipts.push(r);
  }
  const trustedEvidenceRefs=new Set(receipts.map(x=>x.journalEvidenceRef));
  const verified=verifyProjectionReceipts({journal,receipts,trustedEvidenceRefs});
  if(!verified.validatedBothTargets)throw Error("Two-target projection verification failed");
  const acknowledged=await ackEconomicProjection(kv,{
    scopeId,txId,actualVerifiedProofRef:verified.proofRef,
  });
  return {state:"PROJECTED",outbox:acknowledged};
}
