/**
 * Google Drive project folder binding and atomic multi-file sync.
 * Only writes isolated RPG Lab KV keys; never touches legacy gameplay writer.
 */
import {validateLabPack,type LabPack} from "./engine.ts";
import {encodeLabPack,decodeLabPack,type LabStored} from "./storage_codec.ts";
import {mergeGoogleProjectSources,type DriveSourceNote,type DriveFileText} from "./google_merge.ts";
import {verifyDriveFolder,listDriveProjectFiles,downloadDriveText,type GoogleFileMeta} from "./google_drive.ts";
const ROOT="rpg-lab-v1";
const PROJECT=/^[A-Za-z0-9_-]{3,64}$/;
const projectKey=(id:string)=>[ROOT,"projects",id];
const bindingKey=(id:string)=>[ROOT,"google_bindings",id];
const sourceKey=(id:string)=>[ROOT,"google_sources",id];
const baselineKey=(id:string)=>[ROOT,"google_baselines",id];
export type LabPackStored=LabStored;
export type GoogleProjectBinding={
 folderId:string;folderName:string;autoSync:boolean;lastCheckedAt:number;
 signature:string;fileIds:string[];imported:string[];skipped:string[];
};
export type GoogleSourceIndex={projectId:string;notes:DriveSourceNote[];modifiedAt:string|null};
const valid=(projectId:string)=>{if(!PROJECT.test(projectId))throw Error("LAB_DRIVE_BAD_PROJECT_ID");};
const signature=(fs:readonly GoogleFileMeta[])=>fs.map(f=>[f.id,f.name,f.mimeType,f.modifiedTime??""].join("|")).sort().join("\n");
async function downloadAll(files:readonly GoogleFileMeta[]):Promise<{texts:DriveFileText[];skipped:string[]}>{
 const texts:DriveFileText[]=[],skipped:string[]=[];
 // Bounded concurrency protects Google quotas and Deno response time.
 for(let pos=0;pos<files.length;pos+=5){
  const rows=await Promise.all(files.slice(pos,pos+5).map(file=>downloadDriveText(file)));
  rows.forEach((r,i)=>{if(r)texts.push(r);else skipped.push(files[pos+i].name);});
 }
 return {texts,skipped};
}
export async function connectGoogleProject(kv:Deno.Kv,projectId:string,folderId:string,expectedRevision:number,autoSync=true){
 valid(projectId);
 const k=projectKey(projectId),bind=bindingKey(projectId),base=baselineKey(projectId);
 const current=await kv.get<LabPackStored>(k);
 if(!current.value)throw Error("LAB_PROJECT_NOT_FOUND");
 if(current.value.revision!==expectedRevision)throw Error("LAB_REVISION_CONFLICT");
 const old=await kv.get<GoogleProjectBinding>(bind);
 if(old.value)throw Error("LAB_DRIVE_ALREADY_BOUND_DISCONNECT_FIRST");
 const folder=await verifyDriveFolder(folderId);
 const files=await listDriveProjectFiles(folderId);
 const read=await downloadAll(files);
 const currentPack=await decodeLabPack(current.value);
 const result=mergeGoogleProjectSources(currentPack,read.texts);
 const updated=await encodeLabPack(result.pack,current.value.revision+1);
 const binding:GoogleProjectBinding={
  folderId,folderName:folder.name,autoSync,lastCheckedAt:Date.now(),signature:signature(files),
  fileIds:files.map(f=>f.id),imported:result.imported,skipped:[...result.skipped,...read.skipped],
 };
 const index:GoogleSourceIndex={projectId,notes:result.notes,modifiedAt:updated.updatedAt};
 const existingBaseline=await kv.get<LabStored|LabPack>(base);
 if(existingBaseline.value)throw Error("LAB_DRIVE_BASELINE_ALREADY_EXISTS");
 const done=await kv.atomic()
  .check({key:k,versionstamp:current.versionstamp})
  .check({key:bind,versionstamp:old.versionstamp})
  .check({key:base,versionstamp:existingBaseline.versionstamp})
  .set(k,updated).set(bind,binding).set(base,await encodeLabPack(currentPack,0))
  .set(sourceKey(projectId),index).commit();
 if(!done.ok)throw Error("LAB_REVISION_CONFLICT");
 return {connected:true,projectId,folderName:folder.name,revision:updated.revision,
  imported:result.imported,notes:result.notes.map(n=>n.name),skipped:binding.skipped,
  fileCount:files.length,autoSync,legacySaveTouched:false};
}
export async function syncGoogleProject(kv:Deno.Kv,projectId:string,expectedRevision?:number){
 valid(projectId);
 const bindingEntry=await kv.get<GoogleProjectBinding>(bindingKey(projectId));
 const binding=bindingEntry.value;
 if(!binding)throw Error("LAB_DRIVE_NOT_BOUND");
 const packEntry=await kv.get<LabPackStored>(projectKey(projectId));
 const baseline=await kv.get<LabStored|LabPack>(baselineKey(projectId));
 if(!packEntry.value||!baseline.value)throw Error("LAB_DRIVE_INCOMPLETE_BINDING");
 if(expectedRevision!==undefined&&packEntry.value.revision!==expectedRevision)throw Error("LAB_REVISION_CONFLICT");
 const files=await listDriveProjectFiles(binding.folderId);
 const nextSignature=signature(files);
 if(binding.signature===nextSignature){
  const checked={...binding,lastCheckedAt:Date.now()};
  const done=await kv.atomic().check({key:bindingKey(projectId),versionstamp:bindingEntry.versionstamp})
   .set(bindingKey(projectId),checked).commit();
  if(!done.ok)throw Error("LAB_REVISION_CONFLICT");
  return {projectId,changed:false,revision:packEntry.value.revision,checked:true,legacySaveTouched:false};
 }
 const read=await downloadAll(files);
 const baselinePack=(baseline.value as LabPack).schema==="RPG_LAB_PACK_V1"?validateLabPack(baseline.value as LabPack):await decodeLabPack(baseline.value as LabStored);
 const merged=mergeGoogleProjectSources(baselinePack,read.texts);
 const updated=await encodeLabPack(merged.pack,packEntry.value.revision+1);
 const newBinding:GoogleProjectBinding={...binding,lastCheckedAt:Date.now(),signature:nextSignature,
  fileIds:files.map(f=>f.id),imported:merged.imported,skipped:[...merged.skipped,...read.skipped]};
 const index:GoogleSourceIndex={projectId,notes:merged.notes,modifiedAt:updated.updatedAt};
 const done=await kv.atomic()
  .check({key:bindingKey(projectId),versionstamp:bindingEntry.versionstamp})
  .check({key:projectKey(projectId),versionstamp:packEntry.versionstamp})
  .set(projectKey(projectId),updated).set(bindingKey(projectId),newBinding)
  .set(sourceKey(projectId),index).commit();
 if(!done.ok)throw Error("LAB_REVISION_CONFLICT");
 return {projectId,changed:true,revision:updated.revision,imported:merged.imported,
  skipped:newBinding.skipped,notes:merged.notes.map(n=>n.name),fileCount:files.length,
  legacySaveTouched:false};
}
export async function autoSyncGoogleProject(kv:Deno.Kv,projectId:string):Promise<void>{
 valid(projectId);
 const binding=await kv.get<GoogleProjectBinding>(bindingKey(projectId));
 if(!binding.value?.autoSync)return;
 if(Date.now()-binding.value.lastCheckedAt<120000)return;
 await syncGoogleProject(kv,projectId);
}
export async function getGoogleProjectStatus(kv:Deno.Kv,projectId:string){
 valid(projectId);
 const binding=await kv.get<GoogleProjectBinding>(bindingKey(projectId));
 return {connected:!!binding.value,projectId,binding:binding.value??null};
}
export async function getGoogleProjectSources(kv:Deno.Kv,projectId:string){
 valid(projectId);
 const result=await kv.get<GoogleSourceIndex>(sourceKey(projectId));
 return result.value??{projectId,notes:[],modifiedAt:null};
}
export async function disconnectGoogleProject(kv:Deno.Kv,projectId:string,expectedRevision:number){
 valid(projectId);
 const binding=await kv.get<GoogleProjectBinding>(bindingKey(projectId));
 if(!binding.value)throw Error("LAB_DRIVE_NOT_BOUND");
 const project=await kv.get<LabPackStored>(projectKey(projectId));
 if(!project.value||project.value.revision!==expectedRevision)throw Error("LAB_REVISION_CONFLICT");
 const done=await kv.atomic()
 .check({key:bindingKey(projectId),versionstamp:binding.versionstamp})
 .check({key:projectKey(projectId),versionstamp:project.versionstamp})
 .delete(bindingKey(projectId)).delete(baselineKey(projectId)).delete(sourceKey(projectId)).commit();
 if(!done.ok)throw Error("LAB_REVISION_CONFLICT");
 return {disconnected:true,projectId,revision:expectedRevision,packPreserved:true};
}
