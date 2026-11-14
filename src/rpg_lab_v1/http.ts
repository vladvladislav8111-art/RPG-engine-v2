/** Versioned, authenticated, isolated multi-project RPG Lab API.
 * KV prefix is entirely separate from legacy character/save/financial writer.
 */
import {config} from "../config.ts";
import {validateLabPack,evaluateLabPack,type LabPack,type LabJob} from "./engine.ts";
import {importLabFile,type LabFileImport} from "./import.ts";
import {validateLabSession,withSessionDefaults,type LabSession} from "./session.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "./events.ts";
import {encodeLabPack,decodeLabPack,type LabStored} from "./storage_codec.ts";
import {encodeLabSession,decodeLabSession,type LabSessionStored} from "./session_storage.ts";
import {reviewLabSessionMemory} from "./memory_view.ts";
import {newLinosState} from "./linos.ts";
import {planLabEventArchive} from "./event_archive.ts";
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
/** Authenticated internal loader for read-only Runtime Bridge memory view. */
export async function loadLabSessionFromKv(projectId:string,sessionId:string):
 Promise<{pack:LabPack;packRevision:number;session:LabSession;sessionRevision:number}>{
 if(!projectRe.test(projectId)||!projectRe.test(sessionId))throw Error("LAB_SESSION_ID_INVALID");
 const {pack,revision:packRevision}=await loadLabProjectFromKv(projectId);
 const kv=await storage();
 const saved=await kv.get<LabSessionStored>([ROOT,"sessions",projectId,sessionId]);
 if(!saved.value)throw Error("LAB_SESSION_NOT_FOUND");
 return {pack,packRevision,session:await decodeLabSession(saved.value,pack),sessionRevision:saved.value.revision};
}
/** Shared write gate for HTTP and the opt-in ChatGPT MCP tool.
 * Does not ever open or alter the legacy Shura save keyspace.
 * Each RPG Lab session is independently versioned with CAS.
 */
export async function createLabCampaign(args:{
 projectId:string;sessionId:string;gameClock:string;locationId?:string;characterProfile?:"none"|"linos";
}):Promise<{ok:true;revision:number;projectId:string;sessionId:string;legacySaveTouched:false}>{
 const {projectId,sessionId,gameClock,locationId,characterProfile="none"}=args;
 if(!projectRe.test(projectId)||!projectRe.test(sessionId)||
    typeof gameClock!=="string"||gameClock.length<1||gameClock.length>100)
  throw Error("LAB_NEW_CAMPAIGN_INVALID");
 if(!["none","linos"].includes(characterProfile))throw Error("LAB_CHARACTER_PROFILE_INVALID");
 const {pack}=await loadLabProjectFromKv(projectId);
 if(characterProfile==="linos"&&pack.worldId!=="danmachi.orario")throw Error("LAB_LINOS_WRONG_WORLD");
 if(locationId!==undefined&&(!pack.locations[locationId]||!projectRe.test(locationId.replace(/[.:-]/g,"_"))))
  throw Error("LAB_NEW_CAMPAIGN_LOCATION_INVALID");
 const session:LabSession={schema:"RPG_LAB_SESSION_V1",projectId,sessionId,gameClock,
  player:{resources:{},stats:{},inventory:{},
   ...(locationId?{locationId}:{}),
   ...(characterProfile==="linos"?{linos:newLinosState()}:{}),
  },
  discovered:locationId?[locationId]:[],npcs:{},events:[],worldEvents:[]};
 validateLabSession(session,pack);
 const kv=await storage(),key=[ROOT,"sessions",projectId,sessionId];
 const existing=await kv.get<LabSessionStored>(key);
 if(existing.value)throw Error("LAB_CAMPAIGN_ALREADY_EXISTS");
 const value=await encodeLabSession(session,pack,1);
 const done=await kv.atomic().check({key,versionstamp:existing.versionstamp}).set(key,value).commit();
 if(!done.ok)throw Error("LAB_REVISION_CONFLICT");
 return {ok:true,revision:1,projectId,sessionId,legacySaveTouched:false};
}
export async function commitLabCampaignEvent(args:{
 projectId:string;sessionId:string;expectedRevision:number;
 event:LabConfirmedEvent;expectedPackRevision?:number;
}):Promise<{ok:true;revision:number;projectId:string;sessionId:string;
 sourceRef:string;gameClock:string;rememberedBy:string[];legacySaveTouched:false}>{
 const {projectId,sessionId,expectedRevision,event,expectedPackRevision}=args;
 if(!projectRe.test(projectId)||!projectRe.test(sessionId)||!Number.isSafeInteger(expectedRevision)||
  expectedRevision<1)throw Error("LAB_EVENT_SESSION_REF_INVALID");
 const {pack,revision:packRevision}=await loadLabProjectFromKv(projectId);
 if(expectedPackRevision!==undefined&&expectedPackRevision!==packRevision)
  throw Error("LAB_REVISION_CONFLICT");
 const kv=await storage(),key=[ROOT,"sessions",projectId,sessionId];
 const existing=await kv.get<LabSessionStored>(key);
 if(!existing.value)throw Error("LAB_SESSION_NOT_FOUND");
 if(existing.value.revision!==expectedRevision)throw Error("LAB_REVISION_CONFLICT");
 const session=await decodeLabSession(existing.value,pack);
 if(!event||typeof event.sourceRef!=="string"||
    !/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(event.sourceRef))
  throw Error("LAB_EVENT_SOURCE_REF_INVALID");
 // One immutable per-turn event record preserves original witness and feature
 // observations after the active rolling journal has been compacted.
 const refKey=[ROOT,"event_refs",projectId,sessionId,event.sourceRef];
 const ref=await kv.get(refKey);
 if(ref.value)throw Error("LAB_EVENT_ALREADY_APPLIED");
 const planned=planLabEventArchive(session);
 const next=applyConfirmedLabEvent(planned.working,pack,event);
 const value=await encodeLabSession(next,pack,expectedRevision+1);
 let tx=kv.atomic()
  .check({key,versionstamp:existing.versionstamp})
  .check({key:refKey,versionstamp:ref.versionstamp})
  .set(key,value)
  .set(refKey,{revision:expectedRevision+1,event});
 if(planned.archive){
  const archiveKey=[ROOT,"event_archive",projectId,sessionId,planned.archive.index];
  tx=tx.set(archiveKey,planned.archive.events);
 }
 const done=await tx.commit();
 if(!done.ok)throw Error("LAB_REVISION_CONFLICT");
 return {ok:true,revision:value.revision,projectId,sessionId,
  sourceRef:event.sourceRef,gameClock:next.gameClock,
  rememberedBy:event.observations?.map(x=>x.npcId)??[],legacySaveTouched:false};
}

