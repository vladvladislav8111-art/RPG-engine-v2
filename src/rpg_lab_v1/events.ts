/**
 * Confirmed, source-tagged, CAS-ready RPG Lab turn event.
 * Pure function. Never grants preview loot, rewrites canon or touches legacy saves.
 */
import {validateLabSession,type LabSession,type LabMemory,type LabNpcState} from "./session.ts";
import type {LabPack} from "./engine.ts";
import {noteNpcFeature,type NpcFeatureObservation} from "./npc_perception.ts";
import {newLinosState,validateLinosState,LINOS_RANKS,
 resolveLinosCast,regenerateLinosMp,type LinosAbilityRequest,type LinosScores,
 type LinosRank,type LinosSkill} from "./linos.ts";
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const good=(s:unknown):s is string=>typeof s==="string"&&ID.test(s)&&!["constructor","prototype","__proto__"].includes(s);
const phrase=(s:unknown,max:number):s is string=>typeof s==="string"&&s.length>0&&s.length<=max;
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const bounded=(x:unknown,max:number):x is string[]=>Array.isArray(x)&&x.length<=max&&x.every(good);
export type LabNpcObservation={
 npcId:string;channel:"seen"|"heard"|"experienced"|"report"|"rumor"|"deduction";
 perceivedFact:string;learnedAt:string;sourceActor?:string;relayedSourceRef?:string;
 confidence:"certain"|"likely"|"uncertain"|"doubted"|"disproved";
 salience:"fleeting"|"ordinary"|"important"|"life_defining";
 privacy:"private"|"small_group"|"public";
};
export type LabLinosTurn=
 {type:"blessing";godConfirmed:true}|
 {type:"cast";request:LinosAbilityRequest}|
 {type:"time";mode:"quiet"|"combat"|"thread_use"}|
 {type:"learn";skill:LinosSkill;godConfirmed:true}|
 {type:"status_update";godConfirmed:true;current?:LinosScores;
   levelUp?:boolean;threadRank?:LinosRank};
export type LabIndependentAction={npcId:string;action:string;outcome:string;
 locationId?:string;privacy:"public"|"hidden"};
export type LabConfirmedEvent={
 sourceRef:string;time:string;summary:string;kind:string;locationId?:string;
 knownBy:string[];observations?:LabNpcObservation[];
 features?:NpcFeatureObservation[];linos?:LabLinosTurn;
 worldActions?:LabIndependentAction[];
 discovered?:string[];playerLocationId?:string;
 effects?:{resources?:Record<string,number>;inventory?:Record<string,number>};
 gmConfirmed:true;
};
const channels=["seen","heard","experienced","report","rumor","deduction"];
/** A narrative clock may be D1 HH:MM or Day 1 HH:MM. Nonmatching clocks
 * remain opaque, rather than enforcing an invented real-world timestamp. */
export function narrativeMinute(s:string):number|null{
 const match=/^(?:D|Day\s+)(\d+)\s+(\d\d):(\d\d)$/i.exec(s);
 if(!match)return null;
 const day=Number(match[1]),hour=Number(match[2]),minute=Number(match[3]);
 if(!Number.isSafeInteger(day)||day<0||day>100000||hour>23||minute>59)return null;
 return day*1440+hour*60+minute;
}
/** The new Linos event stream requires comparable clocks to prevent free
 * regeneration from narratively ambiguous time jumps. */
function nextTimeValid(after:string,before:string):boolean{
 const a=narrativeMinute(after),b=narrativeMinute(before);
 return a!==null&&b!==null&&a>=b;
}

