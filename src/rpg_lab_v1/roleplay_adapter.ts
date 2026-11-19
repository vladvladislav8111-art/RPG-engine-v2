/** Roleplay-specific, source-backed RPG Lab tool adapter.
 * No dependency on any legacy Shura saveId or world-context packet.
 * Purely read-only, GM-private; does not decide dialogue or mutate state.
 */
import {buildLabSceneBrief,dueLabWorldProjects} from "./living_world.ts";
import {narrativeMinute} from "./events.ts";
import {reviewLabNarration,type LabNarrativeReviewRequest} from "./narrative_guard.ts";
import type {LabPack} from "./engine.ts";
import type {LabSession} from "./session.ts";

type Loaded={
 pack:LabPack;packRevision:number;session:LabSession;sessionRevision:number;
};
export type LabRoleplayLoader=(projectId:string,sessionId:string)=>Promise<Loaded>;
const good=(s:unknown)=>typeof s==="string"&&/^[A-Za-z0-9_-]{3,64}$/.test(s);
const loadExact=async(load:LabRoleplayLoader,projectId:string,sessionId:string)=>{
 if(!good(projectId)||!good(sessionId))
  throw Error("LAB_ROLEPLAY_REF_INVALID");
 const snapshot=await load(projectId,sessionId);
 if(snapshot.pack.projectId!==projectId||
    snapshot.session.projectId!==projectId||
    snapshot.session.sessionId!==sessionId)
  throw Error("LAB_ROLEPLAY_SOURCE_MISMATCH");
 return snapshot;
};
export type LabRoleplaySceneRequest={
 projectId:string;sessionId:string;npcIds:string[];
 eventRef?:string;featureIds?:string[];maxMemories?:number;
 toMinute?:number;
};
export async function readLabRoleplayScene(load:LabRoleplayLoader,
 request:LabRoleplaySceneRequest){
 const s=await loadExact(load,request.projectId,request.sessionId);
 const brief=buildLabSceneBrief(s.pack,s.session,{
  npcIds:request.npcIds,eventRef:request.eventRef,
  featureIds:request.featureIds,maxMemories:request.maxMemories??8,
 });
 const from=narrativeMinute(s.session.gameClock);
 const to=request.toMinute;
 if(to!==undefined&&(from===null||!Number.isSafeInteger(to)||
   to<from||to-from>10080))
  throw Error("LAB_ROLEPLAY_SCENE_TICK_INVALID");
 const due=to!==undefined?dueLabWorldProjects(s.session.worldProjects,to):[];
 const answer={...brief,schema:"RPG_LAB_ROLEPLAY_CONTEXT_V1",
  packRevision:s.packRevision,sessionRevision:s.sessionRevision,
  roleplayGuard:s.session.roleplayGuard??"legacy",
  currentInworldMinute:from,
  ...(to!==undefined?{reviewThroughMinute:to}:{}),
  dueWorldProjects:due,
  resolutionRequired:due.length>0,
  mustUseSourceBoundCommit:s.session.roleplayGuard==="strict",
  note:"GM ONLY; do not disclose private memories or proposal decisions to player."};
 if(JSON.stringify(answer).length>60000)throw Error("LAB_ROLEPLAY_CONTEXT_TOO_LARGE");
 return answer;
}
export type LabRoleplayNarrationRequest=LabNarrativeReviewRequest&{
 projectId:string;sessionId:string;
};
export async function reviewLabRoleplayScene(load:LabRoleplayLoader,
 request:LabRoleplayNarrationRequest){
 const s=await loadExact(load,request.projectId,request.sessionId);
 const reviewed=reviewLabNarration(s.pack,s.session,{
  npcIds:request.npcIds,expectedSessionRevision:request.expectedSessionRevision,
  beats:request.beats,contextEventRef:request.contextEventRef,
  requiredMemoryRefs:request.requiredMemoryRefs,
 },s.sessionRevision);
 return {...reviewed,packRevision:s.packRevision};
}
