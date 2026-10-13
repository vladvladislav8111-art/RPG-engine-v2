/** Work demand and reputation review, constrained to real evidence, never autonomous cash/jobs. */
export type DemandWitness = {
 id:string; employerId:string; workSourceRef:string; employerOwnBudgetRef:string;
 activeIndependentSourceCount:number; unfilledAcceptedSlots:number; employerAvailableC:number;
 independentRequiredWorkCount:number; staffAlreadyHandling:number; minPriceC:number;
};
export type ReputationWitness={
 employerId:string; observingActorId:string; evidenceRef:string;
 kind:"direct_accepted_work"|"signed_reference_seen"|"heard_at_verified_contact";
 verifiedContact:boolean; relevantToWork:boolean; successes:number;
};
export type RumorOpportunity={
 factId:string; fromId:string; toId:string; channelId:string; senderAlreadyKnows:boolean;
 verifiedEncounterRef:string; contactAtMinute:number; nowMinute:number; minChannelMinutes:number;
};
const ref=(s:unknown)=>typeof s==="string"&&/^[a-z0-9_.:-]{8,180}$/i.test(s);
const qty=(v:number)=>Number.isSafeInteger(v)&&v>=0&&v<=100000;
export function marketDemandReview(witnesses:DemandWitness[],reputation:ReputationWitness[]){
 if(witnesses.length>64||reputation.length>128)throw Error("MARKET_SOURCE_BOUNDS");
 const seen=new Set<string>(),proposals=[];let total=0;
 for(const d of witnesses){
  if(!ref(d.id)||!ref(d.employerId)||!ref(d.workSourceRef)||!ref(d.employerOwnBudgetRef)
    ||seen.has(d.id)||![d.activeIndependentSourceCount,d.unfilledAcceptedSlots,d.employerAvailableC,
    d.independentRequiredWorkCount,d.staffAlreadyHandling,d.minPriceC].every(qty)||d.minPriceC<1)
    throw Error("MARKET_MATERIALIZED_SOURCE_REQUIRED");
  seen.add(d.id);
  // No global city population multiplier: only witnessed source-backed workloads.
  const unstaffed=Math.max(0,d.independentRequiredWorkCount-d.staffAlreadyHandling);
  const possible=Math.min(d.activeIndependentSourceCount,d.unfilledAcceptedSlots,
    unstaffed,Math.floor(d.employerAvailableC/d.minPriceC));
  const credible=reputation.filter(r=>r.employerId===d.employerId&&r.verifiedContact&&r.relevantToWork&&
   ref(r.evidenceRef)&&ref(r.observingActorId)&&qty(r.successes));
  const direct=credible.filter(r=>r.kind==="direct_accepted_work").reduce((x,y)=>x+y.successes,0);
  const referenced=credible.filter(r=>r.kind==="signed_reference_seen").length;
  const heard=credible.filter(r=>r.kind==="heard_at_verified_contact").length;
  const trustEvidence=direct>0?"DIRECT_EMPLOYER_HISTORY":referenced>0?"VERIFIED_REFERENCE":heard>0?"HEARD_RUMOR":"NO_CONFIRMED_AWARENESS";
  // This is a trust ranking, not a probability or job award.
  const priority=Math.min(100,direct*12+referenced*8+heard*3);
  proposals.push({demandId:d.id,employerId:d.employerId,maximumPotentialSlots:possible,
   trustEvidence,priorityScore:priority,availableC:d.employerAvailableC,
   fundingAttested:false as const,employerAgreementAttested:false as const,
   noNewJobCreated:true as const});
  total+=possible;
 }
 return {source:"MATERIALIZED_DEMAND_ONLY" as const,maximumPotentialSlots:total,
  entries:proposals,mayStillFindNoPaidOffers:true as const,committed:false as const};
}
export function reviewRumorChannels(events:RumorOpportunity[]){
 if(events.length>64)throw Error("RUMOR_BOUNDS");
 const seen=new Set<string>();
 return events.map(e=>{
  const id=e.factId+":"+e.toId;
  if(seen.has(id))throw Error("RUMOR_DUPLICATE_DESTINATION");seen.add(id);
  const plausible=ref(e.factId)&&ref(e.fromId)&&ref(e.toId)&&ref(e.channelId)&&
    ref(e.verifiedEncounterRef)&&e.fromId!==e.toId&&e.senderAlreadyKnows&&
    Number.isSafeInteger(e.contactAtMinute)&&e.contactAtMinute>=0&&Number.isSafeInteger(e.nowMinute)&&e.nowMinute>=0&&qty(e.minChannelMinutes)&&
    e.nowMinute-e.contactAtMinute>=e.minChannelMinutes;
  return {factId:e.factId,fromId:e.fromId,toId:e.toId,plausible,
   status:plausible?"GM_REVIEW_ACTUAL_CONTACT":"NO_EVIDENCED_RELAY",
   committed:false as const,receiverHasNotAutomaticallyLearned:true as const};
 });
}
