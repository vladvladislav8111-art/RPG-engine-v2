import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {validateLabSession,type LabSession} from "../src/rpg_lab_v1/session.ts";
import {readOrarioPlayerAnchors} from "../src/rpg_lab_v1/orario_player_anchors.ts";
import {buildLabSceneBrief} from "../src/rpg_lab_v1/living_world.ts";
import {DANMACHI_DEEP_CORE_COUNT} from "../src/rpg_lab_v1/danmachi_deep_cores.ts";
import {DANMACHI_STARTING_NPC_COUNT} from "../src/rpg_lab_v1/danmachi_cast.ts";

const pack=buildFreshDanmachiLabPack("chroma_color_test");
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,sessionId:"chroma_01",
 gameClock:"D0 09:00",roleplayGuard:"strict",
 player:{resources:{},stats:{},inventory:{},locationId:"orario.gate"},
 discovered:["orario.gate"],npcs:{},events:[],worldEvents:[]
});
const hero={
 id:"hero.chroma",name:"Хрома",age:null,race:"ирид",sex:"не указано",heightCm:188,
 appearance:"Белые у корней бирюзовые волосы, цветные осколки глаз; один черный осколок в правом глазу",
 knownHistory:"Ирид из кочевого племени артистов и ткачей, пережил опасное испытание.",
 practicalKnowledge:["краски","ткачество"],backgroundMystery:"Происхождение Системы неизвестно.",
 playerControlsPersonality:true as const,immutableCanonIdentity:false as const
};
const setup:LabConfirmedEvent={
 sourceRef:"chroma.genesis.001",time:"D0 09:00",
 kind:"character_setup",summary:"Хрома прибыл к воротам Орарио",
 locationId:"orario.gate",playerLocationId:"orario.gate",
 knownBy:[],gmConfirmed:true,heroProfile:hero,
 playerSystem:{kind:"init",args:{},playerApproved:true},
 playerFeatureChanges:[{
  featureId:"chroma.hair",action:"set",expectedRevision:0,
  playerApproved:true,feature:{description:"Белые волосы с бирюзовой живой краской",
   significance:"notable",visibility:"obvious"}
 },{
  featureId:"chroma.black_eye",action:"set",expectedRevision:0,
  playerApproved:true,feature:{description:"Один черный осколок радужки правого глаза",
   significance:"notable",visibility:"conditional"}
 }]
};
test("Chroma character is explicitly set, with no Falna or previous Kai save",()=>{
 const s=applyConfirmedLabEvent(fresh(),pack,setup);
 assert.equal(validateLabSession(s,pack),s);
 assert.equal(s.player.hero?.name,"Хрома");
 assert.equal(s.player.hero?.age,null);
 assert.equal(s.player.hero?.race,"ирид");
 assert.equal(s.player.jinwoo?.awaitingActivation,true);
 assert.equal(s.player.jinwoo?.falna.blessed,false);
 assert.deepEqual(s.player.chromaPalette?.baselineColors,["бирюза","нежно-голубой"]);
 assert.equal(s.player.chromaPalette?.reaction,null);
 const a=readOrarioPlayerAnchors(s,pack);
 assert.equal(a.chromaPalette?.activeReaction,null);
 assert.equal(a.scene.location,"Ворота Орарио");
});
test("Chroma reaction and material stain persist across unrelated later turns",()=>{
 let s=applyConfirmedLabEvent(fresh(),pack,setup);
 s=applyConfirmedLabEvent(s,pack,{
  sourceRef:"chroma.feeling.001",time:"D0 09:05",kind:"player_turn",
  summary:"Хрома выразил сильную печаль и оставил след на шарфе",
  knownBy:[],gmConfirmed:true,
  chromaReaction:{action:"manifest",emotion:"печаль",
   colors:["фиолетовый","сливовый"],zones:["волосы","глаза","руки"],
   intensity:"strong",control:"involuntary",playerEmotionConfirmed:true},
  chromaStainChanges:[{action:"add",stainId:"stain.scarf.1",
   target:"Шарф Хромы",surface:"fabric",color:"сливовый",
   description:"След окрашенных слез",durability:"fabric_decades",
   playerActionConfirmed:true}]
 });
 assert.equal(s.player.chromaPalette?.reaction?.emotion,"печаль");
 assert.equal(Object.keys(s.player.chromaPalette?.stains??{}).length,1);
 s=applyConfirmedLabEvent(s,pack,{
  sourceRef:"chroma.walk.002",time:"D0 09:20",kind:"player_turn",
  summary:"Хрома продолжил путь; след еще не смыли",knownBy:[],gmConfirmed:true
 });
 assert.equal(s.player.chromaPalette?.reaction?.emotion,"печаль");
 assert.equal(s.player.chromaPalette?.stains["stain.scarf.1"]?.durability,"fabric_decades");
 const anchor=buildLabSceneBrief(pack,s,{npcIds:["npc.apollo","npc.hermes"]});
 assert.equal(anchor.chromaPaletteAnchor?.activeReaction?.emotion,"печаль");
 assert.equal(anchor.chromaPaletteAnchor?.physicalStains.length,1);
 assert.equal(anchor.actors[0].featureAwareness.find(f=>f.featureId==="chroma.hair")?.familiarity,"unfamiliar");
 assert.equal(anchor.actors[1].featureAwareness.find(f=>f.featureId==="chroma.hair")?.familiarity,"unfamiliar");
 s=applyConfirmedLabEvent(s,pack,{
  sourceRef:"chroma.calm.003",time:"D0 09:25",kind:"player_turn",
  summary:"Хрома успокоился",knownBy:[],gmConfirmed:true,
  chromaReaction:{action:"settle",playerEmotionConfirmed:true}
 });
 assert.equal(s.player.chromaPalette?.reaction,null);
 assert.equal(Object.keys(s.player.chromaPalette?.stains??{}).length,1);
 s=applyConfirmedLabEvent(s,pack,{
  sourceRef:"chroma.clean.004",time:"D0 09:40",kind:"player_turn",
  summary:"Шарф очищен подходящим способом",knownBy:[],gmConfirmed:true,
  chromaStainChanges:[{action:"remove",stainId:"stain.scarf.1",
   reason:"Подтвержденная очистка",confirmedRemoval:true}]
 });
 assert.equal(Object.keys(s.player.chromaPalette?.stains??{}).length,0);
});
test("cannot invent hero emotion or silently remove a stubborn pigment trace",()=>{
 const s=applyConfirmedLabEvent(fresh(),pack,setup);
 const unconfirmed:LabConfirmedEvent={
  sourceRef:"chroma.emotion.fake",time:"D0 09:01",kind:"player_turn",
  summary:"Мастер сам приписал страх",knownBy:[],gmConfirmed:true,
  chromaReaction:{action:"manifest",emotion:"страх",colors:["серый"],
   zones:["лицо"],intensity:"mild",control:"involuntary",
   playerEmotionConfirmed:false as true}
 };
 assert.throws(()=>applyConfirmedLabEvent(s,pack,unconfirmed),/CHROMA_EMOTION_NOT_PLAYER_CONFIRMED/);
 const invalid:LabConfirmedEvent={
  sourceRef:"chroma.stain.fake",time:"D0 09:01",kind:"player_turn",
  summary:"Мастер решил убрать несуществующий след",knownBy:[],gmConfirmed:true,
  chromaStainChanges:[{action:"remove",stainId:"stain.unknown",
   reason:"Само исчезло",confirmedRemoval:true}]
 };
 assert.throws(()=>applyConfirmedLabEvent(s,pack,invalid),/CHROMA_STAIN_REMOVAL_UNVERIFIED/);
});
test("all registered DanMachi NPCs including dangerous ones have deep GM cores",()=>{
 assert.equal(DANMACHI_DEEP_CORE_COUNT,DANMACHI_STARTING_NPC_COUNT);
 for(const id of ["apollo","hermes","ouranos","hyakinthos","phryne",
  "ikeros","dix","zanis","ishtar","dionysus"]){
  const c=pack.npcProfiles["npc."+id];
  assert.ok(c?.deepCore?.privateDrive,id);
  assert.ok(c?.deepCore?.failurePattern,id);
  assert.ok(c?.deepCore?.arcGuard,id);
 }
});
