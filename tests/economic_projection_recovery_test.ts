import { wrapDenoAtomicEconomyKv } from "../src/economic_deno_kv_adapter.ts";
import {
  commitEconomicKvStaging, ec06Keys,
  type AtomicKvStore, type PersistedEconomy, type EconomicProjectionOutbox,
} from "../src/economic_kv_atomic.ts";
import {
  reconcileEconomicProjectionStaging,
  type VerifiedEconomicProjectionAdapter,
} from "../src/economic_projection_recovery.ts";
import {
  type ImmutableEconomicTxJournal, type ProjectionCheckpoint,
  type ProjectionVerification,
} from "../src/economic_projection_journal.ts";
import type {
  EconomicSnapshot, EconomicSettlementAuthority, EconomicOperation,
} from "../src/economic_atomic_plan.ts";

const scope="scope.fixture.citymarket";
const sourceRevision="revision.fixture.initial";
const seller="account.fixture.seller";
const buyer="account.fixture.buyer";
const worker="account.fixture.worker";
const lot="item.fixture.paper";
const dest="loc.fixture.loading";
const accounts=[{accountId:seller,availableCopper:100,heldCopper:0},
  {accountId:buyer,availableCopper:40,heldCopper:0},
  {accountId:worker,availableCopper:0,heldCopper:0}];
const initial:EconomicSnapshot={
  revision:sourceRevision,accounts,escrows:[],
  lots:[{itemId:lot,templateId:"object.fixture.paper",quantity:2,
    custodianAccountId:seller,physicalLocationId:dest,
    sellingRight:"AUTHORIZED_WHOLESALE"}],
  committedTxIds:new Set<string>(),
  committedCausalEventIds:new Set<string>(),
};
const proof:Omit<EconomicSettlementAuthority,"actualCurrentRevision">={
  canonicalAccountIds:new Set([seller,buyer,worker]),
  canonicalLocationIds:new Set([dest]),
  actualActiveDemandIds:new Set(["demand.fixture.paper_packing"]),
  actualRecordedDemandIds:new Set(["demand.fixture.paper_packing"]),
  alreadyReservedOrSettledDemandIds:new Set(),
  observedEvidenceRefs:new Set([
    "source.fixture.delivery","source.fixture.consent","source.fixture.sale_right",
    "source.fixture.work_order",
  ]),
};
const sale:EconomicOperation={
  kind:"SELL_GOODS",eventId:"event.fixture.bought_paper",evidenceRef:"source.fixture.delivery",
  itemId:lot,sellerAccountId:seller,buyerAccountId:buyer,
  sellerLocationId:dest,receivingLocationId:dest,
  quantity:1,priceCopper:10,splitItemId:"item.fixture.purchased_paper",
  buyerConsentRef:"source.fixture.consent",sellerRightRef:"source.fixture.sale_right",
};
const wage:EconomicOperation={
  kind:"RESERVE_WAGE",eventId:"event.fixture.pack_wages",
  evidenceRef:"source.fixture.work_order",escrowId:"escrow.fixture.pack",
  payerAccountId:seller,workerAccountId:worker,
  sourceDemandId:"demand.fixture.paper_packing",amountCopper:20,
};
async function seeded():Promise<{db:Deno.Kv;kv:AtomicKvStore}>{
  const db=await Deno.openKv(":memory:");
  await db.set(ec06Keys.ledger(scope) as Deno.KvKey,{
    schema:"EC06_KV_V1",scopeId:scope,lastTxId:"tx.fixture.migrated",
    snapshot:initial,
  });
  return {db,kv:wrapDenoAtomicEconomyKv(db)};
}
const targets=["TEMP_RUNTIME","LIVE_TRANSACTION_ARCHIVE"] as const;
type Target=(typeof targets)[number];
class FakeVerifiedProjectionAdapter implements VerifiedEconomicProjectionAdapter {
  readonly checkpoint=new Map<Target,string>(targets.map(t=>[t,sourceRevision]));
  readonly receipts=new Map<string,ProjectionVerification>();
  readonly applied=new Map<Target,number>(targets.map(t=>[t,0]));
  failureTarget:Target|null=null;
  private key(target:Target,txId:string){return target+"/"+txId}
  async readCheckpoint(target:Target,scopeId:string):Promise<ProjectionCheckpoint>{
    return {scopeId,target,lastAppliedRevision:this.checkpoint.get(target)!,lastAppliedTxId:"tx.fixture.last"};
  }
  async applyJournal(target:Target,journal:ImmutableEconomicTxJournal):Promise<void>{
    if(this.failureTarget===target){
      this.failureTarget=null;
      throw Error("SIMULATED GOOGLE OUTAGE after earlier target was projected");
    }
    const expected=this.checkpoint.get(target);
    if(expected!==journal.beforeRevision)throw Error("Synthetic watermark divergence");
    this.checkpoint.set(target,journal.afterRevision);
    this.applied.set(target,(this.applied.get(target)??0)+1);
    this.receipts.set(this.key(target,journal.txId),{
      target,scopeId:journal.scopeId,txId:journal.txId,
      afterRevision:journal.afterRevision,
      journalEvidenceRef:"proof.fixture.verified_"+target+"_"+journal.txId,
    });
  }
  async readReceipt(target:Target,_scopeId:string,txId:string){
    return this.receipts.get(this.key(target,txId))??null;
  }
  async isIndependentVerifiedReceipt(receipt:ProjectionVerification):Promise<boolean>{
    const stored=this.receipts.get(this.key(receipt.target,receipt.txId));
    return Boolean(stored&&JSON.stringify(stored)===JSON.stringify(receipt));
  }
}
async function mustReject(op:()=>Promise<unknown>,message:string){
  let failed=false;try{await op()}catch{failed=true}
  if(!failed)throw Error("Expected staged projection rejection: "+message);
}

