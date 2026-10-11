import {wrapDenoAtomicEconomyKv} from "../src/economic_deno_kv_adapter.ts";
import {indexedEc06Keys} from "../src/economic_indexed_wholesale_kv.ts";
import {makeIndexedDeltaIntent,type IndexedJournal} from
  "../src/economic_indexed_delta_projection.ts";
import {indexedQueueShardForTx,makeIndexedQueueRegistration,
  listIndexedQueuePage,pruneVerifiedIndexedQueuePointer} from
  "../src/economic_indexed_outbox_queue.ts";

const scopeId="scope.fixture.queue_smalltown";
const txName=(i:number)=>"tx.fixture.independent_"+String(i).padStart(5,"0");
function journal(txId:string):IndexedJournal{
  return {schema:"EC06_INDEX_SALE_JOURNAL_V1",txId,scopeId,
    sourceOrderId:txId,deliveredReceiptRef:"proof.fixture.delivery_001",
    accountDeltas:[{id:"account.fixture.test",before:{accountId:"account.fixture.test",availableCopper:10,heldCopper:0},
      after:{accountId:"account.fixture.test",availableCopper:9,heldCopper:0}}],lotDeltas:[],grossCopper:1,units:1};
}
async function seed(db:Deno.Kv,txId:string){
  const registration=makeIndexedQueueRegistration(
    scopeId,txId,indexedEc06Keys.journal(txId));
  const done=await db.atomic()
    .check({key:registration.key as Deno.KvKey,versionstamp:null})
    .set(registration.key as Deno.KvKey,registration.value)
    .set(indexedEc06Keys.tx(txId) as Deno.KvKey,{
      schema:"EC06_INDEX_SALE_RECEIPT_V1",txId,scopeId})
    .set(indexedEc06Keys.journal(txId) as Deno.KvKey,journal(txId))
    .set(indexedEc06Keys.outbox(txId) as Deno.KvKey,{
      schema:"EC06_INDEX_OUTBOX_V1",txId,scopeId,
      state:"PENDING_INDEXED_PROJECTION",
      journalKey:indexedEc06Keys.journal(txId)})
    .commit();
  if(!done.ok)throw Error("Synthetic source seed CAS failed");
  return registration;
}
async function refuse(run:()=>Promise<unknown>,label:string){
  let refused=false;
  try{await run()}catch{refused=true}
  if(!refused)throw Error("Unsafe queue operation permitted: "+label);
}
Deno.test("bounded 64-shard queue scans only requested prefix/page with stable cursor",async()=>{
  const db=await Deno.openKv(":memory:");
  try{
    const ids=Array.from({length:200},(_,i)=>txName(i));
    await Promise.all(ids.map(id=>seed(db,id)));
    let seen=0;
    for(let shard=0;shard<64;shard++){
      let cursor:string|undefined;
      let loops=0;
      do{
        const page=await listIndexedQueuePage({db,scopeId,shard,limit:3,
          ...(cursor?{cursor}: {})});
        if(page.entries.length>3)throw Error("Unbounded queue page");
        for(const entry of page.entries){
          if(entry.shard!==shard||indexedQueueShardForTx(entry.txId)!==shard)
            throw Error("Cross-shard queue pointer");
        }
        seen+=page.entries.length;
        cursor=page.nextCursor??undefined;
        if(++loops>100)throw Error("Cursor cycle");
        if(!page.entries.length)break;
      }while(cursor);
    }
    if(seen!==ids.length)throw Error("Lost queue page entries: "+seen);
  }finally{db.close()}
});
Deno.test("crash after committed primary KV before Google write leaves discoverable pending outbox",async()=>{
  const db=await Deno.openKv(":memory:");
  try{
    const txId=txName(990);
    await seed(db,txId);
    const page=await listIndexedQueuePage({
      db,scopeId,shard:indexedQueueShardForTx(txId),limit:4});
    if(!page.entries.some(q=>q.txId===txId))
      throw Error("Committed projection intent lost from queue");
    await refuse(()=>pruneVerifiedIndexedQueuePointer({
      db,scopeId,txId}),"pending item pruned before Google receipt");
  }finally{db.close()}
});
Deno.test("queue cleanup requires actual projected source ACK matching immutable journal SHA-256",async()=>{
  const db=await Deno.openKv(":memory:");
  try{
    const txId=txName(991),reg=await seed(db,txId);
    const k=indexedEc06Keys.outbox(txId) as Deno.KvKey;
    const pending=await db.get<Record<string,unknown>>(k);
    const intent=await makeIndexedDeltaIntent(journal(txId));
    await refuse(()=>pruneVerifiedIndexedQueuePointer({db,scopeId,txId}),
      "pending pre-projection");
    let result=await db.atomic().check(pending).set(k,{
      ...pending.value,state:"PROJECTED_INDEXED",
      proofRef:"proof.ec06.indexed."+txId+".forgedhash"}).commit();
    if(!result.ok)throw Error("Could not fake mismatched ACK fixture");
    await refuse(()=>pruneVerifiedIndexedQueuePointer({db,scopeId,txId}),
      "forged Google ACK");
    const mismatch=await db.get<Record<string,unknown>>(k);
    result=await db.atomic().check(mismatch).set(k,{
      ...mismatch.value,
      proofRef:"proof.ec06.indexed."+txId+"."+intent.journalHash}).commit();
    if(!result.ok)throw Error("Could not set valid receipt proof fixture");
    const outcome=await pruneVerifiedIndexedQueuePointer({db,scopeId,txId});
    if(outcome!=="PRUNED"||
       (await db.get(reg.key as Deno.KvKey)).value!==null||
       (await db.get(indexedEc06Keys.tx(txId) as Deno.KvKey)).value===null||
       (await db.get(indexedEc06Keys.journal(txId) as Deno.KvKey)).value===null||
       (await db.get(k)).value===null)
      throw Error("Prune lost immutable financial history or retained queue");
    await refuse(()=>pruneVerifiedIndexedQueuePointer({db,scopeId,txId}),
      "double prune without exact queue");
  }finally{db.close()}
});
Deno.test("parallel cleanup of the same transaction permits exactly one CAS",async()=>{
  const db=await Deno.openKv(":memory:");
  try{
    const txId=txName(992);
    await seed(db,txId);
    const k=indexedEc06Keys.outbox(txId) as Deno.KvKey;
    const before=await db.get<Record<string,unknown>>(k);
    const intent=await makeIndexedDeltaIntent(journal(txId));
    await db.atomic().check(before).set(k,{...before.value,
      state:"PROJECTED_INDEXED",
      proofRef:"proof.ec06.indexed."+txId+"."+intent.journalHash}).commit();
    const claims=await Promise.allSettled(Array.from({length:4},()=>
      pruneVerifiedIndexedQueuePointer({db,scopeId,txId})));
    if(claims.filter(c=>c.status==="fulfilled").length!==1)
      throw Error("Parallel reclaim won or lost more than one CAS");
  }finally{db.close()}
});
Deno.test("reject forged orphan queue pointer, invalid shard and excessive batch",async()=>{
  const db=await Deno.openKv(":memory:");
  try{
    const txId=txName(993),reg=makeIndexedQueueRegistration(
      scopeId,txId,indexedEc06Keys.journal(txId));
    await db.set(reg.key as Deno.KvKey,reg.value); // deliberate orphan.
    await refuse(()=>listIndexedQueuePage({db,scopeId,
      shard:reg.value.shard,limit:2}),"orphan pointer treated as committed");
    await refuse(()=>listIndexedQueuePage({db,scopeId,
      shard:reg.value.shard,limit:33}),"unbounded 33 items");
    await refuse(()=>listIndexedQueuePage({db,scopeId,
      shard:64,limit:1}),"invalid shard");
    let bad=false;
    try{makeIndexedQueueRegistration(scopeId,txId,
      indexedEc06Keys.journal(txName(994)))}catch{bad=true}
    if(!bad)throw Error("Cross-transaction journal pointer accepted");
  }finally{db.close()}
});
