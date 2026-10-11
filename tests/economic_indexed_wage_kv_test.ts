import {wrapDenoAtomicEconomyKv} from "../src/economic_deno_kv_adapter.ts";
import {indexedEc06Keys,type IndexedHome,type IndexedSeal,type IndexedSaleLot,
  commitIndexedNpcWholesaleStaging} from "../src/economic_indexed_wholesale_kv.ts";
import {indexedWageKeys,commitIndexedWageStaging,
  type IndexedWageAuthority,type IndexedWageContract,type IndexedWageEscrow,
  type IndexedWageJournal} from "../src/economic_indexed_wage_kv.ts";
import type {EconomicAccount} from "../src/economic_atomic_plan.ts";
import type {NpcWholesaleOrder} from "../src/npc_wholesale_clearing.ts";

const scope="scope.fixture.indexed_market";
const employer="account.fixture.employer",worker="account.fixture.worker";
const vendor="account.fixture.supplier";
const demand="demand.fixture.real_bookbinding";
const escort="escrow.fixture.real_reserved_shift";
const contract:IndexedWageContract={
  demandId:demand,employerAccountId:employer,workerAccountId:worker,
  agreedCopper:30,sourceContractRef:"proof.fixture.signed_wage_contract",
  dueGameMinute:200,
};
const authority=():IndexedWageAuthority=>({
  nowGameMinute:100,
  migrationProofRefs:new Set(["proof.fixture.source_migration"]),
  sourceEvidenceRefs:new Set([
    contract.sourceContractRef,"proof.fixture.accepted_shift",
    "proof.fixture.work_completed","proof.fixture.work_cancelled",
  ]),
  actualAcceptedContracts:new Map([[demand,contract]]),
  verifiedCompletedDemandIds:new Set([demand]),
  verifiedCancelledDemandIds:new Set([demand]),
});
const reserve=(txId="tx.fixture.reserve_wage_1")=>({
  kind:"RESERVE" as const,txId,escrowId:escort,contract,
  sourceEvidenceRef:"proof.fixture.accepted_shift",
});
const pay=(txId="tx.fixture.pay_wage_1")=>({
  kind:"PAY" as const,txId,escrowId:escort,demandId:demand,
  amountCopper:30,sourceEvidenceRef:"proof.fixture.work_completed",
});
const release=(txId="tx.fixture.release_wage_1")=>({
  kind:"RELEASE" as const,txId,escrowId:escort,demandId:demand,
  amountCopper:30,sourceEvidenceRef:"proof.fixture.work_cancelled",
});
const order:NpcWholesaleOrder={
  orderId:"order.fixture.purchase_materials",sellerAccountId:vendor,
  buyerAccountId:employer,itemId:"item.fixture.supplier_paper",
  sourceProcessId:"process.fixture.delivered_shipment",
  handoffLocationId:"loc.fixture.warehouse",quantity:1,
  totalPriceCopper:30,dueGameMinute:100,
  buyerAcceptanceRef:"proof.fixture.goods_accepted",
  sellerRightRef:"proof.fixture.goods_sale_right",
  deliveredReceiptRef:"proof.fixture.delivered_lot",
};
async function seeded(employerCash=50) {
  const db=await Deno.openKv(":memory:");
  const seal:IndexedSeal={
    schema:"EC06_INDEX_MIGRATION_V1",scopeId:scope,
    state:"STAGING_INDEXED_ONLY",originalSaveId:"V2-FIXTURE-ONLY",
    independentlyVerifiedMigrationRef:"proof.fixture.source_migration",
    originalSourceFingerprint:"hash.fixture.source_v1",
  };
  const home=(id:string):IndexedHome=>({
    schema:"EC06_INDEX_HOME_V1",kind:"account",entityId:id,
    scopeId:scope,sourceProofRef:"proof.fixture.actor_account",
  });
  const account=(id:string,copper:number):EconomicAccount=>({
    accountId:id,availableCopper:copper,heldCopper:0,
  });
  const lot:IndexedSaleLot={
    itemId:order.itemId,templateId:"objtpl.fixture.paper",
    quantity:1,custodianAccountId:vendor,legalOwnerAccountId:vendor,
    physicalLocationId:order.handoffLocationId,
    sellingRight:"AUTHORIZED_WHOLESALE",
  };
  await Promise.all([
    db.set(indexedEc06Keys.seal(scope),seal),
    db.set(indexedEc06Keys.account(scope,employer),account(employer,employerCash)),
    db.set(indexedEc06Keys.account(scope,worker),account(worker,0)),
    db.set(indexedEc06Keys.account(scope,vendor),account(vendor,10)),
    ...[employer,worker,vendor].map(id=>
      db.set(indexedEc06Keys.home("account",id),home(id))),
    db.set(indexedEc06Keys.lot(scope,order.itemId),lot),
    db.set(indexedEc06Keys.home("item",order.itemId),{
      schema:"EC06_INDEX_HOME_V1",kind:"item",entityId:order.itemId,
      scopeId:scope,sourceProofRef:"proof.fixture.sourced_physical_item",
    } satisfies IndexedHome),
  ]);
  return {db,kv:wrapDenoAtomicEconomyKv(db)};
}
const purchaseAuthority={
  nowGameMinute:100,verifiedMigrationProofRefs:new Set(["proof.fixture.source_migration"]),
  confirmedOrdersById:new Map([[order.orderId,order]]),
  verifiedSourceProcessIds:new Set([order.sourceProcessId]),
  independentlyVerifiedEvidenceRefs:new Set([
    order.buyerAcceptanceRef,order.sellerRightRef,order.deliveredReceiptRef,
  ]),
  verifiedLocationIds:new Set([order.handoffLocationId]),
};
async function reject(fn:()=>Promise<unknown>,name:string){
  let failed=false;try{await fn()}catch{failed=true}
  if(!failed)throw Error("Unsafe indexed wage accepted: "+name);
}
const wage=(kv:ReturnType<typeof wrapDenoAtomicEconomyKv>,
  event:ReturnType<typeof reserve>|ReturnType<typeof pay>|ReturnType<typeof release>,
  auth=authority())=>commitIndexedWageStaging(kv,{scopeId:scope,event,authority:auth});

