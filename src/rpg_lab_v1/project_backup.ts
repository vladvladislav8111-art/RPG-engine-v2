/** Consistent read-only project export. Restores ONLY into an empty sandbox KV.
 * Operator must separately arrange durable encrypted storage and a production
 * rollback. This does not certify a live backup merely because unit tests pass.
 */
const ROOT="rpg-lab-v1";
type Wire=null|boolean|string|number|Wire[]|{[key:string]:Wire};
function wire(value:unknown):Wire{
 if(value===undefined)return {type:"undefined"};
 if(value===null||typeof value==="boolean"||typeof value==="string")return value;
 if(typeof value==="number"){
  if(!Number.isFinite(value))throw Error("BACKUP_NONFINITE_NUMBER");return value;
 }
 if(value instanceof Uint8Array)return {type:"bytes",data:Array.from(value)};
 if(Array.isArray(value))return {type:"array",data:value.map(wire)};
 if(typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype)
  return {type:"object",data:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,wire(v)]))};
 throw Error("BACKUP_UNSUPPORTED_VALUE");
}
function unwire(value:Wire):unknown{
 if(value===null||typeof value!=="object")return value;
 const v=value as {type:string;data:Wire};
 if(v.type==="undefined")return undefined;
 if(v.type==="bytes")return new Uint8Array(v.data as number[]);
 if(v.type==="array")return (v.data as Wire[]).map(unwire);
 if(v.type==="object")return Object.fromEntries(Object.entries(v.data as Record<string,Wire>).map(([k,x])=>[k,unwire(x)]));
 throw Error("BACKUP_WIRE_INVALID");
}
async function digest(value:unknown){
 const bytes=new TextEncoder().encode(JSON.stringify(value));
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");
}
export type ProjectBackup={schema:"LAB_PROJECT_BACKUP_V1";projectId:string;sessionId:string;
 revision:number;createdAt:string;entries:{key:string[]| (string|number)[];value:Wire;versionstamp:string}[];sha256:string};
export async function exportLabProjectBackup(kv:Deno.Kv,projectId:string,sessionId:string):Promise<ProjectBackup>{
 if(!/^[A-Za-z0-9_-]{3,64}$/.test(projectId)||!/^[A-Za-z0-9_-]{3,64}$/.test(sessionId))throw Error("BACKUP_SCOPE_INVALID");
 const collect=async()=>{
  const out:ProjectBackup["entries"]=[];
  for await(const row of kv.list({prefix:[ROOT]},{consistency:"strong"})){
   // Include every key mentioning this project: pack, all sessions, chunks,
   // immutable event_refs, event_archive, NPC promotion/source bindings.
   if(!row.key.includes(projectId))continue;
   if(row.key.some(x=>typeof x!=="string"&&typeof x!=="number"))throw Error("BACKUP_KEY_TYPE_UNSUPPORTED");
   out.push({key:row.key as (string|number)[],value:wire(row.value),versionstamp:row.versionstamp});
  }
  return out;
 };
 const entries=await collect();
 const same=await collect();
 if(JSON.stringify(entries)!==JSON.stringify(same))throw Error("BACKUP_CONCURRENT_CHANGE");
 const head=entries.find(x=>JSON.stringify(x.key)===JSON.stringify([ROOT,"sessions",projectId,sessionId]));
 const project=entries.find(x=>JSON.stringify(x.key)===JSON.stringify([ROOT,"projects",projectId]));
 const revision=(head?unwire(head.value):null) as {revision:number}|null;
 if(!head||!project||!Number.isSafeInteger(revision?.revision)||revision!.revision<1)throw Error("BACKUP_HEAD_OR_PROJECT_MISSING");
 const body={schema:"LAB_PROJECT_BACKUP_V1" as const,projectId,sessionId,
  revision:revision!.revision,createdAt:new Date().toISOString(),entries};
 return {...body,sha256:await digest(body)};
}
export async function validateProjectBackup(snapshot:ProjectBackup){
 const {sha256,...body}=snapshot;
 if(snapshot.schema!=="LAB_PROJECT_BACKUP_V1"||!Array.isArray(snapshot.entries)||
    sha256!==await digest(body))throw Error("BACKUP_DIGEST_MISMATCH");
 const keys=new Set<string>();
 for(const row of snapshot.entries){
  if(row.key[0]!==ROOT||!row.key.includes(snapshot.projectId)||keys.has(JSON.stringify(row.key)))throw Error("BACKUP_SCOPE_INVALID");
  keys.add(JSON.stringify(row.key));unwire(row.value);
 }
 for(const key of [[ROOT,"projects",snapshot.projectId],[ROOT,"sessions",snapshot.projectId,snapshot.sessionId]])
  if(!keys.has(JSON.stringify(key)))throw Error("BACKUP_HEAD_OR_PROJECT_MISSING");
 return true;
}
export async function restoreProjectBackupToEmptyKv(kv:Deno.Kv,snapshot:ProjectBackup){
 await validateProjectBackup(snapshot);
 // Explicitly refuse any live or nonempty database, including legacy Shura.
 for await(const _ of kv.list({prefix:[]},{limit:1}))throw Error("BACKUP_RESTORE_REQUIRES_EMPTY_KV");
 const heads=snapshot.entries.filter(x=>x.key[1]==="sessions");
 const rest=snapshot.entries.filter(x=>x.key[1]!=="sessions");
 for(const row of [...rest,...heads]){
  const result=await kv.atomic().check({key:row.key,versionstamp:null}).set(row.key,unwire(row.value)).commit();
  if(!result.ok)throw Error("BACKUP_RESTORE_CAS_CONFLICT");
 }
 for(const row of snapshot.entries){
  const got=await kv.get(row.key);
  if(JSON.stringify(wire(got.value))!==JSON.stringify(row.value))throw Error("BACKUP_RESTORE_READBACK_FAILED");
 }
 return {verified:true,revision:snapshot.revision,entries:snapshot.entries.length};
}
