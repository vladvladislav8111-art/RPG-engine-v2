/** Isolated Deno KV pack codec. Large multi-file worlds exceed KV's 64-KiB
 * value limit; gzip is used only for pack records, never legacy Shura saves.
 */
import {validateLabPack,type LabPack} from "./engine.ts";
export type LabStored={
 revision:number;updatedAt:string;projectId?:string;worldId?:string;
 pack?:LabPack;packedGzip?:Uint8Array;codec?:string;
};
const encoder=new TextEncoder();
async function boundedBytes(stream:ReadableStream<Uint8Array>,limit:number):Promise<Uint8Array>{
 const reader=stream.getReader();const parts:Uint8Array[]=[];let total=0;
 try{
  while(true){
   const next=await reader.read();if(next.done)break;
   total+=next.value.length;if(total>limit)throw Error("LAB_PACK_CODEC_LIMIT");
   parts.push(next.value);
  }
 }finally{reader.releaseLock();}
 const buffer=new Uint8Array(total);let p=0;
 for(const part of parts){buffer.set(part,p);p+=part.length;}return buffer;
}
export async function encodeLabPack(pack:LabPack,revision:number):Promise<LabStored>{
 validateLabPack(pack);
 if(!Number.isSafeInteger(revision)||revision<0)throw Error("LAB_PACK_CODEC_REVISION");
 const json=encoder.encode(JSON.stringify(pack));
 const metadata={revision,updatedAt:new Date().toISOString(),
  projectId:pack.projectId,worldId:pack.worldId};
 if(json.byteLength<=45000)return {...metadata,pack};
 const zipped=await boundedBytes(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),50000);
 return {...metadata,packedGzip:zipped,codec:"gzip-v1"};
}
export async function decodeLabPack(stored:LabStored):Promise<LabPack>{
 if(!stored||typeof stored!=="object")throw Error("LAB_PACK_CODEC_INVALID");
 if(stored.pack!==undefined)return validateLabPack(stored.pack);
 if(stored.codec!=="gzip-v1"||!(stored.packedGzip instanceof Uint8Array))
  throw Error("LAB_PACK_CODEC_UNSUPPORTED");
 const plain=await boundedBytes(new Blob([stored.packedGzip.slice().buffer as ArrayBuffer]).stream()
  .pipeThrough(new DecompressionStream("gzip")),250000);
 const pack=validateLabPack(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(plain)) as LabPack);
 if(stored.projectId!==undefined&&stored.projectId!==pack.projectId)
  throw Error("LAB_PACK_CODEC_PROJECT_MISMATCH");
 return pack;
}
