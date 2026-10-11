import {wrapDenoAtomicEconomyKv} from "../src/economic_deno_kv_adapter.ts";
import {indexedEc06Keys,type IndexedHome,type IndexedSeal,
  commitIndexedNpcWholesaleStaging,type IndexedSaleLot} from "../src/economic_indexed_wholesale_kv.ts";
import {commitIndexedWageStaging,type IndexedWageContract,
  type IndexedWageAuthority} from "../src/economic_indexed_wage_kv.ts";
import {reconcileIndexedDeltaStaging,makeIndexedDeltaIntent,
  type IndexedDeltaTargetAdapter,type IndexedDeltaIntent,
  type IndexedTargetReceipt,type DeltaTarget,type DeltaKind} from "../src/economic_indexed_delta_projection.ts";
import type {EconomicAccount} from "../src/economic_atomic_plan.ts";
import type {NpcWholesaleOrder} from "../src/npc_wholesale_clearing.ts";

const scope="scope.fixture.indexed_projection";
const payer="account.fixture.workshop",worker="account.fixture.carpenter";
const seller="account.fixture.supplier";
const wageDemand="demand.fixture.workshop_loan";
const contract:IndexedWageContract={
  demandId:wageDemand,employerAccountId:payer,workerAccountId:worker,
  agreedCopper:30,sourceContractRef:"proof.fixture.contract",
  dueGameMinute:1000,
};
const wageAuth:IndexedWageAuthority={
  nowGameMinute:100,
  migrationProofRefs:new Set(["proof.fixture.migration"]),
  sourceEvidenceRefs:new Set(["proof.fixture.contract","proof.fixture.accepted",
    "proof.fixture.completed"]),
  actualAcceptedContracts:new Map([[wageDemand,contract]]),
  verifiedCompletedDemandIds:new Set([wageDemand]),
  verifiedCancelledDemandIds:new Set(),
};
const order:NpcWholesaleOrder={
  orderId:"order.fixture.wood",sellerAccountId:seller,buyerAccountId:payer,
  itemId:"item.fixture.lumber",sourceProcessId:"process.fixture.delivered_wood",
  handoffLocationId:"loc.fixture.delivered_site",
  quantity:2,totalPriceCopper:15,dueGameMinute:100,
  buyerAcceptanceRef:"proof.fixture.accepted_goods",
  sellerRightRef:"proof.fixture.sale_right",
  deliveredReceiptRef:"proof.fixture.delivery",
};
const saleAuth={
  nowGameMinute:100,
  verifiedMigrationProofRefs:new Set(["proof.fixture.migration"]),
  confirmedOrdersById:new Map([[order.orderId,order]]),
  verifiedSourceProcessIds:new Set([order.sourceProcessId]),
  independentlyVerifiedEvidenceRefs:new Set([
    order.buyerAcceptanceRef,order.sellerRightRef,order.deliveredReceiptRef,
  ]),
  verifiedLocationIds:new Set([order.handoffLocationId]),
};
const firstTx="tx.fixture.indexed_reserve";
const secondTx="tx.fixture.indexed_wage_pay";
async function setup(){
  const db=await Deno.openKv(":memory:");
  const seal:IndexedSeal={
    schema:"EC06_INDEX_MIGRATION_V1",scopeId:scope,
    state:"STAGING_INDEXED_ONLY",
    originalSaveId:"V2-FIXTURE-SAVE",
    independentlyVerifiedMigrationRef:"proof.fixture.migration",
    originalSourceFingerprint:"hash.fixture.migration",
  };
  const home=(id:string,kind:"account"|"item"):IndexedHome=>({
    schema:"EC06_INDEX_HOME_V1",scopeId:scope,
    entityId:id,kind,sourceProofRef:"proof.fixture.home",
  });
  const account=(id:string,copper:number):EconomicAccount=>({
    accountId:id,availableCopper:copper,heldCopper:0,
  });
  const lot:IndexedSaleLot={
    itemId:order.itemId,templateId:"objtpl.fixture.wood",
    quantity:2,custodianAccountId:seller,legalOwnerAccountId:seller,
    physicalLocationId:order.handoffLocationId,sellingRight:"AUTHORIZED_WHOLESALE",
  };
  await Promise.all([
    db.set(indexedEc06Keys.seal(scope),seal),
    ...[[payer,90],[worker,0],[seller,50]].map(([id,copper])=>
      db.set(indexedEc06Keys.account(scope,id as string),
        account(id as string,copper as number))),
    ...[payer,worker,seller].map(id=>
      db.set(indexedEc06Keys.home("account",id),home(id,"account"))),
    db.set(indexedEc06Keys.home("item",order.itemId),home(order.itemId,"item")),
    db.set(indexedEc06Keys.lot(scope,order.itemId),lot),
  ]);
  return {db,kv:wrapDenoAtomicEconomyKv(db),
    initialRows:new Map<string,unknown>([
      ["account/"+payer,account(payer,90)],
      ["account/"+worker,account(worker,0)],
      ["account/"+seller,account(seller,50)],
      ["lot/"+order.itemId,lot],
    ])};
}
class FictionalAtomicGoogle implements IndexedDeltaTargetAdapter {
  readonly rows=new Map<DeltaTarget,Map<string,unknown>>([
    ["TEMP_RUNTIME",new Map()],
    ["LIVE_TRANSACTION_ARCHIVE",new Map()],
  ]);
  readonly receipts=new Map<DeltaTarget,Map<string,IndexedTargetReceipt>>([
    ["TEMP_RUNTIME",new Map()],
    ["LIVE_TRANSACTION_ARCHIVE",new Map()],
  ]);
  readonly applied=new Map<DeltaTarget,number>([
    ["TEMP_RUNTIME",0],["LIVE_TRANSACTION_ARCHIVE",0],
  ]);
  failBefore:DeltaTarget|null=null;
  throwAfterWrite:DeltaTarget|null=null;
  seed(row:Map<string,unknown>) {
    for(const map of this.rows.values())
      for(const [k,v] of row)map.set(k,structuredClone(v));
  }
  async readReceipt(target:DeltaTarget,_scope:string,txId:string){
    return this.receipts.get(target)!.get(txId)??null;
  }
  async readRows(target:DeltaTarget,_scope:string,
    keys:readonly {kind:DeltaKind;id:string}[]) {
    return keys.map(k=>({kind:k.kind,id:k.id,
      value:structuredClone(this.rows.get(target)!.get(k.kind+"/"+k.id)??null)}));
  }
  async applyRowsAndReceiptAtomically(target:DeltaTarget,intent:IndexedDeltaIntent,
    receipt:IndexedTargetReceipt) {
    if(this.failBefore===target){
      this.failBefore=null;
      throw Error("Synthetic Google target failed BEFORE its atomic row+receipt mutation");
    }
    const bank=this.rows.get(target)!;
    if(this.receipts.get(target)!.has(intent.txId))
      throw Error("Already projected this exact transaction");
    // One synchronous, mock-exclusive critical section, not Google CAS.
    for(const row of intent.mutations){
      if(JSON.stringify(bank.get(row.kind+"/"+row.id)??null)!==JSON.stringify(row.before))
        throw Error("Source row changed at actual target before write");
    }
    for(const row of intent.mutations) {
      if(row.after===null)bank.delete(row.kind+"/"+row.id);
      else bank.set(row.kind+"/"+row.id,structuredClone(row.after));
    }
    this.receipts.get(target)!.set(intent.txId,structuredClone(receipt));
    this.applied.set(target,this.applied.get(target)!+1);
    if(this.throwAfterWrite===target){
      this.throwAfterWrite=null;
      throw Error("Ambiguous network disconnect AFTER durable target mutation");
    }
  }
  async verifyDurableReceipt(target:DeltaTarget,intent:IndexedDeltaIntent,
    receipt:IndexedTargetReceipt){
    const known=this.receipts.get(target)!.get(intent.txId);
    return JSON.stringify(known)===JSON.stringify(receipt);
  }
}
async function rejects(fn:()=>Promise<unknown>,why:string){
  let failed=false;try{await fn()}catch{failed=true}
  if(!failed)throw Error("Indexed projection accepted "+why);
}
Deno.test("wage reserve and payout project only touched rows to both independent targets",async()=>{
  const {db,kv,initialRows}=await setup();
  try{
    const target=new FictionalAtomicGoogle();target.seed(initialRows);
    await commitIndexedWageStaging(kv,{scopeId:scope,
      event:{kind:"RESERVE",txId:firstTx,
        escrowId:"escrow.fixture.job",contract,
        sourceEvidenceRef:"proof.fixture.accepted"},authority:wageAuth});
    const reserved=await reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:firstTx,
    });
    if(reserved.state!=="PROJECTED_INDEXED"||
       reserved.intent.mutations.length!==2 ||
       target.rows.get("TEMP_RUNTIME")!.get("account/"+payer)===undefined)
      throw Error("Reserved wages failed bounded row projection");
    await commitIndexedWageStaging(kv,{scopeId:scope,
      event:{kind:"PAY",txId:secondTx,escrowId:"escrow.fixture.job",
        demandId:wageDemand,amountCopper:30,
        sourceEvidenceRef:"proof.fixture.completed"},authority:wageAuth});
    const paid=await reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:secondTx,
    });
    if(paid.state!=="PROJECTED_INDEXED"||paid.intent.mutations.length!==3)
      throw Error("Completed real reserve did not project exact worker cash");
    for(const key of ["TEMP_RUNTIME","LIVE_TRANSACTION_ARCHIVE"] as const){
      const a=target.rows.get(key)!.get("account/"+payer) as EconomicAccount;
      const b=target.rows.get(key)!.get("account/"+worker) as EconomicAccount;
      if(a.availableCopper!==60||a.heldCopper!==0||b.availableCopper!==30||
         target.applied.get(key)!==2)
        throw Error("Projected cash was credited twice or failed to release reserve");
    }
  }finally{db.close()}
});
Deno.test("partial outage after Sheets mutation is repaired only on missing Docs target",async()=>{
  const {db,kv,initialRows}=await setup();
  try{
    const target=new FictionalAtomicGoogle();target.seed(initialRows);
    await commitIndexedWageStaging(kv,{scopeId:scope,
      event:{kind:"RESERVE",txId:firstTx,
        escrowId:"escrow.fixture.job",contract,
        sourceEvidenceRef:"proof.fixture.accepted"},authority:wageAuth});
    target.failBefore="LIVE_TRANSACTION_ARCHIVE";
    await rejects(()=>reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:firstTx,
    }),"Google Docs outage after Sheets commit");
    if(target.applied.get("TEMP_RUNTIME")!==1||
       target.applied.get("LIVE_TRANSACTION_ARCHIVE")!==0)
      throw Error("Simulated partial Google state wrong");
    const result=await reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:firstTx,
    });
    if(result.state!=="PROJECTED_INDEXED"||
       target.applied.get("TEMP_RUNTIME")!==1||
       target.applied.get("LIVE_TRANSACTION_ARCHIVE")!==1)
      throw Error("Retry replayed Sheets wallet change");
  }finally{db.close()}
});
Deno.test("ambiguous disconnect AFTER target write does not double-pay on retry",async()=>{
  const {db,kv,initialRows}=await setup();
  try{
    const target=new FictionalAtomicGoogle();target.seed(initialRows);
    await commitIndexedWageStaging(kv,{scopeId:scope,
      event:{kind:"RESERVE",txId:firstTx,
        escrowId:"escrow.fixture.job",contract,
        sourceEvidenceRef:"proof.fixture.accepted"},authority:wageAuth});
    target.throwAfterWrite="TEMP_RUNTIME";
    await rejects(()=>reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:firstTx,
    }),"post-commit network failure");
    const result=await reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:firstTx,
    });
    if(result.state!=="PROJECTED_INDEXED"||
       target.applied.get("TEMP_RUNTIME")!==1||
       target.applied.get("LIVE_TRANSACTION_ARCHIVE")!==1)
      throw Error("Ambiguous response repeated paid source changes");
  }finally{db.close()}
});
Deno.test("one account's older wage projection must precede overlapping purchase projection",async()=>{
  const {db,kv,initialRows}=await setup();
  try{
    const target=new FictionalAtomicGoogle();target.seed(initialRows);
    await commitIndexedWageStaging(kv,{scopeId:scope,
      event:{kind:"RESERVE",txId:firstTx,
        escrowId:"escrow.fixture.job",contract,
        sourceEvidenceRef:"proof.fixture.accepted"},authority:wageAuth});
    await commitIndexedNpcWholesaleStaging(kv,{scopeId:scope,order,
      authority:saleAuth});
    await rejects(()=>reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:order.orderId,
    }),"buy materials before older wage reservation for same account");
    await reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:firstTx,
    });
    await reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:order.orderId,
    });
    const bank=target.rows.get("TEMP_RUNTIME")!;
    const employer=bank.get("account/"+payer) as EconomicAccount;
    const goods=bank.get("lot/"+order.itemId) as IndexedSaleLot;
    if(employer.availableCopper!==45||employer.heldCopper!==30||
       goods.legalOwnerAccountId!==payer)
      throw Error("Interleaved indexed trade and wage changes diverged");
  }finally{db.close()}
});
Deno.test("fabricated or missing durable Google receipt cannot ACK indexed outbox",async()=>{
  const {db,kv,initialRows}=await setup();
  try{
    const target=new FictionalAtomicGoogle();target.seed(initialRows);
    await commitIndexedWageStaging(kv,{scopeId:scope,
      event:{kind:"RESERVE",txId:firstTx,
        escrowId:"escrow.fixture.job",contract,
        sourceEvidenceRef:"proof.fixture.accepted"},authority:wageAuth});
    const j=(await kv.get<import("../src/economic_indexed_wage_kv.ts").IndexedWageJournal>(
      indexedEc06Keys.journal(firstTx))).value!;
    const intent=await makeIndexedDeltaIntent(j);
    target.receipts.get("TEMP_RUNTIME")!.set(firstTx,{
      schema:"EC06_INDEXED_TARGET_RECEIPT_V1",target:"TEMP_RUNTIME",
      txId:firstTx,scopeId:scope,journalHash:"HASH_TAMPERED",
      rowIds:intent.mutations.map(m=>m.kind+"/"+m.id),
    });
    await rejects(()=>reconcileIndexedDeltaStaging({
      kv,adapter:target,scopeId:scope,txId:firstTx,
    }),"forged proof digest");
    const outbox=await kv.get<{state:string}>(indexedEc06Keys.outbox(firstTx));
    if(outbox.value?.state!=="PENDING_INDEXED_PROJECTION")
      throw Error("Forged receipt incorrectly confirmed money projection");
  }finally{db.close()}
});
