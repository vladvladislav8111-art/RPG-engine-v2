/**
 * Finite, snapshot-bound financial and custody preflight.
 * Pure proof checker; no ledger, bank or stock is created here.
 * Caller-supplied snapshots are NOT authenticated authority; EC-06 must source them.
 */
export type VerifiedSourceBalance={
  actorId:string;availableCopper:number;sourceRef:string;revision:string;verified:boolean;
};
export type PlannedTransfer={
  receiptId:string;sourceDemandId:string;fromActorId:string;toActorId:string;
  amountCopper:number;fundingReceiptId:string;authorizationRef:string;
};
export type CustodyEntry={itemId:string;custodianId:string;locationId:string;quantity:number;sourceRef:string};
export type PlannedCustodyMove={transferId:string;itemId:string;fromCustodianId:string;toCustodianId:string;
  sourceLocationId:string;destinationLocationId:string;quantity:number;receiptId:string};
export function preflightFinancialCustody(input:{
 expectedRevision:string;
 balances:readonly VerifiedSourceBalance[];
 transfers:readonly PlannedTransfer[];
 stock:readonly CustodyEntry[];
 custodyMoves:readonly PlannedCustodyMove[];
 existingReceiptIds:ReadonlySet<string>;
 existingFundingReceiptIds:ReadonlySet<string>;
}) {
  const fail=(code:string,detail:string)=>({ok:false as const,code,detail,committed:false as const});
  if(!input.expectedRevision) return fail("MISSING_REVISION","No authoritative snapshot revision");
  const funds=new Map<string,number>();
  for(const row of input.balances){
    if(!row.verified || !row.sourceRef || row.revision!==input.expectedRevision ||
      !row.actorId || !Number.isSafeInteger(row.availableCopper) || row.availableCopper<0 ||
      funds.has(row.actorId))return fail("FUNDS_UNPROVEN","Missing, duplicated or stale account evidence");
    funds.set(row.actorId,row.availableCopper);
  }
  const receipts=new Set<string>(), fundingOrigins=new Set<string>();
  const grossDelta=new Map<string,number>();
  for(const t of input.transfers){
    if(!t.authorizationRef||!t.sourceDemandId||!t.fundingReceiptId||!t.receiptId||
      t.fromActorId===t.toActorId || !Number.isSafeInteger(t.amountCopper)||
      t.amountCopper<=0 || receipts.has(t.receiptId) ||
      input.existingReceiptIds.has(t.receiptId) ||
      input.existingFundingReceiptIds.has(t.fundingReceiptId) ||
      fundingOrigins.has(t.fundingReceiptId))
      return fail("RECEIPT_REPLAY_OR_INVALID","Duplicate funding source or unauthorized transfer");
    if(!funds.has(t.fromActorId)||!funds.has(t.toActorId))
      return fail("UNKNOWN_ACCOUNT","No confirmed funding source or payee record");
    receipts.add(t.receiptId);fundingOrigins.add(t.fundingReceiptId);
    grossDelta.set(t.fromActorId,(grossDelta.get(t.fromActorId)??0)-t.amountCopper);
    grossDelta.set(t.toActorId,(grossDelta.get(t.toActorId)??0)+t.amountCopper);
  }
  const projectedAccounts=[...funds].map(([id,available])=>({
    actorId:id,before:available,after:available+(grossDelta.get(id)??0),
  }));
  if(projectedAccounts.some(a=>a.after<0||!Number.isSafeInteger(a.after)))
    return fail("UNFUNDED","Oversubscribed finite source money");
  const originals=new Map<string,CustodyEntry>();
  for(const row of input.stock){
    if(!row.itemId||!row.custodianId||!row.locationId||!row.sourceRef||
      !Number.isSafeInteger(row.quantity)||row.quantity<0||originals.has(row.itemId))
      return fail("CUSTODY_DUPLICATE_OR_UNKNOWN","Each real item needs exactly one holder, place and source");
    originals.set(row.itemId,row);
  }
  const moved=new Map<string,number>(),custodyReceipts=new Set<string>();
  for(const move of input.custodyMoves){
    if(!move.receiptId || !move.transferId||custodyReceipts.has(move.receiptId)||
      input.existingReceiptIds.has(move.receiptId)||
      !Number.isSafeInteger(move.quantity)||move.quantity<=0||
      move.fromCustodianId===move.toCustodianId)
      return fail("CUSTODY_RECEIPT_INVALID","Unsafe movement receipt");
    const stock=originals.get(move.itemId);
    if(!stock||stock.custodianId!==move.fromCustodianId||
      stock.locationId!==move.sourceLocationId||!move.destinationLocationId||
      !move.toCustodianId)
      return fail("CUSTODY_PROVENANCE","Physical item, holder and location must agree");
    const qty=(moved.get(move.itemId)??0)+move.quantity;
    if(qty>stock.quantity)return fail("DOUBLE_SOLD_STOCK","Cannot spend the same item twice");
    moved.set(move.itemId,qty);custodyReceipts.add(move.receiptId);
  }
  return {
    ok:true as const,
    status:"VALID_PROPOSAL_NOT_COMMITTED" as const,
    committed:false as const,
    sourceAuthority:"CALLER_SNAPSHOT_REQUIRES_EC06_ATTESTATION" as const,
    projectedAccounts,
    plannedTransfers:input.transfers.length,
    plannedCustodyMoves:input.custodyMoves.length,
    moneyConserved:[...grossDelta.values()].reduce((a,b)=>a+b,0)===0,
    noActualMutation:true as const,
  };
}