Deno.test("indexed wage reserve, confirmed pay and replay preserve all bank copper",async()=>{
  const {db,kv}=await seeded();
  try {
    const a=await wage(kv,reserve());
    if(a.kind!=="INDEXED_WAGE_COMMITTED_STAGING")throw Error("Wage reservation failed");
    const x=(await kv.get<EconomicAccount>(indexedEc06Keys.account(scope,employer))).value!;
    if(x.availableCopper!==20||x.heldCopper!==30)
      throw Error("Employer wage reserve not funded in existing account");
    const receipt=(await kv.get<IndexedWageEscrow>(indexedWageKeys.escrow(escort))).value;
    if(receipt?.state!=="RESERVED"||receipt.reservedCopper!==30)
      throw Error("Actual escrow not created");
    const b=await wage(kv,pay());
    const ep=(await kv.get<EconomicAccount>(indexedEc06Keys.account(scope,employer))).value!;
    const wp=(await kv.get<EconomicAccount>(indexedEc06Keys.account(scope,worker))).value!;
    if(b.kind!=="INDEXED_WAGE_COMMITTED_STAGING"||ep.heldCopper!==0||
       ep.availableCopper!==20||wp.availableCopper!==30)
      throw Error("Completed work did not transfer reserved copper");
    const twice=await wage(kv,pay());
    if(twice.kind!=="IDEMPOTENT_REPLAY" ||
       (await kv.get<EconomicAccount>(indexedEc06Keys.account(scope,worker))).value?.availableCopper!==30)
      throw Error("Same wage payout double credited");
    await reject(()=>wage(kv,release()),"released already-paid wages");
    await reject(()=>wage(kv,reserve("tx.fixture.another_same_demand")),"re-reserve paid demand");
    const j=(await kv.get<IndexedWageJournal>(
      indexedEc06Keys.journal("tx.fixture.pay_wage_1"))).value;
    if(j?.schema!=="EC06_INDEX_WAGE_JOURNAL_V1"||
       j.accounts.length!==2||j.escrow.after.state!=="PAID")
      throw Error("Immutable indexed wage projection journal missing");
  } finally {db.close()}
});

