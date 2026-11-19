/** RPG Lab narrative evidence and continuity gate.
 *
 * This evaluates structured GM-authored scene beats using the actual saved
 * campaign, not narrator-supplied summaries of memory. The natural-language
 * portion cannot be semantically proven by this deterministic gate.
 * No game mutation, player knowledge leak, or free NPC reaction is produced.
 */
import type {LabPack} from "./engine.ts";
import type {LabSession} from "./session.ts";
import {narrativeMinute} from "./events.ts";
import type {LabNpcDecisionStance} from "./living_world.ts";
import {permittedLabEvidenceClaim} from "./world_evidence.ts";

const id=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const goodId=(x:unknown):x is string=>typeof x==="string"&&id.test(x)&&
 !["constructor","prototype","__proto__"].includes(x);
const unique=(xs:string[])=>new Set(xs).size===xs.length;
export type LabNarrativeBeat={
 actorId:string;kind:"speech"|"action"|"reaction";
 summary:string;
 /** Every *persisted* personal-fact reference expressed by this beat. */
 factRefs:string[];
 featureRefs?:{featureId:string;knowledge:"seen"|"heard"|"either"}[];
 worldClaims?:{factId:string;assertion:"established"|"tentative"|"reported"}[];
 /** Assert that the NPC still holds this saved stance. A new decision
  * must be source-committed before being asserted as settled fact. */
 decision?:{subjectId:string;stance:LabNpcDecisionStance;revision?:number};
 /** The actor personally owns this due or open task; not "it was done". */
 projectId?:string;
};
export type LabNarrativeReviewRequest={
 npcIds:string[];expectedSessionRevision:number;beats:LabNarrativeBeat[];
 /** These persisted events must be acknowledged by an eligible actor when
  * they are materially relevant to the scene; does NOT require repeating
  * all backstory trivia every turn. */
 requiredMemoryRefs?:{npcId:string;sourceRef:string}[];
};
export function reviewLabNarration(pack:LabPack,session:LabSession,
 req:LabNarrativeReviewRequest,sessionRevision:number){
 if(!req||!Array.isArray(req.npcIds)||req.npcIds.length>8||
  !req.npcIds.every(x=>goodId(x)&&Boolean(pack.npcProfiles[x]))||
  !unique(req.npcIds)||!Number.isSafeInteger(req.expectedSessionRevision)||
  req.expectedSessionRevision!==sessionRevision)
  throw Error("LAB_NARRATIVE_REVIEW_SOURCE_INVALID");
 if(!Array.isArray(req.beats)||req.beats.length<1||req.beats.length>32)
  throw Error("LAB_NARRATIVE_BEATS_INVALID");
 const required=req.requiredMemoryRefs??[];
 if(!Array.isArray(required)||required.length>16||
    required.some(x=>!x||!goodId(x.npcId)||!goodId(x.sourceRef)||
      !req.npcIds.includes(x.npcId))||
    new Set(required.map(x=>x.npcId+"|"+x.sourceRef)).size!==required.length)
  throw Error("LAB_NARRATIVE_REQUIRED_REFS_INVALID");
 const failures:{beat:number;actorId:string;code:string;detail:string}[]=[];
 const counts:Record<string,number>={};
 const seen=new Set<string>();
 for(let index=0;index<req.beats.length;index++){
  const beat=req.beats[index];
  if(!beat||!goodId(beat.actorId)||!req.npcIds.includes(beat.actorId)||
   !["speech","action","reaction"].includes(beat.kind)||
   typeof beat.summary!=="string"||!beat.summary.trim()||beat.summary.length>400||
   !Array.isArray(beat.factRefs)||beat.factRefs.length>16||
   !beat.factRefs.every(goodId)||!unique(beat.factRefs))
   throw Error("LAB_NARRATIVE_BEAT_SHAPE_INVALID");
  counts[beat.actorId]=(counts[beat.actorId]??0)+1;
  const state=session.npcs[beat.actorId];
  const memories=state?.memories??[];
  for(const ref of beat.factRefs){
   const own=memories.some(m=>m.sourceRef===ref);
   if(!own)failures.push({beat:index,actorId:beat.actorId,
    code:"NPC_NOT_PERSONALLY_INFORMED",detail:ref});
   else seen.add(beat.actorId+"|"+ref);
  }
  const features=beat.featureRefs??[];
  if(!Array.isArray(features)||features.length>16||
      features.some(x=>!x||!goodId(x.featureId)||
       !["seen","heard","either"].includes(x.knowledge))||
      !unique(features.map(x=>x.featureId)))
   throw Error("LAB_NARRATIVE_FEATURE_REFS_INVALID");
  for(const f of features){
   const memory=state?.perceptions?.[f.featureId];
   const personal=(memory?.notices??0)>0;
   const relayed=(memory?.heardCount??0)>0;
   const valid=f.knowledge==="seen"?personal:
    f.knowledge==="heard"?relayed:personal||relayed;
   if(!valid)failures.push({beat:index,actorId:beat.actorId,
    code:"NPC_FEATURE_KNOWLEDGE_MISSING",detail:f.featureId+":"+f.knowledge});
  }
  const claims=beat.worldClaims??[];
  if(!Array.isArray(claims)||claims.length>16||
    claims.some(x=>!x||!goodId(x.factId)||
     !["established","tentative","reported"].includes(x.assertion))||
    !unique(claims.map(x=>x.factId)))
   throw Error("LAB_NARRATIVE_WORLD_CLAIMS_INVALID");
  for(const claim of claims){
   const fact=session.worldEvidence?.[claim.factId];
   if(!fact){
    failures.push({beat:index,actorId:beat.actorId,
      code:"WORLD_EVIDENCE_NOT_SAVED",detail:claim.factId});
    continue;
   }
   if(!memories.some(m=>m.sourceRef===fact.sourceRef))
    failures.push({beat:index,actorId:beat.actorId,
     code:"NPC_NOT_INFORMED_OF_WORLD_EVIDENCE",detail:claim.factId});
   if(!permittedLabEvidenceClaim(fact,claim.assertion))
    failures.push({beat:index,actorId:beat.actorId,
     code:"UNVERIFIED_CLAIM_UPGRADED",detail:claim.factId+":"+claim.assertion});
  }
  if(beat.decision!==undefined){
   const d=beat.decision;
   if(!d||!goodId(d.subjectId)||
      typeof d.stance!=="string"||
      (d.revision!==undefined&&(!Number.isSafeInteger(d.revision)||d.revision<1)))
    throw Error("LAB_NARRATIVE_DECISION_CLAIM_INVALID");
   const previous=state?.decisions?.[d.subjectId];
   if(!previous||previous.stance!==d.stance||
      (d.revision!==undefined&&previous.revision!==d.revision))
    failures.push({beat:index,actorId:beat.actorId,
     code:"NPC_DECISION_NOT_COMMITTED",detail:d.subjectId+":"+d.stance});
  }
  if(beat.projectId!==undefined){
   if(!goodId(beat.projectId))throw Error("LAB_NARRATIVE_PROJECT_ID_INVALID");
   const p=session.worldProjects?.[beat.projectId];
   if(!p||p.ownerNpcId!==beat.actorId)
    failures.push({beat:index,actorId:beat.actorId,
     code:"NPC_NOT_PROJECT_OWNER",detail:beat.projectId});
  }
 }
 for(const ref of required){
  if(!(session.npcs[ref.npcId]?.memories??[]).some(m=>m.sourceRef===ref.sourceRef))
   throw Error("LAB_NARRATIVE_REQUIRED_REF_NOT_SAVED");
  if(!seen.has(ref.npcId+"|"+ref.sourceRef))
   failures.push({beat:-1,actorId:ref.npcId,code:"RELEVANT_MEMORY_OMITTED",
    detail:ref.sourceRef});
 }
 const currentMinute=narrativeMinute(session.gameClock);
 const overdue=Object.entries(session.worldProjects??{})
  .filter(([,p])=>p.nextReviewMinute!==undefined&&currentMinute!==null&&
    p.nextReviewMinute<=currentMinute&&
    ["accepted","active","blocked"].includes(p.status))
  .map(([projectId])=>projectId);
 return {schema:"RPG_LAB_NARRATIVE_REVIEW_V1",
  projectId:session.projectId,sessionId:session.sessionId,
  sessionRevision,gameClock:session.gameClock,
  readyToRender:failures.length===0&&overdue.length===0,
  failures,overdueProjects:overdue,
  actorBeatCounts:counts,
  narrativeTextSemanticsVerified:false,
  metadataOnly:true,requiresGMResolution:failures.length>0||overdue.length>0,
  noAutomaticCommit:true,readOnly:true,committed:false,gmOnly:true,notPlayerVisible:true,
  note:"Only structured references and stable saved decisions are checked. The GM must review the actual prose for canon tone, subtext and all unmarked factual claims."};
}
