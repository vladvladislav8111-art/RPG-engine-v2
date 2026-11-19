/** Non-railroaded story consequences for RPG Lab.
 * Canon arcs are conditional opportunities, not mandatory cutscenes.
 * Falna gains, fighting technique, personal ties and story history are distinct.
 */
import type {LabPack} from "./engine.ts";
import type {LabSession} from "./session.ts";
import type {LabConfirmedEvent} from "./events.ts";
export type LabStoryBeatDef={
 beatId:string;description:string;
 requiresFlags?:string[];blocksFlags?:string[];
 requiresTechnique?:{trainingId:string;minGrade:"basic"|"trained"|"proficient"};
 alternativeTo?:string;
 dramaticQuestion:string;
 possibleConsequences:string[];
};
export type LabStoryArcDef={
 title:string;era:string;summary:string;canonAnchor:string;
 entryArc?:string;beats:LabStoryBeatDef[];
 mutuallyExclusiveFlags?:string[][];
};
export type LabStoryFlag={value:boolean;sourceRef:string;at:string;revision:number};
export type LabStoryArcProgress={
 phase:"active"|"resolved"|"diverged";completedBeats:string[];
 routeId?:string;lastSourceRef:string;revision:number;
};
export type LabTechniqueProgress={
 traineeNpcId:string;mentorNpcId:string;discipline:string;
 totalMinutes:number;successfulSessions:number;
 technique:"introduced"|"basic"|"trained"|"proficient";
 sourceRef:string;revision:number;
};
export type LabStoryState={
 flags:Record<string,LabStoryFlag>;
 arcs:Record<string,LabStoryArcProgress>;
 techniques:Record<string,LabTechniqueProgress>;
};
export type LabStoryFlagChange={
 flagId:string;expectedRevision:number;value:boolean;
 evidenceRefs:string[];
};
export type LabStoryArcChange={
 arcId:string;expectedRevision:number;phase:LabStoryArcProgress["phase"];
 beatId:string;routeId?:string;evidenceRefs:string[];
};
export type LabTechniqueTraining={
 trainingId:string;traineeNpcId:string;mentorNpcId:string;
 discipline:string;expectedRevision:number;
 sessionMinutes:number;passedDrill:boolean;
};
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const okId=(s:unknown):s is string=>typeof s==="string"&&ID.test(s)&&
 !["constructor","prototype","__proto__"].includes(s);
const isText=(s:unknown,n:number)=>typeof s==="string"&&s.trim().length>0&&s.length<=n;
const revisions=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<10000;
const refs=(a:unknown,max=16):a is string[]=>Array.isArray(a)&&
 a.length>0&&a.length<=max&&a.every(okId)&&new Set(a).size===a.length;
