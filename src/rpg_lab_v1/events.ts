/**
 * Confirmed, source-tagged, CAS-ready RPG Lab turn event.
 * Pure function. Never grants preview loot, rewrites canon or touches legacy saves.
 */
import {validateLabSession,type LabSession,type LabMemory,type LabNpcState,type LabWorkOrder} from "./session.ts";
import type {LabPack} from "./engine.ts";
import {noteNpcFeature,type NpcFeatureObservation} from "./npc_perception.ts";
import {validateLabWorldEvidence,type LabWorldEvidenceInput} from "./world_evidence.ts";
import {dueLabWorldProjects,allowedLabProjectTransition,validateLabNpcMood,validateLabWorldProject,
 validateLabNpcDecision,type LabNpcMood,type LabNpcDecision,type LabNpcDecisionStance,
 type LabWorldProject} from "./living_world.ts";
import {newLinosState,validateLinosState,LINOS_RANKS,
 resolveLinosCast,regenerateLinosMp,type LinosAbilityRequest,type LinosState,type LinosScores,
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
   levelUp?:boolean;threadRank?:LinosRank}|
 {type:"audit_reconcile";approved:true;state:LinosState;evidenceRefs:string[]};
export type LabNpcSocialChange={
 npcId:string;
 /** Must cite this NPC's own previously confirmed memory, or new observation in this event. */
 evidenceRefs:string[];
 goal?:string|null;
 relationships?:Record<string,string|null>;
};
export type LabWorkOrderChange={
 orderId:string;expectedVersion:number;record:LabWorkOrder;
 /** Initial registration must cite at least two existing confirmed events. */
 evidenceRefs?:string[];
};
export type LabNpcInteraction={
 initiatorNpcId:string;recipientNpcId:string;action:string;outcome:string;
 salience:"fleeting"|"ordinary"|"important"|"life_defining";
 privacy:"private"|"small_group"|"public";witnessNpcIds?:string[];
};
export type LabIndependentAction={npcId:string;action:string;outcome:string;
 locationId?:string;privacy:"public"|"hidden"};
export type LabNpcDecisionChange={
 npcId:string;subjectId:string;stance:LabNpcDecisionStance;reason:string;
 evidenceRefs:string[];privacy:"public"|"private";nextReviewMinute?:number;
};
export type LabNpcMoodChange={
 npcId:string;evidenceRefs:string[];
 mood:null|{label:string;intensity:number;settleAfterMinute?:number;context?:string};
};
export type LabWorldProjectChange={projectId:string;expectedRevision:number;record:LabWorldProject};
export type LabConfirmedEvent={
 sourceRef:string;time:string;summary:string;kind:string;locationId?:string;
 knownBy:string[];observations?:LabNpcObservation[];
 features?:NpcFeatureObservation[];linos?:LabLinosTurn;
 worldActions?:LabIndependentAction[];
 npcInteractions?:LabNpcInteraction[];
 npcSocial?:LabNpcSocialChange[];
 moodChanges?:LabNpcMoodChange[];
 npcDecisionChanges?:LabNpcDecisionChange[];
 worldProjectChanges?:LabWorldProjectChange[];
 worldEvidence?:LabWorldEvidenceInput[];
 workOrderChanges?:LabWorkOrderChange[];
 discovered?:string[];playerLocationId?:string;
 effects?:{resources?:Record<string,number>;inventory?:Record<string,number>};
 gmConfirmed:true;
};
const channels=["seen","heard","experienced","report","rumor","deduction"];
/** A narrative clock may be D1 HH:MM or Day 1 HH:MM. Nonmatching clocks
 * remain opaque, rather than enforcing an invented real-world timestamp. */
