/** NPC Life V4: source-constrained proposals only. Nothing in this module commits or changes the save. */
export type EvidenceKind = 'conversation' | 'shared_work' | 'meaningful_assistance' | 'conflict' | 'rescue' | 'personal_disclosure' | 'appointment' | 'routine_trade' | 'passive_presence';
export type VerifiedContact = {
  eventId:string; actorId:string; day:number; kind:EvidenceKind; sourceRef:string;
  committed:boolean; reciprocal:boolean; significance:'routine'|'meaningful'|'major';
};
export type NpcTier = 'KEY'|'RECURRING'|'BACKGROUND';
export type NpcLifeRecord = {
  actorId:string; tier:NpcTier; locationId:string|null; stableIdentityRef:string;
  currentGoal:string; currentGoalSource:string; lastLifeTick:number|null;
  lastDialogueAt:number|null; obligations:readonly PersonalObligation[];
  projects:readonly PersonalProject[]; relationships:readonly DirectedBond[];
};
export type PersonalObligation = {
  id:string; actorId:string; kind:'work'|'care'|'sleep'|'appointment'|'travel'|'personal'|'rest';
  from:number; to:number; locationId:string; sourceRef:string; state:'active'|'cancelled'|'completed';
};
export type PersonalProject = {
  id:string; actorId:string; goal:string; causeRef:string;
  state:'active'|'paused'|'completed'|'cancelled'; nextReviewAt:number|null;
  ownerSourceRef:string; nextDecisionTrigger:string;
};
export type DirectedBond = {
  bondId:string; fromId:string; towardId:string; sourceRef:string;
  trust:string|null; warmth:string|null; tension:string|null; obligation:string|null;
};
export type LifeEvidence = {id:string; actorId:string; kind:'event'|'choice'|'contact'|'witness'|'message'|'process'; at:number; sourceRef:string; confirmed:boolean};
export type CausalOption = {
  optionId:string; actorId:string; goalRef:string; description:string;
  requiredEvidenceIds:readonly string[]; sourceRef:string;
  earliestAt:number; latestAt:number; blockedByObligationIds:readonly string[];
  gmDecisionRequired:true;
};
export type LifeReviewInput = {
  window:{start:number;end:number}; actors:readonly NpcLifeRecord[];
  evidence:readonly LifeEvidence[]; options:readonly CausalOption[];
  maxActors?:number;
};
export type LifeReviewItem = {
  actorId:string; state:'DUE_FOR_GM_RESOLUTION'|'AWAIT_TRIGGER'|'NO_ACTIVE_PERSONAL_PROCESS';
  triggeredProjectIds:string[]; possibleOptionIds:string[]; occupiedObligationIds:string[];
  lastLifeTick:number|null; nextDueAt:number|null; currentGoal:string;
  sourceConfirmed:boolean; committed:false; choicesMade:0;
};
export type LifeReviewResult = {ok:true; code:'NPC_LIFE_V4_PROPOSAL'; sourceAttested:false; committed:false; reviews:LifeReviewItem[]; deferredActorIds:string[];};
export type LifeRefusal = {ok:false; code:string; reason:string};
export type LifeResult<T=LifeReviewResult> = T|LifeRefusal;
export const reject=(code:string,reason:string):LifeRefusal=>({ok:false,code,reason});
export const isId=(x:unknown):x is string=>typeof x==='string'&&x.length>=3&&x.length<=180&&/^[a-z0-9_.:-]+$/i.test(x);
export const minute=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
export const unique=(ids:readonly string[])=>new Set(ids).size===ids.length;