export function validateLabStoryDefs(defs:Record<string,LabStoryArcDef>){
 if(!defs||typeof defs!=="object"||Array.isArray(defs)||
  Object.keys(defs).length>48)throw Error("LAB_STORY_DEFS_INVALID");
 for(const [arcId,def] of Object.entries(defs)){
  if(!okId(arcId)||!def||!isText(def.title,100)||
    !isText(def.era,80)||!isText(def.summary,350)||
    !isText(def.canonAnchor,350)||
    (def.entryArc!==undefined&&!okId(def.entryArc))||
    !Array.isArray(def.beats)||def.beats.length<1||def.beats.length>20)
    throw Error("LAB_STORY_DEF_INVALID:"+arcId);
  if(def.mutuallyExclusiveFlags!==undefined&&
    (!Array.isArray(def.mutuallyExclusiveFlags)||
      def.mutuallyExclusiveFlags.length>12||
      def.mutuallyExclusiveFlags.some(group=>!Array.isArray(group)||
       group.length<2||group.length>8||!group.every(okId))))
   throw Error("LAB_STORY_EXCLUSIVE_FLAGS_INVALID:"+arcId);
  const beatIds=new Set<string>();
  for(const beat of def.beats){
   if(!beat||!okId(beat.beatId)||beatIds.has(beat.beatId)||
     !isText(beat.description,250)||!isText(beat.dramaticQuestion,250)||
     !Array.isArray(beat.possibleConsequences)||beat.possibleConsequences.length>8||
     beat.possibleConsequences.some(x=>!isText(x,240))||
     (beat.alternativeTo!==undefined&&!okId(beat.alternativeTo))||
     (beat.requiresTechnique!==undefined&&(!okId(beat.requiresTechnique.trainingId)||
      !["basic","trained","proficient"].includes(beat.requiresTechnique.minGrade)))||
     (beat.requiresFlags!==undefined&&(!Array.isArray(beat.requiresFlags)||
      beat.requiresFlags.length>12||!beat.requiresFlags.every(okId)))||
     (beat.blocksFlags!==undefined&&(!Array.isArray(beat.blocksFlags)||
      beat.blocksFlags.length>12||!beat.blocksFlags.every(okId))))
    throw Error("LAB_STORY_BEAT_INVALID:"+arcId);
   beatIds.add(beat.beatId);
  }
 }
 return defs;
}
export function validateLabStoryState(state:LabStoryState,pack:LabPack){
 if(!state||!state.flags||!state.arcs||!state.techniques||
   Object.keys(state.flags).length>300||Object.keys(state.arcs).length>60||
   Object.keys(state.techniques).length>100)
  throw Error("LAB_STORY_STATE_INVALID");
 for(const [flagId,f] of Object.entries(state.flags)){
  if(!okId(flagId)||!f||typeof f.value!=="boolean"||
    !okId(f.sourceRef)||!isText(f.at,100)||!revisions(f.revision)||f.revision<1)
   throw Error("LAB_STORY_FLAG_INVALID");
 }
 for(const [id,a] of Object.entries(state.arcs)){
  const def=pack.storyArcs?.[id];
  if(!okId(id)||!def||!a||!["active","resolved","diverged"].includes(a.phase)||
    !revisions(a.revision)||a.revision<1||!okId(a.lastSourceRef)||
    !Array.isArray(a.completedBeats)||a.completedBeats.length>def.beats.length||
    new Set(a.completedBeats).size!==a.completedBeats.length||
    a.completedBeats.some(beat=>!def.beats.some(b=>b.beatId===beat))||
    (a.routeId!==undefined&&!okId(a.routeId)))
   throw Error("LAB_STORY_ARC_INVALID:"+id);
 }
 for(const [id,t] of Object.entries(state.techniques)){
  if(!okId(id)||!t||!pack.npcProfiles[t.traineeNpcId]||
    !pack.npcProfiles[t.mentorNpcId]||
    t.traineeNpcId===t.mentorNpcId||!isText(t.discipline,140)||
    !Number.isSafeInteger(t.totalMinutes)||t.totalMinutes<30||
    t.totalMinutes>1e6||!Number.isSafeInteger(t.successfulSessions)||
    t.successfulSessions<0||t.successfulSessions>10000||
    !["introduced","basic","trained","proficient"].includes(t.technique)||
    !okId(t.sourceRef)||!revisions(t.revision)||t.revision<1)
    throw Error("LAB_STORY_TRAINING_INVALID:"+id);
 }
 return state;
}
const techniqueRank:{[k:string]:number}={introduced:0,basic:1,trained:2,proficient:3};
function hasTechnique(state:LabStoryState,requirement?:LabStoryBeatDef["requiresTechnique"]){
 if(!requirement)return true;
 const grade=state.techniques[requirement.trainingId]?.technique;
 return grade!==undefined&&techniqueRank[grade]>=techniqueRank[requirement.minGrade];
}
/** Story-arc progress and training are not canonical if the saved event has no elapsed
 * time to accommodate the physical work. Story flag only events are unaffected.
 */
