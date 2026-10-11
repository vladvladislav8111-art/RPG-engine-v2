import {indexedEc06Keys} from "../src/economic_indexed_wholesale_kv.ts";
import {makeIndexedQueueRegistration,indexedQueueShardForTx,
  listIndexedQueuePage} from "../src/economic_indexed_outbox_queue.ts";
import {runIndexedProjectionQueuePageStaging} from
  "../src/economic_indexed_queue_drain_staging.ts";
import {makeIndexedDeltaIntent,type IndexedDeltaTargetAdapter,
  type IndexedDeltaIntent,type IndexedTargetReceipt,
  type DeltaTarget} from "../src/economic_indexed_delta_projection.ts";
import type {IndexedWageJournal} from "../src/economic_indexed_wage_kv.ts";
import type {EconomicAccount} from "../src/economic_atomic_plan.ts";

const scope="scope.fixture.queue_drain";
const employer="account.fixture.queue_employer";
const escrow="escrow.fixture.queue_wage";
const before:EconomicAccount={accountId:employer,availableCopper:70,heldCopper:0};
const after:EconomicAccount={accountId:employer,availableCopper:40,heldCopper:30};
const reserve={schema:"EC06_INDEX_ESCROW_V1",escrowId:escrow,scopeId:scope,
  demandId:"demand.fixture.queue_wage",employerAccountId:employer,
  workerAccountId:"account.fixture.queue_worker",amountCopper:30,
  reservedCopper:30,state:"RESERVED",
  originalContractRef:"proof.fixture.queue_contract"} as const;
