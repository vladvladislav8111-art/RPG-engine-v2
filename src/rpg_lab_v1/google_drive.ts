/**
 * Google Drive read-only file transport using existing service account token.
 * All network access is to Google's fixed API hosts, no caller-defined URLs.
 */
import {getGoogleAccessToken} from "../auth.ts";
import type {DriveFileText} from "./google_merge.ts";
export type GoogleFileMeta={id:string;name:string;mimeType:string;modifiedTime?:string;size?:string;trashed?:boolean};
const GOOGLE_ID=/^[A-Za-z0-9_-]{10,180}$/;
const MAX_CONTENT=90000;
export const DRIVE_FOLDER="application/vnd.google-apps.folder";
const DOC="application/vnd.google-apps.document";
const SHEET="application/vnd.google-apps.spreadsheet";
const TEXT_MIME=new Set(["text/plain","text/csv","application/json","text/markdown","application/octet-stream"]);
export const validateGoogleId=(v:unknown):string=>{
 if(typeof v!=="string"||!GOOGLE_ID.test(v))throw Error("LAB_DRIVE_BAD_GOOGLE_ID");
 return v;
};
async function access(url:string):Promise<Response>{
 const token=await getGoogleAccessToken();
 const response=await fetch(url,{headers:{Authorization:"Bearer "+token}});
 if(!response.ok)throw Error("LAB_GOOGLE_HTTP_"+response.status);
 return response;
}
async function readBoundedText(response:Response,max=MAX_CONTENT):Promise<string>{
 const bytes:number[]=[];const reader=response.body?.getReader();
 if(!reader)throw Error("LAB_GOOGLE_EMPTY_BODY");
 try{
  while(true){
   const value=await reader.read();if(value.done)break;
   if(bytes.length+value.value.length>max)throw Error("LAB_GOOGLE_TEXT_LIMIT");
   bytes.push(...value.value);
  }
 }finally{reader.releaseLock();}
 return new TextDecoder("utf-8",{fatal:true}).decode(new Uint8Array(bytes));
}
export async function verifyDriveFolder(folderId:string):Promise<GoogleFileMeta>{
 const id=validateGoogleId(folderId);
 const query=new URLSearchParams({fields:"id,name,mimeType,trashed",supportsAllDrives:"true"});
 const file=await access("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(id)+"?"+query);
 const meta=await file.json() as GoogleFileMeta;
 if(meta.id!==id||meta.mimeType!==DRIVE_FOLDER||meta.trashed===true)throw Error("LAB_DRIVE_NOT_A_FOLDER");
 return meta;
}
export async function listDriveFolder(folderId:string):Promise<GoogleFileMeta[]>{
 const id=validateGoogleId(folderId);
 const files:GoogleFileMeta[]=[];
 let page:string|undefined;
 do{
  const params=new URLSearchParams({
   q:"'"+id+"' in parents and trashed = false",
   fields:"nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,size,trashed)",
   pageSize:"100",supportsAllDrives:"true",includeItemsFromAllDrives:"true",
   ...(page?{pageToken:page}:{}),
  });
  const response=await access("https://www.googleapis.com/drive/v3/files?"+params);
  const data=await response.json() as {files?:GoogleFileMeta[];nextPageToken?:string;incompleteSearch?:boolean};
  if(data.incompleteSearch)throw Error("LAB_DRIVE_INCOMPLETE_SEARCH");
  for(const file of data.files??[]){
   validateGoogleId(file.id);
   if(file.trashed)continue;
   if(typeof file.name!=="string"||file.name.length>180)throw Error("LAB_DRIVE_BAD_FILE_NAME");
   files.push(file);if(files.length>70)throw Error("LAB_DRIVE_TOO_MANY_FILES");
  }
  page=data.nextPageToken;
 }while(page);
 return files.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export async function listDriveProjectFiles(folderId:string):Promise<GoogleFileMeta[]>{
 const root=await listDriveFolder(folderId);
 const direct=root.filter(f=>f.mimeType!==DRIVE_FOLDER);
 // One level of optional subdirectories e.g. /NPC /Rules /Lore.
 const folders=root.filter(f=>f.mimeType===DRIVE_FOLDER);
 if(folders.length>12)throw Error("LAB_DRIVE_TOO_MANY_SUBFOLDERS");
 const nested=(await Promise.all(folders.map(f=>listDriveFolder(f.id)))).flat();
 if(nested.some(f=>f.mimeType===DRIVE_FOLDER))throw Error("LAB_DRIVE_DEPTH_LIMIT");
 const files=[...direct,...nested];
 if(files.length>60)throw Error("LAB_DRIVE_TOO_MANY_FILES");
 if(new Set(files.map(f=>f.id)).size!==files.length)throw Error("LAB_DRIVE_DUPLICATE_IDS");
 return files.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export async function downloadDriveText(file:GoogleFileMeta):Promise<DriveFileText|null>{
 const id=validateGoogleId(file.id);
 const type=file.mimeType;
 const supported=type===DOC||type===SHEET||TEXT_MIME.has(type);
 if(!supported)return null;
 if(file.size&&Number(file.size)>MAX_CONTENT)throw Error("LAB_GOOGLE_TEXT_LIMIT");
 const suffix=type===DOC?
  "/export?mimeType="+encodeURIComponent("text/plain"):
  type===SHEET?"/export?mimeType="+encodeURIComponent("text/csv"):
  "?alt=media";
 const result=await access("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(id)+suffix);
 const text=await readBoundedText(result);
 return {id,name:file.name,mimeType:type,modifiedTime:file.modifiedTime??"",text};
}