Deno.test("immutable journal stays correct after next primary economic TX",async()=>{
  const {db,kv}=await seeded();
  try{
    const first=await commitEconomicKvStaging(kv,{
      scopeId:scope,txId:"tx.fixture.A",expectedRevision:sourceRevision,
      events:[sale],proofAuthority:proof,
    });
    const afterA=await kv.get<PersistedEconomy>(ec06Keys.ledger(scope));
    const second=await commitEconomicKvStaging(kv,{
      scopeId:scope,txId:"tx.fixture.B",expectedRevision:afterA.value!.snapshot.revision,
      events:[wage],proofAuthority:proof,
    });
    const jA=await kv.get<ImmutableEconomicTxJournal>(ec06Keys.journal(scope,"tx.fixture.A"));
    const jB=await kv.get<ImmutableEconomicTxJournal>(ec06Keys.journal(scope,"tx.fixture.B"));
    if(!jA.value||!jB.value||jA.value.afterRevision!==first.receipt.afterRevision||
       jB.value.beforeRevision!==first.receipt.afterRevision ||
       jB.value.afterRevision!==second.receipt.afterRevision)
      throw Error("Historic per-TX revision chain corrupted");
    const beforeSeller=jA.value.accounts.find(x=>x.id===seller)?.before?.availableCopper;
    const afterSeller=jA.value.accounts.find(x=>x.id===seller)?.after?.availableCopper;
    if(beforeSeller!==100||afterSeller!==110 ||
       jA.value.lots.find(x=>x.id==="item.fixture.purchased_paper")?.after?.quantity!==1)
      throw Error("Old purchase projection accidentally reconstructed from later wage ledger");
  }finally{db.close()}
});

