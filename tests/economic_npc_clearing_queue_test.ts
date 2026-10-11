import { queueDueNpcWholesale } from "../src/economic_npc_clearing_queue.ts";
import type { NpcWholesaleOrder } from "../src/npc_wholesale_clearing.ts";
const scope="scope.fixture.current_trade_town";
const future=18000;
const now=17000;
const one=(i:number):NpcWholesaleOrder=>({
  orderId:"order.fixture.wholesale_"+String(i).padStart(5,"0"),
  sellerAccountId:"account.fixture.seller_"+String(i%40),
  buyerAccountId:"account.fixture.buyer_"+String(i%40),
  itemId:"item.fixture.batch_"+String(i).padStart(5,"0"),
  sourceProcessId:"process.fixture.actual_trade",
  handoffLocationId:"loc.fixture.trade_drop",
  quantity:2,totalPriceCopper:7,
  dueGameMinute:now-30+Math.floor(i/10),
  buyerAcceptanceRef:"proof.fixture.accept_"+String(i),
  sellerRightRef:"proof.fixture.right_"+String(i),
  deliveredReceiptRef:"proof.fixture.delivered_"+String(i),
});
const orders=Array.from({length:400},(_,i)=>one(i));
const buyers=orders.map(x=>x.buyerAccountId),sellers=orders.map(x=>x.sellerAccountId);
const acctMap=new Map([...new Set([...buyers,...sellers])].map(k=>[k,scope]));
const itemMap=new Map(orders.map(x=>[x.itemId,scope]));
const evidence=new Set(orders.flatMap(x=>[x.buyerAcceptanceRef,x.sellerRightRef,x.deliveredReceiptRef]));
const auth={
  nowGameMinute:now,
  acceptedOrdersById:new Map(orders.map(x=>[x.orderId,x])),
  confirmedProcessIds:new Set(["process.fixture.actual_trade"]),
  authenticatedEvidenceRefs:evidence,
  alreadyCommittedOrderIds:new Set<string>(),
  alreadyUsedDeliveryReceipts:new Set<string>(),
  accountHomeScope:acctMap,
  itemHomeScope:itemMap,
};
const plan=(list:readonly NpcWholesaleOrder[]=orders,opts:Partial<typeof auth>={})=>
  queueDueNpcWholesale({orders:list,authority:{...auth,...opts}});
function denied(fn:()=>unknown,label:string){
  let failed=false;try{fn()}catch{failed=true}
  if(!failed)throw Error("Unsafe NPC queue accepted: "+label);
}
Deno.test("400 source-confirmed independent NPC wholesale orders queue into bounded <=6-operation windows",()=>{
  const x=plan();
  if(x.mode!=="QUEUE_ONLY_NO_ECONOMIC_COMMIT"||
     x.readyWindows.length!==67||
     x.readyWindows.reduce((sum,w)=>sum+w.orderIds.length,0)!==400||
     x.readyWindows.some(w=>w.orderIds.length<1||w.orderIds.length>6||
       !w.mustReloadCurrentLedgerAndCAS)||
     x.acceptedForWindowCount!==400 ||
     x.noLedgerMutation!==true)throw Error("Large merchant turnover was modeled as one global transaction");
  // Sequence must be causal and deterministic over identical verified source.
  const y=plan([...orders].reverse());
  if(JSON.stringify(x)!==JSON.stringify(y))
    throw Error("Trade scheduler order depends on input array order");
});
Deno.test("trade across primary ledger scopes is deferred, never double-sold or credited",()=>{
  const itemHomes=new Map(itemMap);
  itemHomes.set(orders[0].itemId,"scope.fixture.neighbor_town");
  const x=plan(orders.slice(0,2),{itemHomeScope:itemHomes});
  if(x.deferredCrossScopeOrderIds.length!==1||
     x.deferredCrossScopeOrderIds[0]!==orders[0].orderId||
     x.acceptedForWindowCount!==1||
     x.readyWindows.some(w=>w.orderIds.includes(orders[0].orderId)))
    throw Error("Interscope sale was projected as ordinary same-ledger transfer");
});
Deno.test("future delivery does not settle early; durable committed invoice is skipped on replay",()=>{
  const planned=[orders[0],{...orders[1],dueGameMinute:future}];
  const a=plan(planned,{acceptedOrdersById:new Map(planned.map(x=>[x.orderId,x]))});
  if(a.acceptedForWindowCount!==1||a.dueOrderCount!==1)
    throw Error("Future order prematurely executed");
  const b=plan([orders[0]],{
    alreadyCommittedOrderIds:new Set([orders[0].orderId]),
    alreadyUsedDeliveryReceipts:new Set([orders[0].deliveredReceiptRef]),
  });
  if(b.alreadySettledOrderIds.length!==1||b.readyWindows.length)
    throw Error("Previously paid NPC purchase queued again");
});
Deno.test("identical physical delivery receipt cannot fulfill two invoices",()=>{
  const fake={...orders[1],deliveredReceiptRef:orders[0].deliveredReceiptRef,
    orderId:"order.fixture.changed",
  };
  denied(()=>plan([orders[0],fake]),"two invoices one actual delivered lot");
});
Deno.test("unwitnessed or modified invoice is rejected instead of inventing NPC commerce",()=>{
  denied(()=>plan([{...orders[0],totalPriceCopper:2000}]),"merchant changed price after contract");
  denied(()=>plan([orders[0]],{authenticatedEvidenceRefs:new Set()}),"nobody verified actual trade");
  denied(()=>plan([orders[0]],{itemHomeScope:new Map()}),"source lot has no real current ledger");
  denied(()=>plan([orders[0]],{confirmedProcessIds:new Set()}),"no real trade process");
  denied(()=>plan([orders[0],orders[0]]),"duplicate invoice");
  denied(()=>queueDueNpcWholesale({orders:orders.slice(0,1),authority:auth,
    maxOperationsPerWindow:10}),"overlarge KV window");
});
