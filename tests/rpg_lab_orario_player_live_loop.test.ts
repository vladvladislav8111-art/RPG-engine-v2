import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {applyGuardedLabEvent} from "../src/rpg_lab_v1/turn_guard.ts";
import {validateLabSession,type LabSession} from "../src/rpg_lab_v1/session.ts";
import type {OrarioPlayerAction} from "../src/rpg_lab_v1/orario_player_event.ts";
import {readOrarioPlayerHud} from "../src/rpg_lab_v1/orario_player_event.ts";
import {ORARIO_MONSTER_BY_ID} from "../src/rpg_lab_v1/danmachi_player_balance.ts";
const pack=buildFreshDanmachiLabPack("orario_loop_test");
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,
 sessionId:"orario_first_day",gameClock:"D0 09:00",roleplayGuard:"strict",
 player:{resources:{},stats:{},inventory:{},locationId:"orario.medical_ward"},
 discovered:["orario.medical_ward"],npcs:{},events:[],worldEvents:[]
});
let sourceIndex=0;
const action=(s:LabSession,kind:string,args:Record<string,unknown>={},
 opts?:{time?:string;approved?:boolean;location?:string}):LabSession=>{
 sourceIndex++;
 const e={
  sourceRef:"evt.orario."+sourceIndex,time:opts?.time??s.gameClock,
  kind:kind==="init"?"character_setup":"player_turn",
  summary:"Подтверждённое событие Игрока "+kind,
  knownBy:[],gmConfirmed:true as const,
  ...(opts?.location?{playerLocationId:opts.location}:{}),
  playerSystem:{kind,args,playerApproved:opts?.approved??true} as OrarioPlayerAction
 };
 return applyGuardedLabEvent(s,pack,e,sourceIndex).next;
};
test("real RPG Lab strict event stream can run first login, day quest, combat, XP, stone and saved replay",()=>{
 sourceIndex=0;
 let s=fresh();
 assert.equal(readOrarioPlayerHud(s).available,false);
 s=action(s,"init");
 assert.equal(s.player.jinwoo?.awaitingActivation,true);
 assert.equal(s.player.jinwoo?.systemLevel,1);
 assert.deepEqual(s.player.jinwoo?.shadowRoster,[]);
 assert.throws(()=>action(s,"purchase",{itemId:"blade_steel",quantity:1}),
  /NOT_PLAYER_APPROVED|SYSTEM_NOT_ACTIVE|STORE_REMOVED|ITEM_LOCKED|GOLD_INSUFFICIENT/);
 s=action(s,"activate",{confirmedAwakening:true});
 assert.equal(readOrarioPlayerHud(s).available,true);
 assert.equal(s.player.jinwoo?.falna.blessed,false);
 s=action(s,"daily_start",{day:0,confirmedOffer:true});
 for(const [exercise,count] of Object.entries({
  pushups:100,squats:100,situps:100,runMeters:10000})){
  s=action(s,"daily_progress",{day:0,exercise,count});
 }
 s=action(s,"daily_claim",{day:0,choice:"random_box"});
 assert.equal(s.player.jinwoo?.freeStatPoints,3);
 assert.equal(s.player.jinwoo?.inventory.system_daily_box,1);
 s=action(s,"daily_box",{});
 assert.equal(s.player.jinwoo?.inventory.system_daily_box??0,0);
 s=action(s,"spend_points",{alloc:{strength:2,stamina:1}});
 assert.equal(s.player.jinwoo?.stats.strength,12);
 assert.equal(s.player.jinwoo?.stats.stamina,11);
 s=applyGuardedLabEvent(s,pack,{
  sourceRef:"evt.first_dungeon_arrival",time:s.gameClock,
  summary:"Игрок вошёл на первый этаж Подземелья",
  knownBy:[],gmConfirmed:true,kind:"travel",
  playerLocationId:"orario.dungeon.upper",
  discovered:["orario.dungeon.gate","orario.dungeon.upper"]
 },sourceIndex+1).next;
 sourceIndex++;
 s=action(s,"start_battle",{monsterId:"goblin",
  monsterRef:"mob.goblin.first",floor:1,confirmedHostile:true});
 assert.equal(s.player.jinwoo?.activeEncounter?.enemyHp,
  ORARIO_MONSTER_BY_ID.goblin.hp);
 let count=0;
 while(s.player.jinwoo?.activeEncounter&&count++<40){
  s=action(s,"combat_exchange",{move:"strike",loadout:{}});
 }
 assert.ok(count>0&&count<40,"Goblin should be defeat-able from the early baseline");
 assert.equal(s.player.jinwoo?.activeEncounter,undefined);
 assert.ok(s.player.jinwoo!.defeatedTargetRefs.includes("mob.goblin.first"));
 assert.ok(s.player.jinwoo!.xp>0);
 assert.ok(s.player.jinwoo!.gold>0);
 assert.equal(Object.keys(s.player.jinwoo!.magicStones).length,0,
  "Loot cannot appear before the Player picks up its confirmed stone");
 s=action(s,"stone_collect",{stoneId:"stone.goblin.first",
  monsterRef:"mob.goblin.first",monsterName:"Гоблин",
  confirmedLoot:true,intact:true,powerRating:1,
  powerTier:"common",guildValueValis:28,corruptedMana:false});
 assert.equal(s.player.jinwoo!.magicStones["stone.goblin.first"].state,"held");
 s=action(s,"stone_sell",{stoneId:"stone.goblin.first",
  confirmedGuildExchange:true});
 assert.equal(s.player.jinwoo!.valis,28);
 assert.equal(s.player.jinwoo!.gold>0,true);
 assert.equal(s.player.jinwoo!.magicStones["stone.goblin.first"].state,"sold");
 assert.ok(s.events.length>=15);
 validateLabSession(s,pack);
 const after=structuredClone(s);
 assert.deepEqual(s,after,"CAS snapshot must be serializable and replayable");
 assert.equal(after.player.jinwoo?.freeStatPoints,0);
});
test("guarded stream rejects unapproved decisions, duplicated event refs and incompatible character profile",()=>{
 sourceIndex=0;
 const s=fresh();
 assert.throws(()=>action(s,"init",{}, {approved:false}),/NOT_PLAYER_APPROVED/);
 const created=action(s,"init");
 assert.throws(()=>applyGuardedLabEvent(created,pack,{
  sourceRef:created.events[0].sourceRef,time:"D0 09:00",
  kind:"player_turn",summary:"Дубликат",knownBy:[],gmConfirmed:true,
  playerSystem:{kind:"activate",args:{confirmedAwakening:true},playerApproved:true}
 },2),/ALREADY_APPLIED/);
 assert.throws(()=>action(created,"activate",{confirmedAwakening:false}),
  /NOT_CONFIRMED/);
 const linos=structuredClone(created);
 linos.player.linos={schema:"NOT_VALID"} as never;
 assert.throws(()=>validateLabSession(linos,pack),
  /LAB_LINOS|PLAYER_SYSTEM_WRONG_WORLD_OR_DUPLICATE_PROFILE/);
});
test("a daily penalty needs an actual reached deadline and no expired reward",()=>{
 sourceIndex=0;
 let s=action(fresh(),"init");s=action(s,"activate",{confirmedAwakening:true});
 s=action(s,"daily_start",{day:0,confirmedOffer:true});
 assert.throws(()=>action(s,"daily_fail",{day:0,confirmedDeadline:true},
   {time:"D0 19:00",approved:false}),/PENALTY_PREMATURE/);
 s=action(s,"daily_fail",{day:0,confirmedDeadline:true},
   {time:"D1 00:00",approved:false});
 assert.equal(s.player.jinwoo?.dailyTraining?.status,"failed");
 assert.equal(s.player.jinwoo?.storyFlags.includes("quest.penalty.pending.0"),true);
 assert.throws(()=>action(s,"daily_claim",{day:0,choice:"recovery"}),
  /NOT_FINISHED/);
});
