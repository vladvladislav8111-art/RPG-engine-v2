/** Performance boundary: attention is a scheduling priority, not population count or NPC identity. */
import {isId,minute,reject,unique,type NpcTier} from './types.ts';
export type AttentionCandidate={actorId:string;tier:NpcTier;identityExists:boolean;lastLifeTick:number|null;nextDecisionAt:number|null;liveProjectCount:number;hasActiveObligation:boolean;inCurrentScene:boolean;hasPendingPlayerThread:boolean;sourceRef:string};
export type AttentionRequest={now:number;actors:readonly AttentionCandidate[];maxFocused?:number;maxPeripheral?:number};
export function chooseNpcAttention(input:AttentionRequest){
 if(!minute(input.now)||input.actors.length>500||!unique(input.actors.map(a=>a.actorId)))return reject('INVALID_ATTENTION_REQUEST','Need bounded distinct roster and valid time');
 const maxFocused=input.maxFocused??8,maxPeripheral=input.maxPeripheral??16;
 if(!Number.isSafeInteger(maxFocused)||!Number.isSafeInteger(maxPeripheral)||maxFocused<1||maxFocused>24||maxPeripheral<0||maxPeripheral>48)return reject('ATTENTION_BUDGET','Controlled caps required');
 if(input.actors.some(a=>!isId(a.actorId)||!isId(a.sourceRef)||!a.identityExists||a.nextDecisionAt!==null&&!minute(a.nextDecisionAt)||a.lastLifeTick!==null&&!minute(a.lastLifeTick)||a.liveProjectCount<0||!Number.isSafeInteger(a.liveProjectCount)))return reject('UNVERIFIED_NPC','No speculative resident or activity clock');
 const weighted=input.actors.map(a=>{
  const due=a.nextDecisionAt!==null&&a.nextDecisionAt<=input.now;
  const score=(a.inCurrentScene?10000:0)+(a.hasPendingPlayerThread?2000:0)+(due?1000:0)+(a.tier==='KEY'?250:a.tier==='RECURRING'?90:0)+(a.hasActiveObligation?70:0)+Math.min(a.liveProjectCount,20);
  return {actorId:a.actorId,tier:a.tier,score,due,inCurrentScene:a.inCurrentScene,sourceRef:a.sourceRef};
 }).sort((a,b)=>b.score-a.score||a.actorId.localeCompare(b.actorId));
 const focus=weighted.slice(0,maxFocused),peripheral=weighted.slice(maxFocused,maxFocused+maxPeripheral),deferred=weighted.slice(maxFocused+maxPeripheral);
 return {ok:true as const,code:'NPC_ATTENTION_V4_PROPOSAL' as const,sourceAttested:false as const,committed:false as const,focused:focus,peripheral,deferredCount:deferred.length,deferredActorIds:deferred.map(a=>a.actorId),nextReviewHint:(()=>{const future=input.actors.map(a=>a.nextDecisionAt).filter((n):n is number=>n!==null&&n>input.now);return future.length?Math.min(...future):null;})()};
}
