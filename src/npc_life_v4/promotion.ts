/** 6 distinct committed in-world days (strictly more than five) is the *review* threshold, not automatic KEY promotion. */
import {isId,minute,reject,unique,type NpcTier,type VerifiedContact,type LifeResult} from './types.ts';
export type PromotionInput={actorId:string;currentTier:NpcTier;contactEvidence:readonly VerifiedContact[];knownStableNpcIds:readonly string[];canonicalIdentityRef:string;earlySignificanceRef?:string;gmDecisionRef?:string;alreadyPromoted:boolean};
export type PromotionReview={ok:true;code:'NPC_KEY_REVIEW_V4';actorId:string;candidate:boolean;recommended:'KEY_REVIEW'|'KEEP_CURRENT_TIER';currentTier:NpcTier;distinctQualifyingDays:number;qualifyingDays:number[];qualifyingEvents:number;ignoredEvents:number;sourceIds:string[];reason:string;canCommit:false;autoPromoted:false};
const qualifies=(x:VerifiedContact)=>x.committed&&x.reciprocal&&!!x.sourceRef&&x.significance!=='routine'&&x.kind!=='routine_trade'&&x.kind!=='passive_presence';
export function reviewKeyPromotion(input:PromotionInput):LifeResult<PromotionReview>{
 if(!isId(input.actorId)||!isId(input.canonicalIdentityRef))return reject('INVALID_ID','Stable NPC identity required');
 if(!unique(input.knownStableNpcIds)||!input.knownStableNpcIds.includes(input.actorId))return reject('UNREGISTERED_NPC','No new identity or draft alias promotion');
 if(input.contactEvidence.length>256)return reject('CONTACT_PAGE_REQUIRED','Provide a bounded verified history page');
 const eventIds=input.contactEvidence.map(e=>e.eventId);
 if(!unique(eventIds))return reject('DUPLICATE_CONTACT','Never count the same committed interaction twice');
 if(input.contactEvidence.some(e=>e.actorId!==input.actorId||!isId(e.eventId)||!minute(e.day)))return reject('INVALID_CONTACT','All entries require matching actor, unique ID and valid day');
 const valid=input.contactEvidence.filter(qualifies);
 const days=[...new Set(valid.map(x=>x.day))].sort((a,b)=>a-b);
 const early=!!input.earlySignificanceRef?.trim()&&valid.some(e=>e.sourceRef===input.earlySignificanceRef);
 const candidate=input.currentTier!=='KEY'&&!input.alreadyPromoted&&(days.length>=6||early);
 return {ok:true,code:'NPC_KEY_REVIEW_V4',actorId:input.actorId,candidate,recommended:candidate?'KEY_REVIEW':'KEEP_CURRENT_TIER',currentTier:input.currentTier,distinctQualifyingDays:days.length,qualifyingDays:days,qualifyingEvents:valid.length,ignoredEvents:input.contactEvidence.length-valid.length,sourceIds:valid.map(x=>x.sourceRef),reason:input.currentTier==='KEY'?'Already KEY; retain status without fake re-promotion':candidate?(early?'Documented exceptional significance; GM review needed':'More than five distinct meaningful contact days; GM review needed'):'Insufficient meaningful confirmed contact days',canCommit:false,autoPromoted:false};
}
