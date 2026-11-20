/** Roleplay-specific, source-backed RPG Lab tool adapter.
 * No dependency on any legacy Shura saveId or world-context packet.
 * Purely read-only, GM-private; does not decide dialogue or mutate state.
 */
import {buildLabSceneBrief,dueLabWorldProjects} from "./living_world.ts";
import {readLabAmbientRumors} from "./ambient_rumors.ts";
import {findLabNpcMentions,recallLabNpcPersonalMemories,readLabMentionedNpcCores} from "./npc_mentions.ts";
import {narrativeMinute} from "./events.ts";
import {previewLabLivingWorldCycle} from "./living_world_cycle_v2.ts";
import {previewLabStoryPaths} from "./story_consequences.ts";
import {readLabPublicFog} from "./fog_of_war.ts";
import {reviewLabNarration,type LabNarrativeReviewRequest} from "./narrative_guard.ts";
import type {LabPack} from "./engine.ts";
import {readDanmachiEraNpcContext} from "./danmachi_era_cores_v2.ts";
import {proposeDanmachiNpcIntentCycle,type DanmachiActorSignal} from "./danmachi_intentions_v2.ts";
import {auditDanmachiEraScene,type DanmachiNarrativeBeat} from "./danmachi_scene_audit_v2.ts";
import {readOrarioPlayerHud} from "./orario_player_event.ts";
import {previewArmyBalance} from "./danmachi_shadow_balance.ts";
import {RPG_LAB_SCENE_REMINDER,RPG_BRIDGE_GM_GUIDE_VERSION} from "./gm_guide.ts";
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
 projectId:string;sessionId:string;npcIds?:string[];
 eventRef?:string;featureIds?:string[];maxMemories?:number;
 toMinute?:number;dialogueText?:string;
 danmachiSignals?:DanmachiActorSignal[];
};
export async function readLabRoleplayScene(load:LabRoleplayLoader,
 request:LabRoleplaySceneRequest){
 const s=await loadExact(load,request.projectId,request.sessionId);
 const mentionLookup=request.dialogueText===undefined?null:
  findLabNpcMentions(s.pack,request.dialogueText,8);
 const npcIds=[...new Set([...(request.npcIds??[]),
   ...(mentionLookup?.npcIds??[])])];
 if(npcIds.length===0||npcIds.length>8)
  throw Error("LAB_ROLEPLAY_SCENE_NPC_SELECTION_INVALID");
 const brief=buildLabSceneBrief(s.pack,s.session,{
  npcIds,eventRef:request.eventRef,
  featureIds:request.featureIds,maxMemories:request.maxMemories??8,
 });
 const dialogueMemories=request.dialogueText===undefined?[]:
  npcIds.map(npcId=>({npcId,
   memories:recallLabNpcPersonalMemories(
    s.session,npcId,request.dialogueText!,request.maxMemories??8)}));
 const from=narrativeMinute(s.session.gameClock);
 const to=request.toMinute;
 if(to!==undefined&&(from===null||!Number.isSafeInteger(to)||
   to<from||to-from>10080))
  throw Error("LAB_ROLEPLAY_SCENE_TICK_INVALID");
 const due=to!==undefined?dueLabWorldProjects(s.session.worldProjects,to):[];
 const worldCycle=from!==null?
   previewLabLivingWorldCycle(s.pack,s.session,{
     npcIds,fromMinute:from,toMinute:to??from,
     focusEventRef:request.eventRef,maxPerActor:2,
   }):null;
 const answer={...brief,schema:"RPG_LAB_ROLEPLAY_CONTEXT_V1",
  packRevision:s.packRevision,sessionRevision:s.sessionRevision,
  sourceAttestedBySave:true,
  gmReminderVersion:RPG_BRIDGE_GM_GUIDE_VERSION,
  gmReminder:RPG_LAB_SCENE_REMINDER,
  roleplayGuard:s.session.roleplayGuard??"legacy",
  currentInworldMinute:from,
  ...(to!==undefined?{reviewThroughMinute:to}:{}),
  dueWorldProjects:due,
  localAmbientRumors:s.session.player.locationId?
   readLabAmbientRumors(s.session,s.session.player.locationId,6):[],
  ambientRumorsAreUnverified:true,
  ...(mentionLookup?{resolvedByDialogue:mentionLookup,
    dialogueRelevantPersonalMemories:dialogueMemories,
    dialogueLookupDoesNotProveWitnessing:true}:{}),
  livingWorldCycle:worldCycle,
  ...(s.pack.worldId==="danmachi.orario"?{
   danmachiEraContext:readDanmachiEraNpcContext(s.pack,s.session,npcIds,
     request.dialogueText??""),
   danmachiNpcIntents:from===null?null:proposeDanmachiNpcIntentCycle(
    s.pack,s.session,{npcIds,fromMinute:from,toMinute:to??from,
     signals:request.danmachiSignals??[]}),
  }:{}),
  ...(s.session.player.jinwoo?{
   orarioPlayerSystem:readOrarioPlayerHud(s.session),
   orarioPlayerArmy:previewArmyBalance(s.session.player.jinwoo),
   playerOnlySystemMenus:true
  }:{}),
  storyRoutes:previewLabStoryPaths(s.pack,s.session),
  playerKnownSummary:{knownFacts:Object.keys(s.session.playerFog?.entries??{}).length,
   exploredAreas:Object.keys(s.session.playerFog?.areas??{}).length},
  resolutionRequired:due.length>0,
  mustUseSourceBoundCommit:s.session.roleplayGuard==="strict",
  note:"GM ONLY; do not disclose private memories or proposal decisions to player."};
 if(JSON.stringify(answer).length>60000)throw Error("LAB_ROLEPLAY_CONTEXT_TOO_LARGE");
 return answer;
}
/** GM-only conditional story options, separate from confirmed outcomes. */
export async function readLabStoryOptions(load:LabRoleplayLoader,
 projectId:string,sessionId:string){
 const s=await loadExact(load,projectId,sessionId);
 return {...previewLabStoryPaths(s.pack,s.session),
  packRevision:s.packRevision,sessionRevision:s.sessionRevision,
  sourceAttestedBySave:true};
}
/** Player safe: only what the player actually observed/heard/learned. */
export async function readLabPlayerFog(load:LabRoleplayLoader,
 projectId:string,sessionId:string){
 const s=await loadExact(load,projectId,sessionId);
 return {...readLabPublicFog(s.session),
   ...(s.session.player.jinwoo?{orarioPlayer:readOrarioPlayerHud(s.session)}:{}),
   sessionRevision:s.sessionRevision};
}
export type LabRoleplayWorldCycleRequest={
 projectId:string;sessionId:string;npcIds:string[];
 toMinute:number;maxPerActor?:number;focusEventRef?:string;
};
export async function readLabRoleplayWorldCycle(load:LabRoleplayLoader,
 request:LabRoleplayWorldCycleRequest){
 const s=await loadExact(load,request.projectId,request.sessionId);
 const from=narrativeMinute(s.session.gameClock);
 if(from===null)throw Error("LAB_LIVING_CYCLE_CLOCK_OPAQUE");
 const cycle=previewLabLivingWorldCycle(s.pack,s.session,{
  fromMinute:from,toMinute:request.toMinute,npcIds:request.npcIds,
  focusEventRef:request.focusEventRef,maxPerActor:request.maxPerActor,
 });
 return {...cycle,
   ...(s.pack.worldId==="danmachi.orario"?{
    danmachiNpcIntents:proposeDanmachiNpcIntentCycle(s.pack,s.session,{
     npcIds:request.npcIds,fromMinute:from,toMinute:request.toMinute})
   }:{}),
   packRevision:s.packRevision,
  sessionRevision:s.sessionRevision,sourceAttestedBySave:true};
}
export type LabRoleplayNarrationRequest=LabNarrativeReviewRequest&{
 projectId:string;sessionId:string;
 danmachiAuditBeats?:DanmachiNarrativeBeat[];
};
export async function reviewLabRoleplayScene(load:LabRoleplayLoader,
 request:LabRoleplayNarrationRequest){
 const s=await loadExact(load,request.projectId,request.sessionId);
 const reviewed=reviewLabNarration(s.pack,s.session,{
  npcIds:request.npcIds,expectedSessionRevision:request.expectedSessionRevision,
  beats:request.beats,contextEventRef:request.contextEventRef,
  requiredMemoryRefs:request.requiredMemoryRefs,
 },s.sessionRevision);
 const eraAudit=request.danmachiAuditBeats===undefined?null:
  auditDanmachiEraScene(s.pack,s.session,request.danmachiAuditBeats);
 return {...reviewed,
  ...(eraAudit?{danmachiEraAudit:eraAudit,
   readyToRender:reviewed.readyToRender&&eraAudit.readyToRender}:{}),
  packRevision:s.packRevision};
}

/** Private read-only tool: choose profiles from a dialogue without pretending
 * that the named characters witnessed, attended or learned the dialogue.
 */
export type LabRoleplayMentionRequest={
 projectId:string;sessionId:string;dialogueText:string;
 maxActors?:number;maxMemories?:number;
};
export async function readLabMentionedNpcDialogue(load:LabRoleplayLoader,
 request:LabRoleplayMentionRequest){
 const s=await loadExact(load,request.projectId,request.sessionId);
 const selection=readLabMentionedNpcCores(s.pack,s.session,
  request.dialogueText,request.maxActors??8,request.maxMemories??8);
 return {...selection,
  ...(s.pack.worldId==="danmachi.orario"?{
   danmachiEraContext:readDanmachiEraNpcContext(s.pack,s.session,
    selection.actors.map(x=>x.npcId),request.dialogueText)}:{}),
  packRevision:s.packRevision,
  sessionRevision:s.sessionRevision,sourceAttestedBySave:true};
}