Deno.test("cancel verified job releases real employer reserve and cannot subsequently pay it",async()=>{
  const {db,kv}=await seeded();
  try{
    await wage(kv,reserve());
    await wage(kv,release());
    const e=(await kv.get<EconomicAccount>(indexedEc06Keys.account(scope,employer))).value!;
    if(e.availableCopper!==50||e.heldCopper!==0)throw Error("Wage cancellation minted or lost copper");
    await reject(()=>wage(kv,pay()),"pay from already released reserve");
  }finally{db.close()}
});

Deno.test("concurrent purchase and wage reservation share employer money, cannot both overspend",async()=>{
  const {db,kv}=await seeded(40);
  try{
    const result=await Promise.allSettled([
      wage(kv,reserve()),
      commitIndexedNpcWholesaleStaging(kv,{scopeId:scope,order,
        authority:purchaseAuthority}),
    ]);
    if(result.filter(x=>x.status==="fulfilled").length!==1)
      throw Error("Wage and materials purchase used same money twice");
    const a=(await kv.get<EconomicAccount>(indexedEc06Keys.account(scope,employer))).value!;
    if(a.availableCopper+a.heldCopper!==40 &&
       a.availableCopper+a.heldCopper!==10)
      throw Error("Money reservation/sale altered employer balance improperly");
  }finally{db.close()}
});

Deno.test("two distinct wage demands drawing same last copper cannot both reserve",async()=>{
  const {db,kv}=await seeded(30);
  try{
    const otherContract:IndexedWageContract={
      ...contract,demandId:"demand.fixture.second_worker_shift",
    };
    const other={kind:"RESERVE" as const,txId:"tx.fixture.reserve_other_shift",
      escrowId:"escrow.fixture.second_worker_shift",
      contract:otherContract,sourceEvidenceRef:"proof.fixture.accepted_shift"};
    const a={...authority(),actualAcceptedContracts:new Map([
      [demand,contract],[otherContract.demandId,otherContract],
    ])};
    const results=await Promise.allSettled([wage(kv,reserve(),a),wage(kv,other,a)]);
    if(results.filter(x=>x.status==="fulfilled").length!==1)
      throw Error("Employer reserved the same last money for two jobs");
  }finally{db.close()}
});

Deno.test("wage wages fail without source contract, existing worker or employer funding",async()=>{
  const {db,kv}=await seeded(0);
  try{
    await reject(()=>wage(kv,reserve()),"unfunded wage promise");
    await db.set(indexedEc06Keys.account(scope,employer),{
      accountId:employer,availableCopper:50,heldCopper:0,
    });
    await reject(()=>wage(kv,reserve(),{...authority(),
      actualAcceptedContracts:new Map()}),"no real employment demand");
    await reject(()=>wage(kv,reserve(),{...authority(),
      sourceEvidenceRefs:new Set()}),"unsigned employer/worker agreement");
    await db.delete(indexedEc06Keys.account(scope,worker));
    await reject(()=>wage(kv,reserve()),"fictional worker account");
  }finally{db.close()}
});

Deno.test("wage outcome needs independent completion or cancellation, not GM intent",async()=>{
  const {db,kv}=await seeded();
  try{
    await wage(kv,reserve());
    await reject(()=>wage(kv,pay(),{...authority(),
      verifiedCompletedDemandIds:new Set()}),"no completed job evidence");
    await reject(()=>wage(kv,release(),{...authority(),
      verifiedCancelledDemandIds:new Set()}),"no actual cancellation");
    const pending=(await kv.get<IndexedWageEscrow>(indexedWageKeys.escrow(escort))).value;
    if(pending?.reservedCopper!==30||pending.state!=="RESERVED")
      throw Error("Denied wages changed reserved money");
  }finally{db.close()}
});
