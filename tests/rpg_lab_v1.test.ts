import test from "node:test";
import assert from "node:assert/strict";
import {evaluateFormula} from "../src/rpg_lab_v1/formulas.ts";
import {validateLabPack,evaluateLabPack,type LabPack} from "../src/rpg_lab_v1/engine.ts";
import {importLabFile,parseLabCsv} from "../src/rpg_lab_v1/import.ts";
import {validateLabSession,withSessionDefaults,type LabSession} from "../src/rpg_lab_v1/session.ts";

const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"test_world",worldId:"demo.fantasy",
 formulas:{damage:"max(0, attack - defense)",harvest:"floor((base+skill*0.4)*tool)",xpNext:"100+level*40",
  doubled:"damage*2",training:"floor(trainingMinutes*focus/10)"},
 resources:{hp:{min:0,max:100},stamina:{min:0,max:60},mana:{min:0,max:80}},
 lootTables:{goblin:{rolls:2,entries:[{itemId:"coin",weight:4,chance:0.9,min:1,max:5},{itemId:"fang",weight:1,chance:0.45,min:1,max:2}]}},
 prices:{potion:{base:35,currency:"gold",buyMultiplier:1,sellMultiplier:0.5}},
 recipes:{sword:{inputs:{iron:2},outputs:{blade:1},timeFormula:"training",qcRequired:true}},
 economy:{taxRate:0.05},
 locations:{town:{name:"Town",kind:"city",neighbors:{dungeon:5}},
  dungeon:{name:"Entrance",kind:"entrance",neighbors:{town:5,floor_1:3}},
  floor_1:{name:"Floor one",kind:"dungeon_floor",parentId:"dungeon",neighbors:{dungeon:3,floor_2:8}},
  floor_2:{name:"Floor two",kind:"dungeon_floor",parentId:"dungeon",neighbors:{floor_1:8}}},
 npcProfiles:{"npc.guide":{name:"Guide",canonRef:"demo.placeholder",traits:["cautious"],
  goals:["protect party"],knownFacts:[],responsePatterns:{betrayal:[
    {emotion:"shock",motive:"find immediate safety"}]}}},
 worldProcesses:{guild_notice:{dueMinute:100,kind:"guild_notice",locationId:"town",visibility:"public",sourceRef:"canon.clock.notice"},secret:{dueMinute:101,kind:"private_plot",locationId:"floor_2",visibility:"hidden",sourceRef:"canon.clock.secret"}},
 progression:{xpThresholdFormula:"xpNext"},
};
const run=(kind:string,args:Record<string,unknown>)=>evaluateLabPack(pack,[{id:"job.1",kind,args}]).results[0] as {ok:boolean;value:any;error?:string};
test("pack validates",()=>assert.equal(validateLabPack(pack).projectId,"test_world"));
test("formula arithmetic and math functions",()=>{
 assert.equal(evaluateFormula("floor(2.9)+clamp(13,0,10)*2",{},{}),22);
 assert.equal(evaluateFormula("max(0,attack-defense)",{attack:24,defense:7},{}),17);
});
test("formulas reference other formulas without code execution",()=>{
 assert.equal(evaluateFormula(pack.formulas.doubled,{attack:24,defense:7},pack.formulas,["doubled"]),34);
 assert.throws(()=>evaluateFormula("1+process.exit()",{},{}));
 assert.throws(()=>evaluateFormula("a",{}, {a:"b",b:"a"},["a"]));
 assert.throws(()=>evaluateFormula("1/0",{},{}));
});
test("resources are bounded and no spend without enough resources",()=>{
 const value=run("resources",{current:{hp:90,stamina:20},deltas:{hp:15,stamina:-6}}).value;
 assert.equal(value.next.hp,100);assert.equal(value.next.stamina,14);assert.equal(value.wasted.hp,5);
 assert.equal(run("resources",{current:{stamina:2},deltas:{stamina:-3}}).ok,false);
});
test("loot is deterministic and never grants items",()=>{
 const a={tableId:"goblin",eventId:"battle.1",seed:"locked.seed",killConfirmed:true};
 const x=run("loot",a);const y=run("loot",a);
 assert.deepEqual(x,y);assert.equal(x.value.noItemsGranted,true);
});
test("harvest material quantities from current formula",()=>{
 const r=run("harvest",{itemId:"ore",formulaId:"harvest",variables:{base:4,skill:5,tool:1.5}});
 assert.equal(r.value.quantity,9);assert.equal(r.value.itemsGranted,false);
});
test("multi-level progression is a proposal, not a grant",()=>{
 const r=run("progression",{level:1,xp:100,gained:270});
 assert.equal(r.value.toLevel,3);assert.equal(r.value.remainingXp,50);assert.equal(r.value.noPointsAwarded,true);
});
test("stat growth formula",()=>{
 const r=run("stat",{formulaId:"training",current:12,variables:{trainingMinutes:40,focus:2}});
 assert.equal(r.value.proposedValue,20);
});
test("economy uses source-defined currency and tax",()=>{
 const x=run("economy",{itemId:"potion",quantity:2,action:"buy"});
 assert.equal(x.value.total,73.5);
 const y=run("economy",{itemId:"potion",quantity:2,action:"sell"});
 assert.equal(y.value.total,35);
});
test("route respects discovered locations and weighted connections",()=>{
 assert.deepEqual(run("route",{from:"town",to:"floor_1",discovered:["town","dungeon","floor_1"]}).value.path,["town","dungeon","floor_1"]);
 assert.equal(run("route",{from:"town",to:"floor_2",discovered:["town","dungeon","floor_1"]}).ok,false);
});
test("NPC responses are hypotheses, not certain feelings or actions",()=>{
 const r=run("npc",{npcId:"npc.guide",event:{kind:"betrayal",sourceRef:"tx.event.1",witnessedByNpc:true},knownFactIds:[]});
 assert.equal(r.value.possibleResponses[0].establishedEmotion,false);
 assert.equal(r.value.possibleResponses[0].committedAction,false);
});
test("no offscreen knowledge from unobserved betrayal",()=>{
 const r=run("npc",{npcId:"npc.guide",event:{kind:"betrayal",sourceRef:"tx.event.1",witnessedByNpc:false},knownFactIds:[]});
 assert.equal(r.value.possibleResponses.length,0);
});
test("bounded batch and invalid op cannot mutate save",()=>{
 const r=evaluateLabPack(pack,[{id:"z.1",kind:"unknown",args:{}}]);
 assert.equal(r.committed,false);assert.equal(r.legacySaveTouched,false);assert.equal(r.results[0].ok,false);
});
test("CSV quoted cells parse",()=>{
 const r=parseLabCsv('id,expression\nnewcalc,"max(1, 2)"\n');
 assert.equal(r[0].expression,"max(1, 2)");
});
test("CSV formula import creates new calculation",()=>{
 const updated=importLabFile(pack,"test_world",{format:"csv",table:"formulas",content:"id,expression\nnewcalc,attack*3\n"});
 assert.equal(evaluateLabPack(updated,[{id:"z.2",kind:"formula",args:{formulaId:"newcalc",variables:{attack:5}}}]).results[0].ok,true);
 assert.equal(pack.formulas.newcalc,undefined);
});
test("JSON patches are isolated to own project",()=>{
 const updated=importLabFile(pack,"test_world",{format:"json",content:'{"formulas":{"damage":"attack+1"}}'});
 assert.equal(updated.formulas.damage,"attack+1");assert.equal(pack.formulas.damage,"max(0, attack - defense)");
});
test("rejects cross-project pack replacement",()=>{
 const other=JSON.stringify({...pack,projectId:"other_world"});
 assert.throws(()=>importLabFile(pack,"test_world",{format:"json",content:other}));
});
test("rejects script and prototype injection",()=>{
 assert.throws(()=>importLabFile(pack,"test_world",{format:"csv",table:"formulas",content:"id,expression\n__proto__,100"}));
 assert.throws(()=>evaluateFormula("Math.random()",{},{}));
});

