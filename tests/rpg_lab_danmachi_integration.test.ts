import test from "node:test";
import assert from "node:assert/strict";
import {mergeGoogleProjectSources,type DriveFileText} from "../src/rpg_lab_v1/google_merge.ts";
import {evaluateLabPack,type LabPack} from "../src/rpg_lab_v1/engine.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {validateLabSession,type LabSession} from "../src/rpg_lab_v1/session.ts";
import {encodeLabPack,decodeLabPack} from "../src/rpg_lab_v1/storage_codec.ts";
const base:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"danmachi_core",worldId:"danmachi.orario",
 formulas:{},resources:{hp:{min:0,max:100}},lootTables:{rare_goblin:{rolls:1,entries:[{itemId:"fang",weight:1,chance:.06,min:1,max:1}]}},
 prices:{stone_goblin:{base:180,currency:"valis"}},economy:{taxRate:0},
 locations:{dungeon_f07:{name:"7-й этаж",kind:"dungeon_floor",neighbors:{}},
  dungeon_f18:{name:"18-й этаж",kind:"safe_floor",neighbors:{}}},
 npcProfiles:{"npc.loki":{name:"Локи",canonRef:"canon.loki",traits:["protective"],goals:["family"],knownFacts:[]},
  "npc.finn":{name:"Финн",canonRef:"canon.finn",traits:["leader"],goals:["protect party"],knownFacts:[]}},
 progression:{}
};
const file=(name:string,text:string):DriveFileText=>({
 id:"drive."+name,name,mimeType:name.includes(".json")?"application/vnd.google-apps.document":
 "application/vnd.google-apps.spreadsheet",modifiedTime:"2026-11-14",text
});
const encounters=[
 "floor,region,monsterEncounterPer10Min,adventurerEncounterPer10Min,adventurerAlreadyFightingConditional,wandererFromOtherFloor,localBirthWindowMin,localBirthWindowMax,densityTier,specialRule",
 "7,Зеленоватые ходы,0.4,0.2,0.5,0,9,36,обычная,Держать дистанцию",
 "18,Ривира,0,0.4,0.05,0.01,0,0,нет спавна,Нет рождения монстров"
].join("\n");
const bestiary=[
 "monsterId,Название,F_min,F_max,Статус вида,Редкость,Авторский_или_известный_трофей,Шанс_игровой,Цена_трофея_валис,База_камня_валис,Пояснение",
 "killer_ant,Муравей-убийца,7,9,C,обычный,ant_mandible,0.1,2300,1000,Канонический вид с игровым трофеем",
 "rare_ant,Особый муравей,7,7,H,редкий,rare_mandible,0.3,5000,5000,Авторский тестовый вид",
 "goliath,Голиаф,17,17,C,босс,goliath_tooth,0.08,300000,1000000,Не обычный случайный противник"
].join("\n");
const sources=[
 file("pack.json","\uFEFF"+JSON.stringify(base)),
 file("formulas","id,expression\nfalna_point_multiplier,1+pointsTotal/3000\nfalna_level_multiplier,1.8^(level-1)\nfalna_multiplier,2*falna_point_multiplier*falna_level_multiplier"),
 file("encounters",encounters),
 file("bestiary",bestiary),
 file("loot","tableId,rolls,itemId,weight,chance,min,max\nrare_killer_ant,1,ant_mandible,1,0.1,1,1"),
 file("prices","id,base,currency,buyMultiplier,sellMultiplier\nstone_killer_ant,1200,valis,1,1"),
 file("loot.csv","tableId,rolls,itemId,weight,chance,min,max\nrare_goblin,1,fang,1,0.06,1,1"),
 file("lore.md","NPCs learn only what they personally experience.")
];
const pack=mergeGoogleProjectSources(base,sources).pack;
test("Drive pack import handles Docs BOM and native Sheets with Russian headers",()=>{
 assert.equal(pack.encounterProfiles?.dungeon_f07.monsterChance,0.4);
 assert.equal(pack.encounterProfiles?.dungeon_f18.monsterChance,0);
 assert.equal(pack.bestiary?.killer_ant.name,"Муравей-убийца");
 assert.equal(pack.bestiary?.rare_ant.origin,"H");
 assert.equal(pack.lootTables.rare_goblin.entries.length,1);
 assert.equal(pack.prices.stone_killer_ant.base,1200);
});
test("moderate Falna scales character relative to original physical baseline",()=>{
 const one=evaluateLabPack(pack,[{id:"falna.1",kind:"formula",args:{formulaId:"falna_multiplier",
  variables:{level:3,pointsTotal:1800}}}]);
 assert.equal(one.results[0].ok,true);
 if(one.results[0].ok){
  const val=one.results[0].value as {value:number};
  assert.equal(val.value,10.368);
  assert.ok(Math.abs(80*val.value-829.44)<0.00001);
 }
});
test("exploration is deterministic preview and never commits spawn or actions",()=>{
 const job={id:"watch.1",kind:"dungeon_watch",args:{floor:7,eventId:"day1.path1",seed:"table.rng",minutes:10,allowHomebrew:false}};
 const a=evaluateLabPack(pack,[job]),b=evaluateLabPack(pack,[job]);
 assert.deepEqual(a,b);assert.equal(a.committed,false);
 if(!a.results[0].ok)throw Error(a.results[0].error);
 const v=a.results[0].value as Record<string,unknown>;
 assert.equal(v.noSpawnCommitted,true);assert.equal(v.noNpcActionCommitted,true);
 assert.equal(v.safeFloor,false);
 const species=v.monsterEvidenceCandidate as {origin?:string}|null;
 assert.notEqual(species?.origin,"H");
});
test("safe floor never spawns locals and can report a separate stray chance",()=>{
 const r=evaluateLabPack(pack,[{id:"watch.2",kind:"dungeon_watch",
  args:{floor:18,eventId:"safe.floor",seed:"some.seed",noiseFactor:3}}]);
 if(!r.results[0].ok)throw Error(r.results[0].error);
 const v=r.results[0].value as any;
 assert.equal(v.safeFloor,true);
 assert.equal(v.birthWindowMinutes,null);
 assert.equal(v.encounterProbabilities.monster,0.01);
});
test("bosses are excluded from normal random pools",()=>{
 const r=evaluateLabPack(pack,[{id:"watch.3",kind:"dungeon_watch",
  args:{floor:7,eventId:"run.3",seed:"boss.test",allowHomebrew:true}}]);
 if(!r.results[0].ok)throw Error(r.results[0].error);
 assert.notEqual((r.results[0].value as any).monsterEvidenceCandidate?.monsterId,"goliath");
});
test("invalid unsafe floor profile is rejected",()=>{
 const bad=structuredClone(pack);bad.encounterProfiles!.dungeon_f18.monsterChance=.1;
 assert.throws(()=>evaluateLabPack(bad,[{id:"job",kind:"dungeon_watch",args:{floor:18,seed:"x",eventId:"evt"}}]),/LAB_DUNGEON_SAFE_FLOOR_SPAWN/);
});
const session:LabSession={
 schema:"RPG_LAB_SESSION_V1",projectId:"danmachi_core",sessionId:"linos_alt",
 gameClock:"D1 09:00",player:{resources:{hp:85},stats:{STR:100},inventory:{valis:500}},
 discovered:["dungeon_f07"],npcs:{},events:[]
};
const event:LabConfirmedEvent={
 sourceRef:"day1.scene001",time:"D1 09:10",kind:"witnessed_battle",
 summary:"The player used threads to protect a companion",locationId:"dungeon_f07",
 knownBy:["npc.loki"],
 observations:[{npcId:"npc.loki",channel:"seen",perceivedFact:"I saw a thread binding a monster",
 learnedAt:"D1 09:10",confidence:"certain",salience:"important",privacy:"small_group"}],
 effects:{inventory:{valis:100},resources:{hp:-5}},gmConfirmed:true
};
test("confirmed event saves resources and knowledge only for the actual observer",()=>{
 const next=applyConfirmedLabEvent(session,pack,event);
 assert.equal(next.player.inventory.valis,600);
 assert.equal(next.player.resources.hp,80);
 assert.equal(next.npcs["npc.loki"].memories.length,1);
 assert.equal(next.npcs["npc.finn"],undefined);
 assert.equal(next.npcs["npc.loki"].memories[0].sourceRef,"day1.scene001");
 assert.equal(next.events.length,1);
 assert.equal(session.player.inventory.valis,500);
 assert.equal(session.events.length,0);
 assert.equal(validateLabSession(next,pack),next);
});
test("replaying an event cannot duplicate loot or memories",()=>{
 const next=applyConfirmedLabEvent(session,pack,event);
 assert.throws(()=>applyConfirmedLabEvent(next,pack,event),/LAB_EVENT_ALREADY_APPLIED/);
});
test("NPC cannot witness event outside its knownBy list",()=>{
 const e=structuredClone(event);e.knownBy=[];
 assert.throws(()=>applyConfirmedLabEvent(session,pack,e),/LAB_EVENT_NO_DIRECT_WITNESS_EVIDENCE/);
});
test("report requires named source, not telepathic fact",()=>{
 const e=structuredClone(event);e.sourceRef="day1.scene002";e.knownBy=[];
 e.observations=[{npcId:"npc.finn",channel:"report",perceivedFact:"Loki told me about thread use",
  learnedAt:"D1 09:30",sourceActor:"npc.loki",confidence:"likely",salience:"ordinary",privacy:"small_group"}];
 const next=applyConfirmedLabEvent(session,pack,e);
 assert.equal(next.npcs["npc.finn"].memories[0].channel,"report");
 assert.equal(next.npcs["npc.finn"].memories[0].sourceActor,"npc.loki");
});
test("failed resource commit is atomic at pure-function boundary",()=>{
 const e=structuredClone(event);e.effects={resources:{hp:-90}};
 assert.throws(()=>applyConfirmedLabEvent(session,pack,e),/LAB_EVENT_RESOURCE_OUT_OF_BOUNDS|LAB_EVENT_EFFECT_OUT_OF_BOUNDS/);
 assert.equal(session.player.resources.hp,85);
});
test("unconfirmed outcome cannot mutate gameplay",()=>{
 const e={...event,gmConfirmed:false};
 assert.throws(()=>applyConfirmedLabEvent(session,pack,e as unknown as LabConfirmedEvent),/LAB_EVENT_CONFIRMATION_REQUIRED/);
});
test("large multi-file pack uses compressed KV carrier and roundtrips",async()=>{
 const big=structuredClone(pack);
 for(let i=0;i<115;i++){
  big.bestiary!["filler_"+i]={name:"Описание существа "+i,floorMin:7,floorMax:8,
   origin:"H",rarity:"обычный",note:"Характерные особенности и подробное описание. ".repeat(5)};
 }
 const encoded=await encodeLabPack(big,2);
 assert.ok(encoded.packedGzip instanceof Uint8Array);
 assert.ok(encoded.packedGzip!.byteLength<50000);
 assert.equal(encoded.pack,undefined);
 const decoded=await decodeLabPack(encoded);
 assert.deepEqual(decoded,big);
});
test("smaller pack stays backward-compatible as uncompressed KV object",async()=>{
 const stored=await encodeLabPack(pack,1);
 assert.ok(stored.pack);
 assert.deepEqual(await decodeLabPack(stored),pack);
});
