/** Resolve a saved RPG Lab project before the existing read-only World V3 dispatcher.
 * The loader is injected so pure tests cannot touch Deno KV or Shura data.
 */
import type {WorldV3BatchRequest} from "../world_sim_v3/runtime_facade.ts";
import {evaluateLabPack,type LabPack,type LabJob} from "./engine.ts";
import type {GoogleSourceIndex} from "./google_sync.ts";
export type LabPackLoader=(projectId:string,expectedRevision?:number)=>Promise<{pack:LabPack;revision:number}>;
export type LabSourceLoader=(projectId:string)=>Promise<GoogleSourceIndex>;
const projectId=/^[A-Za-z0-9_-]{3,64}$/;
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
export async function hydrateLabBridgeRequest(req:WorldV3BatchRequest,load:LabPackLoader,loadSources?:LabSourceLoader):Promise<WorldV3BatchRequest>{
 if(!req||!Array.isArray(req.jobs)||req.jobs.length>12)throw Error("LAB_BRIDGE_INVALID_BATCH");
 const jobs=[];
 for(const job of req.jobs){
  const payload=job.payload;
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
