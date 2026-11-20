/** Actor-specific suspicion about the Player. Not a shared "city wanted" meter.
 * Every change must be backed by a witnessed or personally relayed event.
 * Suspicion records a hypothesis, NEVER actual knowledge of a hidden System.
 */
import type {LabSession,LabNpcState} from "./session.ts";
import type {LabPack} from "./engine.ts";
export type NpcPlayerSuspicion={
 score:number;
 clues:{sourceRef:string;tag:string;delta:number;context:string}[];
};
export type NpcSuspicionChange={
 npcId:string;sourceRef:string;tag:string;delta:number;
 context:string;
};
const valid=(s:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(s);
export function validateNpcSuspicion(s:NpcPlayerSuspicion){
 if(!s||!Number.isInteger(s.score)||s.score<0||s.score>100||
  !Array.isArray(s.clues)||s.clues.length>30||
  s.clues.some(x=>!valid(x.sourceRef)||!valid(x.tag)||
   !Number.isInteger(x.delta)||x.delta< -25||x.delta>25||
   !x.context||x.context.length>220)||
  new Set(s.clues.map(x=>x.sourceRef)).size!==s.clues.length)
  throw Error("DANMACHI_NPC_SUSPICION_INVALID");
}
export function applyNpcSuspicionChanges(session:LabSession,pack:LabPack,e:{
 sourceRef:string;knownBy:string[];
 observations?:{npcId:string;channel:string}[];
 npcSuspicionChanges?:NpcSuspicionChange[];
}):Record<string,LabNpcState>|null{
 const batch=e.npcSuspicionChanges??[];
 if(batch.length===0)return null;
 if(pack.worldId!=="danmachi.orario"||!Array.isArray(batch)||
  batch.length>8||new Set(batch.map(x=>x.npcId)).size!==batch.length)
  throw Error("DANMACHI_SUSPICION_BATCH_INVALID");
 const updated=structuredClone(session.npcs);
 for(const change of batch){
  if(!pack.npcProfiles[change.npcId]||!e.knownBy.includes(change.npcId)||
   !valid(change.sourceRef)||!valid(change.tag)||
   !Number.isInteger(change.delta)||Math.abs(change.delta)>25||
   !change.context||change.context.length>220)
   throw Error("DANMACHI_SUSPICION_ACTOR_OR_SOURCE_INVALID");
  const direct=e.sourceRef===change.sourceRef&&
   (e.observations??[]).some(x=>x.npcId===change.npcId&&
    ["seen","heard","experienced"].includes(x.channel));
  const past=(session.npcs[change.npcId]?.memories??[]).some(m=>
   m.sourceRef===change.sourceRef||
   m.relayedSourceRef===change.sourceRef);
  if(!direct&&!past)throw Error("DANMACHI_SUSPICION_NOT_PERSONALLY_KNOWN");
  const state=updated[change.npcId]??{knownFacts:[],memories:[]};
  const prior=state.suspicion??{score:0,clues:[]};
  if(prior.clues.some(c=>c.sourceRef===change.sourceRef))
   throw Error("DANMACHI_SUSPICION_DUPLICATE_EVIDENCE");
  const score=Math.max(0,Math.min(100,prior.score+change.delta));
  const next={score,clues:[...prior.clues.slice(-28),{
   sourceRef:change.sourceRef,tag:change.tag,
   delta:change.delta,context:change.context
  }]};
  validateNpcSuspicion(next);state.suspicion=next;
  updated[change.npcId]=state;
 }
 return updated;
}
export function readPrivateNpcSuspicion(s:LabSession,npcIds:string[]){
 if(!Array.isArray(npcIds)||npcIds.length>8)throw Error("DANMACHI_SUSPICION_QUERY_INVALID");
 return npcIds.map(npcId=>({
  npcId,suspicion:s.npcs[npcId]?.suspicion??{score:0,clues:[]},
  hiddenFromPlayer:true,notKnowledgeOfActualSystem:true
 }));
}
