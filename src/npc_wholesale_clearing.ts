/**
 * EC-06: high-volume independent NPC-to-NPC wholesale clearing.
 *
 * One cohesive, SOURCE-ATTESTED clearing window may contain hundreds of
 * independently negotiated and physically receipted orders. This module
 * does not create demands, NPCs, shops, stock, routes, time or money.
 * It never writes: all outcomes remain part of a single proposed CAS manifest.
 *
 * Gross turnover may exceed net money changes because money recirculates.
 */
import {
  planFiniteEconomicSettlement,
  type EconomicOperation,
  type EconomicSnapshot,
  type EconomicSettlementAuthority,
  type SettlementManifest,
} from "./economic_atomic_plan.ts";

export type NpcWholesaleOrder = {
  orderId: string;
  sellerAccountId: string;
  buyerAccountId: string;
  itemId: string;
  sourceProcessId: string;
  handoffLocationId: string;
  quantity: number;
  totalPriceCopper: number;
  splitItemId?: string;
  dueGameMinute: number;
  sellerRightRef: string;
  buyerAcceptanceRef: string;
  deliveredReceiptRef: string;
};

export type NpcClearingSource = {
  /** Do not include the player's account. A business may employ NPCs. */
  npcBusinessAccountIds: ReadonlySet<string>;
  /** Already signed, independently checked current order terms. */
  confirmedOrdersById: ReadonlyMap<string, NpcWholesaleOrder>;
  /** A real process that originated these orders, not design templates. */
  actualRecordedProcessIds: ReadonlySet<string>;
  /** Physical delivery receipts previously used in committed settlements. */
  previouslySettledReceiptRefs: ReadonlySet<string>;
  /** Inworld time supplied by the committed runtime, never advanced here. */
  currentGameMinute: number;
};

export type NpcWholesaleClearingPreview = {
  readonly state: "STAGING_CAS_REQUIRED";
  readonly transaction: SettlementManifest;
  readonly orderCount: number;
  readonly totalUnitsTransferred: number;
  readonly grossTurnoverCopper: number;
  readonly distinctBusinessCount: number;
  /** Derived from the snapshot/manifest; NOT a second current money ledger. */
  readonly netCopperByAccount: Readonly<Record<string, number>>;
  readonly sourceOrderIds: readonly string[];
};

const signedInt = (x: number): boolean => Number.isSafeInteger(x);
const validId = (x: unknown): x is string =>
  typeof x === "string" && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(x);

/** Fields must match an actually accepted contract, not merely a supplied ID. */
function sameCommittedOrder(a: NpcWholesaleOrder, b: NpcWholesaleOrder): boolean {
  return a.orderId === b.orderId &&
    a.sellerAccountId === b.sellerAccountId &&
    a.buyerAccountId === b.buyerAccountId &&
    a.itemId === b.itemId &&
    a.sourceProcessId === b.sourceProcessId &&
    a.handoffLocationId === b.handoffLocationId &&
    a.quantity === b.quantity &&
    a.totalPriceCopper === b.totalPriceCopper &&
    a.splitItemId === b.splitItemId &&
    a.dueGameMinute === b.dueGameMinute &&
    a.sellerRightRef === b.sellerRightRef &&
    a.buyerAcceptanceRef === b.buyerAcceptanceRef &&
    a.deliveredReceiptRef === b.deliveredReceiptRef;
}

/**
 * All orders must already be due, accepted and PHYSICALLY HANDED OVER at
 * the item holder's actual current location. Transport is another separately
 * timed and custody-controlled process; not an instantaneous map teleport.
 *
 * No implicit credit: orders settle in deterministic (due time, ID) order.
 * One lack of liquidity, failed source, oversold lot or repeated receipt
 * rejects the entire window before any current-state write.
 */
