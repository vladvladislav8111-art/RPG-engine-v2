/** Import JSON/CSV rules into one isolated project. Never reads arbitrary local paths. */
import {validateLabPack,type LabPack} from "./engine.ts";
export type LabFileImport={format:"json"|"csv";table?:string;content:string};
const validId=(s:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(s)&&!["constructor","prototype","__proto__"].includes(s);
export function parseLabCsv(content:string):Record<string,string>[]{
 if(content.length>90000)throw Error("LAB_CSV_TOO_LARGE");
 const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
 for(let i=0;i<content.length;i++){
  const c=content[i];
  if(quoted){
   if(c==='"'&&content[i+1]==='"'){cell+='"';i++;}
   else if(c==='"')quoted=false;
   else cell+=c;
  }else if(c==='"'){if(cell)throw Error("LAB_CSV_INVALID_QUOTE");quoted=true;}
  else if(c===','){row.push(cell.trim());cell="";}
  else if(c==='\n'||c==='\r'){
   if(c==='\r'&&content[i+1]==='\n')i++;
   row.push(cell.trim());cell="";
   if(row.some(v=>v!==""))rows.push(row);
   row=[];if(rows.length>600)throw Error("LAB_CSV_ROW_LIMIT");
  }else cell+=c;
 }
 if(quoted)throw Error("LAB_CSV_UNCLOSED_QUOTE");
 if(cell||row.length){row.push(cell.trim());rows.push(row);}
 if(rows.length<2)throw Error("LAB_CSV_NO_DATA");
 const header=rows.shift()!.map(h=>h.trim());
 if(header.some(h=>!validId(h))||new Set(header).size!==header.length)throw Error("LAB_CSV_BAD_HEADER");
 return rows.map(r=>{
  if(r.length!==header.length)throw Error("LAB_CSV_COLUMN_MISMATCH");
  const o:Record<string,string>=Object.create(null);
  header.forEach((k,i)=>o[k]=r[i]);return o;
 });
}
const num=(v:string|undefined,optional=false):number|undefined=>{
 if(optional&&(v===undefined||v===""))return undefined;
 if(v===undefined||!v.trim()||!Number.isFinite(Number(v)))throw Error("LAB_CSV_NUMBER_REQUIRED");
 return Number(v);
};
function merged(base:LabPack,patch:Record<string,unknown>):LabPack{
 const allowed=new Set(["formulas","resources","lootTables","prices","economy","locations","npcProfiles","progression","recipes","worldProcesses"]);
 if(!patch||typeof patch!=="object"||Array.isArray(patch))throw Error("LAB_PATCH_INVALID");
 for(const k of Object.keys(patch))if(!allowed.has(k))throw Error("LAB_PATCH_UNKNOWN_SECTION:"+k);
 const copy=structuredClone(base) as LabPack;
 for(const [k,v] of Object.entries(patch)){
  if(!v||typeof v!=="object"||Array.isArray(v))throw Error("LAB_PATCH_BAD_SECTION");
  if(["economy","progression"].includes(k))Object.assign((copy as unknown as Record<string,unknown>)[k] as Record<string,unknown>,v);
  else {
   const target=(copy as unknown as Record<string,unknown>)[k] as Record<string,unknown>;
   for(const [id,val] of Object.entries(v)){
    if(!validId(id))throw Error("LAB_PATCH_BAD_ID");
    Object.defineProperty(target,id,{value:val,writable:true,enumerable:true,configurable:true});
   }
  }
 }
 return validateLabPack(copy);
}
export function importLabFile(base:LabPack|null,projectId:string,input:LabFileImport):LabPack{
 if(!validId(projectId)||!input||typeof input.content!=="string"||input.content.length>90000)throw Error("LAB_IMPORT_INVALID");
 if(input.format==="json"){
  const parsed=JSON.parse(input.content) as Record<string,unknown>;
  if(parsed.schema==="RPG_LAB_PACK_V1"){
   const pack=validateLabPack(parsed as LabPack);
   if(pack.projectId!==projectId)throw Error("LAB_IMPORT_PROJECT_MISMATCH");
   return pack;
  }
  if(!base)throw Error("LAB_IMPORT_INITIAL_PACK_REQUIRED");
  return merged(base,parsed);
 }
 if(input.format!=="csv"||!base)throw Error("LAB_IMPORT_FORMAT_OR_BASE");
 const table=input.table;const rows=parseLabCsv(input.content),patch:Record<string,unknown>=Object.create(null);
 if(table==="formulas"){
  const section:Record<string,string>=Object.create(null);
  for(const r of rows){if(!validId(r.id)||!r.expression)throw Error("LAB_CSV_BAD_FORMULA");section[r.id]=r.expression;}
  patch.formulas=section;
 }else if(table==="resources"){
  const section:Record<string,unknown>=Object.create(null);
  for(const r of rows){if(!validId(r.id))throw Error("LAB_CSV_BAD_RESOURCE");section[r.id]={min:num(r.min),max:num(r.max)};}
  patch.resources=section;
 }else if(table==="prices"){
  const section:Record<string,unknown>=Object.create(null);
  for(const r of rows){if(!validId(r.id)||!validId(r.currency))throw Error("LAB_CSV_BAD_PRICE");
   section[r.id]={base:num(r.base),currency:r.currency,...(r.buyMultiplier?{buyMultiplier:num(r.buyMultiplier)}:{}),...(r.sellMultiplier?{sellMultiplier:num(r.sellMultiplier)}:{})};}
  patch.prices=section;
 }else if(table==="loot"){
  const section=structuredClone(base.lootTables);
  for(const tableId of new Set(rows.map(r=>r.tableId))){
   if(!validId(tableId))throw Error("LAB_CSV_BAD_LOOT");
   delete section[tableId]; // Each CSV table definition is a complete, repeatable replacement.
  }
  for(const r of rows){
   if(!validId(r.tableId)||!validId(r.itemId))throw Error("LAB_CSV_BAD_LOOT");
   const rolls=num(r.rolls);
   if(!section[r.tableId])section[r.tableId]={rolls:rolls as number,entries:[]};
   else if(section[r.tableId].rolls!==rolls)throw Error("LAB_CSV_LOOT_ROLLS_CONFLICT");
   section[r.tableId].entries.push({itemId:r.itemId,weight:num(r.weight) as number,chance:num(r.chance) as number,min:num(r.min) as number,max:num(r.max) as number});
  }
  patch.lootTables=section;
 }else if(table==="locations"){
  const section=structuredClone(base.locations);
  for(const r of rows){
   if(!validId(r.id))throw Error("LAB_CSV_BAD_LOCATION");
   const existing=section[r.id];
   if(existing&&(existing.name!==r.name||existing.kind!==r.kind))throw Error("LAB_CSV_LOCATION_CONFLICT");
   if(!existing)section[r.id]={name:r.name,kind:r.kind,neighbors:Object.create(null),...(r.parentId?{parentId:r.parentId}:{})};
   if(r.neighborId){
    if(!validId(r.neighborId))throw Error("LAB_CSV_BAD_NEIGHBOR");
    section[r.id].neighbors[r.neighborId]=num(r.cost) as number;
   }
  }
  patch.locations=section;
 }else throw Error("LAB_CSV_TABLE_NOT_SUPPORTED");
 return merged(base,patch);
}
