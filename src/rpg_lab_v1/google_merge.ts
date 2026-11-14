/**
 * Merge any number of Drive-backed RPG configuration files into one project.
 * Pure, deterministic and source-independent. Human-readable lore becomes a
 * source excerpt, not automatically invented NPC facts or system instructions.
 */
import {importLabFile,type LabFileImport} from "./import.ts";
import {validateLabPack,type LabPack} from "./engine.ts";
export type DriveFileText={
 id:string;name:string;mimeType:string;modifiedTime:string;text:string;
};
export type DriveSourceNote={
 fileId:string;name:string;modifiedTime:string;excerpt:string;
};
export type DriveMergeResult={
 pack:LabPack;imported:string[];notes:DriveSourceNote[];
 skipped:string[];
};
const SECTIONS=new Set([
 "formulas","resources","lootTables","prices","economy","locations","npcProfiles",
 "progression","recipes","worldProcesses","encounterProfiles","bestiary",
]);
const CSV_SECTIONS=new Set(["formulas","resources","loot","prices","locations","encounters","bestiary"]);
const fullNames=new Set(["pack.json","world.json","rpg-pack.json"]);
const isFull=(x:DriveFileText)=>fullNames.has(x.name.toLowerCase());
const ext=(name:string)=>name.toLowerCase().split(".").pop()??"";
function typeOfFile(name:string):{kind:"full"|"json"|"csv"|"note"|"skip";section?:string}{
 const lower=name.toLowerCase();
 if(fullNames.has(lower))return {kind:"full"};
 const extension=ext(name);
 const first=name.split(/[._-]/)[0].toLowerCase();
 const pref=[...SECTIONS,...CSV_SECTIONS].find(s=>s.toLowerCase()===first);
 const isGoogleSheet=extension===name.toLowerCase()&&name.toLowerCase()===first;
 if(extension==="json"&&pref&&SECTIONS.has(pref))return {kind:"json",section:pref};
 if(extension==="json"&&(lower==="rules.json"||lower==="patch.json"))return {kind:"json"};
 if((extension==="csv"||isGoogleSheet)&&pref&&CSV_SECTIONS.has(pref))return {kind:"csv",section:pref};
 if(["md","txt","text"].includes(extension))return {kind:"note"};
 if(extension==="json"||extension==="csv")return {kind:"note"};
 if(!name.includes("."))return {kind:"note"};
 return {kind:"skip"};
}
export function mergeGoogleProjectSources(baseline:LabPack,files:readonly DriveFileText[]):DriveMergeResult{
 validateLabPack(baseline);
 if(files.length>60)throw Error("LAB_DRIVE_TOO_MANY_FILES");
 const copy=files.slice().sort((a,b)=>Number(isFull(b))-Number(isFull(a)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
 if(new Set(copy.map(f=>f.id)).size!==copy.length)throw Error("LAB_DRIVE_DUPLICATE_FILE_ID");
 if(copy.filter(isFull).length>1)throw Error("LAB_DRIVE_MULTIPLE_BASE_PACKS");
 let pack=structuredClone(baseline),noteBudget=22000;
 const imported:string[]=[],skipped:string[]=[],notes:DriveSourceNote[]=[];
 for(const f of copy){
  if(!f.id||!f.name||typeof f.text!=="string"||f.text.length>90000)throw Error("LAB_DRIVE_FILE_INVALID");
  const t=typeOfFile(f.name);
  if(t.kind==="skip"){skipped.push(f.name);continue;}
  if(t.kind==="full"){
   pack=importLabFile(pack,baseline.projectId,{format:"json",content:f.text});
   imported.push(f.name);continue;
  }
  if(t.kind==="json"){
   const parsed:unknown=JSON.parse(f.text.replace(/^\uFEFF/,""));
   if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("LAB_DRIVE_JSON_OBJECT_REQUIRED:"+f.name);
   const value=parsed as Record<string,unknown>;
   const wrapped=t.section&&!(t.section in value)?{[t.section]:value}:value;
   pack=importLabFile(pack,baseline.projectId,{format:"json",content:JSON.stringify(wrapped)});
   imported.push(f.name);continue;
  }
  if(t.kind==="csv"){
   pack=importLabFile(pack,baseline.projectId,{format:"csv",table:t.section,content:f.text});
   imported.push(f.name);continue;
  }
  const excerpt=f.text.slice(0,Math.min(1500,noteBudget));
  if(excerpt){notes.push({fileId:f.id,name:f.name,modifiedTime:f.modifiedTime,excerpt});noteBudget-=excerpt.length;}
  else skipped.push(f.name);
 }
 validateLabPack(pack);
 return {pack,imported,notes,skipped};
}
