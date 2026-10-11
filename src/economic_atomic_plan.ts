/**
 * EC-06: deterministic finite economic settlement planner.
 *
 * READ-ONLY, NOT A STORAGE TRANSACTION. Source balances, cash reservations
 * and inventory MUST be provided by ONE versioned authoritative snapshot.
 * Only a future transactional storage adapter with CAS/idempotency can apply
 * this manifest atomically. No player choice is inferred here.
 */
export type EconomicAccount = {
  accountId: string;
  availableCopper: number;
  heldCopper: number;
};
export type WageEscrow = {
  escrowId: string;
  payerAccountId: string;
  workerAccountId: string;
  reservedCopper: number;
  sourceDemandId: string;
};
export type MarketLot = {
  itemId: string;
  templateId: string;
  quantity: number;
  custodianAccountId: string;
  physicalLocationId: string;
  sellingRight: "AUTHORIZED_RETAIL" | "PRIVATE" | "BAILMENT" | "CONSIGNMENT_UNAPPROVED";
};
export type EconomicSnapshot = {
  revision: string;
  accounts: EconomicAccount[];
  escrows: WageEscrow[];
  lots: MarketLot[];
  committedTxIds: ReadonlySet<string>;
  committedCausalEventIds: ReadonlySet<string>;
};
type BaseEvent = {
  eventId: string;
  evidenceRef: string;
};
export type EconomicOperation =
  | (BaseEvent & {
    kind: "RESERVE_WAGE";
    escrowId: string;
    payerAccountId: string;
    workerAccountId: string;
    sourceDemandId: string;
    amountCopper: number;
  })
  | (BaseEvent & {
    kind: "PAY_WAGE";
    escrowId: string;
    amountCopper: number;
    verifiedWorkCompletionRef: string;
  })
  | (BaseEvent & {
    kind: "RELEASE_WAGE";
    escrowId: string;
    amountCopper: number;
    verifiedCancellationRef: string;
  })
  | (BaseEvent & {
    kind: "SELL_GOODS";
    itemId: string;
    sellerAccountId: string;
    buyerAccountId: string;
    sellerLocationId: string;
    receivingLocationId: string;
    quantity: number;
    priceCopper: number;
    splitItemId?: string;
    buyerConsentRef: string;
    sellerRightRef: string;
  });
export type EconomicSettlementAuthority = {
  actualCurrentRevision: string;
  canonicalAccountIds: ReadonlySet<string>;
  canonicalLocationIds: ReadonlySet<string>;
  actualActiveDemandIds: ReadonlySet<string>;
  observedEvidenceRefs: ReadonlySet<string>;
};
export type SettlementManifest = {
  mode: "STAGING_PLAN_ONLY";
  txId: string;
  expectedRevision: string;
  accountsAfter: EconomicAccount[];
  escrowsAfter: WageEscrow[];
  lotsAfter: MarketLot[];
  processedEventIds: string[];
  requiresAtomicCompareAndSwap: true;
};
const validId = (x: unknown): x is string =>
  typeof x === "string" && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(x);
const amount = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const positive = (n: unknown): n is number => amount(n) && n > 0;
const sumMoney = (a: Map<string,EconomicAccount>): number => {
  let total=0;
  for(const v of a.values()) {
    total+=v.availableCopper+v.heldCopper;
    if(!Number.isSafeInteger(total))throw Error("Unsafe total currency precision");
  }
  return total;
};

/**
 * All operations are applied to throwaway cloned maps and emitted as a single
 * candidate write set. Errors yield NO partial result and never mutate input.
 */
