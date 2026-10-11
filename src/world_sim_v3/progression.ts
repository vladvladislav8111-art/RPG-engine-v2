import {deny,pass,unique,type Domain,type Evidence,type SimOutcome} from './types.ts';
import type {AchievementDefinition,TitleDefinition} from './achievement_catalog.ts';
export type SystemAwardReceipt={id:string;achievementId:string;subjectId:string;sup:number;sourceEvidenceIds:readonly string[];authorizedBy:string;committed:false};
export type EarnedAchievement={id:string;achievementId:string;subjectId:string;sourceEvidenceIds:readonly string[];earnedAt:number};
export type EarnedTitle={titleId:string;subjectId:string;earnedAt:number;sourceEvidenceIds:readonly string[];sourceAchievementIds:readonly string[]};
export type CurrencyReceipt={receiptId:string;kind:'award'|'spend';amount:number;originId:string;};
export function systemCurrencyBalance(receipts:readonly CurrencyReceipt[]):number{
 const seen=new Set<string>(),origins=new Set<string>();let result=0;
 for(const r of receipts){if(!Number.isSafeInteger(r.amount)||r.amount<0||!r.receiptId||seen.has(r.receiptId))throw Error('Invalid or duplicated SUP receipt');seen.add(r.receiptId);
  if(r.kind==='award'){if(origins.has(r.originId))throw Error('Double SUP reward origin');origins.add(r.originId);result+=r.amount;}else result-=r.amount;
  if(!Number.isSafeInteger(result)||result<0)throw Error('Unfunded SUP spending or unsafe currency balance');}
 return result;
}
export type AwardRequest={definition:AchievementDefinition;subjectId:string;subjectType:'SYSTEM_USER'|'NPC';evidence:readonly Evidence[];alreadyEarned:ReadonlySet<string>;existingAwardOrigins:ReadonlySet<string>;canonActivatedIds:ReadonlySet<string>;gmAuthorizationRef:string;};
/** A candidate catalog entry is not canon; GM must explicitly promote rules. */
export function planAchievementAward(input:AwardRequest):SimOutcome<SystemAwardReceipt>{
 const {definition:d,evidence}=input;
 if(!input.canonActivatedIds.has(d.id))return deny('CATALOG_DRAFT','A candidate achievement is not an active rule');
 if(input.subjectType!=='SYSTEM_USER')return deny('NOT_SYSTEM_USER','World NPCs cannot spontaneously gain Shura System resources');
 if(input.alreadyEarned.has(d.id)||input.existingAwardOrigins.has('achievement:'+input.subjectId+':'+d.id))return deny('ALREADY_AWARDED','One-off achievement may not be farmed');
 if(!input.gmAuthorizationRef||!d.triggerKind||evidence.length<d.minProofs||!unique(evidence.map(e=>e.id)))return deny('INSUFFICIENT_EVIDENCE','No independent qualifying event');
 const qualified=evidence.filter(e=>e.independentlyVerified&&e.sourceRef&&e.actorId===input.subjectId&&e.kind===d.triggerKind&&e.domain===d.domain&&e.noveltyVerified===true&&['meaningful','major','landmark'].includes(e.significance??'routine')&&(d.rarity==='meaningful'||['major','landmark'].includes(e.significance??'routine'))&&(d.rarity!=='landmark'||e.significance==='landmark'));
 if(qualified.length<d.minProofs||new Set(qualified.map(e=>e.sourceRef)).size<d.minProofs)return deny('NO_QUALIFYING_CAUSE','Unverified or duplicated origin cannot award SUP');
 if(![0,1,2].includes(d.supReward))return deny('INVALID_SUP','System reward outside ordinary canon bound');
 return pass({id:'receipt.achievement.'+input.subjectId+'.'+d.id,achievementId:d.id,subjectId:input.subjectId,sup:d.supReward,sourceEvidenceIds:qualified.map(e=>e.id),authorizedBy:input.gmAuthorizationRef,committed:false});
}
export function planProgressCycle(input:{subjectId:string;evidence:readonly Evidence[];consumedEvidenceIds:ReadonlySet<string>;existingCycleIds:ReadonlySet<string>;cycleId:string;gmAuthorizationRef:string}):SimOutcome<SystemAwardReceipt>{
 const fresh=input.evidence.filter(e=>e.independentlyVerified&&!input.consumedEvidenceIds.has(e.id)&&!!e.sourceRef&&e.actorId===input.subjectId&&e.noveltyVerified===true&&['meaningful','major','landmark'].includes(e.significance??'routine'));
 if(fresh.length!==3||!unique(fresh.map(e=>e.id))||new Set(fresh.map(e=>e.domain)).size<2||!input.gmAuthorizationRef||input.existingCycleIds.has(input.cycleId))return deny('CYCLE_UNEARNED','Three distinct nontrivial new tasks in two domains required');
 return pass({id:'receipt.sup.cycle.'+input.subjectId+'.'+input.cycleId,achievementId:'system.progress.cycle',subjectId:input.subjectId,sup:1,sourceEvidenceIds:fresh.map(e=>e.id),authorizedBy:input.gmAuthorizationRef,committed:false});
}
export function planTitleAward(input:{definition:TitleDefinition;subjectId:string;earnedAchievementIds:ReadonlySet<string>;evidence:readonly Evidence[];alreadyHeld:ReadonlySet<string>;activatedTitleIds:ReadonlySet<string>;gmAuthorizationRef:string}):SimOutcome<EarnedTitle>{
 const {definition:d}=input;if(!input.activatedTitleIds.has(d.id))return deny('TITLE_DRAFT','Title not yet canonically activated');
 if(input.alreadyHeld.has(d.id))return deny('TITLE_DUPLICATED','Title is permanent and unique');
 if(!input.gmAuthorizationRef||!d.prerequisiteAchievementIds.every(id=>input.earnedAchievementIds.has(id))||!input.evidence.some(e=>e.independentlyVerified&&e.actorId===input.subjectId&&e.kind===d.triggerKind&&!!e.sourceRef))return deny('TITLE_UNEARNED','Major independent source prerequisite missing');
 if(!d.effect.trigger||!d.effect.rule||d.effect.cap<0)return deny('TITLE_NO_EFFECT','Every title must have exact mechanical effect');
 const qualifying=input.evidence.filter(e=>e.independentlyVerified&&e.actorId===input.subjectId&&e.kind===d.triggerKind);
 return pass({titleId:d.id,subjectId:input.subjectId,earnedAt:Math.max(...qualifying.map(e=>e.worldMinute)),sourceEvidenceIds:qualifying.map(e=>e.id),sourceAchievementIds:[...d.prerequisiteAchievementIds]});
}
/** Title passives apply automatically ONLY to owned, active titles and true triggers. */
export function applicableTitleEffects(input:{titles:readonly TitleDefinition[];ownedTitleIds:ReadonlySet<string>;activatedTitleIds:ReadonlySet<string>;trigger:string}):readonly {id:string;rule:string;value:number;cap:number}[]{
 return input.titles.filter(t=>input.ownedTitleIds.has(t.id)&&input.activatedTitleIds.has(t.id)&&t.effect.trigger===input.trigger&&t.effect.mode==='PASSIVE').map(t=>({id:t.id,rule:t.effect.rule,value:t.effect.value,cap:t.effect.cap}));
}
/** Formal System objective SUP is distinct from NPC wages and from achievement SUP. */
export function planSystemObjectiveReward(input:{objectiveId:string;subjectId:string;playerAccepted:boolean;canonActiveIds:ReadonlySet<string>;completionEvidence:readonly Evidence[];gmAuthorizationRef:string;alreadyRewardedIds:ReadonlySet<string>;sup:number}):SimOutcome<SystemAwardReceipt>{
 if(!input.playerAccepted||!input.canonActiveIds.has(input.objectiveId)||input.alreadyRewardedIds.has(input.objectiveId)||!input.gmAuthorizationRef)return deny('OBJECTIVE_NOT_QUALIFIED','Not an accepted, unclaimed canon System objective');
 if(!Number.isSafeInteger(input.sup)||input.sup<1||input.sup>3)return deny('SYSTEM_REWARD_BAND','Ordinary formal System objective must award 1–3 SUP, by explicit canon');
 const causes=input.completionEvidence.filter(e=>e.independentlyVerified&&e.sourceRef&&e.actorId===input.subjectId&&e.noveltyVerified===true&&['meaningful','major','landmark'].includes(e.significance??'routine'));
 if(!causes.length||!new Set(causes.map(e=>e.sourceRef)).size)return deny('OBJECTIVE_NOT_COMPLETE','No verified novel outcome');
 return pass({id:'receipt.system.objective.'+input.subjectId+'.'+input.objectiveId,achievementId:input.objectiveId,subjectId:input.subjectId,sup:input.sup,sourceEvidenceIds:causes.map(e=>e.id),authorizedBy:input.gmAuthorizationRef,committed:false});
}
export function planExplicitSupPurchase(input:{subjectId:string;offerId:string;priceSUP:number;playerChoiceRef:string;availableSUP:number;alreadyPurchasedNonrepeatable:boolean}):SimOutcome<{offerId:string;subjectId:string;supDelta:number;playerChoiceRef:string;committed:false}>{
 if(!input.playerChoiceRef||input.alreadyPurchasedNonrepeatable)return deny('PLAYER_CHOICE_REQUIRED','Only player decides System resource spending');
 if(!Number.isSafeInteger(input.priceSUP)||input.priceSUP<1||!Number.isSafeInteger(input.availableSUP)||input.availableSUP<input.priceSUP)return deny('INSUFFICIENT_SUP','Cannot create a negative System currency balance');
 return pass({offerId:input.offerId,subjectId:input.subjectId,supDelta:-input.priceSUP,playerChoiceRef:input.playerChoiceRef,committed:false});
}