export function applyConfirmedLabEvent(session:LabSession,pack:LabPack,event:LabConfirmedEvent):LabSession{
 validateLabSession(session,pack);
 if(!record(event)||event.gmConfirmed!==true||!good(event.sourceRef)||!good(event.kind)||
    !phrase(event.time,100)||!phrase(event.summary,600)||!bounded(event.knownBy,60))
  throw Error("LAB_EVENT_CONFIRMATION_REQUIRED");
 if(event.locationId!==undefined&&(!good(event.locationId)||!pack.locations[event.locationId]))
  throw Error("LAB_EVENT_LOCATION_INVALID");
 if(event.playerLocationId!==undefined&&(!good(event.playerLocationId)||!pack.locations[event.playerLocationId]))
  throw Error("LAB_EVENT_PLAYER_LOCATION_INVALID");
 const previousMinute=narrativeMinute(session.gameClock),nextMinute=narrativeMinute(event.time);
 if(previousMinute!==null&&nextMinute!==null&&nextMinute<previousMinute)
  throw Error("LAB_EVENT_CLOCK_REGRESSION");
 if(session.events.some(e=>e.sourceRef===event.sourceRef))throw Error("LAB_EVENT_ALREADY_APPLIED");
 if(session.events.length>=256)throw Error("LAB_EVENT_JOURNAL_FULL");
 if(new Set(event.knownBy).size!==event.knownBy.length||event.knownBy.some(k=>!pack.npcProfiles[k]))
  throw Error("LAB_EVENT_WITNESS_INVALID");
 if(event.linos!==undefined){
  if(pack.worldId!=="danmachi.orario"||!nextTimeValid(event.time,session.gameClock))
   throw Error("LAB_LINOS_TIME_INVALID");
 }
 const observations=event.observations??[];
 if(!Array.isArray(observations)||observations.length>32)throw Error("LAB_EVENT_OBSERVATIONS_INVALID");
 if(new Set(observations.map(x=>x.npcId)).size!==observations.length)
  throw Error("LAB_EVENT_DUPLICATE_NPC_OBSERVATION");
 const next=structuredClone(session);
 if(event.linos!==undefined){
  const action=event.linos;
  if(!record(action)||!["blessing","cast","time","learn","status_update"].includes(action.type))
   throw Error("LAB_LINOS_EVENT_INVALID");
  let state=next.player.linos??newLinosState();
  validateLinosState(state);
  if(action.type==="blessing"){
   if(action.godConfirmed!==true||state.blessed||event.kind!=="blessing")
    throw Error("LAB_LINOS_BLESSING_INVALID");
   state={...state,blessed:true,level:1};
  }else if(action.type==="cast"){
   state=resolveLinosCast(state,action.request);
  }else if(action.type==="time"){
   const earlier=narrativeMinute(session.gameClock),later=narrativeMinute(event.time);
   if(earlier===null||later===null||later<earlier)
    throw Error("LAB_LINOS_TIME_UNVERIFIED");
   state=regenerateLinosMp(state,later-earlier,action.mode).state;
  }else if(action.type==="learn"){
   if(action.godConfirmed!==true||!state.blessed||!event.summary||state.unlockedSkills.includes(action.skill))
    throw Error("LAB_LINOS_LEARNING_INVALID");
   if(!["optical_new","optical_hide","magic_drive","living_network",
    "cutting_loop","web_regeneration","healing_cocoon","draining_bindings",
    "microspikes","sensory_network","recolor"].includes(action.skill))
     throw Error("LAB_LINOS_SKILL_INVALID");
   state={...state,unlockedSkills:[...state.unlockedSkills,action.skill]};
  }else if(action.type==="status_update"){
   if(action.godConfirmed!==true||!state.blessed||event.kind!=="falna_update")
    throw Error("LAB_LINOS_STATUS_UPDATE_INVALID");
   if(action.levelUp){
    if(!Object.values(state.current).some(x=>x>=500)||state.level>=10||action.current!==undefined)
     throw Error("LAB_LINOS_LEVELUP_INVALID");
    const past={...state.past};
    for(const stat of ["str","end","dex","agi","mag"] as const)past[stat]+=state.current[stat];
    state={...state,level:state.level+1,past,current:{str:0,end:0,dex:0,agi:0,mag:0}};
   }else if(action.current){
    for(const stat of ["str","end","dex","agi","mag"] as const){
     if(!Number.isInteger(action.current[stat])||action.current[stat]<state.current[stat]||
       action.current[stat]>1999)throw Error("LAB_LINOS_STATUS_SCORE_INVALID");
    }
    state={...state,current:{...action.current}};
   }
   if(action.threadRank!==undefined){
    const old=state.threadRank?LINOS_RANKS.indexOf(state.threadRank):-1;
    const index=LINOS_RANKS.indexOf(action.threadRank);
    if(index<0||index>old+1||index<=old)throw Error("LAB_LINOS_RANK_PROGRESS_INVALID");
    state={...state,threadRank:action.threadRank};
   }
  }
  next.player.linos=validateLinosState(state);
 }
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
 const features=event.features??[];
 if(!Array.isArray(features)||features.length>24)throw Error("LAB_FEATURE_BATCH_INVALID");
 if(new Set(features.map(x=>x.npcId+"|"+x.featureId)).size!==features.length)
  throw Error("LAB_FEATURE_DUPLICATE_OBSERVATION");
 for(const feature of features){
  if(!record(feature)||!good(feature.npcId)||!pack.npcProfiles[feature.npcId]||
    !good(feature.featureId))throw Error("LAB_FEATURE_OBSERVATION_INVALID");
  const npc=next.npcs[feature.npcId]??{knownFacts:[],memories:[]};
  const old=npc.perceptions?.[feature.featureId];
  if(!old&&Object.keys(npc.perceptions??{}).length>=32)throw Error("LAB_FEATURE_COUNT_LIMIT");
  // Provenance must predate this turn, or the source must have actually
  // observed the same feature earlier in this confirmed event.
  const hasSourceObserved=(actor:string,featureId:string,ref:string)=>{
   if(ref===event.sourceRef&&event.knownBy.includes(actor))
    return features.some(x=>x.npcId===actor&&x.featureId===featureId&&x.channel==="seen");
   const mem=session.npcs[actor]?.perceptions?.[featureId];
   return !!mem&&mem.notices>0&&
    (mem.firstSeenRef===ref||mem.lastSeenRef===ref||
     session.events.some(e=>e.sourceRef===ref));
  };
  const known=noteNpcFeature(old,feature,event.sourceRef,event.knownBy,{hasSourceObserved});
  npc.perceptions={...(npc.perceptions??{}),[feature.featureId]:known};
  next.npcs[feature.npcId]=npc;
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
  if(observation.relayedSourceRef!==undefined){
   if(direct||!good(observation.relayedSourceRef)||!pack.npcProfiles[observation.sourceActor??""])
    throw Error("LAB_EVENT_RELAY_INVALID");
   const src=observation.sourceActor!;
   const witnessNow=event.sourceRef===observation.relayedSourceRef&&event.knownBy.includes(src);
   const remembered=!!session.npcs[src]?.memories.some(m=>m.sourceRef===observation.relayedSourceRef);
   if(!witnessNow&&!remembered)throw Error("LAB_EVENT_RELAY_SOURCE_UNVERIFIED");
  }
  const state:LabNpcState=next.npcs[observation.npcId]??{knownFacts:[],memories:[]};
  if(state.memories.length>=128)throw Error("LAB_EVENT_NPC_MEMORY_FULL");
  const memory:LabMemory={
   sourceRef:event.sourceRef,summary:observation.perceivedFact,
   perceivedFact:observation.perceivedFact,learnedAt:observation.learnedAt,
   eventTime:event.time,knownBy:[observation.npcId],
   channel:observation.channel,confidence:observation.confidence,
   salience:observation.salience,privacy:observation.privacy,
   ...(observation.sourceActor?{sourceActor:observation.sourceActor}:{}),
   ...(observation.relayedSourceRef?{relayedSourceRef:observation.relayedSourceRef}:{}),
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
 const worldActions=event.worldActions??[];
 if(!Array.isArray(worldActions)||worldActions.length>12)throw Error("LAB_WORLD_ACTIONS_INVALID");
 if(worldActions.length){
  next.worldEvents??=[];
  if(next.worldEvents.length+worldActions.length>256)throw Error("LAB_WORLD_JOURNAL_FULL");
  for(const act of worldActions){
   if(!record(act)||!good(act.npcId)||!pack.npcProfiles[act.npcId]||
    !phrase(act.action,150)||!phrase(act.outcome,400)||
    !["public","hidden"].includes(act.privacy)||
    (act.locationId!==undefined&&(!good(act.locationId)||!pack.locations[act.locationId])))
    throw Error("LAB_WORLD_ACTION_INVALID");
   next.worldEvents.push({sourceRef:event.sourceRef,time:event.time,npcId:act.npcId,
    action:act.action,outcome:act.outcome,privacy:act.privacy,
    ...(act.locationId?{locationId:act.locationId}:{})});
  }
 }
 next.events.push({sourceRef:event.sourceRef,kind:event.kind,summary:event.summary,
  time:event.time,knownBy:[...event.knownBy],
  ...(event.locationId?{locationId:event.locationId}:{})});
 next.gameClock=event.time;
 validateLabSession(next,pack);
 return next;
}
