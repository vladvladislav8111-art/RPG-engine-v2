/**
 * EC-06: derive ONLY finance that can be proven from a current committed
 * account balance and subsequent reconciled, unique completed transfers.
 *
 * Historical work pay, service prices, merchant biographies and GM PREGEN
 * candidate balances are NOT an opening current cash ledger. Do not fill
 * absent NPC balances with 0 or an invented cash grant.
 *
 * PURE / READ-ONLY. This is not legal ownership proof, real money issuance,
 * an economic migration, or a gameplay transaction.
 */
export type FundingBalanceProof = {
  ownerId:string;
  accountId:string;
  copper:number;
  saveId:string;
  sourceRowRef:string;
  sourceRevision:string;
};
export type FundingFlowEvidence = {
  eventId:string;
  fromAccountId:string;
  toAccountId:string;
  copper:number;
  completedSaveId:string;
  sourceRef:string;
  sequence:number;
};
export type UnfundedObservation = {
  ownerId:string;
  kind:"HISTORICAL_PAYMENT"|"PRICE_QUOTE"|"JOB_OFFER"|"NPC_BIOGRAPHY"|"GM_PREGEN_CANDIDATE";
  sourceRef:string;
  description:string;
};
export type FundingClearance = {
  kind:"PROVEN_LIQUIDITY"|"UNKNOWN_FUNDS";
  ownerId:string;
  accountId?:string;
  availableCopper?:number;
  sourceSaveId?:string;
  reason:string;
};
export type EconomicFundingAudit = {
  state:"EVIDENCE_ONLY_NO_MIGRATION";
  clearances:readonly FundingClearance[];
  rejectedEvidence:readonly string[];
  historicalOnlyObservations:number;
  totalProvenCopper:number;
  noWritesPerformed:true;
};
const id=(s:unknown):s is string=>typeof s==="string"&&s.trim().length>0;
const money=(x:unknown):x is number=>typeof x==="number"&&Number.isSafeInteger(x)&&x>=0;
export function auditProvenNpcLiquidity(input:{
  currentSaveId:string;
  ownerIds:readonly string[];
  balances:readonly FundingBalanceProof[];
  completedFlows:readonly FundingFlowEvidence[];
  historicalOnly:readonly UnfundedObservation[];
  independentlyVerifiedSourceRefs:ReadonlySet<string>;
  committedEventIds:ReadonlySet<string>;
}):EconomicFundingAudit{
  const {currentSaveId,ownerIds,balances,completedFlows,historicalOnly,
    independentlyVerifiedSourceRefs:trusted,committedEventIds}=input;
  if(!id(currentSaveId))throw Error("EC-06 requires pinned committed runtime save ID");
  const errors:string[]=[];
  const identities=new Set<string>();
  for(const owner of ownerIds){
    if(!id(owner)||identities.has(owner))errors.push("INVALID_OR_DUPLICATE_OWNER");
    identities.add(owner);
  }
  const opening=new Map<string,FundingBalanceProof>();
  const accountIds=new Set<string>();
  for(const b of balances){
    if(!id(b.ownerId)||!identities.has(b.ownerId)||
       !id(b.accountId)||accountIds.has(b.accountId)||opening.has(b.ownerId)||
       !money(b.copper)||!id(b.sourceRevision)||b.saveId!==currentSaveId||
       !trusted.has(b.sourceRowRef)){
      errors.push("UNPROVEN_OR_DUPLICATE_CURRENT_BALANCE:"+b.ownerId);
    }else{
      opening.set(b.ownerId,b);
      accountIds.add(b.accountId);
    }
  }
  const byAccount=new Map<string,number>();
  for(const b of opening.values())byAccount.set(b.accountId,b.copper);
  const eventIds=new Set<string>();
  const flows=[...completedFlows].sort((a,b)=>a.sequence-b.sequence||
    a.eventId.localeCompare(b.eventId));
  for(const f of flows){
    if(!id(f.eventId)||eventIds.has(f.eventId)||!committedEventIds.has(f.eventId)||
       !id(f.sourceRef)||!trusted.has(f.sourceRef)||
       !Number.isSafeInteger(f.sequence)||f.sequence<0||
       !money(f.copper)||f.copper===0||
       f.fromAccountId===f.toAccountId||
       !byAccount.has(f.fromAccountId)||!byAccount.has(f.toAccountId)||
       f.completedSaveId!==currentSaveId){
      errors.push("FLOW_HAS_NO_CONSERVED_COMMITTED_SOURCE:"+f.eventId);
      continue;
    }
    eventIds.add(f.eventId);
    const beforeFrom=byAccount.get(f.fromAccountId)!,
      beforeTo=byAccount.get(f.toAccountId)!;
    const afterFrom=beforeFrom-f.copper,afterTo=beforeTo+f.copper;
    if(!money(afterFrom)||!money(afterTo)){
      errors.push("UNFUNDED_OR_OVERFLOW_TRANSFER:"+f.eventId);
      continue;
    }
    byAccount.set(f.fromAccountId,afterFrom);
    byAccount.set(f.toAccountId,afterTo);
  }
  for(const row of historicalOnly){
    // Explicitly never turn these into account funds.
    if(!id(row.ownerId)||!id(row.sourceRef)||!id(row.description))
      errors.push("INVALID_HISTORICAL_CONTEXT");
  }
  // If any source flow cannot reconcile, the entire inference is invalid:
  // do not advertise part of a failed ledger as available spending power.
  if(errors.length)return {
    state:"EVIDENCE_ONLY_NO_MIGRATION",
    clearances:ownerIds.map(ownerId=>({
      kind:"UNKNOWN_FUNDS",ownerId,
      reason:"Source reconciliation failed; no spendable balance can be inferred",
    })),
    rejectedEvidence:[...new Set(errors)],
    historicalOnlyObservations:historicalOnly.length,
    totalProvenCopper:0,noWritesPerformed:true,
  };
  const clearances:FundingClearance[]=ownerIds.map(ownerId=>{
    const b=opening.get(ownerId);
    return b?{
      kind:"PROVEN_LIQUIDITY",ownerId,accountId:b.accountId,
      availableCopper:byAccount.get(b.accountId)!,
      sourceSaveId:currentSaveId,
      reason:"Current committed balance + verified net transfers (no grant)",
    }:{
      kind:"UNKNOWN_FUNDS",ownerId,
      reason:"No independently sourced CURRENT spendable money balance",
    };
  });
  let total=0;
  for(const money of byAccount.values()){
    total+=money;
    if(!Number.isSafeInteger(total))throw Error("Monetary precision overflow");
  }
  return {state:"EVIDENCE_ONLY_NO_MIGRATION",clearances,
    rejectedEvidence:[],historicalOnlyObservations:historicalOnly.length,
    totalProvenCopper:total,noWritesPerformed:true};
}
