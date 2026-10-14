/** Bounded fail-closed payment gate for newly CLOSED paid work offers. No Sheets writes. */
export type WorkSettlementProof={
 offerId:string;employerId:string;originalSourceRef:string;acceptedSourceRef:string;
 methodSourceRef:string;amountC:number;reservedFromEmployerC:number;acceptanceMinute:number;
};
export type OpportunityClose={
 offerId:string;employerId:string;state:string;pay:string;
};
const good=(x:unknown)=>typeof x==="string"&&/^[A-Za-z0-9._:-]{8,180}$/.test(x);
const money=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=10000000;
export function assertNewWorkPayments(input:{
 closes:OpportunityClose[];proofs:WorkSettlementProof[];openedOfferIds:readonly string[];
 authorizedSameTurnOfferIds:readonly string[];moneyNetC:number;expensesC:number;
}):{proofsChecked:number;totalC:number;requiresExternalReceiptAudit:true}{
 if(input.closes.length>40||input.proofs.length>40||!Number.isSafeInteger(input.moneyNetC)||!money(input.expensesC))
  throw Error("WORK_PROOF_BOUNDS");
 const ids=new Set<string>(),sourceIds=new Set<string>(),opened=new Set(input.openedOfferIds),
  sameTurn=new Set(input.authorizedSameTurnOfferIds);
 let total=0;
 for(const c of input.closes){
  if(!good(c.offerId)||!good(c.employerId)||!/\b(PAID|ОПЛАЧЕНО|ВЫПЛАЧЕНО)\b/i.test(c.state+" "+c.pay)
   ||!/\b(COMPLETED|CLOSED|RESOLVED|ВЫПОЛНЕНО)\b/i.test(c.state))
   throw Error("WORK_CLOSED_STATUS_REQUIRED");
  if(!opened.has(c.offerId)&&!sameTurn.has(c.offerId))throw Error("WORK_SOURCE_OFFER_NOT_MATERIALIZED:"+c.offerId);
  const p=input.proofs.find(x=>x.offerId===c.offerId);
  if(!p||!good(p.employerId)||p.employerId!==c.employerId||
   !good(p.originalSourceRef)||!good(p.acceptedSourceRef)||!good(p.methodSourceRef)||
   p.originalSourceRef===p.acceptedSourceRef||!money(p.amountC)||p.amountC<1||
   !money(p.reservedFromEmployerC)||p.amountC>p.reservedFromEmployerC||
   !Number.isSafeInteger(p.acceptanceMinute)||p.acceptanceMinute<0)
   throw Error("WORK_ACCEPTANCE_OR_FUNDS_UNPROVEN:"+c.offerId);
  if(ids.has(c.offerId)||sourceIds.has(p.originalSourceRef))
   throw Error("WORK_DUPLICATE_RECEIPT_OR_ORIGINAL");
  ids.add(c.offerId);sourceIds.add(p.originalSourceRef);total+=p.amountC;
 }
 if(input.proofs.length!==input.closes.length)throw Error("WORK_PROOF_UNMATCHED");
 if(total-input.expensesC!==input.moneyNetC)throw Error("WORK_PAYOUT_LEDGER_MISMATCH");
 return {proofsChecked:input.proofs.length,totalC:total,
  requiresExternalReceiptAudit:true};
}
