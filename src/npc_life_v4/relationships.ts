import {isId,minute,reject,unique,type DirectedBond,type LifeRefusal} from './types.ts';
export type SocialInteraction={id:string;fromId:string;towardId:string;at:number;sourceRef:string;confirmed:boolean;contactVerified:boolean;decisionEvidenceRef:string;effect:'trust'|'warmth'|'tension'|'obligation'|'none';effectDescription:string};
export type BondProposal={ok:true;code:'NPC_BOND_V4_PROPOSAL';committed:false;sourceAttested:false;fromId:string;towardId:string;interactionId:string;directedOnly:true;candidateChange:{field:SocialInteraction['effect'];description:string}|null;needsGmDecision:true};
export function proposeDirectedRelationship(event:SocialInteraction,existing:readonly DirectedBond[]):BondProposal|LifeRefusal{
 if(!isId(event.id)||!isId(event.fromId)||!isId(event.towardId)||event.fromId===event.towardId||!minute(event.at)||!isId(event.sourceRef))return reject('INVALID_SOCIAL_EVENT','Real actors, time and independent event source required');
 if(!event.confirmed||!event.contactVerified)return reject('NO_CONTACT_EVIDENCE','No invented meeting or remote knowledge');
 if(!isId(event.decisionEvidenceRef))return reject('MOTIVE_UNVERIFIED','Actual independent actor response required');
 if(existing.length>32||!unique(existing.map(b=>b.bondId)))return reject('BOND_PAGE_REQUIRED','Bounded distinct relationships only');
 if(existing.some(b=>b.fromId===event.towardId&&b.towardId===event.fromId)){
  // A reverse relationship may already exist; this proposal may never update it.
 }
 if(event.effect!=='none'&&event.effectDescription.trim().length<12)return reject('EMPTY_CAUSAL_CHANGE','An actual consequence, not a +1 meter, is needed');
 return {ok:true,code:'NPC_BOND_V4_PROPOSAL',committed:false,sourceAttested:false,fromId:event.fromId,towardId:event.towardId,interactionId:event.id,directedOnly:true,candidateChange:event.effect==='none'?null:{field:event.effect,description:event.effectDescription},needsGmDecision:true};
}
export type PersonalityChange={actorId:string;eventId:string;sourceRef:string;observedResponse:string;previousTendency:string;newTendency:string;gmApproved:boolean;repeatEvidenceIds:string[];type:'refinement'|'reversal'|'new_boundary'};
export function proposePersonalityEvolution(event:PersonalityChange):{ok:true;code:'NPC_PERSONALITY_V4_PROPOSAL';committed:false;needsCanonValidation:true;proposal:PersonalityChange}|LifeRefusal{
 if(!isId(event.actorId)||!isId(event.eventId)||!isId(event.sourceRef)||!event.gmApproved)return reject('UNAUTHORIZED_EVOLUTION','GM must independently judge a documented personal change');
 if(event.observedResponse.trim().length<10||event.previousTendency.trim().length<5||event.newTendency.trim().length<5||event.previousTendency===event.newTendency)return reject('UNPROVEN_CHARACTER_CHANGE','Need substantial difference evidenced by action, not mere clock passage');
 if(!unique(event.repeatEvidenceIds)||event.repeatEvidenceIds.length>12)return reject('INVALID_CHARACTER_EVIDENCE','Duplicate or unbounded evidence IDs');
 if(event.type==='reversal'&&event.repeatEvidenceIds.length<2)return reject('REVERSAL_NOT_ESTABLISHED','Complete reversal needs independently recorded repeated pattern');
 return {ok:true,code:'NPC_PERSONALITY_V4_PROPOSAL',committed:false,needsCanonValidation:true,proposal:event};
}
