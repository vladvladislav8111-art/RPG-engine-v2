/** Resolve a saved RPG Lab project before the existing read-only World V3 dispatcher.
 * The loader is injected so pure tests cannot touch Deno KV or Shura data.
 */
import type {WorldV3BatchRequest} from "../world_sim_v3/runtime_facade.ts";
import {evaluateLabPack,type LabPack,type LabJob} from "./engine.ts";
import type {GoogleSourceIndex} from "./google_sync.ts";
import {reviewLabSessionMemory,type LabMemoryViewRequest} from "./memory_view.ts";
import {withSessionDefaults,type LabSession} from "./session.ts";
import {buildLabSceneBrief} from "./living_world.ts";
import {narrativeMinute} from "./events.ts";
import {effectiveJinwooMaxHp,effectiveJinwooMaxMp,effectiveJinwooStaminaReserve,
 projectJinwooFalna} from "./shadow_monarch_rules.ts";
import {readCurrentPlayerBattle} from "./orario_player_combat.ts";
import {runChromaHuntBatch} from "./hunt_batch.ts";
import {applyOrarioPlayerAction} from "./orario_player_event.ts";
import {reviewLabNarration,type LabNarrativeReviewRequest} from "./narrative_guard.ts";
export type LabPackLoader=(projectId:string,expectedRevision?:number)=>Promise<{pack:LabPack;revision:number}>;
export type LabSourceLoader=(projectId:string)=>Promise<GoogleSourceIndex>;
export type LabSessionLoader=(projectId:string,sessionId:string)=>Promise<{
 pack:LabPack;packRevision:number;session:LabSession;sessionRevision:number;
}>;
const projectId=/^[A-Za-z0-9_-]{3,64}$/;
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
export async function hydrateLabBridgeRequest(req:WorldV3BatchRequest,load:LabPackLoader,loadSources?:LabSourceLoader,loadSession?:LabSessionLoader):Promise<WorldV3BatchRequest>{
 if(!req||!Array.isArray(req.jobs)||req.jobs.length>12)throw Error("LAB_BRIDGE_INVALID_BATCH");
 const jobs=[];
 for(const job of req.jobs){
  const payload=job.payload;
  // The draft must be checked against the actual saved campaign at a known
  // revision; narrator-provided or cross-campaign memory cannot authorize it.
  if(job.operation==="world_review"&&record(payload)&&record(payload.rpgLabNarrationV1)){
   if(Object.keys(payload).length!==1||!loadSession)
    throw Error("LAB_NARRATION_BRIDGE_ENVELOPE");
   const spec=payload.rpgLabNarrationV1;
   if(typeof spec.projectId!=="string"||!projectId.test(spec.projectId)||
      typeof spec.sessionId!=="string"||!projectId.test(spec.sessionId))
    throw Error("LAB_NARRATION_BRIDGE_REF_INVALID");
   const loaded=await loadSession(spec.projectId,spec.sessionId);
   if(loaded.pack.projectId!==spec.projectId||
      loaded.session.projectId!==spec.projectId||
      loaded.session.sessionId!==spec.sessionId)
    throw Error("LAB_NARRATION_BRIDGE_PROJECT_MISMATCH");
   const checked=reviewLabNarration(loaded.pack,loaded.session,
    spec as LabNarrativeReviewRequest,loaded.sessionRevision);
   jobs.push({...job,payload:{rpgLabNarrationResolvedV1:checked}});
   continue;
  }
  // Bounded GM-only roleplay state for an existing RPG Lab session.
  // Neither scene reaction nor private knowledge is generated from caller prose.
  if(job.operation==="world_review"&&record(payload)&&record(payload.rpgLabSceneV1)){
   if(Object.keys(payload).length!==1||!loadSession)throw Error("LAB_SCENE_BRIDGE_ENVELOPE");
   const spec=payload.rpgLabSceneV1;
   if(typeof spec.projectId!=="string"||!projectId.test(spec.projectId)||
      typeof spec.sessionId!=="string"||!projectId.test(spec.sessionId)||
      !Array.isArray(spec.npcIds)||spec.npcIds.length>8)
    throw Error("LAB_SCENE_BRIDGE_REF_INVALID");
   const loaded=await loadSession(spec.projectId,spec.sessionId);
   if(loaded.pack.projectId!==spec.projectId||loaded.session.projectId!==spec.projectId||
      loaded.session.sessionId!==spec.sessionId)
    throw Error("LAB_SCENE_BRIDGE_PROJECT_MISMATCH");
   const brief=buildLabSceneBrief(loaded.pack,loaded.session,{
    npcIds:spec.npcIds as string[],eventRef:spec.eventRef as string|undefined,
    featureIds:spec.featureIds as string[]|undefined,
    maxMemories:spec.maxMemories===undefined?8:spec.maxMemories as number,
   });
   const envelope={...brief,packRevision:loaded.packRevision,
     sessionRevision:loaded.sessionRevision,sourceAttestedBySave:true};
   if(JSON.stringify(envelope).length>45000)throw Error("LAB_SCENE_BRIEF_TOO_LARGE");
   jobs.push({...job,payload:{rpgLabSceneResolvedV1:envelope}});
   continue;
  }
  // World tick is source-bound to this campaign's actual game time and work
  // queue, not to an arbitrary caller-supplied process list.
  if(job.operation==="world_review"&&record(payload)&&record(payload.rpgLabTickV1)){
   if(Object.keys(payload).length!==1||!loadSession)throw Error("LAB_TICK_BRIDGE_ENVELOPE");
   const spec=payload.rpgLabTickV1;
   if(typeof spec.projectId!=="string"||!projectId.test(spec.projectId)||
      typeof spec.sessionId!=="string"||!projectId.test(spec.sessionId)||
      typeof spec.toMinute!=="number"||!Number.isSafeInteger(spec.toMinute))
    throw Error("LAB_TICK_BRIDGE_REF_INVALID");
   const loaded=await loadSession(spec.projectId,spec.sessionId);
   if(loaded.pack.projectId!==spec.projectId||loaded.session.projectId!==spec.projectId||
      loaded.session.sessionId!==spec.sessionId)
    throw Error("LAB_TICK_BRIDGE_PROJECT_MISMATCH");
   const from=narrativeMinute(loaded.session.gameClock);
   if(from===null||spec.toMinute<from||spec.toMinute-from>10080||
      (spec.fromMinute!==undefined&&spec.fromMinute!==from))
    throw Error("LAB_TICK_BRIDGE_CLOCK_INVALID");
   const ids=spec.npcIds??[];
   if(!Array.isArray(ids)||ids.length>16||
     ids.some(x=>typeof x!=="string"||!loaded.pack.npcProfiles[x]))
    throw Error("LAB_TICK_BRIDGE_NPCS_INVALID");
   const sourceJobs=withSessionDefaults([{
    id:"lab.tick",kind:"world_tick",
    args:{fromMinute:from,toMinute:spec.toMinute,npcIds:ids},
   }],loaded.session);
   const resolved=evaluateLabPack(loaded.pack,sourceJobs);
   if(!resolved.results[0].ok)
    throw Error("LAB_TICK_EVALUATION_FAILED:"+resolved.results[0].error);
   jobs.push({...job,payload:{rpgLabEvaluatedV1:{
    ...resolved,packRevision:loaded.packRevision,
    sessionRevision:loaded.sessionRevision,sourceAttestedBySave:true,
   }}});
   continue;
  }
  if(job.operation==="world_review"&&record(payload)&&record(payload.rpgLabSessionV1)){
   if(Object.keys(payload).length!==1||!loadSession)throw Error("LAB_SESSION_BRIDGE_ENVELOPE");
   const spec=payload.rpgLabSessionV1;
   if(typeof spec.projectId!=="string"||!projectId.test(spec.projectId)||
      typeof spec.sessionId!=="string"||!projectId.test(spec.sessionId))
    throw Error("LAB_SESSION_BRIDGE_REF_INVALID");
   const loaded=await loadSession(spec.projectId,spec.sessionId);
   if(loaded.pack.projectId!==spec.projectId||loaded.session.projectId!==spec.projectId||
      loaded.session.sessionId!==spec.sessionId)
    throw Error("LAB_SESSION_BRIDGE_PROJECT_MISMATCH");
   const view=reviewLabSessionMemory(loaded.pack,loaded.session,spec as LabMemoryViewRequest);
   const hunt=spec.huntPreview;
   if(hunt!==undefined&&(!record(hunt)||typeof hunt.sourceRef!=="string"||!record(hunt.options)||
      Object.keys(hunt).some(k=>!["sourceRef","options"].includes(k))))throw Error("HUNT_PREVIEW_INVALID");
   const huntPreview=record(hunt)?runChromaHuntBatch(loaded.session,hunt.sourceRef as string,hunt.options as Record<string,unknown>,applyOrarioPlayerAction).receipt:null;
   // The existing World V3 memory-view channel can also audit the player's actual
   // typed RPG Lab state. Keep it opt-in, read-only, and bounded to avoid leaking
   // NPC private memories or exceeding World V3's 64 KiB payload limit.
   const compactRequested=spec.includeCompactPlayerAudit===true;
   if(spec.includeCompactPlayerAudit!==undefined&&typeof spec.includeCompactPlayerAudit!=="boolean")
    throw Error("LAB_COMPACT_PLAYER_AUDIT_FLAG_INVALID");
   if(compactRequested&&spec.includePlayerAudit===true)
    throw Error("LAB_PLAYER_AUDIT_MODES_CONFLICT");
   const p=loaded.session.player.jinwoo;
   const compact=compactRequested&&p?{
    locationId:loaded.session.player.locationId??null,
    systemLevel:p.systemLevel,xp:p.xp,freeStatPoints:p.freeStatPoints,
    hp:p.hp,hpMax:effectiveJinwooMaxHp(p),mp:p.mp,mpMax:effectiveJinwooMaxMp(p),
    fatigue:p.fatigue,stamina:effectiveJinwooStaminaReserve(p),
    stats:p.stats,effectiveStats:projectJinwooFalna(p).total,
    falna:{level:p.falna.divineLevel,status:p.falna.status,godId:p.falna.godId??null},
    gold:p.gold,valis:p.valis,activeTitle:p.chromaV4Meta?.activeTitle??null,
    activeSkills:(p.activeSkills??[]).slice(0,20),
    skillMastery:Object.entries(p.skillMastery??{}).slice(0,20).map(([id,m])=>
      ({id,level:m.level,xp:m.xp,uses:m.uses})),
    daggerUses:p.combatTraining?.dagger?.uses??0,
    inventory:Object.entries(p.inventory).slice(0,40).map(([id,quantity])=>({id,quantity})),
    inventoryDistinctCount:Object.keys(p.inventory).length,
    battle:readCurrentPlayerBattle(p),
    battleConditions:p.activeEncounter?{
      bleeding:(p.activeEncounter.bleedingWounds??[]).slice(0,20),
      paralysis:(p.activeEncounter.paralyzedLocations??[]).slice(0,20),
      lastCombatRef:p.activeEncounter.lastCombatRef??null}:null,
    recentEvents:loaded.session.events.slice(-8),
    gmPostCount:loaded.session.gmPostCadence?.count??0,
    heldMagicStones:Object.values(p.magicStones).filter(x=>x.state==="held").length,
    lastHuntBatch:p.lastHuntBatch?{sourceRef:p.lastHuntBatch.sourceRef,endClock:p.lastHuntBatch.endClock,totals:p.lastHuntBatch.totals,stopReason:p.lastHuntBatch.stopReason}:null,
    sourceAttestedBySave:true,readOnly:true
   }:null;
   const auditRequested=spec.includePlayerAudit===true;
   if(spec.includePlayerAudit!==undefined&&typeof spec.includePlayerAudit!=="boolean")
    throw Error("LAB_PLAYER_AUDIT_FLAG_INVALID");
   const eventOffset=typeof spec.eventOffset==="number"?spec.eventOffset:
    spec.eventOffset===undefined?0:Number.NaN;
   const eventLimit=typeof spec.eventLimit==="number"?spec.eventLimit:
    spec.eventLimit===undefined?12:Number.NaN;
   if(auditRequested&&(!Number.isSafeInteger(eventOffset)||eventOffset<0||
      !Number.isSafeInteger(eventLimit)||eventLimit<1||eventLimit>30))
    throw Error("LAB_PLAYER_AUDIT_PAGINATION_INVALID");
   const audit=auditRequested?{
    player:loaded.session.player,
    gameClock:loaded.session.gameClock,
    discovered:loaded.session.discovered,
    activeEventCount:loaded.session.events.length,
    archivedEventCount:loaded.session.archivedEventCount??0,
    eventOffset,eventLimit,
    events:loaded.session.events.slice(eventOffset,eventOffset+eventLimit),
    worldEventCount:loaded.session.worldEvents?.length??0,
    sourceAttestedBySave:true,
    readOnly:true,
   }:null;
   jobs.push({...job,payload:{rpgLabSessionResolvedV1:{
    ...view,packRevision:loaded.packRevision,sessionRevision:loaded.sessionRevision,
    ...(audit?{playerAudit:audit}:{}),
    ...(compact?{compactPlayerAudit:compact}:{}),
    ...(huntPreview?{huntPreview:{...huntPreview,readOnly:true,committed:false}}:{}),
   }}});
   continue;
  }
  if(job.operation==="world_review"&&record(payload)&&record(payload.rpgLabSourcesV1)){
   const spec=payload.rpgLabSourcesV1;
   if(Object.keys(payload).length!==1||typeof spec.projectId!=="string"||
      !projectId.test(spec.projectId)||!loadSources)
    throw Error("LAB_SOURCE_LOOKUP_INVALID");
   const query=spec.query===undefined?"":spec.query;
   if(typeof query!=="string"||query.length>120)throw Error("LAB_SOURCE_QUERY_INVALID");
   const limit=spec.maxResults===undefined?5:spec.maxResults;
   if(typeof limit!=="number"||!Number.isSafeInteger(limit)||limit<1||limit>10)
    throw Error("LAB_SOURCE_LIMIT_INVALID");
   const index=await loadSources(spec.projectId);
   const found=index.notes.filter(n=>!query||n.name.toLowerCase().includes(query.toLowerCase()))
     .slice(0,limit).map(n=>({fileId:n.fileId,name:n.name,
      modifiedTime:n.modifiedTime,textExcerpt:n.excerpt}));
   jobs.push({...job,payload:{rpgLabSourcesResolvedV1:{
    projectId:spec.projectId,sources:found,sourceIndexUpdated:index.modifiedAt,
    truncatedExcerpts:true,sourceType:"GOOGLE_DRIVE_SYNCHRONIZED",
   }}});
   continue;
  }
  if(job.operation!=="world_review"||!record(payload)||!record(payload.rpgLabV1)){
   jobs.push(job);continue;
  }
  const lab=payload.rpgLabV1;
  if(lab.pack!==undefined){jobs.push(job);continue;}
  const project=lab.projectId;
  if(typeof project!=="string"||!projectId.test(project)||!Array.isArray(lab.jobs))
   throw Error("LAB_BRIDGE_PROJECT_REF_INVALID");
  const expected=lab.expectedRevision;
  if(expected!==undefined&&(typeof expected!=="number"||!Number.isSafeInteger(expected)||expected<1))
   throw Error("LAB_BRIDGE_EXPECTED_REVISION_INVALID");
  const loaded=await load(project,expected as number|undefined);
  if(loaded.pack.projectId!==project)throw Error("LAB_BRIDGE_PROJECT_MISMATCH");
  if(JSON.stringify(loaded.pack).length>100000)throw Error("LAB_BRIDGE_PACK_TOO_LARGE_USE_HTTP");
  const inline={rpgLabV1:{pack:loaded.pack,jobs:lab.jobs,packRevision:loaded.revision}};
  if(JSON.stringify(inline).length>46000){
   const results=evaluateLabPack(loaded.pack,lab.jobs as LabJob[]);
   jobs.push({...job,payload:{rpgLabEvaluatedV1:{...results,packRevision:loaded.revision}}});
  }else{
   jobs.push({...job,payload:inline});
  }
 }
 const hydrated={...req,jobs};
 if(JSON.stringify(hydrated).length>64000)throw Error("LAB_BRIDGE_PACK_TOO_LARGE_USE_HTTP");
 return hydrated;
}
