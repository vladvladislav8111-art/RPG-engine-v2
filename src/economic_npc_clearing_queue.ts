/**
 * EC-06: deterministic bounded queue of independent NPC↔NPC wholesale
 * transactions. Each window is a SCHEDULING PROPOSAL, not a sale/commit.
 *
 * No one giant city ledger write, no per-second full-city NPC ticks.
 * The real current KV transaction must RELOAD money, stock and custody
 * and CAS each window. Cross-primary-scope trades are explicitly DEFERRED,
 * never duplicated on both sides or "eventually credited" automatically.
 */
import type { NpcWholesaleOrder } from "./npc_wholesale_clearing.ts";

export type ClearingQueueAuthority = {
  nowGameMinute:number;
  acceptedOrdersById:ReadonlyMap<string,NpcWholesaleOrder>;
  confirmedProcessIds:ReadonlySet<string>;
  authenticatedEvidenceRefs:ReadonlySet<string>;
  alreadyCommittedOrderIds:ReadonlySet<string>;
  alreadyUsedDeliveryReceipts:ReadonlySet<string>;
  /** Exactly one account/lot owner scope; these are canonical verified mappings. */
  accountHomeScope:ReadonlyMap<string,string>;
  itemHomeScope:ReadonlyMap<string,string>;
};
export type StagedClearingWindow = {
  scopeId:string;
  ordinal:number;
  windowId:string;
  orderIds:readonly string[];
  earliestDueGameMinute:number;
  latestDueGameMinute:number;
  mustReloadCurrentLedgerAndCAS:true;
};
export type ClearingQueue = {
  mode:"QUEUE_ONLY_NO_ECONOMIC_COMMIT";
  readyWindows:readonly StagedClearingWindow[];
  deferredCrossScopeOrderIds:readonly string[];
  alreadySettledOrderIds:readonly string[];
  dueOrderCount:number;
  acceptedForWindowCount:number;
  noLedgerMutation:true;
};
function id(x:unknown):x is string{
  return typeof x==="string"&&/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i.test(x);
}
function identical(a:NpcWholesaleOrder,b:NpcWholesaleOrder):boolean {
  const keys:(keyof NpcWholesaleOrder)[]=[
    "orderId","sellerAccountId","buyerAccountId","itemId","sourceProcessId",
    "handoffLocationId","quantity","totalPriceCopper","splitItemId",
    "dueGameMinute","sellerRightRef","buyerAcceptanceRef","deliveredReceiptRef",
  ];
  return keys.every(k=>a[k]===b[k]);
}
export function queueDueNpcWholesale(input:{
  orders:readonly NpcWholesaleOrder[];
  authority:ClearingQueueAuthority;
  maxOperationsPerWindow?:number;
}):ClearingQueue {
  const {orders,authority:a}=input;
  const max=input.maxOperationsPerWindow??6;
  if(!Number.isSafeInteger(a.nowGameMinute)||a.nowGameMinute<0||
     !Number.isSafeInteger(max)||max<1||max>6||orders.length>20000)
    throw Error("Bounded due-order clearance requires a finite tick and CAS window 1..6");
  const globalOrderIds=new Set<string>();
  const receipts=new Set<string>();
  const grouped=new Map<string,NpcWholesaleOrder[]>();
  const deferred:string[]=[],settled:string[]=[];
  let due=0,accepted=0;
  for(const o of [...orders].sort((x,y)=>
    x.dueGameMinute-y.dueGameMinute||x.orderId.localeCompare(y.orderId))){
    if(!id(o.orderId)||globalOrderIds.has(o.orderId)||
       !id(o.deliveredReceiptRef)||receipts.has(o.deliveredReceiptRef))
      throw Error("Duplicate or missing wholesale order/shipment receipt");
    globalOrderIds.add(o.orderId);receipts.add(o.deliveredReceiptRef);
    if(!Number.isSafeInteger(o.dueGameMinute)||o.dueGameMinute<0)
      throw Error("Malformed NPC order due time");
    if(o.dueGameMinute>a.nowGameMinute)continue; // Future remains queued elsewhere
    due++;
    if(a.alreadyCommittedOrderIds.has(o.orderId)){
      // Completed receipt cannot create another spend/stock transfer.
      if(!a.alreadyUsedDeliveryReceipts.has(o.deliveredReceiptRef))
        throw Error("Already committed order has no durable used-receipt marker");
      settled.push(o.orderId);
      continue;
    }
    const canonical=a.acceptedOrdersById.get(o.orderId);
    if(!canonical||!identical(canonical,o)||
       !a.confirmedProcessIds.has(o.sourceProcessId)||
       !a.authenticatedEvidenceRefs.has(o.buyerAcceptanceRef)||
       !a.authenticatedEvidenceRefs.has(o.sellerRightRef)||
       !a.authenticatedEvidenceRefs.has(o.deliveredReceiptRef)||
       a.alreadyUsedDeliveryReceipts.has(o.deliveredReceiptRef)||
       !Number.isSafeInteger(o.quantity)||o.quantity<=0||
       !Number.isSafeInteger(o.totalPriceCopper)||o.totalPriceCopper<=0||
       o.sellerAccountId===o.buyerAccountId){
      throw Error("Wholesale order not accepted or witnessed as actual due NPC delivery: "+o.orderId);
    }
    const sellerScope=a.accountHomeScope.get(o.sellerAccountId),
      buyerScope=a.accountHomeScope.get(o.buyerAccountId),
      itemScope=a.itemHomeScope.get(o.itemId);
    if(!sellerScope||!buyerScope||!itemScope)
      throw Error("Unowned economic account/lot scope: "+o.orderId);
    if(sellerScope!==buyerScope||sellerScope!==itemScope){
      deferred.push(o.orderId);
      continue;
    }
    const q=grouped.get(sellerScope)??[];
    q.push(o);grouped.set(sellerScope,q);
    accepted++;
  }
  const windows:StagedClearingWindow[]=[];
  for(const scope of [...grouped.keys()].sort()){
    const queue=grouped.get(scope)!;
    for(let start=0;start<queue.length;start+=max){
      const slice=queue.slice(start,start+max);
      const ordinal=Math.floor(start/max);
      windows.push({
        scopeId:scope,ordinal,
        windowId:"window.ec06."+scope+"."+ordinal,
        orderIds:slice.map(o=>o.orderId),
        earliestDueGameMinute:slice[0].dueGameMinute,
        latestDueGameMinute:slice.at(-1)!.dueGameMinute,
        mustReloadCurrentLedgerAndCAS:true,
      });
    }
  }
  // Global execution order remains deterministic, but independently
  // competing windows must use authoritative KV CAS to resolve actual order.
  windows.sort((x,y)=>
    x.earliestDueGameMinute-y.earliestDueGameMinute||
    x.scopeId.localeCompare(y.scopeId)||x.ordinal-y.ordinal);
  return {
    mode:"QUEUE_ONLY_NO_ECONOMIC_COMMIT",
    readyWindows:windows,deferredCrossScopeOrderIds:deferred,
    alreadySettledOrderIds:settled,dueOrderCount:due,
    acceptedForWindowCount:accepted,noLedgerMutation:true,
  };
}
