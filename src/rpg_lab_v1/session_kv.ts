/** Immutable, content-addressed KV chunks for large isolated Lab sessions.
 * The session head is still written using the existing atomic CAS transaction.
 * Chunks are stored first; partial/failed CAS writes leave unreferenced chunks,
 * NEVER a visible broken or partially advanced campaign save.
 */
import {decodeLabSession,sessionKvHead,type LabSessionStored} from "./session_storage.ts";
import type {LabSession} from "./session.ts";
import type {LabPack} from "./engine.ts";
const ROOT="rpg-lab-v1";
const keyFor=(projectId:string,sessionId:string,digest:string,index:number)=>
 [ROOT,"session_chunks",projectId,sessionId,digest,index] as Deno.KvKey;
export async function prepareLabSessionHead(
 kv:Deno.Kv,projectId:string,sessionId:string,encoded:LabSessionStored,
):Promise<LabSessionStored>{
 const head=sessionKvHead(encoded);
 if(encoded.codec!=="gzip-session-chunks-v2")return head;
 const {sessionGzipChunks:chunks,sessionChunkDigest:digest}=encoded;
 if(!chunks||!digest)throw Error("LAB_SESSION_CHUNK_MISSING");
 // Same content has the same hash and identical chunk boundaries, so racing
 // revisions may harmlessly reuse chunks. No existing segment is modified.
 for(let i=0;i<chunks.length;i++){
  const done=await kv.set(keyFor(projectId,sessionId,digest,i),chunks[i]);
  if(!done.ok)throw Error("LAB_SESSION_CHUNK_WRITE_FAILED");
 }
 return head;
}
export async function decodeLabSessionFromKv(
 kv:Deno.Kv,projectId:string,sessionId:string,
 stored:LabSessionStored,pack:LabPack,
):Promise<LabSession>{
 return await decodeLabSession(stored,pack,async(digest,index)=>{
  const value=await kv.get<Uint8Array>(keyFor(projectId,sessionId,digest,index));
  return value.value instanceof Uint8Array?value.value:null;
 });
}
