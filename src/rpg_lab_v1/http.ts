/** Versioned, authenticated, isolated multi-project RPG Lab API.
 * KV prefix is entirely separate from legacy character/save/financial writer.
 */
import {config} from "../config.ts";
import {validateLabPack,evaluateLabPack,type LabPack,type LabJob} from "./engine.ts";
import {importLabFile,type LabFileImport} from "./import.ts";
import {validateLabSession,withSessionDefaults,type LabSession} from "./session.ts";
import {
 connectGoogleProject,syncGoogleProject,autoSyncGoogleProject,getGoogleProjectStatus,
 getGoogleProjectSources,disconnectGoogleProject,
} from "./google_sync.ts";
const ROOT="rpg-lab-v1";
type LabStored={revision:number;pack:LabPack;updatedAt:string};
type SessionStored={revision:number;session:LabSession;updatedAt:string};
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
 return {pack:validateLabPack(result.value.pack),revision:result.value.revision};
}
export async function handleRpgLabHttp(req:Request,url:URL):Promise<Response>{
 try{
  const kv=await storage(),path=url.pathname;
  if(path==="/rpg-lab/v1/projects"&&req.method==="GET"){
   const projects:unknown[]=[];
   for await(const e of kv.list<LabStored>({prefix:[ROOT,"projects"]},{limit:50})){
    projects.push({projectId:e.value.pack.projectId,worldId:e.value.pack.worldId,revision:e.value.revision,updatedAt:e.value.updatedAt});
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
  const sessionPath=/^\/rpg-lab\/v1\/projects\/([A-Za-z0-9_-]{3,64})\/sessions\/([A-Za-z0-9_-]{3,64})$/.exec(path);
  if(sessionPath){
   const projectId=sessionPath[1],sessionId=sessionPath[2],packEntry=await kv.get<LabStored>(keyOf(projectId));
   if(!packEntry.value)return reply({error:"LAB_PROJECT_NOT_FOUND"},404);
   const sessionKey=[ROOT,"sessions",projectId,sessionId];
   const current=await kv.get<SessionStored>(sessionKey);
   if(req.method==="GET"){
    if(!current.value)return reply({error:"LAB_SESSION_NOT_FOUND"},404);
    return reply({schema:"RPG_LAB_SESSION_STORED_V1",revision:current.value.revision,updatedAt:current.value.updatedAt,session:current.value.session});
   }
   if(req.method==="PUT"){
    const data=await limited(req);if(!obj(data))throw Error("LAB_SESSION_BODY_REQUIRED");
    if(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision!==(current.value?.revision??0))throw Error("LAB_REVISION_CONFLICT");
    const session=validateLabSession(data.session as LabSession,packEntry.value.pack);
    if(session.sessionId!==sessionId)throw Error("LAB_SESSION_ID_MISMATCH");
    const value:SessionStored={revision:(current.value?.revision??0)+1,session,updatedAt:new Date().toISOString()};
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
   return reply({schema:"RPG_LAB_PROJECT_V1",revision:result.value.revision,updatedAt:result.value.updatedAt,pack:result.value.pack});
  }
  if(action==="evaluate"&&req.method==="POST"){
   await autoSyncGoogleProject(kv,projectId);
   const result=await kv.get<LabStored>(kvKey);
   if(!result.value)return reply({error:"LAB_PROJECT_NOT_FOUND"},404);
   const data=await limited(req);
   if(!obj(data))throw Error("LAB_EVALUATE_BODY_REQUIRED");
   if(data.expectedRevision!==undefined&&data.expectedRevision!==result.value.revision)throw Error("LAB_REVISION_CONFLICT");
   let jobs=data.jobs as LabJob[];let sessionRevision:number|null=null;
   if(data.sessionId!==undefined){
    if(typeof data.sessionId!=="string"||!projectRe.test(data.sessionId))throw Error("LAB_SESSION_ID_INVALID");
    const sessionData=await kv.get<SessionStored>([ROOT,"sessions",projectId,data.sessionId]);
    if(!sessionData.value)throw Error("LAB_SESSION_NOT_FOUND");
    if(data.expectedSessionRevision!==undefined&&data.expectedSessionRevision!==sessionData.value.revision)
     throw Error("LAB_REVISION_CONFLICT");
    jobs=withSessionDefaults(jobs,validateLabSession(sessionData.value.session,result.value.pack));
    sessionRevision=sessionData.value.revision;
   }
   return reply({...evaluateLabPack(result.value.pack,jobs),packRevision:result.value.revision,sessionRevision});
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
    pack=importLabFile(current.value?.pack??null,projectId,data.file as LabFileImport);
   }else{
    pack=validateLabPack(data.pack as LabPack);
   }
   if(pack.projectId!==projectId)throw Error("LAB_PROJECT_MISMATCH");
   const value:LabStored={revision:(current.value?.revision??0)+1,pack,updatedAt:new Date().toISOString()};
   const commit=await kv.atomic().check({key:kvKey,versionstamp:current.versionstamp}).set(kvKey,value).commit();
   if(!commit.ok)throw Error("LAB_REVISION_CONFLICT");
   return reply({ok:true,projectId,revision:value.revision,updatedAt:value.updatedAt,saved:true,legacySaveTouched:false});
  }
  return reply({error:"LAB_METHOD_NOT_ALLOWED"},405);
 }catch(e){
  const msg=unexpected(e);
  const status=msg==="LAB_REVISION_CONFLICT"?409:msg==="LAB_KV_DISABLED"?503:msg==="LAB_BODY_TOO_LARGE"?413:msg==="LAB_PROJECT_NOT_FOUND"||msg==="LAB_DRIVE_NOT_BOUND"?404:400;
  return reply({ok:false,error:msg},status);
 }
}