/** Lookup an archived confirmed event by exact sourceRef, without creating a new turn. */
export async function readLabConfirmedEvent(projectId:string,sessionId:string,sourceRef:string){
 if(!projectRe.test(projectId)||!projectRe.test(sessionId)||
  !/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(sourceRef))
  throw Error("LAB_EVENT_LOOKUP_INVALID");
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
    sessions.push({sessionId:e.value.sessionId??e.value.session?.sessionId,revision:e.value.revision,
     gameClock:e.value.gameClock??e.value.session?.gameClock,updatedAt:e.value.updatedAt});
   }
   return reply({schema:"RPG_LAB_SESSION_INDEX_V1",projectId,sessions});
  }
  const memoryPath=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/sessions\/([A-Za-z0-9_-]{3,64})\/memory$/.exec(path);
  if(memoryPath&&req.method==="GET"){
   const projectId=memoryPath[1],sessionId=memoryPath[2];
   await autoSyncGoogleProject(kv,projectId);
   const storedPack=await kv.get<LabStored>(keyOf(projectId));
   if(!storedPack.value)return reply({error:"LAB_PROJECT_NOT_FOUND"},404);
   const record=await kv.get<LabSessionStored>([ROOT,"sessions",projectId,sessionId]);
   if(!record.value)return reply({error:"LAB_SESSION_NOT_FOUND"},404);
   const pack=await decodeLabPack(storedPack.value);
   const session=await decodeLabSession(record.value,pack);
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
   if(req.method==="GET"){
    if(!current.value)return reply({error:"LAB_SESSION_NOT_FOUND"},404);
    return reply({schema:"RPG_LAB_SESSION_STORED_V1",revision:current.value.revision,updatedAt:current.value.updatedAt,
     session:await decodeLabSession(current.value,await decodeLabPack(packEntry.value))});
   }
   if(req.method==="PUT"){
    const data=await limited(req);if(!obj(data))throw Error("LAB_SESSION_BODY_REQUIRED");
    if(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision!==(current.value?.revision??0))throw Error("LAB_REVISION_CONFLICT");
    const pack=await decodeLabPack(packEntry.value);
    const session=validateLabSession(data.session as LabSession,pack);
    if(session.sessionId!==sessionId)throw Error("LAB_SESSION_ID_MISMATCH");
    const value=await encodeLabSession(session,pack,(current.value?.revision??0)+1);
    const commit=await kv.atomic().check({key:sessionKey,versionstamp:current.versionstamp}).set(sessionKey,value).commit();
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
    jobs=withSessionDefaults(jobs,await decodeLabSession(sessionData.value,activePack));
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
  const status=msg==="LAB_EVENT_ALREADY_APPLIED"||msg==="LAB_REVISION_CONFLICT"||msg==="LAB_CAMPAIGN_ALREADY_EXISTS"?409:msg==="LAB_KV_DISABLED"?503:msg==="LAB_BODY_TOO_LARGE"?413:msg==="LAB_PROJECT_NOT_FOUND"||msg==="LAB_DRIVE_NOT_BOUND"?404:400;
  return reply({ok:false,error:msg},status);
 }
}
