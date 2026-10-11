/**
 * EC-06 bounded indexed projection discovery — STAGING ONLY.
 *
 * A small immutable, sharded queue pointer is written IN THE SAME primary KV
 * atomic transaction as the indexed sale/wage receipt, journal and outbox.
 * No city-wide mutable sequence, timer, financial snapshot or Google write.
 * Workers independently verify source state and use the existing fenced
 * projection reconciler; merely reading this index NEVER authorizes retry.
 */
import type {AtomicKvStore,KvKey} from "./economic_kv_atomic.ts";
import {indexedEc06Keys} from "./economic_indexed_wholesale_kv.ts";
import {makeIndexedDeltaIntent,type IndexedJournal,type IndexedDeltaOutbox} from
  "./economic_indexed_delta_projection.ts";

const valid=(s:unknown):s is string=>typeof s==="string"&&s.length<=180&&
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(s);
const SHARDS=64;
const root=["rpg-v2","ec06","indexed","projection-queue"] as const;
export type IndexedQueuePointer={
  schema:"EC06_INDEX_QUEUE_V1";scopeId:string;txId:string;
  shard:number;journalKey:KvKey;
};
/** Deterministic ASCII ID hashing. No globally contended counter/key. */
export function indexedQueueShardForTx(txId:string):number {
  if(!valid(txId))throw Error("Invalid indexed queue transaction ID");
  let h=2166136261;
  for(let i=0;i<txId.length;i++){
    h=Math.imul(h^txId.charCodeAt(i),16777619)>>>0;
  }
  return h%SHARDS;
}
const queueKey=(scopeId:string,shard:number,txId:string):KvKey=>
  [...root,scopeId,shard,txId];
export function makeIndexedQueueRegistration(scopeId:string,txId:string,
  journalKey:KvKey):{key:KvKey;value:IndexedQueuePointer}{
  if(!valid(scopeId)||!valid(txId)||JSON.stringify(journalKey)!==
     JSON.stringify(indexedEc06Keys.journal(txId)))
    throw Error("Indexed queue must reference exact committed journal key");
  const shard=indexedQueueShardForTx(txId);
  return {key:queueKey(scopeId,shard,txId),value:{
    schema:"EC06_INDEX_QUEUE_V1",scopeId,txId,shard,journalKey,
  }};
}
/** The Deno.Kv iterator returns a cursor; no all-market list is permitted. */
export async function listIndexedQueuePage(input:{
  db:Deno.Kv;scopeId:string;shard:number;limit:number;cursor?:string;
}):Promise<{entries:readonly IndexedQueuePointer[];nextCursor:string|null}>{
  const {db,scopeId,shard,limit,cursor}=input;
  if(!valid(scopeId)||!Number.isInteger(shard)||shard<0||
     shard>=SHARDS||!Number.isInteger(limit)||limit<1||limit>32||
     (cursor!==undefined&&(typeof cursor!=="string"||!cursor)))
    throw Error("Bounded indexed queue page requires valid scope/shard/limit");
  const iterator=db.list<IndexedQueuePointer>(
    {prefix:[...root,scopeId,shard]},
    {...(cursor?{cursor}:{}),limit},
  );
  const entries:IndexedQueuePointer[]=[];
  for await(const row of iterator){
    const q=row.value;
    if(!q||q.schema!=="EC06_INDEX_QUEUE_V1"||
       q.scopeId!==scopeId||q.shard!==shard||
       !valid(q.txId)||indexedQueueShardForTx(q.txId)!==shard||
       JSON.stringify(row.key)!==JSON.stringify(queueKey(scopeId,shard,q.txId))||
       JSON.stringify(q.journalKey)!==
         JSON.stringify(indexedEc06Keys.journal(q.txId)))
      throw Error("Indexed projection queue contains forged/inconsistent pointer");
    // Assert the queue is not fabricated independently of a committed TX.
    const [tx,journal,outbox]=await Promise.all([
      db.get<{txId:string;scopeId:string;schema:string}>(
        indexedEc06Keys.tx(q.txId) as Deno.KvKey),
      db.get<IndexedJournal>(indexedEc06Keys.journal(q.txId) as Deno.KvKey),
      db.get<IndexedDeltaOutbox>(indexedEc06Keys.outbox(q.txId) as Deno.KvKey),
    ]);
    if(!tx.value||tx.value.txId!==q.txId||tx.value.scopeId!==scopeId||
       !["EC06_INDEX_SALE_RECEIPT_V1","EC06_INDEX_WAGE_TX_V1"].includes(tx.value.schema)||
       !journal.value||journal.value.txId!==q.txId||
       journal.value.scopeId!==scopeId||
       !outbox.value||outbox.value.txId!==q.txId||
       outbox.value.scopeId!==scopeId||
       !["PENDING_INDEXED_PROJECTION","PROJECTED_INDEXED"].includes(outbox.value.state))
      throw Error("Queue pointer is not backed by one committed indexed journal/outbox");
    entries.push(q);
  }
  return {entries,nextCursor:iterator.cursor??null};
}
/**
 * Only garbage-collect a discovery pointer AFTER reconciler has confirmed
 * both Google target receipts and CAS-ACKed this exact primary outbox.
 * The immutable journal, TX receipt, delivery/demand receipt and audit remain.
 * No in-flight Google request can be made safe by deleting this pointer.
 */
