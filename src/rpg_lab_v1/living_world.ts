/** RPG Lab Living World V1.
 * Pure, source-bounded roleplay continuity and project review. Never writes state.
 * The model may supply prose, but it may not silently turn a proposal into history.
 */
import type {LabPack} from "./engine.ts";
import type {LabSession} from "./session.ts";

export type LabNpcMood={
 label:string;intensity:number;causeRef:string;sinceMinute:number;
 settleAfterMinute?:number;context?:string;
};
export type LabProjectStatus="proposed"|"accepted"|"active"|"blocked"|
 "completed"|"rejected"|"cancelled";
export type LabWorldProject={
 ownerNpcId:string;originRef:string;title:string;stage:string;
 status:LabProjectStatus;locationId?:string;privacy:"public"|"hidden";
 startedMinute:number;lastReviewMinute:number;nextReviewMinute?:number;
 revision:number;latestEvidenceRef:string;blockerReason?:string;
};
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const goodId=(s:unknown):s is string=>typeof s==="string"&&ID.test(s)&&
 !["constructor","prototype","__proto__"].includes(s);
const text=(x:unknown,max:number):x is string=>
 typeof x==="string"&&x.trim().length>0&&x.length<=max;
const minute=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0&&Number(x)<=1e9;
const ACTIVE=new Set<LabProjectStatus>(["accepted","active","blocked"]);
const TERMINAL=new Set<LabProjectStatus>(["completed","rejected","cancelled"]);
export const isOpenProject=(x:LabWorldProject)=>ACTIVE.has(x.status);
export function validateLabNpcMood(m:LabNpcMood):LabNpcMood{
 if(!m||!text(m.label,80)||!Number.isInteger(m.intensity)||m.intensity<1||
  m.intensity>5||!goodId(m.causeRef)||!minute(m.sinceMinute)||
  (m.settleAfterMinute!==undefined&&(!minute(m.settleAfterMinute)||
   m.settleAfterMinute<m.sinceMinute))||
  (m.context!==undefined&&!text(m.context,240)))
  throw Error("LAB_NPC_MOOD_INVALID");
 return m;
}
export function validateLabWorldProject(projectId:string,p:LabWorldProject,pack:LabPack):LabWorldProject{
 if(!goodId(projectId)||!p||typeof p!=="object"||
  !goodId(p.ownerNpcId)||!pack.npcProfiles[p.ownerNpcId]||
  !goodId(p.originRef)||!goodId(p.latestEvidenceRef)||
  !text(p.title,180)||!text(p.stage,240)||
  !["proposed","accepted","active","blocked","completed","rejected","cancelled"].includes(p.status)||
  !["public","hidden"].includes(p.privacy)||
  (p.locationId!==undefined&&(!goodId(p.locationId)||!pack.locations[p.locationId]))||
  !minute(p.startedMinute)||!minute(p.lastReviewMinute)||
  p.lastReviewMinute<p.startedMinute||
  !Number.isSafeInteger(p.revision)||p.revision<1||p.revision>10000)
  throw Error("LAB_WORLD_PROJECT_INVALID:"+projectId);
 if(isOpenProject(p)){
  if(!minute(p.nextReviewMinute)||Number(p.nextReviewMinute)<=p.lastReviewMinute)
   throw Error("LAB_WORLD_PROJECT_REVIEW_CLOCK:"+projectId);
 }else if(p.nextReviewMinute!==undefined){
  throw Error("LAB_WORLD_PROJECT_TERMINAL_REVIEW:"+projectId);
 }
 if(p.status==="blocked"?!text(p.blockerReason,300):p.blockerReason!==undefined)
  throw Error("LAB_WORLD_PROJECT_BLOCKER_INVALID:"+projectId);
 return p;
}
export function dueLabWorldProjects(
 projects:Record<string,LabWorldProject>|undefined,toMinute:number
){
 if(!minute(toMinute))throw Error("LAB_WORLD_PROJECT_CLOCK_INVALID");
 return Object.entries(projects??{}).filter(([,p])=>isOpenProject(p)&&
  p.nextReviewMinute!==undefined&&p.nextReviewMinute<=toMinute)
  .sort((a,b)=>a[1].nextReviewMinute!-b[1].nextReviewMinute!||a[0].localeCompare(b[0]))
  .map(([projectId,p])=>({projectId,ownerNpcId:p.ownerNpcId,title:p.title,
   status:p.status,stage:p.stage,dueMinute:p.nextReviewMinute!,
   blockerReason:p.blockerReason??null,revision:p.revision,
   originRef:p.originRef,privacy:p.privacy,needsDecision:true}));
}
export function allowedLabProjectTransition(old:LabProjectStatus,next:LabProjectStatus){
 const allowed:Record<LabProjectStatus,LabProjectStatus[]>={
  proposed:["proposed","accepted","rejected","cancelled"],
  accepted:["accepted","active","blocked","rejected","cancelled"],
  active:["active","blocked","completed","cancelled"],
  blocked:["blocked","active","rejected","cancelled"],
  completed:["completed"],rejected:["rejected"],cancelled:["cancelled"],
 };
 return allowed[old].includes(next);
}
export type LabSceneBriefRequest={
 npcIds:string[];eventRef?:string;featureIds?:string[];maxMemories?:number;
};
export function buildLabSceneBrief(pack:LabPack,session:LabSession,req:LabSceneBriefRequest){
 if(!req||!Array.isArray(req.npcIds)||req.npcIds.length>16||
  new Set(req.npcIds).size!==req.npcIds.length||
  req.npcIds.some(x=>!goodId(x)||!pack.npcProfiles[x]))
  throw Error("LAB_SCENE_ACTOR_IDS_INVALID");
 if(req.eventRef!==undefined&&!goodId(req.eventRef))
  throw Error("LAB_SCENE_EVENT_REF_INVALID");
 const features=req.featureIds??[];
 if(!Array.isArray(features)||features.length>24||
  features.some(x=>!goodId(x)))throw Error("LAB_SCENE_FEATURE_IDS_INVALID");
 const max=req.maxMemories??12;
 if(!Number.isInteger(max)||max<1||max>24)throw Error("LAB_SCENE_MEMORY_LIMIT_INVALID");
 const event=req.eventRef?session.events.find(x=>x.sourceRef===req.eventRef):undefined;
 const actors=req.npcIds.map(npcId=>{
  const identity=pack.npcProfiles[npcId],state=session.npcs[npcId];
  const witnessed=!!event?.knownBy.includes(npcId);
  const sourceMemory=state?.memories.find(m=>m.sourceRef===req.eventRef);
  const observation=sourceMemory?
    (["seen","heard","experienced"].includes(sourceMemory.channel??"")?"direct":
     "indirect"):witnessed?"witnessed_record_only":"not_recorded";
  const relevant=(state?.memories??[]).slice()
   .sort((a,b)=>{
    const rank=(x?:string)=>x==="life_defining"?4:x==="important"?3:x==="ordinary"?2:1;
    return rank(b.salience)-rank(a.salience)||
      (state!.memories.indexOf(b)-state!.memories.indexOf(a));
   }).slice(0,max)
   .map(m=>({sourceRef:m.sourceRef,perceivedFact:m.perceivedFact??m.summary,
    confidence:m.confidence??"unspecified",channel:m.channel??"unspecified",
    learnedAt:m.learnedAt,sourceActor:m.sourceActor??null,privacy:m.privacy??"unknown"}));
  const featureAwareness=features.map(featureId=>{
   const old=state?.perceptions?.[featureId];
   return {featureId,personallySeen:(old?.notices??0)>0,
    heardAbout:(old?.heardCount??0)>0,familiarity:old?.familiarity??"unfamiliar",
    interpretation:old?.lastInterpretation??null,sourceRef:old?.lastSeenRef??old?.lastHeardRef??null,
    mustNotInheritOtherNpcFamiliarity:true};
  });
  const work=Object.entries(session.worldProjects??{})
   .filter(([,p])=>p.ownerNpcId===npcId)
   .map(([projectId,p])=>({projectId,title:p.title,status:p.status,stage:p.stage,
    nextReviewMinute:p.nextReviewMinute??null,blockerReason:p.blockerReason??null,
    originRef:p.originRef,revision:p.revision}));
  return {npcId,name:identity.name,canonRef:identity.canonRef,
   canonAnchors:identity.traits,canonGoals:identity.goals,
   speechStyle:identity.speechStyle??null,currentGoal:state?.currentGoal??null,
   mood:state?.mood??null,relationships:state?.relationships??{},
   eventObservation:observation,memories:relevant,featureAwareness,
   activeResponsibilities:work,
   decisionMustFollowOwnKnowledge:true,playerApprovalNotAssumed:true,
   noAutomaticReconciliation:true,permissionToDisagreeOrRefuse:true};
 });
 return {schema:"RPG_LAB_SCENE_BRIEF_V1",projectId:session.projectId,
  sessionId:session.sessionId,gameClock:session.gameClock,
  readOnly:true,committed:false,gmOnly:true,notPlayerVisible:true,
  observedSourceRef:req.eventRef??null,
  eventCommitted:Boolean(event),actors,
  uncommittedEventIsNotWitnessedProof:!event,
  narratorConstraints:[
   "Resolve each NPC's decision and actual experience before writing the scene",
   "No omniscient knowledge transfer, and no borrowed feature familiarity",
   "Character flaws, anger and unresolved conflicts may persist without an apology",
   "NPCs can interact with other NPCs and pursue their own commitments",
   "Do not overwrite confirmed actions or invent outcomes from proposals"
  ],
 };
}
