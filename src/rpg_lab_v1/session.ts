/** Explicit, isolated per-campaign snapshot with source-tagged NPC memory.
 * No inferred NPC feelings; manual edits are user-provided state, not canonical proof.
 */
import type {LabPack,LabJob} from "./engine.ts";
import {validateLinosState,type LinosState} from "./linos.ts";
import {validateFeatureMemory,type NpcFeatureMemory} from "./npc_perception.ts";
export type LabMemory={sourceRef:string;summary:string;learnedAt:string;knownBy:string[];
  eventTime?:string;locationId?:string;channel?:string;sourceActor?:string;relayedSourceRef?:string;
  confidence?:string;salience?:string;privacy?:string;perceivedFact?:string;
 };
export type LabNpcState={knownFacts:string[];memories:LabMemory[];currentGoal?:string;relationships?:Record<string,string>;perceptions?:Record<string,NpcFeatureMemory>};
export type LabSession={
 schema:"RPG_LAB_SESSION_V1";projectId:string;sessionId:string;gameClock:string;
 player:{resources:Record<string,number>;stats:Record<string,number>;inventory:Record<string,number>;locationId?:string;linos?:LinosState};
 discovered:string[];npcs:Record<string,LabNpcState>;
 events:{sourceRef:string;summary:string;time:string;knownBy:string[];locationId?:string;kind?:string}[];
 worldEvents?:{sourceRef:string;time:string;npcId:string;action:string;outcome:string;locationId?:string;privacy:"public"|"hidden"}[];
};
const id=(v:unknown)=>typeof v==="string"&&/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(v)&&!["constructor","prototype","__proto__"].includes(v);
const list=(v:unknown,max:number)=>Array.isArray(v)&&v.length<=max&&v.every(id);
const map=(v:unknown,max:number)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length<=max&&Object.keys(v).every(id);
const n=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1e12;
const txt=(v:unknown,max:number)=>typeof v==="string"&&v.length>0&&v.length<=max;
export function validateLabSession(s:LabSession,pack:LabPack):LabSession{
 if(!s||s.schema!=="RPG_LAB_SESSION_V1"||s.projectId!==pack.projectId||!id(s.sessionId)||
    !txt(s.gameClock,100)||JSON.stringify(s).length>100000)throw Error("LAB_SESSION_SCHEMA");
 if(!s.player||!map(s.player.resources,128)||!map(s.player.stats,128)||!map(s.player.inventory,500))throw Error("LAB_SESSION_PLAYER_INVALID");
 if(s.player.locationId!==undefined&&( !id(s.player.locationId)||!pack.locations[s.player.locationId]))throw Error("LAB_SESSION_LOCATION_INVALID");
 if(s.player.linos!==undefined){if(pack.worldId!=="danmachi.orario")throw Error("LAB_LINOS_WRONG_WORLD");validateLinosState(s.player.linos);}
 for(const [k,v] of Object.entries(s.player.resources)){if(!n(v)||!pack.resources[k]||v<pack.resources[k].min||v>pack.resources[k].max)throw Error("LAB_SESSION_RESOURCE_INVALID");}
 for(const v of Object.values(s.player.stats))if(!n(v))throw Error("LAB_SESSION_STAT_INVALID");
 for(const v of Object.values(s.player.inventory))if(!n(v)||!Number.isInteger(v))throw Error("LAB_SESSION_ITEM_INVALID");
 if(!list(s.discovered,500)||s.discovered.some(k=>!pack.locations[k]))throw Error("LAB_SESSION_DISCOVERY_INVALID");
 if(!map(s.npcs,128))throw Error("LAB_SESSION_NPCS_INVALID");
 for(const [npcId,raw] of Object.entries(s.npcs)){
  const state=raw as LabNpcState;
  if(!pack.npcProfiles[npcId]||!state||!list(state.knownFacts,128)||!Array.isArray(state.memories)||state.memories.length>128)
   throw Error("LAB_SESSION_NPC_INVALID");
  if(state.perceptions!==undefined){
   if(!map(state.perceptions,32))throw Error("LAB_NPC_FEATURES_INVALID");
   for(const [featureId,feature] of Object.entries(state.perceptions)){
    if(featureId!==feature.featureId)throw Error("LAB_NPC_FEATURE_ID_MISMATCH");
    validateFeatureMemory(feature);
   }
  }
  if(state.currentGoal!==undefined&&!txt(state.currentGoal,300))throw Error("LAB_SESSION_NPC_GOAL_INVALID");
  if(state.relationships!==undefined&&(!map(state.relationships,80)||Object.values(state.relationships).some(v=>!txt(v,250))))
   throw Error("LAB_SESSION_NPC_RELATION_INVALID");
  for(const mem of state.memories){
   if(!id(mem.sourceRef)||!txt(mem.summary,600)||!txt(mem.learnedAt,100)||!list(mem.knownBy,128))
    throw Error("LAB_SESSION_MEMORY_INVALID");
   for(const field of ["eventTime","sourceActor","confidence","salience","privacy","channel"] as const)
    if(mem[field]!==undefined&&!txt(mem[field],150))throw Error("LAB_SESSION_MEMORY_META_INVALID");
   if(mem.locationId!==undefined&&!id(mem.locationId))throw Error("LAB_SESSION_MEMORY_LOCATION_INVALID");
   if(mem.relayedSourceRef!==undefined&&!id(mem.relayedSourceRef))throw Error("LAB_SESSION_MEMORY_RELAY_INVALID");
   if(mem.perceivedFact!==undefined&&!txt(mem.perceivedFact,600))throw Error("LAB_SESSION_MEMORY_PERCEPTION_INVALID");
  }
  if(new Set(state.memories.map(m=>m.sourceRef)).size!==state.memories.length)throw Error("LAB_SESSION_DUPLICATE_MEMORY");
 }
 if(!Array.isArray(s.events)||s.events.length>256)throw Error("LAB_SESSION_EVENTS_INVALID");
 for(const ev of s.events){
  if(!id(ev.sourceRef)||!txt(ev.summary,600)||!txt(ev.time,100)||!list(ev.knownBy,128)||
     (ev.locationId!==undefined&&!id(ev.locationId))||(ev.kind!==undefined&&!id(ev.kind)))
   throw Error("LAB_SESSION_EVENT_INVALID");
 }
 if(new Set(s.events.map(e=>e.sourceRef)).size!==s.events.length)throw Error("LAB_SESSION_DUPLICATE_EVENT");
 if(s.worldEvents!==undefined){
  if(!Array.isArray(s.worldEvents)||s.worldEvents.length>256)throw Error("LAB_WORLD_JOURNAL_INVALID");
  for(const world of s.worldEvents){
   if(!id(world.sourceRef)||!id(world.npcId)||!pack.npcProfiles[world.npcId]||
    !txt(world.time,100)||!txt(world.action,150)||!txt(world.outcome,400)||
    !["public","hidden"].includes(world.privacy)||
    (world.locationId!==undefined&&(!id(world.locationId)||!pack.locations[world.locationId])))
    throw Error("LAB_WORLD_JOURNAL_ENTRY_INVALID");
  }
 }
 return s;
}
/** Fill convenient read-only inputs from a known session; never silently alter the snapshot. */
export function withSessionDefaults(jobs:LabJob[],session:LabSession):LabJob[]{
 return jobs.map(job=>{
  const args={...job.args};
  if(job.kind==="resources"&&args.current===undefined)args.current=session.player.resources;
  if(job.kind==="route"&&args.discovered===undefined)args.discovered=session.discovered;
  if(["formula","stat","harvest"].includes(job.kind)&&args.variables===undefined)
   args.variables=session.player.stats;
  if(job.kind==="linos"&&args.state===undefined&&session.player.linos!==undefined)
   args.state=session.player.linos;
  if(job.kind==="npc"&&args.knownFactIds===undefined){
   const id=typeof args.npcId==="string"?args.npcId:"";
   args.knownFactIds=session.npcs[id]?.knownFacts??[];
  }
  if(job.kind==="npc"&&args.memoryRefs===undefined){
   const npcId=typeof args.npcId==="string"?args.npcId:"";
   args.memoryRefs=(session.npcs[npcId]?.memories??[]).map(m=>m.sourceRef);
  }
  return {...job,args};
 });
}