test("craft uses named recipe and verifies stock",()=>{
 const r=run("craft",{recipeId:"sword",inventory:{iron:3},variables:{trainingMinutes:50,focus:1}});
 assert.equal(r.value.remainingInventory.iron,1);assert.equal(r.value.proposedOutputs.blade,1);
 assert.equal(r.value.itemsGranted,false);
 assert.equal(run("craft",{recipeId:"sword",inventory:{iron:1},variables:{trainingMinutes:50,focus:1}}).ok,false);
});
test("encounter combines formula, resource budget and optional loot",()=>{
 const r=run("encounter",{damageFormulaId:"damage",variables:{attack:24,defense:7},targetHp:15,
   eventId:"event.kill.1",lootTableId:"goblin",seed:"battle.seed",killConfirmed:false,
   resourceCurrent:{stamina:20},resourceDeltas:{stamina:-5}});
 assert.equal(r.value.damage,17);assert.equal(r.value.lethalCandidate,true);
 assert.equal(r.value.loot.pendingEvidence,true);
 assert.equal(r.value.resourcePreview.next.stamina,15);
});
test("world clock identifies hidden vs public, does not materialize events",()=>{
 const r=run("world_tick",{fromMinute:90,toMinute:105,discovered:["town"]});
 assert.equal(r.value.dueProcesses.length,2);
 assert.equal(r.value.dueProcesses[0].visibleToPlayer,true);
 assert.equal(r.value.dueProcesses[1].visibleToPlayer,false);
 assert.equal(r.value.eventsResolved,false);
});
test("trade requires player and merchant money and stock",()=>{
 const r=run("trade",{itemId:"potion",quantity:2,action:"buy",playerFunds:100,merchantFunds:100,merchantStock:3,playerStock:0});
 assert.equal(r.value.projectedMerchantStock,1);assert.equal(r.value.fundsTransferred,false);
 assert.equal(run("trade",{itemId:"potion",quantity:4,action:"buy",playerFunds:10,merchantFunds:100,merchantStock:3,playerStock:0}).ok,false);
});
test("session memory and discovered locations are source-shaped and isolated",()=>{
 const session:LabSession={schema:"RPG_LAB_SESSION_V1",projectId:"test_world",sessionId:"chapter_one",gameClock:"Day 1 06:00",
  player:{resources:{hp:100,stamina:50},stats:{attack:24,defense:7},inventory:{iron:3}},
  discovered:["town","dungeon"],npcs:{"npc.guide":{knownFacts:[],memories:[{sourceRef:"tx.scene.1",summary:"Observed camp fire",learnedAt:"Day 1",knownBy:["npc.guide"]}]}},events:[]};
 assert.equal(validateLabSession(session,pack).sessionId,"chapter_one");
 const jobs=withSessionDefaults([{id:"j.1",kind:"formula",args:{formulaId:"damage"}},{id:"j.2",kind:"route",args:{from:"town",to:"dungeon"}}],session);
 assert.equal((jobs[0].args.variables as Record<string,number>).attack,24);
 assert.deepEqual(jobs[1].args.discovered,["town","dungeon"]);
});
test("session rejects invented resource and unknown map node",()=>{
 const session:LabSession={schema:"RPG_LAB_SESSION_V1",projectId:"test_world",sessionId:"chapter_one",gameClock:"Day 1",
  player:{resources:{hp:999},stats:{},inventory:{}},discovered:["secret"],npcs:{},events:[]};
 assert.throws(()=>validateLabSession(session,pack));
});
