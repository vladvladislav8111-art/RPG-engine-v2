/** Bounded, backward-compatible per-campaign KV codec.
 * Only rpg-lab-v1/sessions/*: never touches the legacy Shura save.
 *
 * v1 inline and gzip records remain readable. v2 oversized gzip snapshots are
 * split into immutable, content-addressed KV chunks. The head revision is
 * committed with CAS after every chunk is durably written. No partial update
 * is ever made visible when a write conflicts.
 */
import {validateLabSession,LAB_SESSION_MAX_TEXT_UNITS,type LabSession} from "./session.ts";
import type {LabPack} from "./engine.ts";
export type LabSessionStored={
 revision:number;updatedAt:string;projectId?:string;sessionId?:string;gameClock?:string;
 session?:LabSession;sessionGzip?:Uint8Array;codec?:string;
 /** Digest and count of immutable chunks, only for gzip-session-chunks-v2. */
 sessionChunkDigest?:string;sessionChunkCount?:number;sessionChunkBytes?:number;
 /** Transient generated chunks; must never be embedded in a KV head. */
 sessionGzipChunks?:Uint8Array[];
};
const INLINE_THRESHOLD=45000;
const MAX_GZIP_VALUE=50000;
export const LAB_SESSION_CHUNK_SIZE=40000;
export const LAB_SESSION_MAX_CHUNKS=64;
const MAX_COMPRESSED=LAB_SESSION_CHUNK_SIZE*LAB_SESSION_MAX_CHUNKS;
const MAX_INFLATED=LAB_SESSION_MAX_TEXT_UNITS*4;
async function streamBounded(s:ReadableStream<Uint8Array>,limit:number){
 const reader=s.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{
  for(;;){
   const row=await reader.read();
   if(row.done)break;
   total+=row.value.length;
   if(total>limit)throw Error("LAB_SESSION_CODEC_LIMIT");
   chunks.push(row.value);
  }
 }finally{reader.releaseLock();}
 const out=new Uint8Array(total);let off=0;
 for(const x of chunks){out.set(x,off);off+=x.length;}
 return out;
}
async function sha256(bytes:Uint8Array):Promise<string>{
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
function concatParts(parts:Uint8Array[],expectedBytes:number){
 let bytes=0;
 for(const p of parts)bytes+=p.byteLength;
 if(bytes!==expectedBytes||bytes>MAX_COMPRESSED)
  throw Error("LAB_SESSION_CHUNK_LENGTH_INVALID");
 const joined=new Uint8Array(bytes);
 let off=0;for(const p of parts){joined.set(p,off);off+=p.byteLength;}
 return joined;
}
export async function encodeLabSession(session:LabSession,pack:LabPack,revision:number):Promise<LabSessionStored>{
 validateLabSession(session,pack);
 if(!Number.isSafeInteger(revision)||revision<1)throw Error("LAB_SESSION_CODEC_REVISION");
 const bytes=new TextEncoder().encode(JSON.stringify(session));
 const meta={revision,updatedAt:new Date().toISOString(),
  projectId:session.projectId,sessionId:session.sessionId,gameClock:session.gameClock};
 if(bytes.length<=INLINE_THRESHOLD)return {...meta,session};
 const gz=await streamBounded(
  new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),MAX_COMPRESSED);
 if(gz.length<=MAX_GZIP_VALUE)return {...meta,sessionGzip:gz,codec:"gzip-session-v1"};
 const count=Math.ceil(gz.length/LAB_SESSION_CHUNK_SIZE);
 if(count>LAB_SESSION_MAX_CHUNKS)throw Error("LAB_SESSION_CHUNK_LIMIT");
 const digest=await sha256(gz);
 const parts:Uint8Array[]=[];
 for(let i=0;i<count;i++)
  parts.push(gz.slice(i*LAB_SESSION_CHUNK_SIZE,(i+1)*LAB_SESSION_CHUNK_SIZE));
 return {...meta,codec:"gzip-session-chunks-v2",sessionChunkDigest:digest,
  sessionChunkCount:count,sessionChunkBytes:gz.length,sessionGzipChunks:parts};
}
/** Remove ephemeral chunk bytes before persisting the head record. */
export function sessionKvHead(encoded:LabSessionStored):LabSessionStored{
 const {sessionGzipChunks:chunks,...head}=encoded;
 if(encoded.codec==="gzip-session-chunks-v2"){
  if(!Array.isArray(chunks)||chunks.length!==encoded.sessionChunkCount)
   throw Error("LAB_SESSION_CHUNK_MISSING");
 }else if(chunks!==undefined)throw Error("LAB_SESSION_CHUNK_UNEXPECTED");
 return head;
}
/** Fetch v2 chunk bytes using metadata in the head (read-only).
 * Storage implementations can provide one safe chunk at a time. */
export type LabSessionChunkLoader=(
 digest:string,index:number,revision:number
)=>Promise<Uint8Array|null>;
export async function decodeLabSession(
 stored:LabSessionStored,pack:LabPack,loadChunk?:LabSessionChunkLoader,
):Promise<LabSession>{
 if(!stored||typeof stored!=="object")throw Error("LAB_SESSION_CODEC_INVALID");
 let session:LabSession;
 if(stored.session)session=stored.session;
 else {
  let gz:Uint8Array;
  if(stored.codec==="gzip-session-v1"&&stored.sessionGzip instanceof Uint8Array){
   gz=stored.sessionGzip;
  }else if(stored.codec==="gzip-session-chunks-v2"){
   const {sessionChunkDigest:digest,sessionChunkCount:count,
    sessionChunkBytes:expectedBytes,revision}=stored;
   if(typeof digest!=="string"||!/^[0-9a-f]{64}$/.test(digest)||
     !Number.isInteger(count)||count!<1||count!>LAB_SESSION_MAX_CHUNKS||
     !Number.isInteger(expectedBytes)||expectedBytes!<1||
     expectedBytes!>MAX_COMPRESSED||!Number.isInteger(revision))
    throw Error("LAB_SESSION_CHUNK_MANIFEST_INVALID");
   const parts:Uint8Array[]=[];
   for(let i=0;i<count!;i++){
    const p=stored.sessionGzipChunks?.[i]??(loadChunk?await loadChunk(digest,i,revision):null);
    if(!(p instanceof Uint8Array)||p.byteLength<1||p.byteLength>LAB_SESSION_CHUNK_SIZE)
     throw Error("LAB_SESSION_CHUNK_MISSING");
    parts.push(p);
   }
   gz=concatParts(parts,expectedBytes!);
   if(await sha256(gz)!==digest)throw Error("LAB_SESSION_CHUNK_HASH_MISMATCH");
  }else throw Error("LAB_SESSION_CODEC_UNSUPPORTED");
  const plain=await streamBounded(
   new Blob([gz.slice().buffer as ArrayBuffer]).stream()
    .pipeThrough(new DecompressionStream("gzip")),MAX_INFLATED);
  session=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(plain)) as LabSession;
 }
 validateLabSession(session,pack);
 if(stored.projectId!==undefined&&stored.projectId!==session.projectId)
  throw Error("LAB_SESSION_CODEC_PROJECT_MISMATCH");
 if(stored.sessionId!==undefined&&stored.sessionId!==session.sessionId)
  throw Error("LAB_SESSION_CODEC_ID_MISMATCH");
 return session;
}
