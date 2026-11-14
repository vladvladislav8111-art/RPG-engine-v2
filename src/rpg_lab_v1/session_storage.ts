/** Bounded, backward-compatible per-campaign KV codec.
 * Applies only to rpg-lab-v1/sessions/...; the legacy RPG character save is never read or written.
 */
import {validateLabSession,type LabSession} from "./session.ts";
import type {LabPack} from "./engine.ts";
export type LabSessionStored={
 revision:number;updatedAt:string;projectId?:string;sessionId?:string;gameClock?:string;
 session?:LabSession;sessionGzip?:Uint8Array;codec?:string;
};
async function streamBounded(s:ReadableStream<Uint8Array>,limit:number){
 const reader=s.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{
  for(;;){
   const row=await reader.read();
   if(row.done)break;
   total+=row.value.length;if(total>limit)throw Error("LAB_SESSION_CODEC_LIMIT");
   chunks.push(row.value);
  }
 }finally{reader.releaseLock();}
 const out=new Uint8Array(total);let off=0;
 for(const x of chunks){out.set(x,off);off+=x.length;}
 return out;
}
export async function encodeLabSession(session:LabSession,pack:LabPack,revision:number):Promise<LabSessionStored>{
 validateLabSession(session,pack);
 if(!Number.isSafeInteger(revision)||revision<1)throw Error("LAB_SESSION_CODEC_REVISION");
 const bytes=new TextEncoder().encode(JSON.stringify(session));
 const meta={revision,updatedAt:new Date().toISOString(),
  projectId:session.projectId,sessionId:session.sessionId,gameClock:session.gameClock};
 if(bytes.length<=45000)return {...meta,session};
 const gz=await streamBounded(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),50000);
 return {...meta,sessionGzip:gz,codec:"gzip-session-v1"};
}
export async function decodeLabSession(stored:LabSessionStored,pack:LabPack):Promise<LabSession>{
 if(!stored||typeof stored!=="object")throw Error("LAB_SESSION_CODEC_INVALID");
 let session:LabSession;
 if(stored.session)session=stored.session;
 else {
  if(stored.codec!=="gzip-session-v1"||!(stored.sessionGzip instanceof Uint8Array))
   throw Error("LAB_SESSION_CODEC_UNSUPPORTED");
  const plain=await streamBounded(
   new Blob([stored.sessionGzip.slice().buffer as ArrayBuffer]).stream()
    .pipeThrough(new DecompressionStream("gzip")),150000);
  session=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(plain)) as LabSession;
 }
 validateLabSession(session,pack);
 if(stored.projectId!==undefined&&stored.projectId!==session.projectId)throw Error("LAB_SESSION_CODEC_PROJECT_MISMATCH");
 if(stored.sessionId!==undefined&&stored.sessionId!==session.sessionId)throw Error("LAB_SESSION_CODEC_ID_MISMATCH");
 return session;
}
