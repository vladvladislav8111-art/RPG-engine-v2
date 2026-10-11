/**
 * Competition for finite work slots, driven by actual actor decisions.
 * Snapshot claims are only proposals until a protected authoritative writer
 * verifies receipt, time, budget and unique slot reservation.
 */
export type EmployerOffer={
 offerId:string;sourceProcessId:string;employerId:string;
 slotsTotal:number;slotsRemaining:number;expiresAtMinute:number;
 sourceRevision:string;status:"AVAILABLE"|"FILLED"|"EXPIRED"|"CLOSED";
};
export type Claim={
 claimId:string;offerId:string;applicantId:string;
 acceptedByEmployer:boolean;acceptedAtMinute:number;
 employerDecisionRef:string;sourceRevision:string;
};
export function planWorkCompetition(input:{
 revision:string;nowMinute:number;offers:readonly EmployerOffer[];
 attestedClaims:readonly Claim[];
 existingClaimIds:ReadonlySet<string>;
}) {
 const fail=(code:string)=>({ok:false as const,code,committed:false as const});
 if(!input.revision||!Number.isSafeInteger(input.nowMinute)||input.nowMinute<0)return fail("SOURCE_TIME_REQUIRED");
 const ids=new Set<string>(),claims=new Set<string>(),result=[];
 for(const offer of input.offers){
  if(!offer.offerId||ids.has(offer.offerId)||offer.sourceRevision!==input.revision||
   !offer.sourceProcessId||!offer.employerId||!Number.isSafeInteger(offer.slotsTotal)||
   !Number.isSafeInteger(offer.slotsRemaining)||offer.slotsTotal<0||
   offer.slotsRemaining<0||offer.slotsRemaining>offer.slotsTotal||
   !Number.isSafeInteger(offer.expiresAtMinute))return fail("OFFER_PROVENANCE_OR_STOCK");
  ids.add(offer.offerId);
 }
 for(const claim of input.attestedClaims){
  if(!claim.claimId||claims.has(claim.claimId)||input.existingClaimIds.has(claim.claimId)||
   claim.sourceRevision!==input.revision||!ids.has(claim.offerId)||!claim.applicantId||
   !claim.employerDecisionRef||!Number.isSafeInteger(claim.acceptedAtMinute)||
   claim.acceptedAtMinute>input.nowMinute)
   return fail("DUPLICATE_OR_UNSOURCED_COMPETITOR");
  claims.add(claim.claimId);
 }
 for(const offer of input.offers){
  const contenders=input.attestedClaims.filter(c=>c.offerId===offer.offerId&&c.acceptedByEmployer);
  if(contenders.length>offer.slotsRemaining)return fail("WORK_SLOTS_DOUBLE_ALLOCATED");
  const open=offer.status==="AVAILABLE"&&offer.expiresAtMinute>input.nowMinute;
  result.push({offerId:offer.offerId,open,
   possibleRemainingSlots:open?offer.slotsRemaining-contenders.length:0,
   sourceAcceptedOtherApplicants:contenders.filter(x=>x.applicantId!=="player.shura").length,
   confirmedNPCAction:contenders.length>0,
   playerAcceptanceRequired:true,
   outcome:contenders.length?"ALLOCATABLE_AFTER_WRITER_ATTESTATION":"NO_CONFIRMED_NEW_CLAIM"});
 }
 return {ok:true as const,schema:"WORK_COMPETITION_PROPOSALS_V1" as const,
  revision:input.revision,offers:result,committed:false as const,
  budgetsAttested:false as const,settlementsCreated:0 as const,
  note:"No competitor claims are inferred from elapsed time; each must have a real employer decision and receipt"};
}
