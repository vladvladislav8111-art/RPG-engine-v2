/**
 * Confirmed, source-tagged, CAS-ready RPG Lab turn event.
 * Pure function. Never grants preview loot, rewrites canon or touches legacy saves.
 */
import {validateLabSession,type LabSession,type LabMemory,type LabNpcState} from "./session.ts";
import type {LabPack} from "./engine.ts";
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const good=(s:unknown):s is string=>typeof s==="string"&&ID.test(s)&&!["constructor","prototype","__proto__"].includes(s);
const phrase=(s:unknown,max:number):s is string=>typeof s==="string"&&s.length>0&&s.length<=max;
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const bounded=(x:unknown,max:number):x is string[]=>Array.isArray(x)&&x.length<=max&&x.every(good);
export type LabNpcObservation={
 npcId:string;channel:"seen"|"heard"|"experienced"|"report"|"rumor"|"deduction";
 perceivedFact:string;learnedAt:string;sourceActor?:string;
 confidence:"certain"|"likely"|"uncertain"|"doubted"|"disproved";
 salience:"fleeting"|"ordinary"|"important"|"life_defining";
 privacy:"private"|"small_group"|"public";
};
export type LabConfirmedEvent={
 sourceRef:string;time:string;summary:string;kind:string;locationId?:string;
 knownBy:string[];observations?:LabNpcObservation[];
 discovered?:string[];playerLocationId?:string;
 effects?:{resources?:Record<string,number>;inventory?:Record<string,number>};
 gmConfirmed:true;
};
const channels=["seen","heard","experienced","report","rumor","deduction"];
export function applyConfirmedLabEvent(session:LabSession,pack:LabPack,event:LabConfirmedEvent):LabSession{
 validateLabSession(session,pack);
 if(!record(event)||event.gmConfirmed!==true||!good(event.sourceRef)||!good(event.kind)||
    !phrase(event.time,100)||!phrase(event.summary,600)||!bounded(event.knownBy,60))
  throw Error("LAB_EVENT_CONFIRMATION_REQUIRED");
 if(event.locationId!==undefined&&(!good(event.locationId)||!pack.locations[event.locationId]))
  throw Error("LAB_EVENT_LOCATION_INVALID");
 if(event.playerLocationId!==undefined&&(!good(event.playerLocationId)||!pack.locations[event.playerLocationId]))
  throw Error("LAB_EVENT_PLAYER_LOCATION_INVALID");
 if(session.events.some(e=>e.sourceRef===event.sourceRef))throw Error("LAB_EVENT_ALREADY_APPLIED");
 if(session.events.length>=256)throw Error("LAB_EVENT_JOURNAL_FULL");
 if(new Set(event.knownBy).size!==event.knownBy.length||event.knownBy.some(k=>!pack.npcProfiles[k]))
  throw Error("LAB_EVENT_WITNESS_INVALID");
 const observations=event.observations??[];
 if(!Array.isArray(observations)||observations.length>32)throw Error("LAB_EVENT_OBSERVATIONS_INVALID");
 if(new Set(observations.map(x=>x.npcId)).size!==observations.length)
  throw Error("LAB_EVENT_DUPLICATE_NPC_OBSERVATION");
 const next=structuredClone(session);
 if(event.discovered!==undefined){
  if(!bounded(event.discovered,120)||event.discovered.some(k=>!pack.locations[k]))
   throw Error("LAB_EVENT_DISCOVERY_INVALID");
  next.discovered=[...new Set([...next.discovered,...event.discovered])];
  if(next.discovered.length>500)throw Error("LAB_EVENT_DISCOVERY_LIMIT");
 }
 if(event.playerLocationId!==undefined){
  if(!next.discovered.includes(event.playerLocationId))throw Error("LAB_EVENT_LOCATION_NOT_DISCOVERED");
  next.player.locationId=event.playerLocationId;
 }
 for(const observation of observations){
  if(!record(observation)||!good(observation.npcId)||!pack.npcProfiles[observation.npcId]||
     !channels.includes(observation.channel)||!phrase(observation.perceivedFact,600)||
     !phrase(observation.learnedAt,100)||
     !["certain","likely","uncertain","doubted","disproved"].includes(observation.confidence)||
     !["fleeting","ordinary","important","life_defining"].includes(observation.salience)||
     !["private","small_group","public"].includes(observation.privacy))
   throw Error("LAB_EVENT_OBSERVATION_INVALID");
  const direct=["seen","heard","experienced"].includes(observation.channel);
  if(direct&&!event.knownBy.includes(observation.npcId))
   throw Error("LAB_EVENT_NO_DIRECT_WITNESS_EVIDENCE");
  if(!direct&&(!good(observation.sourceActor)||observation.sourceActor===observation.npcId))
   throw Error("LAB_EVENT_REPORT_SOURCE_REQUIRED");
  const state:LabNpcState=next.npcs[observation.npcId]??{knownFacts:[],memories:[]};
  if(state.memories.length>=128)throw Error("LAB_EVENT_NPC_MEMORY_FULL");
  const memory:LabMemory={
   sourceRef:event.sourceRef,summary:observation.perceivedFact,
   perceivedFact:observation.perceivedFact,learnedAt:observation.learnedAt,
   eventTime:event.time,knownBy:[observation.npcId],
   channel:observation.channel,confidence:observation.confidence,
   salience:observation.salience,privacy:observation.privacy,
   ...(observation.sourceActor?{sourceActor:observation.sourceActor}:{}),
   ...(event.locationId?{locationId:event.locationId}:{}),
  };
  state.memories.push(memory);
  if(!state.knownFacts.includes(event.sourceRef))state.knownFacts.push(event.sourceRef);
  if(state.knownFacts.length>128)throw Error("LAB_EVENT_NPC_KNOWLEDGE_FULL");
  next.npcs[observation.npcId]=state;
 }
 if(event.effects!==undefined){
  if(!record(event.effects))throw Error("LAB_EVENT_EFFECT_INVALID");
  for(const category of ["resources","inventory"] as const){
   const changes=event.effects[category];
   if(changes===undefined)continue;
   if(!record(changes)||Object.keys(changes).length>80)throw Error("LAB_EVENT_EFFECT_INVALID");
   const target=next.player[category] as Record<string,number>;
   for(const [key,delta] of Object.entries(changes)){
    if(!good(key)||typeof delta!=="number"||!Number.isFinite(delta)||Math.abs(delta)>1e9)
     throw Error("LAB_EVENT_EFFECT_INVALID");
    if(category==="inventory"&&!Number.isInteger(delta))throw Error("LAB_EVENT_EFFECT_INTEGER");
    const value=(target[key]??0)+delta;
    if(!Number.isFinite(value)||value<0||value>1e12||(category==="inventory"&&!Number.isInteger(value)))
     throw Error("LAB_EVENT_EFFECT_OUT_OF_BOUNDS");
    if(category==="resources"&&(!pack.resources[key]||value<pack.resources[key].min||value>pack.resources[key].max))
     throw Error("LAB_EVENT_RESOURCE_OUT_OF_BOUNDS");
    target[key]=value;
   }
  }
 }
 next.events.push({sourceRef:event.sourceRef,kind:event.kind,summary:event.summary,
  time:event.time,knownBy:[...event.knownBy],
  ...(event.locationId?{locationId:event.locationId}:{})});
 next.gameClock=event.time;
 validateLabSession(next,pack);
 return next;
}
