import { planNpcWholesaleClearing, type NpcWholesaleOrder } from "../src/npc_wholesale_clearing.ts";
import type { EconomicSettlementAuthority, EconomicSnapshot } from "../src/economic_atomic_plan.ts";

function denied(run:()=>unknown,label:string){
  let failed=false;try{run()}catch{failed=true}
  if(!failed)throw Error("Unsafe wholesale trade allowed: "+label);
}
const acct=(i:number)=>"account.fixture.npc_shop_"+String(i).padStart(2,"0");
const lot=(i:number)=>"item.fixture.wholesale_lot_"+String(i).padStart(4,"0");
const receipt=(i:number)=>"proof.fixture.delivery_"+String(i).padStart(4,"0");
const consent=(i:number)=>"proof.fixture.buyer_ok_"+String(i).padStart(4,"0");
const sellerRight=(i:number)=>"proof.fixture.wholesale_right_"+String(i).padStart(4,"0");
const order=(i:number)=>"order.fixture.npc_invoice_"+String(i).padStart(4,"0");
const site=(i:number)=>"loc.fixture.market_loading_"+String(i).padStart(2,"0");
const sourceProcess="process.fixture.npc_trade_window";
const revision="revision.fixture.confirmed_current";
const snapshot: EconomicSnapshot={
  revision,
  accounts:Array.from({length:40},(_,i)=>({
    accountId:acct(i),availableCopper:1000,heldCopper:0,
  })),
  escrows:[],
  lots:Array.from({length:400},(_,i)=>({
    itemId:lot(i),templateId:"object.fixture.sealed_paper_batch",
    quantity:10,custodianAccountId:acct(i%40),
    physicalLocationId:site(i%40),
    sellingRight:"AUTHORIZED_WHOLESALE" as const,
  })),
  committedTxIds:new Set<string>(),
  committedCausalEventIds:new Set<string>(),
};
const orders:NpcWholesaleOrder[]=Array.from({length:400},(_,i)=>({
  orderId:order(i),sellerAccountId:acct(i%40),
  buyerAccountId:acct((i+1)%40),
  itemId:lot(i),sourceProcessId:sourceProcess,
  handoffLocationId:site(i%40),quantity:10,totalPriceCopper:20,
  dueGameMinute:900+Math.floor(i/10),
  sellerRightRef:sellerRight(i),
  buyerAcceptanceRef:consent(i),
  deliveredReceiptRef:receipt(i),
}));
const evidence=new Set<string>(orders.flatMap(o=>[
  o.deliveredReceiptRef,o.buyerAcceptanceRef,o.sellerRightRef,
]));
const auth:EconomicSettlementAuthority={
  actualCurrentRevision:revision,
  canonicalAccountIds:new Set(snapshot.accounts.map(a=>a.accountId)),
  canonicalLocationIds:new Set(orders.map(o=>o.handoffLocationId)),
  actualActiveDemandIds:new Set<string>(),
  actualRecordedDemandIds:new Set<string>(),
  alreadyReservedOrSettledDemandIds:new Set<string>(),
  observedEvidenceRefs:evidence,
};
const clearing={
  npcBusinessAccountIds:new Set(snapshot.accounts.map(a=>a.accountId)),
  confirmedOrdersById:new Map(orders.map(o=>[o.orderId,o])),
  actualRecordedProcessIds:new Set([sourceProcess]),
  previouslySettledReceiptRefs:new Set<string>(),
  currentGameMinute:1100,
};
const run=(o:readonly NpcWholesaleOrder[]=orders,s: EconomicSnapshot=snapshot,
  a:EconomicSettlementAuthority=auth,c:typeof clearing=clearing)=>
  planNpcWholesaleClearing({
    txId:"tx.fixture.trade_window_01",snapshot:s,authority:a,clearing:c,orders:o,
  });

Deno.test("400 independent NPC wholesale trades can clear as one coherent staged transaction",()=>{
  const before=JSON.stringify(snapshot.accounts)+JSON.stringify(snapshot.lots);
  const result=run();
  if(result.orderCount!==400 || result.distinctBusinessCount!==40 ||
    result.totalUnitsTransferred!==4000 ||
    result.grossTurnoverCopper!==8000 ||
    result.sourceOrderIds.length!==400 ||
    result.transaction.lotsAfter.length!==400 ||
    result.transaction.mode!=="STAGING_PLAN_ONLY" ||
    result.state!=="STAGING_CAS_REQUIRED") {
    throw Error("High-volume commercial settlement summary invalid");
  }
  for(let i=0;i<40;i++){
    if(result.netCopperByAccount[acct(i)]!==0 ||
      result.transaction.accountsAfter[i].availableCopper!==1000) {
      throw Error("Wholesale turnover must not invent a market money surplus");
    }
  }
  for(const x of result.transaction.lotsAfter){
    if(x.custodianAccountId!==acct((Number(x.itemId.split("_").at(-1))+1)%40) ||
      x.sellingRight!=="PRIVATE")throw Error("Bought batch has wrong actual new owner");
  }
  if(JSON.stringify(snapshot.accounts)+JSON.stringify(snapshot.lots)!==before) {
    throw Error("Staged wholesale clearance mutated authoritative source");
  }
});