Deno.test("real KV outbox recovery resumes only missing second Google projection",async()=>{
  const {db,kv}=await seeded();
  try{
    await commitEconomicKvStaging(kv,{scopeId:scope,txId:"tx.fixture.A",
      expectedRevision:sourceRevision,events:[sale],proofAuthority:proof});
    const adapter=new FakeVerifiedProjectionAdapter();
    adapter.failureTarget="LIVE_TRANSACTION_ARCHIVE";
    await mustReject(()=>reconcileEconomicProjectionStaging({
      kv,adapter,scopeId:scope,txId:"tx.fixture.A",
    }),"one target failed after earlier succeeded");
    const pending=await kv.get<EconomicProjectionOutbox>(ec06Keys.outbox(scope,"tx.fixture.A"));
    if(pending.value?.state!=="PENDING_PROJECTION" ||
       adapter.applied.get("TEMP_RUNTIME")!==1 ||
       adapter.applied.get("LIVE_TRANSACTION_ARCHIVE")!==0)
      throw Error("Pending outbox lost or Sheets projection rolled back");
    const recovered=await reconcileEconomicProjectionStaging({
      kv,adapter,scopeId:scope,txId:"tx.fixture.A",
    });
    if(recovered.outbox.state!=="PROJECTED"||
       adapter.applied.get("TEMP_RUNTIME")!==1 ||
       adapter.applied.get("LIVE_TRANSACTION_ARCHIVE")!==1)
      throw Error("Recovery reapplied Sheets or failed second projection");
    const rerun=await reconcileEconomicProjectionStaging({kv,adapter,
      scopeId:scope,txId:"tx.fixture.A"});
    if(rerun.state!=="ALREADY_PROJECTED")
      throw Error("Repeated recovery was not idempotent");
  }finally{db.close()}
});

Deno.test("projection refuses out-of-order newer TX even if primary KV has both",async()=>{
  const {db,kv}=await seeded();
  try{
    await commitEconomicKvStaging(kv,{scopeId:scope,txId:"tx.fixture.A",
      expectedRevision:sourceRevision,events:[sale],proofAuthority:proof});
    const ledger=await kv.get<PersistedEconomy>(ec06Keys.ledger(scope));
    await commitEconomicKvStaging(kv,{scopeId:scope,txId:"tx.fixture.B",
      expectedRevision:ledger.value!.snapshot.revision,events:[wage],proofAuthority:proof});
    const adapter=new FakeVerifiedProjectionAdapter();
    await mustReject(()=>reconcileEconomicProjectionStaging({kv,adapter,
      scopeId:scope,txId:"tx.fixture.B"}),"new TX projected before its predecessor");
    const a=await reconcileEconomicProjectionStaging({kv,adapter,
      scopeId:scope,txId:"tx.fixture.A"});
    const b=await reconcileEconomicProjectionStaging({kv,adapter,
      scopeId:scope,txId:"tx.fixture.B"});
    if(a.outbox.state!=="PROJECTED"||b.outbox.state!=="PROJECTED"||
      adapter.applied.get("TEMP_RUNTIME")!==2||
      adapter.applied.get("LIVE_TRANSACTION_ARCHIVE")!==2)
      throw Error("Sequential recovered projections did not converge");
  }finally{db.close()}
});

Deno.test("untrusted projection receipt cannot close an outbox",async()=>{
  const {db,kv}=await seeded();
  try{
    await commitEconomicKvStaging(kv,{scopeId:scope,txId:"tx.fixture.A",
      expectedRevision:sourceRevision,events:[sale],proofAuthority:proof});
    const adapter=new FakeVerifiedProjectionAdapter();
    adapter.receipts.set("TEMP_RUNTIME/tx.fixture.A",{
      target:"TEMP_RUNTIME",scopeId:scope,txId:"tx.fixture.A",
      afterRevision:"revision.fixture.counterfeit",
      journalEvidenceRef:"proof.fixture.bad",
    });
    await mustReject(()=>reconcileEconomicProjectionStaging({kv,adapter,
      scopeId:scope,txId:"tx.fixture.A"}),"counterfeit source revision");
    const pending=await kv.get<EconomicProjectionOutbox>(ec06Keys.outbox(scope,"tx.fixture.A"));
    if(pending.value?.state!=="PENDING_PROJECTION")
      throw Error("Unverified source marker was acknowledged");
  }finally{db.close()}
});