export function narrativeMinute(s:string):number|null{
 const match=/^(?:D\s*|Day\s+|День\s+)(\d+)\s*,?\s+(\d\d):(\d\d)$/iu.exec(s);
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
 // Once persistent world work exists, every future clock advance must be
 // comparable. An opaque date cannot silently bypass the due-review gate.
 if(Object.values(session.worldProjects??{}).some(p=>
    ["accepted","active","blocked"].includes(p.status))){
   if(previousMinute===null||nextMinute===null)
    throw Error("LAB_WORLD_PROJECT_CLOCK_COMPARABILITY_REQUIRED");
   if(nextMinute-previousMinute>10080&&
      Object.values(session.worldProjects??{}).some(p=>
       p.nextReviewMinute!==undefined&&p.nextReviewMinute<=nextMinute))
    throw Error("LAB_WORLD_PROJECT_CATCHUP_WINDOW_EXCEEDED");
 }
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
  if(!record(action)||!["blessing","cast","time","learn","status_update","audit_reconcile"].includes(action.type))
   throw Error("LAB_LINOS_EVENT_INVALID");
  let state=next.player.linos??newLinosState();
  validateLinosState(state);
  if(action.type==="audit_reconcile"){
   // Recovery is deliberately single-use: ONLY an untouched newLinosState()
   // can be reconciled using at least three already confirmed event references.
   // No cast, blessing or XP is retroactively replayed.
   if(event.kind!=="continuity_repair"||action.approved!==true||
      JSON.stringify(state)!==JSON.stringify(newLinosState())||
      !Array.isArray(action.evidenceRefs)||action.evidenceRefs.length<3||
      action.evidenceRefs.length>12||
      !action.evidenceRefs.every((ref:unknown)=>good(ref)&&session.events.some(ev=>ev.sourceRef===ref))||
      new Set(action.evidenceRefs).size!==action.evidenceRefs.length)
    throw Error("LAB_LINOS_AUDIT_RECONCILE_INVALID");
   const proposed=validateLinosState(action.state);
   if(!proposed.blessed||proposed.level!==1||
      proposed.unlockedSkills.length!==0||
      Object.values(proposed.past).some(x=>x!==0))
    throw Error("LAB_LINOS_AUDIT_RECONCILE_UNSUPPORTED");
   state=structuredClone(proposed);
  }else if(action.type==="blessing"){
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
   if(action.godConfirmed!==true||!state.blessed||event.kind!=="falna_update"||!event.summary||state.unlockedSkills.includes(action.skill))
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
    (mem.firstSeenRef===ref||mem.lastSeenRef===ref);
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
 // Confirmed NPC-to-NPC contact is an independent world event, not flavor
 // revolving around the player. Each participant remembers the interaction,
 // but no claim made during it is silently converted into objective truth.
 const interactions=event.npcInteractions??[];
 if(!Array.isArray(interactions)||interactions.length>12)
  throw Error("LAB_NPC_INTERACTIONS_INVALID");
 for(const interaction of interactions){
  if(!record(interaction)||!good(interaction.initiatorNpcId)||
      !good(interaction.recipientNpcId)||
      interaction.initiatorNpcId===interaction.recipientNpcId||
      !pack.npcProfiles[interaction.initiatorNpcId]||
      !pack.npcProfiles[interaction.recipientNpcId]||
      !phrase(interaction.action,160)||!phrase(interaction.outcome,300)||
      !["private","small_group","public"].includes(interaction.privacy)||
      !["fleeting","ordinary","important","life_defining"].includes(interaction.salience)||
      (interaction.witnessNpcIds!==undefined&&
       (!bounded(interaction.witnessNpcIds,12)||
        interaction.witnessNpcIds.some(x=>!pack.npcProfiles[x]||
          !event.knownBy.includes(x)))))
   throw Error("LAB_NPC_INTERACTION_INVALID");
  const listeners=new Set([interaction.initiatorNpcId,interaction.recipientNpcId,
    ...(interaction.witnessNpcIds??[])]);
  for(const npcId of listeners){
   const state:LabNpcState=next.npcs[npcId]??{knownFacts:[],memories:[]};
   if(state.memories.length>=128||state.knownFacts.length>=128)
    throw Error("LAB_NPC_INTERACTION_MEMORY_FULL");
   const participant=npcId===interaction.initiatorNpcId||
    npcId===interaction.recipientNpcId;
   const text=interaction.action+"; "+interaction.outcome;
   const memory:LabMemory={
    sourceRef:event.sourceRef,summary:text,perceivedFact:text,
    learnedAt:event.time,eventTime:event.time,knownBy:[npcId],
    channel:participant?"experienced":"heard",confidence:"certain",
    salience:interaction.salience,privacy:interaction.privacy,
    sourceActor:interaction.initiatorNpcId,
    ...(event.locationId?{locationId:event.locationId}:{})
   };
   state.memories.push(memory);
   if(!state.knownFacts.includes(event.sourceRef))
    state.knownFacts.push(event.sourceRef);
   next.npcs[npcId]=state;
  }
  next.worldEvents??=[];
  if(next.worldEvents.length>=256)throw Error("LAB_WORLD_JOURNAL_FULL");
  next.worldEvents.push({sourceRef:event.sourceRef,time:event.time,
   npcId:interaction.initiatorNpcId,targetNpcId:interaction.recipientNpcId,
   action:interaction.action,outcome:interaction.outcome,
   privacy:interaction.privacy==="public"?"public":"hidden",
   ...(event.locationId?{locationId:event.locationId}:{})});
 }
 // World-level evidence is scoped: two 2mm tested strands do not prove
 // a claimed 10mm capacity, nor does a breastplate test prove damage to gods.
 const evidence=event.worldEvidence??[];
 if(!Array.isArray(evidence)||evidence.length>24||
   new Set(evidence.map(x=>x.factId)).size!==evidence.length)
  throw Error("LAB_WORLD_EVIDENCE_BATCH_INVALID");
 for(const input of evidence){
  if(!record(input)||!good(input.factId)||
     next.worldEvidence?.[input.factId])
   throw Error("LAB_WORLD_EVIDENCE_DUPLICATE_OR_BAD_ID");
  const fact=validateLabWorldEvidence({...input,sourceRef:event.sourceRef});
  if(fact.observedBy.some(npcId=>!event.knownBy.includes(npcId)||
    !observations.some(o=>o.npcId===npcId&&
     ["seen","heard","experienced"].includes(o.channel))))
   throw Error("LAB_WORLD_EVIDENCE_OBSERVER_NOT_ESTABLISHED");
  if(fact.locationId!==undefined&&!pack.locations[fact.locationId])
   throw Error("LAB_WORLD_EVIDENCE_LOCATION_UNKNOWN");
  if(fact.supersedesFactId!==undefined&&
     (!session.worldEvidence?.[fact.supersedesFactId]||
      fact.supersedesFactId===fact.factId))
   throw Error("LAB_WORLD_EVIDENCE_SUPERSEDED_SOURCE_UNKNOWN");
  next.worldEvidence={...(next.worldEvidence??{}),
   [fact.factId]:fact};
 }
 // Interpretations and current objectives are updated only from the NPC's own
 // confirmed memories. This does not alter immutable canonical personality.
 const social=event.npcSocial??[];
 if(!Array.isArray(social)||social.length>24||
   new Set(social.map(x=>x.npcId)).size!==social.length)
  throw Error("LAB_NPC_SOCIAL_BATCH_INVALID");
 for(const change of social){
  if(!record(change)||!good(change.npcId)||!pack.npcProfiles[change.npcId]||
    !bounded(change.evidenceRefs,12)||change.evidenceRefs.length<1||
    new Set(change.evidenceRefs).size!==change.evidenceRefs.length||
    (change.goal===undefined&&change.relationships===undefined)||
    (change.goal!==undefined&&change.goal!==null&&!phrase(change.goal,300))||
    (change.relationships!==undefined&&
     (!record(change.relationships)||Object.keys(change.relationships).length>12)))
   throw Error("LAB_NPC_SOCIAL_INVALID");
  const state:LabNpcState=next.npcs[change.npcId]??{knownFacts:[],memories:[]};
  if(!change.evidenceRefs.every(ref=>state.memories.some(m=>m.sourceRef===ref)))
   throw Error("LAB_NPC_SOCIAL_UNVERIFIED_MEMORY");
  if(change.goal!==undefined){
   if(change.goal===null)delete state.currentGoal;
   else state.currentGoal=change.goal;
  }
  if(change.relationships!==undefined){
   const relations={...(state.relationships??{})};
   for(const [target,value] of Object.entries(change.relationships)){
    if(!good(target)||(value!==null&&!phrase(value,250)))
     throw Error("LAB_NPC_SOCIAL_RELATION_INVALID");
    if(value===null)delete relations[target];
    else relations[target]=value;
   }
   state.relationships=relations;
  }
  next.npcs[change.npcId]=state;
 }
 // A contract is an obligation, not a second transfer of money or MP.
 // Future updates are CAS-versioned and do not rewrite contractual amounts
 // without the client's direct, explicitly recorded participation.
 const workOrderChanges=event.workOrderChanges??[];
 if(!Array.isArray(workOrderChanges)||workOrderChanges.length>8||
    new Set(workOrderChanges.map(x=>x.orderId)).size!==workOrderChanges.length)
  throw Error("LAB_WORKORDER_CHANGES_INVALID");
 for(const change of workOrderChanges){
  if(!record(change)||!good(change.orderId)||
    !Number.isSafeInteger(change.expectedVersion)||change.expectedVersion<0||
    !record(change.record)||!pack.npcProfiles[change.record.clientNpcId])
   throw Error("LAB_WORKORDER_CHANGE_INVALID");
  const orders=next.player.workOrders??{};
  const old=orders[change.orderId];
  if((old?.version??0)!==change.expectedVersion||
    change.record.version!==change.expectedVersion+1||
    change.record.lastUpdatedRef!==event.sourceRef)
   throw Error("LAB_WORKORDER_VERSION_CONFLICT");
  if(!old){
   if(event.kind!=="continuity_repair"&&event.kind!=="order_contract"&&event.kind!=="player_turn")
    throw Error("LAB_WORKORDER_REGISTER_KIND");
   // Contract evidence survives narrative archiving: the client's own
   // confirmed memories remain in the session after events roll to KV archives.
   const clientMemories=session.npcs[change.record.clientNpcId]?.memories??[];
   if(!bounded(change.evidenceRefs,16)||change.evidenceRefs.length<2||
      new Set(change.evidenceRefs).size!==change.evidenceRefs.length||
      !Array.isArray(change.record.evidenceRefs)||
      !change.record.evidenceRefs.every(ref=>change.evidenceRefs!.includes(ref))||
      !change.evidenceRefs.every(ref=>
       session.events.some(oldEvent=>oldEvent.sourceRef===ref)||
       clientMemories.some(mem=>mem.sourceRef===ref)))
    throw Error("LAB_WORKORDER_SOURCE_UNVERIFIED");
  }else{
   if(JSON.stringify(old.evidenceRefs)!==JSON.stringify(change.record.evidenceRefs))
    throw Error("LAB_WORKORDER_ORIGINAL_EVIDENCE_CHANGED");
   const terms=["clientNpcId","signedAt","totalValis","depositValis",
    "balanceValis","warrantyDays","freeAlterations"] as const;
   const termsChanged=terms.some(k=>old[k]!==change.record[k])||
    old.dueFrom!==change.record.dueFrom||old.dueTo!==change.record.dueTo;
   if(termsChanged&&(!event.knownBy.includes(old.clientNpcId)||
     !observations.some(o=>o.npcId===old.clientNpcId)))
    throw Error("LAB_WORKORDER_RENEGOTIATION_NOT_CONFIRMED");
   const allowed:Record<string,string[]>={
    contracted:["contracted","preparing","cancelled"],
    preparing:["preparing","weaving","ready","cancelled"],
    weaving:["weaving","ready","cancelled"],
    ready:["ready","weaving","delivered","cancelled"],
    delivered:["delivered"],cancelled:["cancelled"]};
   if(!allowed[old.status]?.includes(change.record.status))
    throw Error("LAB_WORKORDER_STATUS_REGRESSION");
  }
  next.player.workOrders={...orders,[change.orderId]:structuredClone(change.record)};
 }
 // Emotional inertia: anger, curiosity and embarrassment never reset merely
 // because the scene ends, the player apologizes or a narrator changes tone.
 const moods=event.moodChanges??[];
 if(!Array.isArray(moods)||moods.length>24||
    new Set(moods.map(x=>x.npcId)).size!==moods.length)
  throw Error("LAB_NPC_MOOD_BATCH_INVALID");
 for(const change of moods){
  if(!record(change)||!good(change.npcId)||!pack.npcProfiles[change.npcId]||
   !bounded(change.evidenceRefs,12)||change.evidenceRefs.length<1||
   new Set(change.evidenceRefs).size!==change.evidenceRefs.length||
   (change.mood!==null&&!record(change.mood)))
   throw Error("LAB_NPC_MOOD_CHANGE_INVALID");
  const state:LabNpcState=next.npcs[change.npcId]??{knownFacts:[],memories:[]};
  if(!change.evidenceRefs.every(ref=>state.memories.some(m=>m.sourceRef===ref)))
   throw Error("LAB_NPC_MOOD_UNVERIFIED_MEMORY");
  if(change.mood===null){
   delete state.mood;
  }else{
   if(nextMinute===null)throw Error("LAB_NPC_MOOD_CLOCK_REQUIRED");
   const m:LabNpcMood={...change.mood,causeRef:event.sourceRef,sinceMinute:nextMinute};
   state.mood=validateLabNpcMood(m);
  }
  next.npcs[change.npcId]=state;
 }
 // Decisions survive interruptions, apologies and narration resets. They may be
 // revised only by another source-linked decision from the same NPC.
 const decisions=event.npcDecisionChanges??[];
 if(!Array.isArray(decisions)||decisions.length>24||
  new Set(decisions.map(d=>d.npcId+"|"+d.subjectId)).size!==decisions.length)
  throw Error("LAB_NPC_DECISION_BATCH_INVALID");
 for(const change of decisions){
  if(!record(change)||!good(change.npcId)||!pack.npcProfiles[change.npcId]||
      !good(change.subjectId)||!phrase(change.reason,320)||
      !bounded(change.evidenceRefs,12)||change.evidenceRefs.length<1||
      !["public","private"].includes(change.privacy)||nextMinute===null)
   throw Error("LAB_NPC_DECISION_CHANGE_INVALID");
  const state:LabNpcState=next.npcs[change.npcId]??{knownFacts:[],memories:[]};
  const ownAction=event.worldActions?.some(a=>a.npcId===change.npcId)===true;
  if(!change.evidenceRefs.every(ref=>state.memories.some(m=>m.sourceRef===ref)||
     (ref===event.sourceRef&&ownAction)))
   throw Error("LAB_NPC_DECISION_UNVERIFIED_EVIDENCE");
  const old=state.decisions?.[change.subjectId];
  if(!old&&Object.keys(state.decisions??{}).length>=32)
   throw Error("LAB_NPC_DECISION_LIMIT");
  const decision:LabNpcDecision={
   subjectId:change.subjectId,stance:change.stance,reason:change.reason,
   sourceRef:event.sourceRef,madeAtMinute:nextMinute,
   revision:(old?.revision??0)+1,privacy:change.privacy,
   ...(change.nextReviewMinute!==undefined?{nextReviewMinute:change.nextReviewMinute}:{})
  };
  state.decisions={...(state.decisions??{}),
   [change.subjectId]:validateLabNpcDecision(decision)};
  next.npcs[change.npcId]=state;
 }
 // Stateful NPC/faction work. Nothing advances in the background simply because
 // the narrator says "we will test it"; advancing world time requires review
 // of every overdue accepted task, or an explicit grounded closure.
 const projectChanges=event.worldProjectChanges??[];
 if(!Array.isArray(projectChanges)||projectChanges.length>24||
    new Set(projectChanges.map(x=>x.projectId)).size!==projectChanges.length)
   throw Error("LAB_WORLD_PROJECT_CHANGE_BATCH_INVALID");
 for(const change of projectChanges){
  if(!record(change)||!good(change.projectId)||
     !Number.isSafeInteger(change.expectedRevision)||change.expectedRevision<0||
     !record(change.record)||nextMinute===null)
    throw Error("LAB_WORLD_PROJECT_CHANGE_INVALID");
  const prev=session.worldProjects?.[change.projectId];
  if((prev?.revision??0)!==change.expectedRevision||
     change.record.revision!==change.expectedRevision+1||
     change.record.latestEvidenceRef!==event.sourceRef||
     change.record.lastReviewMinute!==nextMinute)
    throw Error("LAB_WORLD_PROJECT_REVISION_CONFLICT");
  const candidate=validateLabWorldProject(change.projectId,change.record,pack);
  if(candidate.startedMinute>nextMinute)
    throw Error("LAB_WORLD_PROJECT_FUTURE_START");
  if(prev){
   if(candidate.ownerNpcId!==prev.ownerNpcId||candidate.originRef!==prev.originRef||
      candidate.startedMinute!==prev.startedMinute||
      !allowedLabProjectTransition(prev.status,candidate.status)||
      prev.status==="completed"||prev.status==="rejected"||prev.status==="cancelled")
    throw Error("LAB_WORLD_PROJECT_TRANSITION_INVALID");
  }else{
   if(candidate.startedMinute!==nextMinute||candidate.originRef!==event.sourceRef)
    throw Error("LAB_WORLD_PROJECT_ORIGIN_INVALID");
   const witnessedAcceptance=event.knownBy.includes(candidate.ownerNpcId)&&
    observations.some(o=>o.npcId===candidate.ownerNpcId&&
     ["seen","heard","experienced"].includes(o.channel));
   const independentAcceptance=event.worldActions?.some(a=>
    a.npcId===candidate.ownerNpcId);
   if(!witnessedAcceptance&&!independentAcceptance)
    throw Error("LAB_WORLD_PROJECT_OWNER_UNAWARE");
  }
  // Direct participation or an established responsibility is required. A player
  // cannot assign arbitrary private work to a total stranger through narration.
  if(!prev&&!["proposed","accepted"].includes(candidate.status))
   throw Error("LAB_WORLD_PROJECT_INITIAL_STATUS");
  if(prev&&!event.worldActions?.some(a=>a.npcId===candidate.ownerNpcId)&&
      !observations.some(o=>o.npcId===candidate.ownerNpcId)&&
      !event.npcInteractions?.some(a=>a.initiatorNpcId===candidate.ownerNpcId||
       a.recipientNpcId===candidate.ownerNpcId))
   throw Error("LAB_WORLD_PROJECT_NO_OWNER_ACTION");
  next.worldProjects={...(next.worldProjects??{}),
    [change.projectId]:structuredClone(candidate)};
 }
 if(nextMinute!==null&&previousMinute!==null&&nextMinute>previousMinute){
  const due=dueLabWorldProjects(session.worldProjects,nextMinute);
  const reviewed=new Set(projectChanges.map(p=>p.projectId));
  if(due.some(p=>!reviewed.has(p.projectId)))
    throw Error("LAB_WORLD_PROJECT_REVIEW_REQUIRED:"+due.filter(p=>!reviewed.has(p.projectId))
     .map(p=>p.projectId).join(","));
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