export async function pruneVerifiedIndexedQueuePointer(input:{
  kv:AtomicKvStore;scopeId:string;txId:string;
}):Promise<"PRUNED"> {
  const {kv,scopeId,txId}=input;
  const registration=makeIndexedQueueRegistration(
    scopeId,txId,indexedEc06Keys.journal(txId));
  const [queue,tx,outbox,journal]=await Promise.all([
    kv.get<IndexedQueuePointer>(registration.key),
    kv.get<{txId:string;scopeId:string;schema:string}>(indexedEc06Keys.tx(txId)),
    kv.get<IndexedDeltaOutbox>(indexedEc06Keys.outbox(txId)),
    kv.get<IndexedJournal>(indexedEc06Keys.journal(txId)),
  ]);
  if(!queue.versionstamp||!queue.value||
     JSON.stringify(queue.value)!==JSON.stringify(registration.value)||
     !tx.versionstamp||!tx.value||tx.value.txId!==txId||
     tx.value.scopeId!==scopeId||
     !["EC06_INDEX_SALE_RECEIPT_V1","EC06_INDEX_WAGE_TX_V1"].includes(tx.value.schema)||
     !journal.versionstamp||!journal.value||
     journal.value.txId!==txId||journal.value.scopeId!==scopeId||
     !outbox.versionstamp||!outbox.value||
     outbox.value.schema!=="EC06_INDEX_OUTBOX_V1"||
     outbox.value.txId!==txId||outbox.value.scopeId!==scopeId||
     outbox.value.state!=="PROJECTED_INDEXED")
    throw Error("Cannot prune pending, unverified, or inconsistent primary outbox");
  const intent=await makeIndexedDeltaIntent(journal.value);
  if(outbox.value.proofRef!==
     "proof.ec06.indexed."+txId+"."+intent.journalHash)
    throw Error("Indexed outbox ACK does not match immutable journal hash");
  // No financial or log keys are deleted; CAS rejects parallel reclaim.
  const ok=await kv.atomic()
    .check({key:queue.key,versionstamp:queue.versionstamp})
    .check({key:tx.key,versionstamp:tx.versionstamp})
    .check({key:journal.key,versionstamp:journal.versionstamp})
    .check({key:outbox.key,versionstamp:outbox.versionstamp})
    .delete(queue.key)
    .commit();
  if(!ok.ok)throw Error("Concurrent indexed queue cleanup; re-inspect");
  return "PRUNED";
}
