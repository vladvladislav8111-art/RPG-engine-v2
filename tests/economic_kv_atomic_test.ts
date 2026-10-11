import {
  commitEconomicKvStaging, ackEconomicProjection, ec06Keys,
  type AtomicKvStore, type AtomicWrite, type KvKey, type KvEntry,
} from "../src/economic_kv_atomic.ts";
import type {
  EconomicSnapshot,EconomicSettlementAuthority,EconomicOperation,
} from "../src/economic_atomic_plan.ts";

const k=(p:KvKey)=>JSON.stringify(p);
class FakeAtomicKv implements AtomicKvStore {
  private rows=new Map<string,{value:unknown;versionstamp:string}>();
  private counter=0;
  rejectNextCommit=false;
  seed(key:KvKey,value:unknown){
    this.rows.set(k(key),{value:structuredClone(value),versionstamp:String(++this.counter)});
  }
  async get<T>(key:KvKey):Promise<KvEntry<T>>{
    const row=this.rows.get(k(key));
    return {key,value:row?structuredClone(row.value) as T:null,
      versionstamp:row?.versionstamp??null};
  }
  atomic():AtomicWrite {
    const checks:{key:KvKey;versionstamp:string|null}[]=[];
    const sets:{key:KvKey;value:unknown}[]=[];
    const self=this;
    const builder:AtomicWrite={
      check(c){checks.push(c);return builder},
      set(key,value){sets.push({key,value:structuredClone(value)});return builder},
      async commit(){
        if(self.rejectNextCommit){self.rejectNextCommit=false;return {ok:false}}
        // One synchronous CAS section; no interleaving on a single store.
        if(checks.some(c=>(self.rows.get(k(c.key))?.versionstamp??null)!==c.versionstamp))
          return {ok:false};
        for(const op of sets){
          self.rows.set(k(op.key),{
            value:structuredClone(op.value),
            versionstamp:String(++self.counter),
          });
        }
        return {ok:true};
      },
    };
    return builder;
  }
}
async function rejects(action:()=>Promise<unknown>,label:string):Promise<void>{
  let rejected=false;
  try {await action()} catch {rejected=true}
  if(!rejected)throw Error("Unsafe KV operation accepted: "+label);
}
const scopeId="scope.fixture.selarin_market_01";
const employer="account.fixture.merchant";
const worker="account.fixture.laborer";
const buyer="account.fixture.buyer";
const store="loc.fixture.bazaar";
const goods="item.fixture.crate";
const demand="demand.fixture.bounded_shift";
const proof=["proof.fixture.auth","proof.fixture.completion","proof.fixture.buyer_yes",
  "proof.fixture.seller_right","proof.fixture.delivery"];
const initial:EconomicSnapshot={
  revision:"revision.fixture.before",
  accounts:[{accountId:employer,availableCopper:100,heldCopper:0},
    {accountId:worker,availableCopper:0,heldCopper:0},
    {accountId:buyer,availableCopper:50,heldCopper:0}],
  escrows:[],
  lots:[{itemId:goods,templateId:"object.fixture.crate",quantity:2,
    custodianAccountId:employer,physicalLocationId:store,
    sellingRight:"AUTHORIZED_WHOLESALE"}],
  committedTxIds:new Set<string>(),
  committedCausalEventIds:new Set<string>(),
};
const authority:Omit<EconomicSettlementAuthority,"actualCurrentRevision">={
  canonicalAccountIds:new Set([employer,worker,buyer]),
  canonicalLocationIds:new Set([store]),
  actualActiveDemandIds:new Set([demand]),
  actualRecordedDemandIds:new Set([demand]),
  alreadyReservedOrSettledDemandIds:new Set<string>(),
  observedEvidenceRefs:new Set(proof),
};
const wage:EconomicOperation={
  kind:"RESERVE_WAGE",eventId:"event.fixture.reserve_wage",
  evidenceRef:"proof.fixture.auth",escrowId:"escrow.fixture.worker_wage",
  payerAccountId:employer,workerAccountId:worker,sourceDemandId:demand,
  amountCopper:20,
};
const purchase:EconomicOperation={
  kind:"SELL_GOODS",eventId:"event.fixture.buy_crate",
  evidenceRef:"proof.fixture.delivery",itemId:goods,
  sellerAccountId:employer,buyerAccountId:buyer,
  sellerLocationId:store,receivingLocationId:store,
  quantity:1,priceCopper:15,splitItemId:"item.fixture.sold_crate",
  buyerConsentRef:"proof.fixture.buyer_yes",sellerRightRef:"proof.fixture.seller_right",
};
function seededStore(stock=2):FakeAtomicKv{
  const kv=new FakeAtomicKv();
  kv.seed(ec06Keys.ledger(scopeId),{
    schema:"EC06_KV_V1",scopeId,
    snapshot:{...initial,lots:[{...initial.lots[0],quantity:stock}]},
    lastTxId:"tx.fixture.owner_migration",
  });
  return kv;
}
const make=(txId="tx.fixture.first",events:readonly EconomicOperation[]=[wage,purchase])=>({
  scopeId,txId,expectedRevision:initial.revision,
  events,proofAuthority:authority,
});

Deno.test("fail-closed without explicit approved authoritative wallet and stock migration",async()=>{
  const kv=new FakeAtomicKv();
  await rejects(()=>commitEconomicKvStaging(kv,make()),"invent free merchant money");
  if((await kv.get(ec06Keys.tx(scopeId,"tx.fixture.first"))).value!==null)
    throw Error("No ledger must produce no transaction");
});

