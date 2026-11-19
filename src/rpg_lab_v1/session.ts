/** Explicit, isolated per-campaign snapshot with source-tagged NPC memory.
 * No inferred NPC feelings; manual edits are user-provided state, not canonical proof.
 */
import type {LabPack,LabJob} from "./engine.ts";
import {validateLabAmbientRumor,type LabAmbientRumor} from "./ambient_rumors.ts";
import {validateLabNpcAdaptation,type LabNpcAdaptationState} from "./npc_adaptation.ts";
import {validateLinosState,type LinosState} from "./linos.ts";
import {validateFeatureMemory,type NpcFeatureMemory} from "./npc_perception.ts";
import {validateLabSocialVector,type LabSocialVector} from "./social_dynamics_v2.ts";
import {validateLabWorldEvidence,type LabWorldEvidence} from "./world_evidence.ts";
import {validateLabPlayerFog,type LabPlayerFog} from "./fog_of_war.ts";
import {validateLabStoryState,type LabStoryState} from "./story_consequences.ts";
import {validateLabNpcMood,validateLabWorldProject,validateLabNpcDecision,
 type LabNpcMood,type LabWorldProject,type LabNpcDecision} from "./living_world.ts";
export type LabMemory={sourceRef:string;summary:string;learnedAt:string;knownBy:string[];
  eventTime?:string;locationId?:string;channel?:string;sourceActor?:string;relayedSourceRef?:string;
  confidence?:string;salience?:string;privacy?:string;perceivedFact?:string;
 };
/** Permanent player-identity cues, NOT automatic awareness in every NPC.
 * Obvious means potentially perceptible in a scene, not automatically seen.
 */
export type LabPlayerFeature={
 description:string;significance:"routine"|"notable"|"transformative";
 visibility:"obvious"|"conditional";revision:number;lastUpdatedRef:string;
};
export type LabNpcState={knownFacts:string[];memories:LabMemory[];currentGoal?:string;
 relationships?:Record<string,string>;perceptions?:Record<string,NpcFeatureMemory>;
 mood?:LabNpcMood;decisions?:Record<string,LabNpcDecision>;
 socialDynamics?:Record<string,LabSocialVector>;
 adaptations?:Record<string,LabNpcAdaptationState>;
 locationId?:string;locationSourceRef?:string;};
/** Explicit commercial commitments. Amounts are ledger facts, NOT cash effects. */
export type LabWorkOrder={
 title:string;clientNpcId:string;signedAt:string;dueFrom:string;dueTo:string;
 totalValis:number;depositValis:number;balanceValis:number;
 warrantyDays:number;freeAlterations:number;
 status:"contracted"|"preparing"|"weaving"|"ready"|"delivered"|"cancelled";
 material:{diameterMm:number;minMeters:number;maxMeters:number;accuracy:"exact"|"range"};
 notes?:string;version:number;lastUpdatedRef:string;evidenceRefs:string[];
};
export type LabSession={
 schema:"RPG_LAB_SESSION_V1";projectId:string;sessionId:string;gameClock:string;
 /** New sessions default strict; legacy sessions without this flag remain compatible. */
 roleplayGuard?:"strict";
 player:{resources:Record<string,number>;stats:Record<string,number>;inventory:Record<string,number>;locationId?:string;linos?:LinosState;workOrders?:Record<string,LabWorkOrder>;visibleFeatures?:Record<string,LabPlayerFeature>};
 discovered:string[];npcs:Record<string,LabNpcState>;worldProjects?:Record<string,LabWorldProject>;worldEvidence?:Record<string,LabWorldEvidence>;
 playerFog?:LabPlayerFog;storyState?:LabStoryState;
 ambientRumors?:Record<string,LabAmbientRumor>;
 events:{sourceRef:string;summary:string;time:string;knownBy:string[];locationId?:string;kind?:string}[];
 worldEvents?:{sourceRef:string;time:string;npcId:string;targetNpcId?:string;action:string;outcome:string;locationId?:string;privacy:"public"|"hidden"}[];
 archivedEventCount?:number;
};
const id=(v:unknown)=>typeof v==="string"&&/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(v)&&!["constructor","prototype","__proto__"].includes(v);
const list=(v:unknown,max:number)=>Array.isArray(v)&&v.length<=max&&v.every(id);
const map=(v:unknown,max:number)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length<=max&&Object.keys(v).every(id);
const n=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1e12;
const txt=(v:unknown,max:number)=>typeof v==="string"&&v.length>0&&v.length<=max;
/** Active session limit in UTF-16 code units. Historical turns are archived
 * separately; ongoing NPC memory still needs room to grow between archives.
 * Codec handles larger compressed snapshots as individually bounded KV chunks. */
