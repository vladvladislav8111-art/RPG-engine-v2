/**
 * EC-06 one-page indexed projection drain — STAGING ONLY, NO SCHEDULER.
 *
 * A caller explicitly chooses one known scope + one of 64 deterministic
 * shards; at most eight immutable primary-KV queue pointers are inspected.
 * Every TX is resolved by the existing fenced primary-journal reconciler and
 * BOTH actual Google target receipts must be re-read before its discovery
 * pointer can be CAS-pruned. The source TX, journal, outbox, and accounting
 * rows are NEVER deleted here.
 *
 * One external/primary ambiguity HALTS the page. It does not requeue,
 * force-release a HELD Google fence, recover external writes, or schedule a
 * retry. Any continuation needs independent incident review. This file is
 * NOT imported by main.ts and does not deploy or open KV/Google itself.
 */
import {wrapDenoAtomicEconomyKv} from "./economic_deno_kv_adapter.ts";
import {
  reconcileIndexedDeltaStaging,type IndexedDeltaIntent,
  type IndexedDeltaTargetAdapter,type IndexedTargetReceipt,
} from "./economic_indexed_delta_projection.ts";
import {
  listIndexedQueuePage,pruneVerifiedIndexedQueuePointer,
} from "./economic_indexed_outbox_queue.ts";

type CompletedQueueTx={
  txId:string;
  projection:"PROJECTED_INDEXED"|"ALREADY_PROJECTED_INDEXED";
  queuePointer:"PRUNED";
};
export type IndexedDrainPageResult={
  status:"DRAINED"|"HALTED";
  scopeId:string;shard:number;examined:number;
  completed:readonly CompletedQueueTx[];
  nextCursor:string|null;
  /** HALTED means the same pointer remains pending until a human review. */
  blockedTxId?:string;
  /** Do not publish raw Google, credential or NPC data in an error payload. */
  incident?:"SOURCE_OR_GOOGLE_STATE_UNCERTAIN";
};

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function targetReceipt(
  intent:IndexedDeltaIntent,
  target:"TEMP_RUNTIME"|"LIVE_TRANSACTION_ARCHIVE",
):IndexedTargetReceipt {
  return {
    schema:"EC06_INDEXED_TARGET_RECEIPT_V1",target,
    txId:intent.txId,scopeId:intent.scopeId,journalHash:intent.journalHash,
    rowIds:intent.mutations.map(m=>m.kind+"/"+m.id),
  };
}
/** Do not trust KV ACK alone: only an actual target's own receipt suffices. */
async function verifyBothGoogleReceipts(input:{
  adapter:IndexedDeltaTargetAdapter;
  intent:IndexedDeltaIntent;
}):Promise<void>{
  for(const target of ["TEMP_RUNTIME","LIVE_TRANSACTION_ARCHIVE"] as const){
    const expected=targetReceipt(input.intent,target);
    const actual=await input.adapter.readReceipt(
      target,input.intent.scopeId,input.intent.txId);
    if(!same(expected,actual)||
       !(await input.adapter.verifyDurableReceipt(
         target,input.intent,expected)))
      throw Error("EC-06 Google target receipt is absent, forged or unverifiable");
  }
}
/**
 * The handler creates its KV adapter from the supplied primary DB, so the
 * discovery queue, finance journal, reconciliation and pruning cannot point
 * at different KV stores.
 * Never run this function against CURRENT/production Google assets.
 *
 * Cursor is only a discovery token for the caller; there is deliberately no
 * implicit loop over remaining pages or automatic retry of blocked writes.
 */
export async function runIndexedProjectionQueuePageStaging(input:{
  db:Deno.Kv;adapter:IndexedDeltaTargetAdapter;
  scopeId:string;shard:number;limit:number;cursor?:string;
}):Promise<IndexedDrainPageResult>{
  const {db,adapter,scopeId,shard,limit,cursor}=input;
  const kv=wrapDenoAtomicEconomyKv(db);
  if(!Number.isInteger(limit)||limit<1||limit>8)
    throw Error("A projection worker may inspect at most eight TXs in one call");
  const page=await listIndexedQueuePage({db,scopeId,shard,limit,
    ...(cursor?{cursor}:{})});
  const completed:CompletedQueueTx[]=[];
  for(const entry of page.entries){
    try {
      const result=await reconcileIndexedDeltaStaging({
        kv,adapter,scopeId,txId:entry.txId,
      });
      await verifyBothGoogleReceipts({adapter,intent:result.intent});
      const pruned=await pruneVerifiedIndexedQueuePointer({
        db,scopeId,txId:entry.txId,
      });
      completed.push({txId:entry.txId,
        projection:result.state,queuePointer:pruned});
    }catch{
      // Fail closed on ANY ambiguous write, fencing error, forged proof,
      // source drift or conflicting cleanup. No attempt at another TX.
      return {status:"HALTED",scopeId,shard,examined:page.entries.length,
        completed,nextCursor:null,
        blockedTxId:entry.txId,incident:"SOURCE_OR_GOOGLE_STATE_UNCERTAIN"};
    }
  }
  return {status:"DRAINED",scopeId,shard,examined:page.entries.length,
    completed,nextCursor:page.nextCursor};
}
