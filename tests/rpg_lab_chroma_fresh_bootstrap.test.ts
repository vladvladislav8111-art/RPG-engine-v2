import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {validateLabSession} from "../src/rpg_lab_v1/session.ts";
import {applyConfirmedLabEvent} from "../src/rpg_lab_v1/events.ts";
import {newOrarioPlayerAwakening} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";

test("fresh, isolated Chroma world has Orario gate and all seventy canonical NPC cores",()=>{
 const pack=buildFreshDanmachiLabPack("chroma_orario_main_20261120");
 assert.equal(pack.worldId,"danmachi.orario");
 assert.ok(pack.locations["orario.gate"]);
 assert.equal(Object.keys(pack.npcProfiles).length,70);
 assert.equal(Object.keys(pack.npcProfiles).filter(x=>Boolean(pack.npcProfiles[x].deepCore)).length,70);
});
test("Chroma starts at gate with no stale Player identity, Falna or memory",()=>{
 const pack=buildFreshDanmachiLabPack("chroma_orario_main_20261120");
 const session={
  schema:"RPG_LAB_SESSION_V1" as const,projectId:pack.projectId,
  sessionId:"chroma_day0_20261120",gameClock:"D0 09:00",
  roleplayGuard:"strict" as const,player:{locationId:"orario.gate",
   resources:{},stats:{},inventory:{}},
  discovered:["orario.gate"],npcs:{},events:[],worldEvents:[]
 };
 assert.equal(validateLabSession(session,pack),session);
 const event={
  sourceRef:"chroma.genesis.001",time:"D0 09:00",kind:"character_setup",
  summary:"Хрома прибывает к воротам Орарио",
  knownBy:[],locationId:"orario.gate",playerLocationId:"orario.gate",
  gmConfirmed:true as const,
  playerSystem:{kind:"init",args:{},playerApproved:true as const},
  heroProfile:{id:"hero.chroma",name:"Хрома",age:null,race:"ирид",
   sex:"не указано",heightCm:188,appearance:"Ирид, бирюзовая палитра, один чёрный осколок правого глаза",
   knownHistory:"Кочевой художник, переживший опасное испытание.",
   practicalKnowledge:["роспись","ткачество"],backgroundMystery:"Природа Системы неизвестна",
   playerControlsPersonality:true as const,immutableCanonIdentity:false as const},
  playerFeatureChanges:[{featureId:"chroma.hair",action:"set" as const,
   expectedRevision:0,playerApproved:true as const,
   feature:{description:"Белые у корней бирюзовые волосы",
    significance:"notable" as const,visibility:"obvious" as const}}]
 };
 const ready=applyConfirmedLabEvent(session,pack,event);
 assert.equal(ready.player.hero?.id,"hero.chroma");
 assert.equal(ready.player.jinwoo?.awaitingActivation,true);
 assert.equal(ready.player.jinwoo?.falna.blessed,false);
 assert.equal(ready.player.chromaPalette?.reaction,null);
 assert.deepEqual(ready.player.chromaPalette?.baselineColors,["бирюза","нежно-голубой"]);
 assert.deepEqual(ready.npcs,{});
 assert.equal(session.events.length,0);
});
