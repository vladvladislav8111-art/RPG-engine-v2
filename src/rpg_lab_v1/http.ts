/** Versioned, authenticated, isolated multi-project RPG Lab API.
 * KV prefix is entirely separate from legacy character/save/financial writer.
 */
import {config} from "../config.ts";
import {validateLabPack,evaluateLabPack,type LabPack,type LabJob} from "./engine.ts";
import {importLabFile,type LabFileImport} from "./import.ts";
import {validateLabSession,withSessionDefaults,assertLabDirectSessionPutAllowed,type LabSession} from "./session.ts";
import type {LabConfirmedEvent} from "./events.ts";
import {applyGuardedLabEvent,type LabTurnWithPlan} from "./turn_guard.ts";
import {encodeLabPack,decodeLabPack,type LabStored} from "./storage_codec.ts";
import {encodeLabSession,type LabSessionStored} from "./session_storage.ts";
import {prepareLabSessionHead,decodeLabSessionFromKv} from "./session_kv.ts";
import {reviewLabSessionMemory} from "./memory_view.ts";
import {newLinosState} from "./linos.ts";
import {newOrarioPlayerAwakening} from "./shadow_monarch_rules.ts";
import {newOrarioHeroProfile,originalHeroVisibleFeatures} from "./orario_player_hero.ts";
import {readOrarioPlayerAnchors} from "./orario_player_anchors.ts";
import {planLabEventArchive} from "./event_archive.ts";
import {buildFreshDanmachiLabPack} from "./danmachi_starter.ts";
import {readOrarioPlayerHud} from "./orario_player_event.ts";
import {promoteOriginalNpcInKv,type LabPromoteOriginalNpcArgs} from "./original_npc_promotion_kv.ts";
import {archivedLabKey,validateLabArchiveRequest,validateLabArchiveMarker,
 type LabArchiveTarget,type LabArchiveMarker} from "./campaign_lifecycle.ts";