export function planFiniteEconomicSettlement(input: {
  txId: string;
  expectedRevision: string;
  snapshot: EconomicSnapshot;
  events: readonly EconomicOperation[];
  authority: EconomicSettlementAuthority;
}): SettlementManifest {
  const {txId,expectedRevision,snapshot:s,events,authority:a}=input;
  if(!validId(txId)||s.committedTxIds.has(txId)||!validId(expectedRevision)||
    s.revision!==expectedRevision||a.actualCurrentRevision!==expectedRevision||
    !events.length) {
    throw Error("Settlement requires current unique TX, matching authoritative revision and events");
  }
  const accounts = new Map<string,EconomicAccount>();
  const escrows = new Map<string,WageEscrow>();
  const lots = new Map<string,MarketLot>();
  for(const x of s.accounts){
    if(!validId(x.accountId)||accounts.has(x.accountId)||
      !a.canonicalAccountIds.has(x.accountId)||!amount(x.availableCopper)||!amount(x.heldCopper)) {
      throw Error("Duplicate/unknown account or negative/noninteger money");
    }
    accounts.set(x.accountId,{...x});
  }
  for(const e of s.escrows){
    if(!validId(e.escrowId)||escrows.has(e.escrowId)||
      !accounts.has(e.payerAccountId)||!accounts.has(e.workerAccountId)||
      e.payerAccountId===e.workerAccountId||!positive(e.reservedCopper)||
      !a.actualActiveDemandIds.has(e.sourceDemandId)) {
      throw Error("Existing wages must have one evidenced employer, worker and pending obligation");
    }
    escrows.set(e.escrowId,{...e});
  }
  const heldByPayer = new Map<string,number>();
  for(const e of escrows.values()){
    heldByPayer.set(e.payerAccountId,(heldByPayer.get(e.payerAccountId)??0)+e.reservedCopper);
  }
  for(const acc of accounts.values()){
    if(acc.heldCopper!==(heldByPayer.get(acc.accountId)??0)) {
      throw Error("Held employer money must reconcile exactly with escrow obligations");
    }
  }
  for(const l of s.lots){
    if(!validId(l.itemId)||lots.has(l.itemId)||!validId(l.templateId)||
      !positive(l.quantity)||!accounts.has(l.custodianAccountId)||
      !a.canonicalLocationIds.has(l.physicalLocationId)||
      !["AUTHORIZED_RETAIL","PRIVATE","BAILMENT","CONSIGNMENT_UNAPPROVED"].includes(l.sellingRight)){
      throw Error("Item custody must have unique ID, physical location and known legal status");
    }
    lots.set(l.itemId,{...l});
  }
  const initialCash=sumMoney(accounts);
  const eventsProcessed = new Set<string>();
  const checkEvidence=(v: string) => {
    if(!validId(v)||!a.observedEvidenceRefs.has(v))throw Error("Missing actual independent source proof");
  };
  const debit=(id:string,copper:number,field:"availableCopper"|"heldCopper")=>{
    const account=accounts.get(id);
    if(!account||!positive(copper)||account[field]<copper)throw Error("Insufficient finite funds");
    account[field]-=copper;
  };
  const credit=(id:string,copper:number,field:"availableCopper"|"heldCopper")=>{
    const account=accounts.get(id);
    if(!account||!positive(copper)||!amount(account[field]+copper))throw Error("Invalid money credit");
    account[field]+=copper;
  };
  for(const op of events){
    if(!validId(op.eventId)||eventsProcessed.has(op.eventId)||
      s.committedCausalEventIds.has(op.eventId))throw Error("Causal event ID already applied");
    eventsProcessed.add(op.eventId);
    checkEvidence(op.evidenceRef);
    if(op.kind==="RESERVE_WAGE"){
      if(!validId(op.escrowId)||escrows.has(op.escrowId)||
        !a.actualActiveDemandIds.has(op.sourceDemandId)||
        [...escrows.values()].some(e=>e.sourceDemandId===op.sourceDemandId)||
        op.payerAccountId===op.workerAccountId||
        !accounts.has(op.workerAccountId))throw Error("No unique real employment demand");
      debit(op.payerAccountId,op.amountCopper,"availableCopper");
      credit(op.payerAccountId,op.amountCopper,"heldCopper");
      escrows.set(op.escrowId,{
        escrowId:op.escrowId,payerAccountId:op.payerAccountId,
        workerAccountId:op.workerAccountId,reservedCopper:op.amountCopper,
        sourceDemandId:op.sourceDemandId,
      });
    } else if(op.kind==="PAY_WAGE"||op.kind==="RELEASE_WAGE"){
      const e=escrows.get(op.escrowId);
      if(!e || !positive(op.amountCopper)||e.reservedCopper<op.amountCopper) {
        throw Error("Cannot pay or cancel unreserved wages");
      }
      checkEvidence(op.kind==="PAY_WAGE"?op.verifiedWorkCompletionRef:op.verifiedCancellationRef);
      debit(e.payerAccountId,op.amountCopper,"heldCopper");
      credit(op.kind==="PAY_WAGE"?e.workerAccountId:e.payerAccountId,op.amountCopper,"availableCopper");
      e.reservedCopper-=op.amountCopper;
      if(e.reservedCopper===0)escrows.delete(e.escrowId);
    } else if(op.kind==="SELL_GOODS"){
      const l=lots.get(op.itemId);
      if(!l||!positive(op.quantity)||!positive(op.priceCopper)||
        l.quantity<op.quantity||l.sellingRight!=="AUTHORIZED_RETAIL"||
        l.custodianAccountId!==op.sellerAccountId||
        l.physicalLocationId!==op.sellerLocationId||
        op.buyerAccountId===op.sellerAccountId||
        !accounts.has(op.buyerAccountId)||
        !a.canonicalLocationIds.has(op.receivingLocationId)) {
        throw Error("Sale needs finite transferable goods, one true holder and buyer");
      }
      checkEvidence(op.buyerConsentRef);
      checkEvidence(op.sellerRightRef);
      debit(op.buyerAccountId,op.priceCopper,"availableCopper");
      credit(op.sellerAccountId,op.priceCopper,"availableCopper");
      if(op.quantity===l.quantity){
        if(op.splitItemId)throw Error("Full-lot handoff cannot mint a second item");
        l.custodianAccountId=op.buyerAccountId;
        l.physicalLocationId=op.receivingLocationId;
        l.sellingRight="PRIVATE";
      } else {
        if(!validId(op.splitItemId)||lots.has(op.splitItemId!)) {
          throw Error("Partial sale requires one new, unique physical item ID");
        }
        l.quantity-=op.quantity;
        lots.set(op.splitItemId!,{
          itemId:op.splitItemId!,templateId:l.templateId,quantity:op.quantity,
          custodianAccountId:op.buyerAccountId,
          physicalLocationId:op.receivingLocationId,sellingRight:"PRIVATE",
        });
      }
    } else {
      throw Error("Unknown economic transaction operation");
    }
  }
  if(sumMoney(accounts)!==initialCash)throw Error("Copper unexpectedly appeared or vanished");
  const finalHeld=new Map<string,number>();
  for(const e of escrows.values())
    finalHeld.set(e.payerAccountId,(finalHeld.get(e.payerAccountId)??0)+e.reservedCopper);
  for(const acc of accounts.values())
    if(acc.heldCopper!==(finalHeld.get(acc.accountId)??0))throw Error("Escrow reserve reconciliation failed");
  return {
    mode:"STAGING_PLAN_ONLY",txId,expectedRevision,
    accountsAfter:[...accounts.values()].map(e=>({...e})),
    escrowsAfter:[...escrows.values()].map(e=>({...e})),
    lotsAfter:[...lots.values()].map(e=>({...e})),
    processedEventIds:[...eventsProcessed],
    requiresAtomicCompareAndSwap:true,
  };
}

/**
 * One semantic inventory event per tracked item ID in a single prepared turn.
 * Any legitimate partial transfer must use a single consolidated source delta
 * and a distinct destination item ID with established provenance.
 */
export function assertUniqueInventoryEventIds(
  events: readonly {itemId: string}[],
): void {
  const ids=new Set<string>();
  for(const e of events){
    if(!validId(e.itemId)||ids.has(e.itemId))throw Error("Same physical item ID mutated more than once in one turn");
    ids.add(e.itemId);
  }
}
