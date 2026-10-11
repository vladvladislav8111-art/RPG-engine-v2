/**
 * EC-06 — indexed per-row Google projection protocol (STAGING ONLY).
 *
 * No Google calls or live current Sheets edits. The target transport MUST
 * guarantee an indivisible, fenced write of touched rows + exact receipt.
 * Raw Sheets values.update alone CANNOT implement this CAS contract.
 * Every journal is from one committed primary Deno KV transaction.
 */
import type {EconomicAccount} from "./economic_atomic_plan.ts";
import type {AtomicKvStore} from "./economic_kv_atomic.ts";
import {indexedEc06Keys,type IndexedSaleJournal} from "./economic_indexed_wholesale_kv.ts";
import type {IndexedWageJournal} from "./economic_indexed_wage_kv.ts";
export type IndexedJournal=IndexedSaleJournal|IndexedWageJournal;
export type DeltaKind="account"|"lot"|"escrow";
export type IndexedDeltaRow={
  kind:DeltaKind;id:string;before:unknown|null;after:unknown|null;
};
export type IndexedDeltaIntent={
  schema:"EC06_INDEXED_DELTA_V1";
  txId:string;scopeId:string;sourceSchema:IndexedJournal["schema"];
  mutations:readonly IndexedDeltaRow[];
  journalHash:string;
};
export type DeltaTarget="TEMP_RUNTIME"|"LIVE_TRANSACTION_ARCHIVE";
export type IndexedTargetReceipt={
  schema:"EC06_INDEXED_TARGET_RECEIPT_V1";
  target:DeltaTarget;txId:string;scopeId:string;journalHash:string;
  rowIds:readonly string[];
};
export interface IndexedDeltaTargetAdapter{
  /** Optional fail-fast remote capacity check BEFORE touching any target.
   * It is NOT a CAS or lock; both targets still revalidate under their fence. */
  preflightProjection?(intent:IndexedDeltaIntent):Promise<void>;
  /** Durable receipt read from THIS actual Google target, not from caller. */
  readReceipt(target:DeltaTarget,scopeId:string,txId:string):
    Promise<IndexedTargetReceipt|null>;
  /** Real committed rows with their latest materialized exact values. */
  readRows(target:DeltaTarget,scopeId:string,
    rows:readonly {kind:DeltaKind;id:string}[]):
    Promise<readonly {kind:DeltaKind;id:string;value:unknown|null}[]>;
  /**
   * Server-side exclusive writer plus indivisible row+receipt apply.
   * The writer MUST re-verify before values under the actual fence.
   * Google Sheets has NO native per-row CAS; without an external enforced
   * single writer this method MUST refuse.
   */
  applyRowsAndReceiptAtomically(target:DeltaTarget,intent:IndexedDeltaIntent,
    receipt:IndexedTargetReceipt):Promise<void>;
  /** Independently authenticated readback of exact receipt and changes. */
  verifyDurableReceipt(target:DeltaTarget,intent:IndexedDeltaIntent,
    receipt:IndexedTargetReceipt):Promise<boolean>;
}
export type IndexedDeltaOutbox={
  schema:"EC06_INDEX_OUTBOX_V1";txId:string;scopeId:string;
  state:"PENDING_INDEXED_PROJECTION"|"PROJECTED_INDEXED";
  journalKey:readonly (string|number|bigint|boolean|Uint8Array)[];
  proofRef?:string;
};
function equal(a:unknown,b:unknown):boolean {
  return JSON.stringify(a)===JSON.stringify(b);
}
function bytesToHex(buffer:ArrayBuffer):string {
  return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function sha(s:string):Promise<string>{
  return bytesToHex(await crypto.subtle.digest(
    "SHA-256",new TextEncoder().encode(s)));
}
function validJournal(j:IndexedJournal):boolean {
  return (j.schema==="EC06_INDEX_SALE_JOURNAL_V1"||
    j.schema==="EC06_INDEX_WAGE_JOURNAL_V1")&&
    typeof j.txId==="string"&&j.txId.length>0&&
    typeof j.scopeId==="string"&&j.scopeId.length>0;
}
export async function makeIndexedDeltaIntent(j:IndexedJournal):
  Promise<IndexedDeltaIntent>{
  if(!validJournal(j))throw Error("Only committed EC06 indexed journal may produce a projection");
  const mutations:IndexedDeltaRow[]=[];
  for(const item of j.schema==="EC06_INDEX_SALE_JOURNAL_V1"?
    j.accountDeltas:j.accounts){
    mutations.push({kind:"account",id:item.id,before:item.before,after:item.after});
  }
  if(j.schema==="EC06_INDEX_SALE_JOURNAL_V1") {
    for(const item of j.lotDeltas)
      mutations.push({kind:"lot",id:item.id,before:item.before,after:item.after});
  }else {
    mutations.push({kind:"escrow",id:j.escrow.id,before:j.escrow.before,
      after:j.escrow.after});
  }
  const unique=new Set<string>();
  for(const x of mutations){
    if(!x.id||unique.has(x.kind+"/"+x.id)||equal(x.before,x.after))
      throw Error("Indexed journal has duplicate or no-op account/lot/escrow row");
    unique.add(x.kind+"/"+x.id);
  }
  if(!mutations.length||mutations.length>16)
    throw Error("Indexed delta must be bounded to one real economic operation");
  return {
    schema:"EC06_INDEXED_DELTA_V1",scopeId:j.scopeId,txId:j.txId,
    sourceSchema:j.schema,mutations,
    journalHash:await sha(JSON.stringify(j)),
  };
}
function expectedReceipt(target:DeltaTarget,intent:IndexedDeltaIntent):
  IndexedTargetReceipt{
  return {
    schema:"EC06_INDEXED_TARGET_RECEIPT_V1",
    target,txId:intent.txId,scopeId:intent.scopeId,
    journalHash:intent.journalHash,
    rowIds:intent.mutations.map(m=>m.kind+"/"+m.id),
  };
}
async function assertReceipt(adapter:IndexedDeltaTargetAdapter,target:DeltaTarget,
  intent:IndexedDeltaIntent,receipt:IndexedTargetReceipt){
  if(!equal(receipt,expectedReceipt(target,intent))||
    !(await adapter.verifyDurableReceipt(target,intent,receipt)))
    throw Error("Indexed Google projection receipt is forged, stale or unverified");
}
/**
 * Recover one immutable primary KV transaction. Each target can be retried
 * independently after a network outage; duplicate payments NEVER occur.
 * Incompatible order for the SAME account/item row is refused if no exact
 * earlier receipt exists. Unrelated rows are free to project independently.
 */
export async function reconcileIndexedDeltaStaging(input:{
  kv:AtomicKvStore;adapter:IndexedDeltaTargetAdapter;
  scopeId:string;txId:string;
}):Promise<{state:"PROJECTED_INDEXED"|"ALREADY_PROJECTED_INDEXED";
  intent:IndexedDeltaIntent}>{
  const {kv,adapter,scopeId,txId}=input;
  const [tx,outbox,journal]=await Promise.all([
    kv.get<{schema:string;txId:string;scopeId:string}>(indexedEc06Keys.tx(txId)),
    kv.get<IndexedDeltaOutbox>(indexedEc06Keys.outbox(txId)),
    kv.get<IndexedJournal>(indexedEc06Keys.journal(txId)),
  ]);
  if(!tx.value||![
     "EC06_INDEX_SALE_RECEIPT_V1","EC06_INDEX_WAGE_TX_V1"
    ].includes(tx.value.schema)||tx.value.txId!==txId||
    tx.value.scopeId!==scopeId||!outbox.versionstamp||
    !outbox.value||outbox.value.schema!=="EC06_INDEX_OUTBOX_V1"||
    outbox.value.txId!==txId||outbox.value.scopeId!==scopeId||
    !journal.value||journal.value.txId!==txId||
    journal.value.scopeId!==scopeId)
    throw Error("No consistent committed indexed KV transaction/outbox/journal");
  const intent=await makeIndexedDeltaIntent(journal.value);
  if(outbox.value.state==="PROJECTED_INDEXED"){
    const expectedProof="proof.ec06.indexed."+txId+"."+intent.journalHash;
    if(outbox.value.proofRef!==expectedProof)
      throw Error("Completed indexed outbox proof differs from original journal");
    return {state:"ALREADY_PROJECTED_INDEXED",intent};
  }
  if(outbox.value.state!=="PENDING_INDEXED_PROJECTION")
    throw Error("Unexpected indexed outbox state");
  // A full Doc window must be checkpointed BEFORE any new Sheet writes.
  // This read-only preflight never replaces native per-target fence checks.
  await adapter.preflightProjection?.(intent);
  for(const target of ["TEMP_RUNTIME","LIVE_TRANSACTION_ARCHIVE"] as const){
    const receipt=expectedReceipt(target,intent);
    const old=await adapter.readReceipt(target,scopeId,txId);
    if(old){
      await assertReceipt(adapter,target,intent,old);
      continue;
    }
    const rows=await adapter.readRows(target,scopeId,
      intent.mutations.map(m=>({kind:m.kind,id:m.id})));
    if(rows.length!==intent.mutations.length||
      rows.some((r,i)=>r.kind!==intent.mutations[i].kind||
      r.id!==intent.mutations[i].id||!equal(r.value,intent.mutations[i].before)))
      throw Error("Indexed Google target has out-of-order or divergent per-row value");
    // The actual transport MUST re-verify under its exclusive writer fence.
    await adapter.applyRowsAndReceiptAtomically(target,intent,receipt);
    const reread=await adapter.readReceipt(target,scopeId,txId);
    if(!reread)throw Error("Google row mutation lacks durable matching receipt");
    await assertReceipt(adapter,target,intent,reread);
  }
  const latest=await kv.get<IndexedDeltaOutbox>(indexedEc06Keys.outbox(txId));
  if(latest.value?.state==="PROJECTED_INDEXED"){
    if(latest.value.proofRef!=="proof.ec06.indexed."+txId+"."+intent.journalHash)
      throw Error("Concurrent projection completed under different journal");
    return {state:"ALREADY_PROJECTED_INDEXED",intent};
  }
  if(!latest.versionstamp||latest.value?.state!=="PENDING_INDEXED_PROJECTION")
    throw Error("Indexed outbox changed during projection");
  const done=await kv.atomic()
    .check({key:latest.key,versionstamp:latest.versionstamp})
    .set(latest.key,{
      ...latest.value,state:"PROJECTED_INDEXED",
      proofRef:"proof.ec06.indexed."+txId+"."+intent.journalHash,
    } satisfies IndexedDeltaOutbox).commit();
  if(!done.ok)throw Error("Projection outbox conflict; read source receipt before retry");
  return {state:"PROJECTED_INDEXED",intent};
}