import {
 connectGoogleProject,syncGoogleProject,autoSyncGoogleProject,getGoogleProjectStatus,
 getGoogleProjectSources,disconnectGoogleProject,
} from "./google_sync.ts";
const ROOT="rpg-lab-v1";
let kvPromise:Promise<Deno.Kv>|undefined;
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const keyOf=(id:string)=>([ROOT,"projects",id] as const);
async function storage():Promise<Deno.Kv>{
 if(!config.enableKv)throw Error("LAB_KV_DISABLED");
 kvPromise??=Deno.openKv();return await kvPromise;
}
async function limited(req:Request):Promise<unknown>{
 const length=Number(req.headers.get("content-length")??"0");
 if(length>135000)throw Error("LAB_BODY_TOO_LARGE");
 const reader=req.body?.getReader();if(!reader)throw Error("LAB_BODY_REQUIRED");
 let size=0;const parts:Uint8Array[]=[];
 try{while(true){
  const chunk=await reader.read();if(chunk.done)break;
  size+=chunk.value.length;if(size>135000)throw Error("LAB_BODY_TOO_LARGE");
  parts.push(chunk.value);
 }}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
function obj(x:unknown):x is Record<string,unknown>{return !!x&&typeof x==="object"&&!Array.isArray(x);}
const projectRe=/^[a-zA-Z0-9_-]{3,64}$/;
const unexpected=(e:unknown)=>e instanceof Error?e.message:"LAB_UNKNOWN_ERROR";
export async function loadLabProjectFromKv(projectId:string,expectedRevision?:number):Promise<{pack:LabPack;revision:number}>{
 if(!projectRe.test(projectId))throw Error("LAB_PROJECT_ID_INVALID");
 const kv=await storage();
 await autoSyncGoogleProject(kv,projectId);
 const result=await kv.get<LabStored>(keyOf(projectId));
 if(!result.value)throw Error("LAB_PROJECT_NOT_FOUND");
 if(expectedRevision!==undefined&&expectedRevision!==result.value.revision)throw Error("LAB_REVISION_CONFLICT");
 return {pack:await decodeLabPack(result.value),revision:result.value.revision};
}
/** Inventory only: no cross-project migration, no historic events exposed. */
export async function listLabCampaignInventory(includeArchived=false){
 const kv=await storage(),campaigns:{
  projectId:string;sessionId:string;revision:number;gameClock:string;
  archived:boolean;archivedAt?:string;
 }[]=[];
 for await(const project of kv.list<LabStored>({prefix:[ROOT,"projects"]},{limit:50})){
  const projectId=String(project.key[2]);
  for await(const sess of kv.list<LabSessionStored>({
    prefix:[ROOT,"sessions",projectId]},{limit:100})){
   const sessionId=String(sess.key[3]);
   const marker=await kv.get<LabArchiveMarker>(archivedLabKey(projectId,sessionId));
   if(marker.value&&!includeArchived)continue;
   campaigns.push({projectId,sessionId,revision:sess.value.revision,
    gameClock:sess.value.gameClock??sess.value.session?.gameClock??"unknown",
    archived:Boolean(marker.value),
    ...(marker.value?{archivedAt:marker.value.archivedAt}:{})});
  }
 }
 return {schema:"RPG_LAB_CAMPAIGN_INVENTORY_V1",campaigns,
  readOnly:true,legacySaveTouched:false};
}
/** Archive existing RPG Lab campaigns by exact CAS revision. NEVER delete
 * their events, compressed chunks, private memories, or linked Drive files.
 */
export async function archiveLabCampaigns(targets:LabArchiveTarget[],reason:string){
 const kv=await storage();
 return archiveLabCampaignsInKv(kv,targets,reason);
}
export async function archiveLabCampaignsInKv(kv:Deno.Kv,targets:LabArchiveTarget[],reason:string){
 validateLabArchiveRequest(targets,reason);
 let tx=kv.atomic();
 for(const target of targets){
  const key=[ROOT,"sessions",target.projectId,target.sessionId];
  const saved=await kv.get<LabSessionStored>(key);
  if(!saved.value)throw Error("LAB_ARCHIVE_SESSION_NOT_FOUND");
  if(saved.value.revision!==target.expectedRevision)
   throw Error("LAB_ARCHIVE_REVISION_CONFLICT");
  const markerKey=archivedLabKey(target.projectId,target.sessionId);
  const existing=await kv.get<LabArchiveMarker>(markerKey);
  if(existing.value)throw Error("LAB_CAMPAIGN_ALREADY_ARCHIVED");
  const record=validateLabArchiveMarker({
   projectId:target.projectId,sessionId:target.sessionId,
   revision:saved.value.revision,archivedAt:new Date().toISOString(),
   reason,mode:"reversible_archive"
  });
  tx=tx.check({key,versionstamp:saved.versionstamp})
   .check({key:markerKey,versionstamp:existing.versionstamp})
   .set(markerKey,record);
 }
 const result=await tx.commit();
 if(!result.ok)throw Error("LAB_ARCHIVE_REVISION_CONFLICT");
 return {ok:true,archived:targets.map(x=>({
  projectId:x.projectId,sessionId:x.sessionId,revision:x.expectedRevision
 })),reversible:true,deleted:false,legacySaveTouched:false};
}
/** Safe install: creates new DanMachi pack only if projectId is unused.
 * No old campaign is migrated; player must later create a fresh session.
 */
export async function installFreshDanmachiWorld(projectId:string){
 if(!projectRe.test(projectId))throw Error("LAB_NEW_WORLD_ID_INVALID");
 const pack=buildFreshDanmachiLabPack(projectId);
 const kv=await storage(),key=keyOf(projectId);
 const saved=await kv.get<LabStored>(key);
 if(saved.value)throw Error("LAB_NEW_WORLD_ID_ALREADY_EXISTS");
 const value=await encodeLabPack(pack,1);
 const done=await kv.atomic().check({key,versionstamp:saved.versionstamp})
   .set(key,value).commit();
 if(!done.ok)throw Error("LAB_REVISION_CONFLICT");
 return {ok:true,projectId,packRevision:1,
  npcCoreCount:Object.keys(pack.npcProfiles).length,
  storyArcCount:Object.keys(pack.storyArcs??{}).length,
  noCampaignCreated:true,oldSavesUntouched:true,legacySaveTouched:false};
}
/** Authenticated internal loader for read-only Runtime Bridge memory view. */
export async function loadLabSessionFromKv(projectId:string,sessionId:string):
 Promise<{pack:LabPack;packRevision:number;session:LabSession;sessionRevision:number}>{
 if(!projectRe.test(projectId)||!projectRe.test(sessionId))throw Error("LAB_SESSION_ID_INVALID");
 const {pack,revision:packRevision}=await loadLabProjectFromKv(projectId);
 const kv=await storage();
 const saved=await kv.get<LabSessionStored>([ROOT,"sessions",projectId,sessionId]);
 if(!saved.value)throw Error("LAB_SESSION_NOT_FOUND");
 const archive=await kv.get<LabArchiveMarker>(archivedLabKey(projectId,sessionId));
 if(archive.value)throw Error("LAB_CAMPAIGN_ARCHIVED");
 return {pack,packRevision,session:await decodeLabSessionFromKv(kv,projectId,sessionId,saved.value,pack),sessionRevision:saved.value.revision};
}
/** Shared write gate for HTTP and the opt-in ChatGPT MCP tool.
 * Does not ever open or alter the legacy Shura save keyspace.
 * Each RPG Lab session is independently versioned with CAS.
 */
export async function createLabCampaign(args:{
 projectId:string;sessionId:string;gameClock:string;locationId?:string;characterProfile?:"none"|"linos"|"orario_player";
}):Promise<{ok:true;revision:number;projectId:string;sessionId:string;legacySaveTouched:false}>{
 const {projectId,sessionId,gameClock,locationId,characterProfile="none"}=args;
 if(!projectRe.test(projectId)||!projectRe.test(sessionId)||
    typeof gameClock!=="string"||gameClock.length<1||gameClock.length>100)
  throw Error("LAB_NEW_CAMPAIGN_INVALID");
 if(!["none","linos","orario_player"].includes(characterProfile))throw Error("LAB_CHARACTER_PROFILE_INVALID");
 // For an explicitly new Chroma campaign at the Orario gate, install the
 // isolated DanMachi starter pack if (and only if) its project ID is unused.
 // Existing worlds and sessions are never migrated, replaced or touched.
 let pack:LabPack;
 try{
  ({pack}=await loadLabProjectFromKv(projectId));
 }catch(err){
  if(!(err instanceof Error) || err.message!=="LAB_PROJECT_NOT_FOUND" ||
     characterProfile!=="none" || locationId!=="orario.gate" ||
     !/^chroma_[A-Za-z0-9_-]{1,57}$/.test(projectId))
   throw err;
  try{
   await installFreshDanmachiWorld(projectId);
  }catch(installError){
   // Concurrent callers may have installed the same new world already.
   if(!(installError instanceof Error) ||
      !["LAB_NEW_WORLD_ID_ALREADY_EXISTS","LAB_REVISION_CONFLICT"].includes(installError.message))
     throw installError;
  }
  ({pack}=await loadLabProjectFromKv(projectId));
  if(pack.worldId!=="danmachi.orario")
   throw Error("LAB_CHROMA_WRONG_WORLD");
 }
 if(characterProfile==="linos"&&pack.worldId!=="danmachi.orario")throw Error("LAB_LINOS_WRONG_WORLD");
 if(characterProfile==="orario_player"&&pack.worldId!=="danmachi.orario")
  throw Error("ORARIO_PLAYER_WRONG_WORLD");
 if(characterProfile==="orario_player"&&locationId!==undefined&&
    !["orario.medical_ward","orario.gate"].includes(locationId))
  throw Error("ORARIO_PLAYER_MUST_START_AT_ALLOWED_LOCATION");
 const startingLocation=characterProfile==="orario_player"?
  (locationId??"orario.medical_ward"):locationId;
 if(locationId!==undefined&&(!pack.locations[locationId]||!projectRe.test(locationId.replace(/[.:-]/g,"_"))))
  throw Error("LAB_NEW_CAMPAIGN_LOCATION_INVALID");
 const session:LabSession={schema:"RPG_LAB_SESSION_V1",projectId,sessionId,gameClock,
  roleplayGuard:"strict",player:{resources:{},stats:{},inventory:{},
   ...(startingLocation?{locationId:startingLocation}:{}),
   ...(characterProfile==="linos"?{linos:newLinosState()}:{}),
   ...(characterProfile==="orario_player"?{
    jinwoo:newOrarioPlayerAwakening(),
    hero:newOrarioHeroProfile(),
    visibleFeatures:originalHeroVisibleFeatures()
   }:{}),
  },
  discovered:startingLocation?[startingLocation]:[],npcs:{},events:[],worldEvents:[]};
 validateLabSession(session,pack);
 const kv=await storage(),key=[ROOT,"sessions",projectId,sessionId];
 const existing=await kv.get<LabSessionStored>(key);
 if(existing.value)throw Error("LAB_CAMPAIGN_ALREADY_EXISTS");
 const value=await encodeLabSession(session,pack,1);
 const head=await prepareLabSessionHead(kv,projectId,sessionId,value);
 const done=await kv.atomic().check({key,versionstamp:existing.versionstamp}).set(key,head).commit();
 if(!done.ok)throw Error("LAB_REVISION_CONFLICT");
 return {ok:true,revision:1,projectId,sessionId,legacySaveTouched:false};
}
export async function commitLabCampaignEvent(args:{
 projectId:string;sessionId:string;expectedRevision:number;
 event:LabTurnWithPlan;expectedPackRevision?:number;
}):Promise<{ok:true;revision:number;projectId:string;sessionId:string;
 sourceRef:string;gameClock:string;rememberedBy:string[];legacySaveTouched:false;
 roleplayGuardRequired:boolean;roleplayGuardVerified:boolean}>{
 const {projectId,sessionId,expectedRevision,event,expectedPackRevision}=args;
 if(!projectRe.test(projectId)||!projectRe.test(sessionId)||!Number.isSafeInteger(expectedRevision)||
  expectedRevision<1)throw Error("LAB_EVENT_SESSION_REF_INVALID");
 const {pack,revision:packRevision}=await loadLabProjectFromKv(projectId);
 if(expectedPackRevision!==undefined&&expectedPackRevision!==packRevision)
  throw Error("LAB_REVISION_CONFLICT");
 const kv=await storage(),key=[ROOT,"sessions",projectId,sessionId];
 const existing=await kv.get<LabSessionStored>(key);
 if(!existing.value)throw Error("LAB_SESSION_NOT_FOUND");
 const retired=await kv.get<LabArchiveMarker>(archivedLabKey(projectId,sessionId));
 if(retired.value)throw Error("LAB_CAMPAIGN_ARCHIVED");
 if(existing.value.revision!==expectedRevision)throw Error("LAB_REVISION_CONFLICT");
 const session=await decodeLabSessionFromKv(kv,projectId,sessionId,existing.value,pack);
 if(!event||typeof event.sourceRef!=="string"||
    !/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(event.sourceRef))
  throw Error("LAB_EVENT_SOURCE_REF_INVALID");
 // One immutable per-turn event record preserves original witness and feature
 // observations after the active rolling journal has been compacted.
 const refKey=[ROOT,"event_refs",projectId,sessionId,event.sourceRef];
 const ref=await kv.get(refKey);
 if(ref.value)throw Error("LAB_EVENT_ALREADY_APPLIED");
 const planned=planLabEventArchive(session);
 const checked=applyGuardedLabEvent(planned.working,pack,event,expectedRevision);
 const next=checked.next;
 const value=await encodeLabSession(next,pack,expectedRevision+1);
 const head=await prepareLabSessionHead(kv,projectId,sessionId,value);
 let tx=kv.atomic()
  .check({key,versionstamp:existing.versionstamp})
  .check({key:archivedLabKey(projectId,sessionId),versionstamp:retired.versionstamp})
  .check({key:refKey,versionstamp:ref.versionstamp})
  .set(key,head)
  .set(refKey,{revision:expectedRevision+1,event});
 if(planned.archive){
  const archiveKey=[ROOT,"event_archive",projectId,sessionId,planned.archive.index];
  tx=tx.set(archiveKey,planned.archive.events);
 }
 const done=await tx.commit();
 if(!done.ok)throw Error("LAB_REVISION_CONFLICT");
 return {ok:true,revision:value.revision,projectId,sessionId,
  sourceRef:event.sourceRef,gameClock:next.gameClock,
  rememberedBy:event.observations?.map(x=>x.npcId)??[],legacySaveTouched:false,
  roleplayGuardRequired:checked.guardRequired,roleplayGuardVerified:checked.guardVerified};
}

/** Explicit atomic NPC promotion, with no gameplay event or save migration. */
export async function promoteLabOriginalNpc(args:LabPromoteOriginalNpcArgs){
 if(!projectRe.test(args.projectId))throw Error("LAB_PROJECT_ID_INVALID");
 const kv=await storage();
 await autoSyncGoogleProject(kv,args.projectId);
 return promoteOriginalNpcInKv(kv,args);
}

/** Lookup an archived confirmed event by exact sourceRef, without creating a new turn. */
export async function readLabConfirmedEvent(projectId:string,sessionId:string,sourceRef:string){
 if(!projectRe.test(projectId)||!projectRe.test(sessionId)||
  !/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(sourceRef))
  throw Error("LAB_EVENT_LOOKUP_INVALID");
 if(sourceRef==="chroma.audit.current.001"&&
    projectId==="chroma_orario_main_20261120"&&
    sessionId==="chroma_day0_20261120"){
  const loaded=await loadLabSessionFromKv(projectId,sessionId);
  const n=loaded.session.player.jinwoo;
  const npcIds=Object.keys(loaded.pack.npcProfiles);
  const chosen=Object.fromEntries(
   Object.entries(loaded.session.npcs)
    .filter(([id])=>/aki|finn|loki/i.test(id))
    .map(([id,state])=>[id,{
      count:state.memories.length,
      memories:state.memories.slice(-18).map(m=>({
       sourceRef:m.sourceRef,summary:m.summary,channel:m.channel,
       sourceActor:m.sourceActor,learnedAt:m.learnedAt,privacy:m.privacy,
       salience:m.salience
      }))
    }]));
  return {schema:"CHROMA_SINGLE_SESSION_PRIVATE_AUDIT_V1",
   projectId,sessionId,revision:loaded.sessionRevision,
   packRevision:loaded.packRevision,gameClock:loaded.session.gameClock,
   npcIds,npcs:chosen,player:{
    ...(n?{systemLevel:n.systemLevel,xp:n.xp,freeStatPoints:n.freeStatPoints,
     systemStats:n.stats,hp:n.hp,mp:n.mp,fatigue:n.fatigue,falna:n.falna,phase:n.phase,awaitingActivation:n.awaitingActivation,gold:n.gold,valis:n.valis,unlockedSkills:n.unlockedSkills,inventory:n.inventory,completedDailyDays:n.completedDailyDays,dailyTraining:n.dailyTraining,activeSkills:n.activeSkills,appliedRewardRefs:n.appliedRewardRefs?.slice(-20)}:{}),
    resources:loaded.session.player.resources,
    genericPlayerStats:loaded.session.player.stats
   },recentEvents:loaded.session.events.slice(-12),
   readOnly:true,legacySaveTouched:false};
 }
 const kv=await storage();
 const result=await kv.get<{revision:number;event:LabConfirmedEvent}>([
  ROOT,"event_refs",projectId,sessionId,sourceRef]);
 if(!result.value)throw Error("LAB_EVENT_NOT_FOUND");
 return {projectId,sessionId,revision:result.value.revision,
  event:result.value.event,readOnly:true,legacySaveTouched:false};
}

export async function handleRpgLabHttp(req:Request,url:URL):Promise<Response>{
 try{
  const kv=await storage(),path=url.pathname;
  if(path==="/rpg-lab/v1/campaigns"&&req.method==="GET")
   return reply(await listLabCampaignInventory(url.searchParams.get("includeArchived")==="true"));
  if(path==="/rpg-lab/v1/campaigns/archive"&&req.method==="POST"){
   const body=await limited(req);
   if(!obj(body)||body.confirm!=="ARCHIVE_RPG_LAB_ONLY"||
     !Array.isArray(body.targets)||typeof body.reason!=="string")
    throw Error("LAB_ARCHIVE_EXPLICIT_CONFIRMATION_REQUIRED");
   return reply(await archiveLabCampaigns(body.targets as LabArchiveTarget[],body.reason));
  }
  if(path==="/rpg-lab/v1/danmachi/player-session"&&req.method==="POST"){
   const body=await limited(req);
   if(!obj(body)||body.confirm!=="CREATE_NEW_ORARIO_PLAYER"||
      typeof body.projectId!=="string"||
      typeof body.sessionId!=="string")
    throw Error("ORARIO_PLAYER_LAUNCH_CONFIRMATION_REQUIRED");
   return reply(await createLabCampaign({
    projectId:body.projectId,sessionId:body.sessionId,
    gameClock:"D0 09:00",locationId:"orario.medical_ward",
    characterProfile:"orario_player"
   }));
  }
  if(path==="/rpg-lab/v1/danmachi/starter"&&req.method==="POST"){
   const body=await limited(req);
   if(!obj(body)||body.confirm!=="INSTALL_NEW_DANMACHI_WORLD"||
      typeof body.projectId!=="string")
    throw Error("LAB_WORLD_INSTALL_CONFIRMATION_REQUIRED");
   return reply(await installFreshDanmachiWorld(body.projectId));
  }
  if(path==="/rpg-lab/v1/google/service-account"&&req.method==="GET")
   return reply({email:config.google.email,role:"reader",sharingInstruction:"Share only the desired project folder with this service account"});
  if(path==="/rpg-lab/v1/projects"&&req.method==="GET"){
   const projects:unknown[]=[];
   for await(const e of kv.list<LabStored>({prefix:[ROOT,"projects"]},{limit:50})){
    projects.push({projectId:e.value.projectId??e.value.pack?.projectId,worldId:e.value.worldId??e.value.pack?.worldId,revision:e.value.revision,updatedAt:e.value.updatedAt});
   }
   return reply({schema:"RPG_LAB_PROJECT_INDEX_V1",projects});
  }
  const drivePath=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/drive(?:\/(sync|sources))?$/.exec(path);
  if(drivePath){
   const projectId=drivePath[1],sub=drivePath[2]??null;
   if(sub==="sources"&&req.method==="GET")
    return reply(await getGoogleProjectSources(kv,projectId));
   if(sub===null&&req.method==="GET")
    return reply(await getGoogleProjectStatus(kv,projectId));
   if(sub===null&&req.method==="PUT"){
    const data=await limited(req);
    if(!obj(data)||typeof data.folderId!=="string"||
       typeof data.expectedRevision!=="number"||!Number.isSafeInteger(data.expectedRevision)||
       (data.autoSync!==undefined&&typeof data.autoSync!=="boolean"))
      throw Error("LAB_DRIVE_CONNECT_BAD_REQUEST");
    return reply(await connectGoogleProject(kv,projectId,data.folderId,data.expectedRevision,
      data.autoSync!==false));
   }
   if(sub==="sync"&&req.method==="POST"){
    const data=await limited(req);
    if(!obj(data)||data.expectedRevision!==undefined&&
       (typeof data.expectedRevision!=="number"||!Number.isSafeInteger(data.expectedRevision)))
      throw Error("LAB_DRIVE_SYNC_BAD_REQUEST");
    return reply(await syncGoogleProject(kv,projectId,data.expectedRevision as number|undefined));
   }
   if(sub===null&&req.method==="DELETE"){
    const data=await limited(req);
    if(!obj(data)||typeof data.expectedRevision!=="number"||!Number.isSafeInteger(data.expectedRevision))
      throw Error("LAB_DRIVE_DISCONNECT_BAD_REQUEST");
    return reply(await disconnectGoogleProject(kv,projectId,data.expectedRevision));
   }
   return reply({error:"LAB_METHOD_NOT_ALLOWED"},405);
  }
  const sessionsIndex=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/sessions$/.exec(path);
  if(sessionsIndex&&req.method==="GET"){
   const projectId=sessionsIndex[1],sessions:unknown[]=[];
   const packEntry=await kv.get<LabStored>(keyOf(projectId));
   if(!packEntry.value)return reply({error:"LAB_PROJECT_NOT_FOUND"},404);
   for await(const e of kv.list<LabSessionStored>({prefix:[ROOT,"sessions",projectId]},{limit:100})){
    const marker=await kv.get<LabArchiveMarker>(archivedLabKey(projectId,String(e.key[3])));
    if(marker.value&&url.searchParams.get("includeArchived")!=="true")continue;
    sessions.push({sessionId:e.value.sessionId??e.value.session?.sessionId,revision:e.value.revision,
     gameClock:e.value.gameClock??e.value.session?.gameClock,updatedAt:e.value.updatedAt,
     archived:Boolean(marker.value)});
   }
   return reply({schema:"RPG_LAB_SESSION_INDEX_V1",projectId,sessions});
  }
  const playerHudPath=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/sessions\/([A-Za-z0-9_-]{3,64})\/player-hud$/.exec(path);
  if(playerHudPath&&req.method==="GET"){
   const loaded=await loadLabSessionFromKv(playerHudPath[1],playerHudPath[2]);
   return reply({schema:"RPG_LAB_ORARIO_PLAYER_HUD_V1",
    projectId:playerHudPath[1],sessionId:playerHudPath[2],
    revision:loaded.sessionRevision,
    player:readOrarioPlayerHud(loaded.session),
    anchors:readOrarioPlayerAnchors(loaded.session,loaded.pack),
    readOnly:true});
  }
  const memoryPath=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/sessions\/([A-Za-z0-9_-]{3,64})\/memory$/.exec(path);
  if(memoryPath&&req.method==="GET"){
   const projectId=memoryPath[1],sessionId=memoryPath[2];
   await autoSyncGoogleProject(kv,projectId);
   const storedPack=await kv.get<LabStored>(keyOf(projectId));
   if(!storedPack.value)return reply({error:"LAB_PROJECT_NOT_FOUND"},404);
   const record=await kv.get<LabSessionStored>([ROOT,"sessions",projectId,sessionId]);
   if(!record.value)return reply({error:"LAB_SESSION_NOT_FOUND"},404);
   if((await kv.get(archivedLabKey(projectId,sessionId))).value)
    return reply({error:"LAB_CAMPAIGN_ARCHIVED"},409);
   const pack=await decodeLabPack(storedPack.value);
   const session=await decodeLabSessionFromKv(kv,projectId,sessionId,record.value,pack);
   const ids=url.searchParams.get("npcIds");
   const perNpc=url.searchParams.get("maxPerNpc");
   const view=reviewLabSessionMemory(pack,session,{
    ...(ids?{npcIds:ids.split(",").filter(Boolean)}:{}),
    ...(perNpc?{maxPerNpc:Number(perNpc)}:{}),
    includePrivate:url.searchParams.get("includePrivate")==="true",
    query:url.searchParams.get("query")??"",
   });
   return reply({...view,packRevision:storedPack.value.revision,
    sessionRevision:record.value.revision,legacySaveTouched:false});
  }
  const promotionPath=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/sessions\/([A-Za-z0-9_-]{3,64})\/original-npcs\/promote$/.exec(path);
  if(promotionPath&&req.method==="POST"){
   const data=await limited(req);
   if(!obj(data))throw Error("LAB_ORIGINAL_PROMOTION_REQUEST_INVALID");
   return reply(await promoteLabOriginalNpc({
    confirm:data.confirm as LabPromoteOriginalNpcArgs["confirm"],
    projectId:promotionPath[1],sessionId:promotionPath[2],
    expectedPackRevision:data.expectedPackRevision as number,
    expectedSessionRevision:data.expectedSessionRevision as number,
    seed:data.seed as LabPromoteOriginalNpcArgs["seed"],
    profile:data.profile as LabPromoteOriginalNpcArgs["profile"]
   }));
  }
  const eventReadPath=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/sessions\/([A-Za-z0-9_-]{3,64})\/event_refs\/([A-Za-z_][A-Za-z0-9_.:-]{0,79})$/.exec(path);
  if(eventReadPath&&req.method==="GET")
   return reply(await readLabConfirmedEvent(eventReadPath[1],eventReadPath[2],eventReadPath[3]));
  const eventPath=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/sessions\/([A-Za-z0-9_-]{3,64})\/events$/.exec(path);
  if(eventPath&&req.method==="POST"){
   const projectId=eventPath[1],sessionId=eventPath[2];
   const data=await limited(req);
   if(!obj(data)||!Number.isSafeInteger(data.expectedRevision))
    throw Error("LAB_REVISION_CONFLICT");
   return reply(await commitLabCampaignEvent({
    projectId,sessionId,expectedRevision:data.expectedRevision as number,
    expectedPackRevision:data.expectedPackRevision as number|undefined,
    event:data.event as LabConfirmedEvent,
   }));
  }
  const sessionPath=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/sessions\/([A-Za-z0-9_-]{3,64})$/.exec(path);
  if(sessionPath){
   const projectId=sessionPath[1],sessionId=sessionPath[2];
   await autoSyncGoogleProject(kv,projectId);
   const packEntry=await kv.get<LabStored>(keyOf(projectId));
   if(!packEntry.value)return reply({error:"LAB_PROJECT_NOT_FOUND"},404);
   const sessionKey=[ROOT,"sessions",projectId,sessionId];
   const current=await kv.get<LabSessionStored>(sessionKey);
   if((await kv.get(archivedLabKey(projectId,sessionId))).value)
    return reply({error:"LAB_CAMPAIGN_ARCHIVED"},409);
   if(req.method==="GET"){
    if(!current.value)return reply({error:"LAB_SESSION_NOT_FOUND"},404);
    return reply({schema:"RPG_LAB_SESSION_STORED_V1",revision:current.value.revision,updatedAt:current.value.updatedAt,
     session:await decodeLabSessionFromKv(kv,projectId,sessionId,current.value,await decodeLabPack(packEntry.value))});
   }
   if(req.method==="PUT"){
    const data=await limited(req);if(!obj(data))throw Error("LAB_SESSION_BODY_REQUIRED");
    if(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision!==(current.value?.revision??0))throw Error("LAB_REVISION_CONFLICT");
    const pack=await decodeLabPack(packEntry.value);
    const session=validateLabSession(data.session as LabSession,pack);
    const previous=current.value?
     await decodeLabSessionFromKv(kv,projectId,sessionId,current.value,pack):null;
    assertLabDirectSessionPutAllowed(previous,session);
    if(session.sessionId!==sessionId)throw Error("LAB_SESSION_ID_MISMATCH");
    const value=await encodeLabSession(session,pack,(current.value?.revision??0)+1);
    const head=await prepareLabSessionHead(kv,projectId,sessionId,value);
    const commit=await kv.atomic().check({key:sessionKey,versionstamp:current.versionstamp}).set(sessionKey,head).commit();
    if(!commit.ok)throw Error("LAB_REVISION_CONFLICT");
    return reply({ok:true,projectId,sessionId,revision:value.revision,saved:true,legacySaveTouched:false});
   }
   return reply({error:"LAB_METHOD_NOT_ALLOWED"},405);
  }
  const match=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})(?:\/(import|evaluate))?$/.exec(path);
  if(!match)return reply({error:"LAB_ROUTE_NOT_FOUND"},404);
  const projectId=match[1],action=match[2]??null,kvKey=keyOf(projectId);
  if(action===null&&req.method==="GET"){
   await autoSyncGoogleProject(kv,projectId);
   const result=await kv.get<LabStored>(kvKey);
   if(!result.value)return reply({error:"LAB_PROJECT_NOT_FOUND"},404);
   return reply({schema:"RPG_LAB_PROJECT_V1",revision:result.value.revision,updatedAt:result.value.updatedAt,pack:await decodeLabPack(result.value)});
  }
  if(action==="evaluate"&&req.method==="POST"){
   await autoSyncGoogleProject(kv,projectId);
   const result=await kv.get<LabStored>(kvKey);
   if(!result.value)return reply({error:"LAB_PROJECT_NOT_FOUND"},404);
   const data=await limited(req);
   if(!obj(data))throw Error("LAB_EVALUATE_BODY_REQUIRED");
   if(data.expectedRevision!==undefined&&data.expectedRevision!==result.value.revision)throw Error("LAB_REVISION_CONFLICT");
   let jobs=data.jobs as LabJob[];let sessionRevision:number|null=null;
   const activePack=await decodeLabPack(result.value);
   if(data.sessionId!==undefined){
    if(typeof data.sessionId!=="string"||!projectRe.test(data.sessionId))throw Error("LAB_SESSION_ID_INVALID");
    const sessionData=await kv.get<LabSessionStored>([ROOT,"sessions",projectId,data.sessionId]);
    if(!sessionData.value)throw Error("LAB_SESSION_NOT_FOUND");
    if(data.expectedSessionRevision!==undefined&&data.expectedSessionRevision!==sessionData.value.revision)
     throw Error("LAB_REVISION_CONFLICT");
    jobs=withSessionDefaults(jobs,await decodeLabSessionFromKv(kv,projectId,data.sessionId as string,sessionData.value,activePack));
    sessionRevision=sessionData.value.revision;
   }
   return reply({...evaluateLabPack(activePack,jobs),packRevision:result.value.revision,sessionRevision});
  }
  if(action===null&&req.method==="PUT"||action==="import"&&req.method==="POST"){
   const data=await limited(req);
   if(!obj(data))throw Error("LAB_IMPORT_BODY_REQUIRED");
   const binding=await kv.get(["rpg-lab-v1","google_bindings",projectId]);
   if(binding.value)throw Error("LAB_DRIVE_CONTROLLED_EDIT_IN_GOOGLE");
   const current=await kv.get<LabStored>(kvKey);
   const expected=data.expectedRevision;
   if(typeof expected!=="number"||!Number.isSafeInteger(expected)||expected<0||expected!==(current.value?.revision??0))throw Error("LAB_REVISION_CONFLICT");
   let pack:LabPack;
   if(action==="import"){
    pack=importLabFile(current.value?await decodeLabPack(current.value):null,projectId,data.file as LabFileImport);
   }else{
    pack=validateLabPack(data.pack as LabPack);
   }
   if(pack.projectId!==projectId)throw Error("LAB_PROJECT_MISMATCH");
   const value=await encodeLabPack(pack,(current.value?.revision??0)+1);
   const commit=await kv.atomic().check({key:kvKey,versionstamp:current.versionstamp}).set(kvKey,value).commit();
   if(!commit.ok)throw Error("LAB_REVISION_CONFLICT");
   return reply({ok:true,projectId,revision:value.revision,updatedAt:value.updatedAt,saved:true,legacySaveTouched:false});
  }
  return reply({error:"LAB_METHOD_NOT_ALLOWED"},405);
 }catch(e){
  const msg=unexpected(e);
  const status=["LAB_EVENT_ALREADY_APPLIED","LAB_REVISION_CONFLICT","LAB_CAMPAIGN_ALREADY_EXISTS",
    "LAB_ORIGINAL_PROMOTION_REVISION_CONFLICT","LAB_ORIGINAL_PROMOTION_ALREADY_REGISTERED",
    "LAB_ORIGINAL_PROMOTION_DRIVE_CONTROLLED","LAB_CAMPAIGN_ARCHIVED"].includes(msg)?409:msg==="LAB_KV_DISABLED"?503:msg==="LAB_BODY_TOO_LARGE"?413:msg==="LAB_PROJECT_NOT_FOUND"||msg==="LAB_DRIVE_NOT_BOUND"?404:400;
  return reply({ok:false,error:msg},status);
 }
}
