import test from "node:test";
import assert from "node:assert/strict";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";
import {evaluateLabPack} from "../src/rpg_lab_v1/engine.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {validateLabSession,type LabSession} from "../src/rpg_lab_v1/session.ts";
import {reviewLabSessionMemory} from "../src/rpg_lab_v1/memory_view.ts";
import {encodeLabSession,decodeLabSession} from "../src/rpg_lab_v1/session_storage.ts";
import {newLinosState,linosProfile,linosCastCost,previewLinosCast,
 regenerateLinosMp} from "../src/rpg_lab_v1/linos.ts";
const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"danmachi_core",worldId:"danmachi.orario",
 formulas:{falna_multiplier:"2*1.8^(level-1)*(1+pointsTotal/3000)"},
 resources:{hp:{min:0,max:100}},lootTables:{},prices:{},economy:{taxRate:0},
 locations:{orario_south_main:{name:"Южная улица",kind:"city",neighbors:{}}},
 npcProfiles:{
  "npc.finn":{name:"Финн",canonRef:"danmachi.canon.finn",traits:["calculating"],goals:["protect familia"],knownFacts:[]},
  "npc.lefiya":{name:"Лефия",canonRef:"danmachi.canon.lefiya",traits:["earnest"],goals:["improve magic"],knownFacts:[]},
  "npc.loki":{name:"Локи",canonRef:"danmachi.canon.loki",traits:["mischievous"],goals:["family"],knownFacts:[]},
 },progression:{},worldProcesses:{guild:{dueMinute:600,sourceRef:"guild.daily",kind:"board_change",visibility:"public"}}
};
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:"danmachi_core",sessionId:"linos_probe_new",
 gameClock:"D0 08:00",player:{resources:{hp:100},stats:{},inventory:{},linos:newLinosState()},
 discovered:["orario_south_main"],npcs:{},events:[],worldEvents:[]
});
function evt(sourceRef:string,time:string,options:Partial<LabConfirmedEvent>={}):LabConfirmedEvent{
 return {sourceRef,time,kind:"scene",summary:"Состоявшееся событие",knownBy:[],gmConfirmed:true,...options};
}
test("Falna doubles natural attributes, material strength, output and MP immediately",()=>{
 const base=linosProfile(newLinosState());
 assert.equal(base.mp,2400);
 assert.equal(base.maxMp,2400);
 assert.equal(base.thread.kgf,480);
 let state=applyConfirmedLabEvent(fresh(),pack,evt("evt.bless","D0 08:01",{
  kind:"blessing",linos:{type:"blessing",godConfirmed:true}}));
 const p=linosProfile(state.player.linos!);
 assert.equal(p.blessed,true);
 assert.equal(p.level,1);
 assert.equal(p.maxMp,4800);
 assert.equal(p.mp,2400); // blessing does NOT magically refill missing MP
 assert.equal(p.thread.kgf,960);
 assert.equal(p.thread.creationMps,16);
 assert.equal(p.attributes.str.multiplier,2);
 assert.equal(p.attributes.mag.multiplier,2);
 assert.ok(p.thread.gestureRangeM>20);
});
test("MP regeneration exactly 100% in 24 hours only while thread-free and out of combat",()=>{
 const s=newLinosState();
 s.mp=0;
 const quarter=regenerateLinosMp(s,360,"quiet");
 assert.equal(quarter.state.mp,600);
 assert.equal(regenerateLinosMp(s,360,"combat").state.mp,0);
 assert.equal(regenerateLinosMp(s,360,"thread_use").state.mp,0);
 assert.equal(regenerateLinosMp(s,1440,"quiet").state.mp,2400);
 assert.equal(regenerateLinosMp({...s,mp:2350},1440,"quiet").state.mp,2400);
});
test("Only explicit confirmed quiet clock passage can regenerate a persistent Linos snapshot",()=>{
 let s=fresh();s.player.linos!.mp=1200;
 s=applyConfirmedLabEvent(s,pack,evt("evt.work","D0 09:00",{
  linos:{type:"time",mode:"thread_use"}}));
 assert.equal(s.player.linos!.mp,1200);
 s=applyConfirmedLabEvent(s,pack,evt("evt.battle","D0 10:00",{
  kind:"combat",linos:{type:"time",mode:"combat"}}));
 assert.equal(s.player.linos!.mp,1200);
 s=applyConfirmedLabEvent(s,pack,evt("evt.quiet","D0 16:00",{
  kind:"rest",linos:{type:"time",mode:"quiet"}}));
 assert.equal(s.player.linos!.mp,1800);
 s=applyConfirmedLabEvent(s,pack,evt("evt.no_assumed_recovery","D0 18:00"));
 assert.equal(s.player.linos!.mp,1800);
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.fault","D0 17:59",{
  linos:{type:"time",mode:"quiet"}})),/LAB_EVENT_CLOCK_REGRESSION/);
});
test("Thread production costs exact MP and non-learned skills cannot be cast",()=>{
 assert.equal(linosCastCost({ability:"thread",lengthM:30,diameterMm:2}).costMp,300);
 assert.equal(linosCastCost({ability:"magic_drive",seconds:10,mode:"fast"}).costMp,40);
 assert.equal(linosCastCost({ability:"magic_drive",seconds:10,mode:"loaded",loops:2}).costMp,220);
 assert.equal(linosCastCost({ability:"living_network",zones:1,seconds:300,trigger:"medium"}).costMp,30);
 assert.equal(linosCastCost({ability:"healing_cocoon",seconds:300}).costMp,110);
 assert.equal(linosCastCost({ability:"draining_bindings",seconds:30}).costMp,70);
 assert.equal(linosCastCost({ability:"optical_hide",lengthM:20,seconds:4}).costMp,38);
 assert.equal(previewLinosCast(newLinosState(),{ability:"magic_drive",seconds:1}).canCast,false);
 let s=fresh();
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.invalid_skill","D0 08:01",{
  linos:{type:"cast",request:{ability:"magic_drive",seconds:1}}})),/LINOS_SKILL_NOT_UNLOCKED/);
 s=applyConfirmedLabEvent(s,pack,evt("evt.thread","D0 08:01",{
  linos:{type:"cast",request:{ability:"thread",lengthM:30,diameterMm:2}}}));
 assert.equal(s.player.linos!.mp,2100);
 assert.equal(s.events.length,1);
});
test("Skill unlocks need a blessing and confirmed divine acquisition",()=>{
 let s=fresh();
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.cheat","D0 08:01",{
  linos:{type:"learn",skill:"magic_drive",godConfirmed:true}})),/LAB_LINOS_LEARNING_INVALID/);
 s=applyConfirmedLabEvent(s,pack,evt("evt.bless","D0 08:01",{
  kind:"blessing",linos:{type:"blessing",godConfirmed:true}}));
 s=applyConfirmedLabEvent(s,pack,evt("evt.learn","D0 08:02",{
  kind:"falna_update",linos:{type:"learn",skill:"magic_drive",godConfirmed:true}}));
 s=applyConfirmedLabEvent(s,pack,evt("evt.drive","D0 08:03",{
  linos:{type:"cast",request:{ability:"magic_drive",seconds:10,mode:"fast"}}}));
 assert.equal(s.player.linos!.mp,2360);
});
test("Falna update makes level persistent and MAG affects new fiber without nerf caps",()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,evt("evt.bless","D0 08:01",{kind:"blessing",linos:{type:"blessing",godConfirmed:true}}));
 s=applyConfirmedLabEvent(s,pack,evt("evt.stats","D0 08:02",{kind:"falna_update",
  linos:{type:"status_update",godConfirmed:true,current:{str:500,end:20,dex:90,agi:35,mag:100},threadRank:"I"}}));
 const p=linosProfile(s.player.linos!);
 assert.equal(p.maxMp,5208);
 assert.equal(p.thread.kgf,1041.6);
 assert.equal(p.thread.creationMps,17.36);
 s=applyConfirmedLabEvent(s,pack,evt("evt.level","D0 08:03",{
  kind:"falna_update",linos:{type:"status_update",godConfirmed:true,levelUp:true}}));
 assert.equal(s.player.linos!.level,2);
 assert.equal(s.player.linos!.current.mag,0);
 assert.equal(s.player.linos!.past.mag,100);
 assert.equal(s.player.linos!.past.str,500);
 assert.equal(s.player.linos!.mp,2400);
});
test("Feature familiarity is personal, per-feature and hearsay does not count as seeing",()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,evt("evt.eyes","D0 09:00",{
  knownBy:["npc.finn"],features:[{npcId:"npc.finn",featureId:"linos.six_eyes.active",
   channel:"seen",significance:"notable",reaction:"заметил и внимательно посмотрел",
   privacy:"small_group"}]}));
 assert.equal(s.npcs["npc.finn"].perceptions!["linos.six_eyes.active"].familiarity,"recognizes");
 s=applyConfirmedLabEvent(s,pack,evt("evt.report","D0 10:00",{
  features:[{npcId:"npc.lefiya",featureId:"linos.six_eyes.active",
   channel:"report",sourceActor:"npc.finn",relayedSourceRef:"evt.eyes",
   interpretation:"Финн описал необычное зрение",privacy:"small_group"}]}));
 assert.equal(s.npcs["npc.lefiya"].perceptions!["linos.six_eyes.active"].familiarity,"unfamiliar");
 assert.equal(s.npcs["npc.lefiya"].perceptions!["linos.six_eyes.active"].heardCount,1);
 assert.equal(s.npcs["npc.loki"],undefined);
 for(let i=0;i<2;i++){
  s=applyConfirmedLabEvent(s,pack,evt("evt.repeat"+i,"D0 1"+i+":00",{
   knownBy:["npc.lefiya"],features:[{npcId:"npc.lefiya",
    featureId:"linos.six_eyes.active",channel:"seen",significance:"notable",
    privacy:"small_group"}]}));
 }
 assert.equal(s.npcs["npc.lefiya"].perceptions!["linos.six_eyes.active"].familiarity,"accustomed");
 assert.equal(s.npcs["npc.lefiya"].perceptions!["linos.sudden_movement"],undefined);
 const privateView=reviewLabSessionMemory(pack,s,{npcIds:["npc.lefiya"],includePrivate:true});
 assert.equal(privateView.npcSummaries[0].featureFamiliarity[0].familiarity,"accustomed");
 const publicView=reviewLabSessionMemory(pack,s,{npcIds:["npc.lefiya"]});
 assert.deepEqual(publicView.npcSummaries[0].featureFamiliarity,[]);
});
test("World autonomy previews are independent, never committed without explicit GM result",()=>{
 const preview=evaluateLabPack(pack,[{id:"d0",kind:"world_tick",args:{
  fromMinute:400,toMinute:2000,npcIds:["npc.finn","npc.lefiya"],sessionId:"linos_probe_new"
 }}]);
 const v=preview.results[0];
 assert.equal(v.ok,true);
 if(!v.ok)throw Error("world tick rejected");
 const info=v.value as {npcAgenda:unknown[];dueProcesses:unknown[];worldTimeAdvanced:boolean};
 assert.equal(info.worldTimeAdvanced,false);
 assert.equal(info.dueProcesses.length,1);
 assert.ok(info.npcAgenda.length>=1);
 let s=fresh();
 assert.equal(s.worldEvents?.length,0);
 s=applyConfirmedLabEvent(s,pack,evt("evt.offscreen","D0 14:00",{
  worldActions:[{npcId:"npc.finn",action:"проверил снабжение",
   outcome:"поручил проверить записи",privacy:"hidden"}]}));
 assert.equal(s.worldEvents?.length,1);
 const publicView=reviewLabSessionMemory(pack,s,{npcIds:["npc.finn"]});
 assert.equal(publicView.independentWorldEvents.length,0);
 const gmView=reviewLabSessionMemory(pack,s,{npcIds:["npc.finn"],includePrivate:true});
 assert.equal(gmView.independentWorldEvents.length,1);
});
test("Linos events, personal feature familiarity, and offscreen actions survive round-trip",async()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,evt("evt.eyes","D0 08:01",{
  knownBy:["npc.lefiya"],features:[{npcId:"npc.lefiya",featureId:"linos.extra_hands",
   channel:"seen",significance:"notable",privacy:"public"}],
  linos:{type:"cast",request:{ability:"thread",lengthM:2,diameterMm:2}},
  worldActions:[{npcId:"npc.finn",action:"занят планированием",
   outcome:"подготовил совещание",privacy:"hidden"}]
 }));
 const encoded=await encodeLabSession(s,pack,1);
 const restored=await decodeLabSession(encoded,pack);
 assert.deepEqual(restored,s);
 validateLabSession(restored,pack);
 assert.equal(restored.player.linos!.mp,2380);
});