function timeInMinutes(clock:string):number|null{
 const m=/^(?:D\s*|Day\s+|День\s+)(\d+)\s*,?\s+(\d\d):(\d\d)$/iu.exec(clock);
 if(!m)return null;
 const day=Number(m[1]),h=Number(m[2]),min=Number(m[3]);
 if(!Number.isSafeInteger(day)||day<0||day>100000||h>23||min>59)return null;
 return day*1440+h*60+min;
}
export function applyLabStoryChanges(session:LabSession,pack:LabPack,
 event:LabConfirmedEvent):LabStoryState|undefined{
 const flags=event.storyFlagChanges??[],arcs=event.storyArcChanges??[],
   training=event.npcTechniqueTraining??[];
 if(!flags.length&&!arcs.length&&!training.length)return session.storyState;
 if(!Array.isArray(flags)||!Array.isArray(arcs)||!Array.isArray(training)||
    flags.length>30||arcs.length>12||training.length>8||
    new Set(flags.map(x=>x.flagId)).size!==flags.length||
    new Set(arcs.map(x=>x.arcId+"|"+x.beatId)).size!==arcs.length||
    new Set(training.map(x=>x.trainingId)).size!==training.length)
   throw Error("LAB_STORY_CHANGE_BATCH_INVALID");
 const next:LabStoryState=structuredClone(session.storyState??{
  flags:{},arcs:{},techniques:{}
 });
 const sourceBelongs=(refs:string[])=>refs.every(ref=>
   ref===event.sourceRef||
   session.events.some(e=>e.sourceRef===ref)||
   Object.values(session.npcs).some(n=>n.memories.some(m=>
    m.sourceRef===ref||m.relayedSourceRef===ref)));
 // Major canon divergences need actual participants, not a narrator-only tag.
 const ganeshaNpc=(npcId:string)=>pack.npcProfiles[npcId]?.faction==="ganesha";
 const witnessedGanesha=(event.observations??[]).some(o=>
  ganeshaNpc(o.npcId)&&["seen","heard","experienced"].includes(o.channel));
 const ganeshaBellContact=(event.npcInteractions??[]).some(a=>
  (ganeshaNpc(a.initiatorNpcId)&&a.recipientNpcId==="npc.bell")||
  (ganeshaNpc(a.recipientNpcId)&&a.initiatorNpcId==="npc.bell"));
 const bellAction=(event.worldActions??[]).some(a=>a.npcId==="npc.bell");
 for(const f of flags){
  if(f?.value===true){
   if(f.flagId==="silverback.saved_by_player"&&event.playerWitnessed!==true)
    throw Error("LAB_STORY_PLAYER_RESCUE_NOT_WITNESSED");
   if(f.flagId==="bell.won_silverback"&&
     !bellAction&&!(event.observations??[]).some(o=>o.npcId==="npc.bell"))
    throw Error("LAB_STORY_BELL_VICTORY_NOT_EVIDENCED");
   if(f.flagId==="ganesha.noticed_bell"&&
     !witnessedGanesha&&!(event.worldActions??[]).some(a=>ganeshaNpc(a.npcId)))
    throw Error("LAB_STORY_GANESHA_ATTENTION_NOT_EVIDENCED");
   if(f.flagId==="ganesha.training_offered"&&!ganeshaBellContact)
    throw Error("LAB_STORY_GANESHA_OFFER_NOT_DELIVERED");
   if(f.flagId==="bell.training_accepted"&&!ganeshaBellContact)
    throw Error("LAB_STORY_BELL_TRAINING_CONSENT_NOT_EVIDENCED");
  }
  if(!f||!okId(f.flagId)||!revisions(f.expectedRevision)||
   typeof f.value!=="boolean"||!refs(f.evidenceRefs)||!sourceBelongs(f.evidenceRefs))
    throw Error("LAB_STORY_FLAG_EVIDENCE_INVALID");
  const old=next.flags[f.flagId];
  if((old?.revision??0)!==f.expectedRevision)
   throw Error("LAB_STORY_FLAG_REVISION_CONFLICT");
  next.flags[f.flagId]={value:f.value,sourceRef:event.sourceRef,
   at:event.time,revision:f.expectedRevision+1};
 }
 for(const [arcId,def] of Object.entries(pack.storyArcs??{})){
  for(const exclusive of def.mutuallyExclusiveFlags??[]){
   if(exclusive.filter(flagId=>next.flags[flagId]?.value===true).length>1)
    throw Error("LAB_STORY_MUTUALLY_EXCLUSIVE_CAUSE:"+arcId);
  }
 }
 for(const change of arcs){
  if(!change||!okId(change.arcId)||!okId(change.beatId)||
    !["active","resolved","diverged"].includes(change.phase)||
    !revisions(change.expectedRevision)||!refs(change.evidenceRefs)||
    !sourceBelongs(change.evidenceRefs)||
    (change.routeId!==undefined&&!okId(change.routeId)))
   throw Error("LAB_STORY_ARC_CHANGE_INVALID");
  const def=pack.storyArcs?.[change.arcId],
   beat=def?.beats.find(b=>b.beatId===change.beatId);
  if(!beat)throw Error("LAB_STORY_BEAT_NOT_IN_CANON_BLUEPRINT");
  const old=next.arcs[change.arcId];
  if((old?.revision??0)!==change.expectedRevision||
    old?.phase==="resolved"||old?.phase==="diverged"||
    old?.completedBeats.includes(change.beatId))
   throw Error("LAB_STORY_ARC_REVISION_CONFLICT");
  const met=beat.requiresFlags?.every(k=>next.flags[k]?.value===true)??true;
  const blocked=beat.blocksFlags?.some(k=>next.flags[k]?.value===true)??false;
  if(!met||blocked||!hasTechnique(next,beat.requiresTechnique))
   throw Error("LAB_STORY_BEAT_CAUSAL_PREREQUISITES");
  next.arcs[change.arcId]={
   phase:change.phase,completedBeats:[...(old?.completedBeats??[]),change.beatId],
   revision:change.expectedRevision+1,lastSourceRef:event.sourceRef,
   ...(change.routeId?{routeId:change.routeId}:old?.routeId?{routeId:old.routeId}:{})
  };
 }
 // A trainee cannot accumulate two separate ninety-minute technique lessons
 // during the same ninety-minute elapsed window, even under two labels.
 const elapsedFrom=timeInMinutes(session.gameClock),elapsedTo=timeInMinutes(event.time);
 const minutesByTrainee=new Map<string,number>();
 for(const t of training){
  const total=(minutesByTrainee.get(t.traineeNpcId)??0)+t.sessionMinutes;
  minutesByTrainee.set(t.traineeNpcId,total);
 }
 if(training.length&&(elapsedFrom===null||elapsedTo===null))
  throw Error("LAB_STORY_TRAINING_TIME_INSUFFICIENT");
 for(const total of minutesByTrainee.values()){
  if(total>elapsedTo!-elapsedFrom!)
   throw Error("LAB_STORY_TRAINING_OVERLAPPING_CREDIT");
 }
 for(const t of training){
  if(!t||!okId(t.trainingId)||!pack.npcProfiles[t.traineeNpcId]||
   !pack.npcProfiles[t.mentorNpcId]||t.traineeNpcId===t.mentorNpcId||
   !isText(t.discipline,140)||!revisions(t.expectedRevision)||
   !Number.isSafeInteger(t.sessionMinutes)||t.sessionMinutes<30||
   t.sessionMinutes>480||typeof t.passedDrill!=="boolean")
   throw Error("LAB_STORY_TRAINING_CHANGE_INVALID");
  if(!["training","world_training","practice"].includes(event.kind))
   throw Error("LAB_STORY_TRAINING_EVENT_KIND");
  const from=timeInMinutes(session.gameClock),until=timeInMinutes(event.time);
  if(from===null||until===null||until-from<t.sessionMinutes)
   throw Error("LAB_STORY_TRAINING_TIME_INSUFFICIENT");
  const interaction=event.npcInteractions?.some(i=>
    (i.initiatorNpcId===t.mentorNpcId&&i.recipientNpcId===t.traineeNpcId)||
    (i.initiatorNpcId===t.traineeNpcId&&i.recipientNpcId===t.mentorNpcId));
  const actions=event.worldActions?.some(a=>a.npcId===t.mentorNpcId)&&
   event.worldActions?.some(a=>a.npcId===t.traineeNpcId);
  if(!interaction&&!actions)throw Error("LAB_STORY_TRAINING_MENTOR_MISSING");
  const old=next.techniques[t.trainingId];
  if((old?.revision??0)!==t.expectedRevision||
    old&&old.traineeNpcId!==t.traineeNpcId||
    old&&old.mentorNpcId!==t.mentorNpcId||
    old&&old.discipline!==t.discipline)
   throw Error("LAB_STORY_TRAINING_REVISION_CONFLICT");
  const minutes=(old?.totalMinutes??0)+t.sessionMinutes;
  const sessions=(old?.successfulSessions??0)+(t.passedDrill?1:0);
  const technique=(!t.passedDrill&&sessions===0)?"introduced":
   sessions>=10&&minutes>=900?"proficient":
   sessions>=4&&minutes>=360?"trained":
   sessions>=2&&minutes>=120?"basic":"introduced";
  next.techniques[t.trainingId]={
   traineeNpcId:t.traineeNpcId,mentorNpcId:t.mentorNpcId,
   discipline:t.discipline,totalMinutes:minutes,
   successfulSessions:sessions,technique,sourceRef:event.sourceRef,
   revision:t.expectedRevision+1
  };
 }
 return validateLabStoryState(next,pack);
}
export function previewLabStoryPaths(pack:LabPack,session:LabSession){
 const flags=session.storyState?.flags??{},progress=session.storyState?.arcs??{};
 const possible=[];
 const blocked=[];
 for(const [arcId,def] of Object.entries(pack.storyArcs??{})){
  const complete=new Set(progress[arcId]?.completedBeats??[]);
  for(const beat of def.beats){
   if(complete.has(beat.beatId))continue;
   const missing=(beat.requiresFlags??[]).filter(k=>flags[k]?.value!==true);
   const blocking=(beat.blocksFlags??[]).filter(k=>flags[k]?.value===true);
   const missingTechnique=!hasTechnique(session.storyState??{
    flags:{},arcs:{},techniques:{}},beat.requiresTechnique)?
    beat.requiresTechnique??null:null;
   const descriptor={arcId,title:def.title,beatId:beat.beatId,
    dramaticQuestion:beat.dramaticQuestion,
    possibleConsequences:beat.possibleConsequences,
    prerequisiteFlags:beat.requiresFlags??[],blockFlags:beat.blocksFlags??[],
    requiredTechnique:beat.requiresTechnique??null,
    isPureProposal:true,notScheduledAutomatically:true};
   if(!missing.length&&!blocking.length&&!missingTechnique)possible.push(descriptor);
   else if(progress[arcId]?.phase!=="resolved"&&progress[arcId]?.phase!=="diverged")
    blocked.push({...descriptor,missing,blocking,missingTechnique});
  }
 }
 return {schema:"RPG_LAB_STORY_PATHS_V1",
  projectId:session.projectId,sessionId:session.sessionId,
  candidateBeats:possible.slice(0,32),blockedBeats:blocked.slice(0,64),
  storyFlags:Object.entries(flags).map(([id,f])=>({id,value:f.value,sourceRef:f.sourceRef})),
  techniques:Object.entries(session.storyState?.techniques??{}).map(([id,t])=>({
   id,traineeNpcId:t.traineeNpcId,mentorNpcId:t.mentorNpcId,
   discipline:t.discipline,technique:t.technique,totalMinutes:t.totalMinutes,
   successfulSessions:t.successfulSessions,notFalnaExp:true
  })),
  canonIsAnchorsNotRails:true,previewsArePrivate:true,
  noAutoXP:true,noAutoProgress:true,readOnly:true,committed:false,
  gmOnly:true,notPlayerVisible:true};
}