const k=(kind:string,id:string)=>kind+"/"+id;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function journal(txId:string):IndexedWageJournal{
  return {schema:"EC06_INDEX_WAGE_JOURNAL_V1",scopeId:scope,txId,
    kind:"RESERVE",demandId:reserve.demandId,
    sourceEvidenceRef:"proof.fixture.queue_verified",
    copper:30,accounts:[{id:employer,before,after}],
    escrow:{id:escrow,before:null,after:reserve}};
}
function receipt(intent:IndexedDeltaIntent,target:DeltaTarget):IndexedTargetReceipt{
  return {schema:"EC06_INDEXED_TARGET_RECEIPT_V1",target,
    txId:intent.txId,scopeId:scope,journalHash:intent.journalHash,
    rowIds:intent.mutations.map(m=>k(m.kind,m.id))};
}
async function seed(txId="tx.fixture.queue_drain_001"){
  const db=await Deno.openKv(":memory:");
  try{
    const j=journal(txId),q=makeIndexedQueueRegistration(
      scope,txId,indexedEc06Keys.journal(txId));
    const committed=await db.atomic()
      .check({key:q.key as Deno.KvKey,versionstamp:null})
      .set(q.key as Deno.KvKey,q.value)
      .set(indexedEc06Keys.tx(txId) as Deno.KvKey,{
        schema:"EC06_INDEX_WAGE_TX_V1",txId,scopeId:scope,
      })
      .set(indexedEc06Keys.journal(txId) as Deno.KvKey,j)
      .set(indexedEc06Keys.outbox(txId) as Deno.KvKey,{
        schema:"EC06_INDEX_OUTBOX_V1",txId,scopeId:scope,
        state:"PENDING_INDEXED_PROJECTION",
        journalKey:indexedEc06Keys.journal(txId),
      }).commit();
    if(!committed.ok)throw Error("Atomic primary staging fixture commit failed");
    const api=new FakeGoogle(j);
    return {db,api,txId,
      shard:indexedQueueShardForTx(txId)};
  }catch(e){db.close();throw e}
}
class FakeGoogle implements IndexedDeltaTargetAdapter{
  readonly rows=new Map<DeltaTarget,Map<string,unknown>>();
  readonly receipts=new Map<DeltaTarget,Map<string,IndexedTargetReceipt>>();
  readonly writes=new Map<DeltaTarget,number>();
  unavailable:DeltaTarget|null=null;
  constructor(j:IndexedWageJournal){
    for(const target of ["TEMP_RUNTIME","LIVE_TRANSACTION_ARCHIVE"] as const){
      this.rows.set(target,new Map([
        [k("account",employer),j.accounts[0].before],
        [k("escrow",escrow),null],
      ]));
      this.receipts.set(target,new Map());
      this.writes.set(target,0);
    }
  }
  async readReceipt(target:DeltaTarget,_scope:string,txId:string){
    return this.receipts.get(target)!.get(txId)??null;
  }
  async readRows(target:DeltaTarget,_scope:string,ids:readonly {
    kind:"account"|"lot"|"escrow";id:string;
  }[]){
    return ids.map(({kind,id})=>({kind,id,
      value:this.rows.get(target)!.get(k(kind,id))??null}));
  }
  async applyRowsAndReceiptAtomically(target:DeltaTarget,intent:IndexedDeltaIntent,
    r:IndexedTargetReceipt){
    if(this.unavailable===target)throw Error("Injected external Google failure");
    if(!same(r,receipt(intent,target)))
      throw Error("Attempted projection with wrong source journal receipt");
    const rows=this.rows.get(target)!;
    for(const m of intent.mutations)
      if(!rows.has(k(m.kind,m.id))||
         !same(rows.get(k(m.kind,m.id)),m.before))
        throw Error("Source row BEFORE diverged");
    if(this.receipts.get(target)!.has(intent.txId))
      throw Error("Duplicate Google receipt");
    for(const m of intent.mutations)rows.set(k(m.kind,m.id),m.after);
    this.receipts.get(target)!.set(intent.txId,r);
    this.writes.set(target,(this.writes.get(target)??0)+1);
  }
  async verifyDurableReceipt(target:DeltaTarget,intent:IndexedDeltaIntent,
    r:IndexedTargetReceipt){
    return same(r,receipt(intent,target))&&same(
      this.receipts.get(target)!.get(intent.txId),r);
  }
}
async function refuses(fn:()=>Promise<unknown>){
  let rejected=false;try{await fn()}catch{rejected=true}
  if(!rejected)throw Error("Unsafe queue drain was accepted");
}
Deno.test("bounded drain reconciles both Google targets once, verifies independent receipts, CAS-prunes only queue",async()=>{
  const {db,api,txId,shard}=await seed();
  try {
    const r=await runIndexedProjectionQueuePageStaging({
      db,adapter:api,scopeId:scope,shard,limit:1,
    });
    if(r.status!=="DRAINED"||r.completed.length!==1||
       r.completed[0].txId!==txId||
       r.completed[0].projection!=="PROJECTED_INDEXED"||
       api.writes.get("TEMP_RUNTIME")!==1||
       api.writes.get("LIVE_TRANSACTION_ARCHIVE")!==1)
      throw Error("Queue drain lost a target, duplicated write or refused verified ACK");
    const again=await runIndexedProjectionQueuePageStaging({
      db,adapter:api,scopeId:scope,shard,limit:1,
    });
    if(again.completed.length!==0||again.examined!==0||
       (await db.get(indexedEc06Keys.journal(txId) as Deno.KvKey)).value===null||
       (await db.get(indexedEc06Keys.tx(txId) as Deno.KvKey)).value===null||
       (await db.get(indexedEc06Keys.outbox(txId) as Deno.KvKey)).value===null)
      throw Error("Queue drain replay/cleanup corrupted immutable source or duplicated TX");
  } finally {db.close()}
});
Deno.test("Docs unavailable after Sheet success HALTS without pruning or retry",async()=>{
  const {db,api,txId,shard}=await seed();
  try {
    api.unavailable="LIVE_TRANSACTION_ARCHIVE";
    const r=await runIndexedProjectionQueuePageStaging({
      db,adapter:api,scopeId:scope,shard,limit:1,
    });
    const page=await listIndexedQueuePage({db,scopeId:scope,shard,limit:1});
    const outbox=(await db.get<{state:string}>(
      indexedEc06Keys.outbox(txId) as Deno.KvKey)).value;
    if(r.status!=="HALTED"||r.blockedTxId!==txId||r.nextCursor!==null||
       r.completed.length!==0||api.writes.get("TEMP_RUNTIME")!==1||
       api.writes.get("LIVE_TRANSACTION_ARCHIVE")!==0||
       page.entries.length!==1||outbox?.state!=="PENDING_INDEXED_PROJECTION")
      throw Error("Ambiguous external failure was silently retried or queue cleared");
  } finally {db.close()}
});
Deno.test("forged primary ACK never allows queue GC without two actual Google receipts",async()=>{
  const {db,api,txId,shard}=await seed();
  try {
    const hash=(await makeIndexedDeltaIntent(journal(txId))).journalHash;
    const key=indexedEc06Keys.outbox(txId) as Deno.KvKey;
    const old=await db.get<Record<string,unknown>>(key);
    const ack=await db.atomic().check(old).set(key,{
      ...old.value,state:"PROJECTED_INDEXED",
      proofRef:"proof.ec06.indexed."+txId+"."+hash,
    }).commit();
    if(!ack.ok)throw Error("Cannot seed forged ACK");
    const r=await runIndexedProjectionQueuePageStaging({
      db,adapter:api,scopeId:scope,shard,limit:1,
    });
    if(r.status!=="HALTED"||r.blockedTxId!==txId||r.nextCursor!==null||
       (await listIndexedQueuePage({db,scopeId:scope,shard,limit:1}))
         .entries.length!==1||
       api.writes.get("TEMP_RUNTIME")!==0)
      throw Error("Forged primary projection ACK evaded independent Google readback");
  } finally{db.close()}
});
Deno.test("drain rejects oversized pages before any Google call",async()=>{
  const {db,api,shard}=await seed();
  try {
    await refuses(()=>runIndexedProjectionQueuePageStaging({
      db,adapter:api,scopeId:scope,shard,limit:9,
    }));
    if(api.writes.get("TEMP_RUNTIME")!==0)throw Error("Oversized drain wrote Google");
  }finally{db.close()}
});