Deno.test("many NPC trades can turn over high gross volume while net money is small",()=>{
  const result=run(orders.slice(0,40));
  if(result.grossTurnoverCopper!==800 ||
    result.totalUnitsTransferred!==400 ||
    result.distinctBusinessCount!==40 ||
    Object.values(result.netCopperByAccount).some(v=>v!==0)) {
    throw Error("Gross daily turnover is not the same thing as net cash minted");
  }
});

Deno.test("only confirmed signed and physically delivered NPC orders are eligible",()=>{
  denied(()=>run([{...orders[0],buyerAccountId:acct(2)}]),
    "misattribute an accepted buyer");
  denied(()=>run([{...orders[0],totalPriceCopper:200}]),
    "increase invoice amount after acceptance");
  denied(()=>run([{...orders[0],handoffLocationId:site(1)}]),
    "goods teleported between market lanes");
  denied(()=>run([{...orders[0],dueGameMinute:1200}]),
    "future order is not yet deliverable");
  denied(()=>run([orders[0]],snapshot,auth,{...clearing,currentGameMinute:0}),
    "zero-time meta cannot settle future delivery");
  denied(()=>run([orders[0]],snapshot,auth,{...clearing,
    actualRecordedProcessIds:new Set()}),
    "fictitious independent trade process");
  denied(()=>run([orders[0]],snapshot,auth,{...clearing,
    confirmedOrdersById:new Map()}),
    "unrecorded trader promise");
  denied(()=>run([orders[0]],snapshot,auth,{...clearing,
    npcBusinessAccountIds:new Set([acct(0)])}),
    "player or unknown non-NPC recipient");
  denied(()=>run([orders[0]],snapshot,{...auth,observedEvidenceRefs:new Set()}),
    "no receipt/consent/permission");
  denied(()=>run([orders[0]],snapshot,auth,{...clearing,
    previouslySettledReceiptRefs:new Set([receipt(0)])}),
    "old receipt used for second trade");
});

Deno.test("goods may not be sold twice and separately proved receipts may not be recycled",()=>{
  denied(()=>run([orders[0],orders[0]]),"same wholesale order twice");
  denied(()=>run([orders[0],{...orders[1],
    orderId:"order.fixture.duplicate",
    deliveredReceiptRef:orders[0].deliveredReceiptRef}],snapshot,auth,{
      ...clearing,
      confirmedOrdersById:new Map([
        [orders[0].orderId,orders[0]],
        ["order.fixture.duplicate",{...orders[1],
          orderId:"order.fixture.duplicate",
          deliveredReceiptRef:orders[0].deliveredReceiptRef}],
      ]),
    }),
    "one shipment receipt covers two distinct deals");
  denied(()=>run([{...orders[0],quantity:11}]),"material shortage");
  denied(()=>run([{...orders[0],quantity:11}],
    {...snapshot,lots:[{...snapshot.lots[0],quantity:20},...snapshot.lots.slice(1)]},
    auth,{...clearing,confirmedOrdersById:new Map([[
      orders[0].orderId,{...orders[0],quantity:11}
    ]])}),"partial physical parcel requires unique output item ID");
});

Deno.test("no NPC can sell personal or borrowed stock; no buyer infinite credit",()=>{
  denied(()=>run([orders[0]],{...snapshot,lots:[
    {...snapshot.lots[0],sellingRight:"BAILMENT"},...snapshot.lots.slice(1)]}),
    "borrowed goods were sold");
  denied(()=>run([orders[0]],{...snapshot,lots:[
    {...snapshot.lots[0],sellingRight:"PRIVATE"},...snapshot.lots.slice(1)]}),
    "personally held gifts sold");
  denied(()=>run([orders[0]],{...snapshot,accounts:[
    snapshot.accounts[0],{...snapshot.accounts[1],availableCopper:0},
    ...snapshot.accounts.slice(2)]}),
    "buyer funds absent");
  denied(()=>run([orders[0]],{...snapshot,
    committedCausalEventIds:new Set([orders[0].orderId])}),
    "settled real order replayed under same event ID");
});

Deno.test("bounded batch windows cannot run all-city per-second processing",()=>{
  denied(()=>run([]),"empty fabricated trading window");
  const tooMany=Array.from({length:1001},(_,i)=>({
    ...orders[i%orders.length],
    orderId:"order.fixture.extra_"+i,
  }));
  denied(()=>run(tooMany),"unbounded city simulation in one turn");
});
