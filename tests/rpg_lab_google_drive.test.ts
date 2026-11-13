import test from "node:test";
import assert from "node:assert/strict";
import {mergeGoogleProjectSources,type DriveFileText} from "../src/rpg_lab_v1/google_merge.ts";
import {evaluateLabPack,type LabPack} from "../src/rpg_lab_v1/engine.ts";
import {importLabFile} from "../src/rpg_lab_v1/import.ts";
const baseline:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"danmachi_01",worldId:"danmachi.orario",
 formulas:{damage:"max(0,attack-defense)"},resources:{hp:{min:0,max:100}},
 lootTables:{goblin:{rolls:1,entries:[{itemId:"old",weight:1,chance:1,min:1,max:1}]}},
 prices:{},economy:{taxRate:0},
 locations:{town:{name:"Орарио",kind:"city",neighbors:{}}},
 npcProfiles:{},progression:{thresholds:[100]}
};
const source=(id:string,name:string,text:string):DriveFileText=>({
 id,name,text,mimeType:name.endsWith(".csv")?"text/csv":"application/json",modifiedTime:"2026-11-13T10:00:00Z"
});
const files=[
 source("drive.file.001","formulas.csv","id,expression\nnewdamage,\"max(0,attack*1.5-defense)\"\n"),
 source("drive.file.002","loot.goblin.csv","tableId,rolls,itemId,weight,chance,min,max\ngoblin,2,fang,2,0.5,1,2\ngoblin,2,claw,1,0.2,1,1\n"),
 source("drive.file.003","npcProfiles.json",JSON.stringify({"npc.loki":{name:"Локи",canonRef:"canon.sword_oratoria",traits:["азарт"],goals:["заботиться о семье"],knownFacts:[]}})),
 source("drive.file.004","canon.md","Упрощённый тестовый фрагмент мира без автоматической канонизации личности.")
];
test("one sync merges multiple files and keeps lore as a non-authoritative note",()=>{
 const result=mergeGoogleProjectSources(baseline,files);
 assert.equal(result.imported.length,3);
 assert.equal(result.notes.length,1);
 assert.equal(result.pack.lootTables.goblin.rolls,2);
 assert.equal(result.pack.lootTables.goblin.entries.length,2);
 assert.equal(result.pack.npcProfiles["npc.loki"].name,"Локи");
 const calc=evaluateLabPack(result.pack,[{id:"calculate.1",kind:"formula",args:{formulaId:"newdamage",variables:{attack:10,defense:2}}}]);
 assert.equal((calc.results[0] as {value:{value:number}}).value.value,13);
});
test("file order does not change the merged pack",()=>{
 const a=mergeGoogleProjectSources(baseline,files),b=mergeGoogleProjectSources(baseline,[...files].reverse());
 assert.deepEqual(a.pack,b.pack);
});
test("removing a file from next source snapshot removes its prior contributions",()=>{
 const first=mergeGoogleProjectSources(baseline,files);
 const second=mergeGoogleProjectSources(baseline,files.filter(f=>f.name!=="npcProfiles.json"));
 assert.equal(first.pack.npcProfiles["npc.loki"].name,"Локи");
 assert.equal(second.pack.npcProfiles["npc.loki"],undefined);
});
test("Google Sheets named formulas without extension are parsed as CSV",()=>{
 const f=source("drive.file.005","formulas","id,expression\nbonus,level*2\n");
 const result=mergeGoogleProjectSources(baseline,[f]);
 assert.equal(result.pack.formulas.bonus,"level*2");
});
test("CSV repeated import replaces loot rows instead of doubling them",()=>{
 const f=files[1];
 const once=importLabFile(baseline,baseline.projectId,{format:"csv",table:"loot",content:f.text});
 const twice=importLabFile(once,baseline.projectId,{format:"csv",table:"loot",content:f.text});
 assert.deepEqual(once.lootTables.goblin,twice.lootTables.goblin);
});
test("multiple root pack.json files are not silently merged",()=>{
 assert.throws(()=>mergeGoogleProjectSources(baseline,[
  source("drive.file.1","pack.json",JSON.stringify(baseline)),
  source("drive.file.2","world.json",JSON.stringify(baseline))
 ]),/LAB_DRIVE_MULTIPLE_BASE_PACKS/);
});
test("invalid file fails before accepting incomplete project rules",()=>{
 assert.throws(()=>mergeGoogleProjectSources(baseline,[source("drive.bad.1","formulas.csv","id,expression\nx,attack*2,unwanted_extra_column\n")]),/LAB_CSV_COLUMN_MISMATCH/);
});
test("source excerpts are bounded and do not modify NPC canonical data",()=>{
 const lore=source("drive.file.999","world_notes.txt","Lorem ipsum ".repeat(2000));
 const result=mergeGoogleProjectSources(baseline,[lore]);
 assert.ok(result.notes[0].excerpt.length<=5000);
 assert.deepEqual(result.pack.npcProfiles,baseline.npcProfiles);
});
test("duplicate Drive IDs are rejected",()=>{
 assert.throws(()=>mergeGoogleProjectSources(baseline,[files[0],{...files[0],name:"another.csv"}]),/LAB_DRIVE_DUPLICATE_FILE_ID/);
});