export const LAB_SESSION_MAX_TEXT_UNITS=1000000;
export function validateLabSession(s:LabSession,pack:LabPack):LabSession{
 if(!s||s.schema!=="RPG_LAB_SESSION_V1"||!id(s.sessionId)||!txt(s.gameClock,100))
  throw Error("LAB_SESSION_SCHEMA");
 if(s.projectId!==pack.projectId)throw Error("LAB_SESSION_PROJECT_MISMATCH");
 if(s.roleplayGuard!==undefined&&s.roleplayGuard!=="strict")
  throw Error("LAB_ROLEPLAY_GUARD_INVALID");
 if(JSON.stringify(s).length>LAB_SESSION_MAX_TEXT_UNITS)
  throw Error("LAB_SESSION_SIZE_LIMIT");
 if(!s.player||!map(s.player.resources,128)||!map(s.player.stats,128)||!map(s.player.inventory,500))throw Error("LAB_SESSION_PLAYER_INVALID");
 if(s.player.visibleFeatures!==undefined){
  if(!map(s.player.visibleFeatures,48))throw Error("LAB_PLAYER_FEATURES_INVALID");
  for(const [featureId,feature] of Object.entries(s.player.visibleFeatures)){
   if(!id(featureId)||!feature||!txt(feature.description,280)||
     !["routine","notable","transformative"].includes(feature.significance)||
     !["obvious","conditional"].includes(feature.visibility)||
     !Number.isSafeInteger(feature.revision)||feature.revision<1||feature.revision>10000||
     !id(feature.lastUpdatedRef))
     throw Error("LAB_PLAYER_FEATURE_INVALID:"+featureId);
  }
 }
 if(s.player.workOrders!==undefined){
  if(!map(s.player.workOrders,60))throw Error("LAB_WORKORDER_MAP_INVALID");
  for(const [orderId,order] of Object.entries(s.player.workOrders)){
   const material=order?.material;
   if(!order||!pack.npcProfiles[order.clientNpcId]||
      !txt(order.title,120)||!txt(order.signedAt,100)||
      !txt(order.dueFrom,100)||!txt(order.dueTo,100)||
      !Number.isSafeInteger(order.version)||order.version<1||order.version>10000||
      !id(order.lastUpdatedRef)||!list(order.evidenceRefs,16)||order.evidenceRefs.length<2||
      new Set(order.evidenceRefs).size!==order.evidenceRefs.length||
      !["contracted","preparing","weaving","ready","delivered","cancelled"].includes(order.status)||
      !n(order.totalValis)||!n(order.depositValis)||!n(order.balanceValis)||
      !Number.isInteger(order.totalValis)||!Number.isInteger(order.depositValis)||
      !Number.isInteger(order.balanceValis)||
      order.depositValis>order.totalValis||
      order.balanceValis!==order.totalValis-order.depositValis||
      !Number.isInteger(order.warrantyDays)||order.warrantyDays<0||order.warrantyDays>3650||
      !Number.isInteger(order.freeAlterations)||order.freeAlterations<0||order.freeAlterations>100||
      !material||!n(material.diameterMm)||material.diameterMm<0.01||material.diameterMm>100||
      !n(material.minMeters)||!n(material.maxMeters)||material.minMeters>material.maxMeters||
      material.maxMeters>1000000000||!["exact","range"].includes(material.accuracy)||
      (material.accuracy==="exact"&&material.minMeters!==material.maxMeters)||
      (order.notes!==undefined&&!txt(order.notes,400)))
    throw Error("LAB_WORKORDER_INVALID:"+orderId);
  }
 }
 if(s.player.locationId!==undefined&&( !id(s.player.locationId)||!pack.locations[s.player.locationId]))throw Error("LAB_SESSION_LOCATION_INVALID");
 if(s.player.linos!==undefined){if(pack.worldId!=="danmachi.orario")throw Error("LAB_LINOS_WRONG_WORLD");validateLinosState(s.player.linos);}
 for(const [k,v] of Object.entries(s.player.resources)){if(!n(v)||!pack.resources[k]||v<pack.resources[k].min||v>pack.resources[k].max)throw Error("LAB_SESSION_RESOURCE_INVALID");}
 for(const v of Object.values(s.player.stats))if(!n(v))throw Error("LAB_SESSION_STAT_INVALID");
 for(const v of Object.values(s.player.inventory))if(!n(v)||!Number.isInteger(v))throw Error("LAB_SESSION_ITEM_INVALID");
 if(!list(s.discovered,500)||s.discovered.some(k=>!pack.locations[k]))throw Error("LAB_SESSION_DISCOVERY_INVALID");
 if(s.playerFog!==undefined)validateLabPlayerFog(s.playerFog,pack);
 if(s.storyState!==undefined)validateLabStoryState(s.storyState,pack);
 if(s.worldEvidence!==undefined){
  if(!map(s.worldEvidence,256))throw Error("LAB_WORLD_EVIDENCE_MAP_INVALID");
  for(const [factId,fact] of Object.entries(s.worldEvidence)){
   if(factId!==fact.factId)throw Error("LAB_WORLD_EVIDENCE_KEY_MISMATCH");
   validateLabWorldEvidence(fact);
   if(fact.locationId!==undefined&&!pack.locations[fact.locationId])
    throw Error("LAB_WORLD_EVIDENCE_LOCATION_UNKNOWN");
   if(fact.observedBy.some(npcId=>!pack.npcProfiles[npcId]))
    throw Error("LAB_WORLD_EVIDENCE_OBSERVER_UNKNOWN");
  }
 }
 if(s.ambientRumors!==undefined){
  if(!map(s.ambientRumors,128))throw Error("LAB_AMBIENT_RUMOR_MAP_INVALID");
  for(const [rumorId,rumor] of Object.entries(s.ambientRumors)){
   if(rumorId!==rumor.rumorId)throw Error("LAB_AMBIENT_RUMOR_ID_MISMATCH");
   validateLabAmbientRumor(rumor,pack);
   if(rumor.parentRumorId!==undefined&&!s.ambientRumors[rumor.parentRumorId])
    throw Error("LAB_AMBIENT_RUMOR_PARENT_UNKNOWN");
  }
 }
 if(s.worldProjects!==undefined){
  if(!map(s.worldProjects,128))throw Error("LAB_WORLD_PROJECTS_INVALID");
  for(const [projectId,project] of Object.entries(s.worldProjects))
   validateLabWorldProject(projectId,project,pack);
 }
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
  if(state.mood!==undefined)validateLabNpcMood(state.mood);
  if(state.decisions!==undefined){
   if(!map(state.decisions,32))throw Error("LAB_NPC_DECISIONS_INVALID");
   for(const [subjectId,decision] of Object.entries(state.decisions)){
    if(subjectId!==decision.subjectId)throw Error("LAB_NPC_DECISION_KEY_MISMATCH");
    validateLabNpcDecision(decision);
   }
  }
  if(state.adaptations!==undefined){
   if(!map(state.adaptations,8))throw Error("LAB_ADAPTATIONS_MAP_INVALID");
   const allowed=pack.npcProfiles[npcId].adaptiveAxes??[];
   for(const [axisId,adapt] of Object.entries(state.adaptations)){
    if(!allowed.some(axis=>axis.axisId===axisId))
     throw Error("LAB_ADAPTATION_AXIS_NOT_ALLOWED");
    validateLabNpcAdaptation(axisId,adapt);
    if(adapt.evidenceRefs.some(ref=>!state.memories.some(m=>m.sourceRef===ref)))
     throw Error("LAB_ADAPTATION_MEMORY_MISSING");
   }
  }
  if(state.socialDynamics!==undefined){
   if(!map(state.socialDynamics,80))throw Error("LAB_NPC_SOCIAL_VECTORS_INVALID");
   for(const [towardId,vector] of Object.entries(state.socialDynamics)){
    if(towardId===npcId||!pack.npcProfiles[towardId])
     throw Error("LAB_NPC_SOCIAL_TARGET_UNKNOWN");
    validateLabSocialVector(towardId,vector);
   }
  }
  if(state.locationId!==undefined&&(!id(state.locationId)||!pack.locations[state.locationId]))
   throw Error("LAB_NPC_LOCATION_INVALID");
  if(state.locationSourceRef!==undefined&&
    (!id(state.locationSourceRef)||state.locationId===undefined))
   throw Error("LAB_NPC_LOCATION_SOURCE_INVALID");
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
 if(s.archivedEventCount!==undefined&&(!Number.isSafeInteger(s.archivedEventCount)||s.archivedEventCount<0||s.archivedEventCount>10000000))throw Error("LAB_SESSION_ARCHIVE_COUNT_INVALID");
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
    (world.targetNpcId!==undefined&&(!id(world.targetNpcId)||!pack.npcProfiles[world.targetNpcId]||world.targetNpcId===world.npcId))||
    !txt(world.time,100)||!txt(world.action,150)||!txt(world.outcome,400)||
    !["public","hidden"].includes(world.privacy)||
    (world.locationId!==undefined&&(!id(world.locationId)||!pack.locations[world.locationId])))
    throw Error("LAB_WORLD_JOURNAL_ENTRY_INVALID");
  }
 }
 return s;
}
/** The direct snapshot writer predates strict RPG Lab. It remains available
 * only for legacy sessions; guarded sessions must use the event CAS path.
 */
export function assertLabDirectSessionPutAllowed(
 previous:LabSession|null,candidate:LabSession){
 if(previous?.roleplayGuard==="strict")
  throw Error("LAB_STRICT_SESSION_PUT_FORBIDDEN");
 if(candidate.roleplayGuard==="strict")
  throw Error("LAB_STRICT_SESSION_CREATE_OR_UPGRADE_FORBIDDEN");
 return true;
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
  if(job.kind==="scene_brief")args.session=session;
  if(job.kind==="world_tick"){
   args.session=session;
   args.worldProjects=session.worldProjects??{};
   args.discovered=session.discovered;
   args.sessionId=session.sessionId;
  }
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