export function planNpcWholesaleClearing(input: {
  txId: string;
  snapshot: EconomicSnapshot;
  authority: EconomicSettlementAuthority;
  clearing: NpcClearingSource;
  orders: readonly NpcWholesaleOrder[];
}): NpcWholesaleClearingPreview {
  const {txId,snapshot,authority,clearing,orders}=input;
  if(!signedInt(clearing.currentGameMinute) ||
    clearing.currentGameMinute<0 || orders.length<1 || orders.length>1000) {
    throw Error("Wholesale windows must have actual game time and 1..1000 concrete orders");
  }
  const sorted=[...orders].sort((a,b)=>
    a.dueGameMinute-b.dueGameMinute || a.orderId.localeCompare(b.orderId));
  const usedOrderIds=new Set<string>();
  const usedDeliveryReceipts=new Set<string>();
  const participatingAccounts=new Set<string>();
  const lotsById=new Map(snapshot.lots.map(l=>[l.itemId,l]));
  const events:EconomicOperation[]=[];
  let gross=0,totalUnits=0;
  for(const o of sorted){
    if(!validId(o.orderId)||usedOrderIds.has(o.orderId) ||
      !clearing.npcBusinessAccountIds.has(o.sellerAccountId) ||
      !clearing.npcBusinessAccountIds.has(o.buyerAccountId) ||
      o.buyerAccountId===o.sellerAccountId ||
      !clearing.actualRecordedProcessIds.has(o.sourceProcessId) ||
      !signedInt(o.dueGameMinute) || o.dueGameMinute<0 ||
      o.dueGameMinute>clearing.currentGameMinute ||
      !clearing.confirmedOrdersById.has(o.orderId) ||
      !sameCommittedOrder(o,clearing.confirmedOrdersById.get(o.orderId)!) ||
      !validId(o.deliveredReceiptRef) ||
      usedDeliveryReceipts.has(o.deliveredReceiptRef) ||
      clearing.previouslySettledReceiptRefs.has(o.deliveredReceiptRef) ||
      !authority.observedEvidenceRefs.has(o.deliveredReceiptRef) ||
      !authority.observedEvidenceRefs.has(o.buyerAcceptanceRef) ||
      !authority.observedEvidenceRefs.has(o.sellerRightRef) ||
      !signedInt(o.quantity)||o.quantity<=0 ||
      !signedInt(o.totalPriceCopper)||o.totalPriceCopper<=0 ||
      !lotsById.has(o.itemId) ||
      !authority.canonicalLocationIds.has(o.handoffLocationId)) {
      throw Error("Wholesale needs a distinct signed/due delivered order and actual NPC counterparties");
    }
    const lot=lotsById.get(o.itemId)!;
    if(lot.physicalLocationId!==o.handoffLocationId){
      throw Error("Wholesale handoff cannot move goods without a real transport process");
    }
    usedOrderIds.add(o.orderId);
    usedDeliveryReceipts.add(o.deliveredReceiptRef);
    participatingAccounts.add(o.sellerAccountId);
    participatingAccounts.add(o.buyerAccountId);
    gross+=o.totalPriceCopper;
    totalUnits+=o.quantity;
    if(!signedInt(gross)||!signedInt(totalUnits)){
      throw Error("Wholesale totals exceeded safe integer precision");
    }
    events.push({
      kind:"SELL_GOODS",
      eventId:o.orderId,
      evidenceRef:o.deliveredReceiptRef,
      itemId:o.itemId,
      sellerAccountId:o.sellerAccountId,
      buyerAccountId:o.buyerAccountId,
      sellerLocationId:o.handoffLocationId,
      receivingLocationId:o.handoffLocationId,
      quantity:o.quantity,
      priceCopper:o.totalPriceCopper,
      splitItemId:o.splitItemId,
      buyerConsentRef:o.buyerAcceptanceRef,
      sellerRightRef:o.sellerRightRef,
    });
  }
  const transaction=planFiniteEconomicSettlement({
    txId,expectedRevision:snapshot.revision,snapshot,events,authority,
  });
  const before=new Map(snapshot.accounts.map(a=>[a.accountId,a.availableCopper+a.heldCopper]));
  const delta:Record<string,number>={};
  let reconciliation=0;
  for(const a of transaction.accountsAfter){
    if(!participatingAccounts.has(a.accountId))continue;
    const previous=before.get(a.accountId);
    if(previous===undefined)throw Error("Wholesale participant has no sourced account");
    const change=a.availableCopper+a.heldCopper-previous;
    if(!signedInt(change))throw Error("Invalid net account delta");
    delta[a.accountId]=change;
    reconciliation+=change;
  }
  if(reconciliation!==0)throw Error("NPC gross sales cannot create or destroy net money");
  return {
    state:"STAGING_CAS_REQUIRED",transaction,
    orderCount:sorted.length,
    totalUnitsTransferred:totalUnits,
    grossTurnoverCopper:gross,
    distinctBusinessCount:participatingAccounts.size,
    netCopperByAccount:delta,
    sourceOrderIds:sorted.map(o=>o.orderId),
  };
}