Deno.test("one KV CAS records money, escrow, item custody, event receipts and outbox",async()=>{
  const kv=seededStore();
  const result=await commitEconomicKvStaging(kv,make());
  if(result.kind!=="COMMITTED"||
     result.outbox.state!=="PENDING_PROJECTION"||
     result.receipt.eventIds.length!==2)throw Error("Incomplete economic commit");
  const ledger=await kv.get<{snapshot:EconomicSnapshot}>(ec06Keys.ledger(scopeId));
  const accounts=ledger.value?.snapshot.accounts;
  if(accounts?.[0]?.availableCopper!==95||accounts?.[0]?.heldCopper!==20||
    accounts?.[2]?.availableCopper!==35 ||
    ledger.value?.snapshot.lots.length!==2)throw Error("Money/custody conservation broken");
  for(const key of [
    ec06Keys.event(scopeId,wage.eventId),
    ec06Keys.event(scopeId,purchase.eventId),
    ec06Keys.outbox(scopeId,"tx.fixture.first"),
  ]){
    if((await kv.get(key)).value===null)throw Error("Missing transaction/event/outbox receipt");
  }
  const repeat=await commitEconomicKvStaging(kv,make());
  if(repeat.kind!=="IDEMPOTENT_REPLAY")throw Error("Same intent retry not recognized");
  const reread=await kv.get(ec06Keys.ledger(scopeId));
  if(ledger.versionstamp!==reread.versionstamp)throw Error("Idempotency replay double wrote");
  await rejects(()=>commitEconomicKvStaging(kv,make("tx.fixture.first",[purchase])),
    "same TX ID different economic intent");
});

Deno.test("two simultaneous purchases of the last item cannot both succeed",async()=>{
  const kv=seededStore(1);
  const one={...purchase,splitItemId:undefined};
  const two={...one,eventId:"event.fixture.another_buyer"};
  const results=await Promise.allSettled([
    commitEconomicKvStaging(kv,make("tx.fixture.purchase_a",[one])),
    commitEconomicKvStaging(kv,make("tx.fixture.purchase_b",[two])),
  ]);
  const successful=results.filter(x=>x.status==="fulfilled");
  if(successful.length!==1)throw Error("Both competing consumers took last item or neither succeeded");
  const live=await kv.get<{snapshot:EconomicSnapshot}>(ec06Keys.ledger(scopeId));
  if(live.value?.snapshot.lots[0].custodianAccountId!==buyer ||
     live.value?.snapshot.accounts[0].availableCopper!==115 ||
     live.value?.snapshot.accounts[2].availableCopper!==35)
    throw Error("Last-unit trade was not settled once");
  const receipts=await Promise.all([
    kv.get(ec06Keys.tx(scopeId,"tx.fixture.purchase_a")),
    kv.get(ec06Keys.tx(scopeId,"tx.fixture.purchase_b")),
  ]);
  if(receipts.filter(x=>x.value!==null).length!==1)
    throw Error("Both competing transaction receipts were written");
});

Deno.test("failed atomic write and stale revision emit no partial accounts or receipts",async()=>{
  const kv=seededStore();
  const prior=await kv.get(ec06Keys.ledger(scopeId));
  kv.rejectNextCommit=true;
  await rejects(()=>commitEconomicKvStaging(kv,make()),"atomic CAS failure");
  const after=await kv.get(ec06Keys.ledger(scopeId));
  if(after.versionstamp!==prior.versionstamp ||
     (await kv.get(ec06Keys.outbox(scopeId,"tx.fixture.first"))).value!==null)
    throw Error("KV conflict left orphan outbox or ledger mutation");
  await commitEconomicKvStaging(kv,make("tx.fixture.second",[wage]));
  await rejects(()=>commitEconomicKvStaging(kv,make("tx.fixture.third",[purchase])),
    "stale original revision");
});

Deno.test("projection remains durable pending after KV commit; exact ACK is idempotent",async()=>{
  const kv=seededStore();
  await commitEconomicKvStaging(kv,make("tx.fixture.pending",[wage]));
  const pending=await kv.get(ec06Keys.outbox(scopeId,"tx.fixture.pending"));
  if(pending.value?.state!=="PENDING_PROJECTION")throw Error("Lost pending projection");
  await rejects(()=>ackEconomicProjection(kv,{
    scopeId,txId:"tx.fixture.not_committed",actualVerifiedProofRef:"proof.fixture.outbox_approved",
  }),"outbox without real committed transaction");
  const done=await ackEconomicProjection(kv,{
    scopeId,txId:"tx.fixture.pending",actualVerifiedProofRef:"proof.fixture.outbox_approved",
  });
  if(done.state!=="PROJECTED")throw Error("Verified projection acknowledgement not recorded");
  const duplicate=await ackEconomicProjection(kv,{
    scopeId,txId:"tx.fixture.pending",actualVerifiedProofRef:"proof.fixture.outbox_approved",
  });
  if(duplicate.state!=="PROJECTED")throw Error("Retried outbox ACK not idempotent");
  await rejects(()=>ackEconomicProjection(kv,{
    scopeId,txId:"tx.fixture.pending",actualVerifiedProofRef:"proof.fixture.false_marker",
  }),"duplicate incompatible projection marker");
});

Deno.test("bounded 1..6 event CAS window rejects oversize cross-city batch",async()=>{
  const kv=seededStore();
  await rejects(()=>commitEconomicKvStaging(kv,make("tx.fixture.seven",
    Array.from({length:7},(_,i)=>({...purchase,eventId:"event.fixture."+i}))))
    ,"unbounded 1000 event KV atomic write");
});
