import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {issueSystemDungeonKey,enterSystemDungeon} from "../src/rpg_lab_v1/system_dungeon_keys.ts";
import {startConfirmedOrarioBattle} from "../src/rpg_lab_v1/orario_player_combat.ts";
import {commitBalancedMonsterDefeat,ORARIO_MONSTER_BY_ID} from
 "../src/rpg_lab_v1/danmachi_player_balance.ts";
import {SYSTEM_ENCOUNTER_DEFS,verifySystemDungeonBossEvidence} from
 "../src/rpg_lab_v1/orario_system_encounters.ts";
import {applyOrarioPlayerAction} from "../src/rpg_lab_v1/orario_player_event.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";

function player(){
 const s=newJinwooPreparation();s.completedDailyDays=["0"];
 s.storyFlags.push("quest.reward.instant_key_from_box");
 return s;
}
test("Kasaka and Igris do not spawn as random Upper Dungeon mobs without a System key",()=>{
 const s=player();
 assert.ok(ORARIO_MONSTER_BY_ID["system.kasaka"]);
 assert.ok(ORARIO_MONSTER_BY_ID["system.igris"]);
 assert.equal(SYSTEM_ENCOUNTER_DEFS["system.igris"].instance,"job.change");
 assert.throws(()=>startConfirmedOrarioBattle(s,{
  sourceRef:"evt.fake.kasaka",monsterId:"system.kasaka",monsterRef:"enemy.kasaka.1",
  floor:1,playerCommitted:true,confirmedHostile:true
 }),/SYSTEM_INSTANCE_NOT_ENTERED/);
 assert.throws(()=>startConfirmedOrarioBattle(s,{
  sourceRef:"evt.fake.igris",monsterId:"system.igris",monsterRef:"enemy.igris.1",
  floor:1,playerCommitted:true,confirmedHostile:true
 }),/SYSTEM_INSTANCE_NOT_ENTERED/);
});
test("live dungeon clear refuses an unearned story boss, accepts a source-tagged victory",()=>{
 let s=player();
 s=issueSystemDungeonKey(s,{sourceRef:"evt.key.kasaka",
  confirmedReward:true,dungeonId:"instant.first"});
 s=enterSystemDungeon(s,{sourceRef:"evt.enter.kasaka",
  confirmedEntry:true,dungeonId:"instant.first",
  entranceLocationRef:"orario.guild.door"});
 const session=():LabSession=>({schema:"RPG_LAB_SESSION_V1",
  projectId:"danmachi_boss_test",sessionId:"boss_session",
  gameClock:"D0 10:00",player:{resources:{},stats:{},inventory:{},
   jinwoo:s,locationId:"orario.medical_ward"},discovered:[],npcs:{},events:[]});
 assert.equal(verifySystemDungeonBossEvidence(s,"instant.first"),false);
 assert.throws(()=>applyOrarioPlayerAction(session(),{
  kind:"dungeon_clear",playerApproved:true,
  args:{dungeonId:"instant.first",confirmedClear:true}
 },"evt.clear.cheat","D0 10:10"),/BOSS_NOT_DEFEATED/);
 const encounter=startConfirmedOrarioBattle(s,{
  sourceRef:"evt.start.kasaka",monsterId:"system.kasaka",
  monsterRef:"mob.kasaka.01",floor:1,
  playerCommitted:true,confirmedHostile:true
 });
 assert.equal(encounter.activeEncounter?.enemyHp,
  ORARIO_MONSTER_BY_ID["system.kasaka"].hp);
 // Artificially mark *confirmed test battle result* after encounter:
 // production can only obtain the proof through combat event resolution.
 const won=commitBalancedMonsterDefeat(s,{
  sourceRef:"evt.defeat.kasaka",monsterId:"system.kasaka",
  monsterRef:"mob.kasaka.01",floor:1,
  confirmedDefeat:true,killer:"player"
 });
 assert.equal(won.defeatEvidence?.["mob.kasaka.01"].monsterId,"system.kasaka");
 assert.equal(verifySystemDungeonBossEvidence(won,"instant.first"),true);
 s=won;
 const cleared=applyOrarioPlayerAction(session(),{
  kind:"dungeon_clear",playerApproved:true,
  args:{dungeonId:"instant.first",confirmedClear:true}
 },"evt.clear.earned","D0 10:20");
 assert.equal(cleared.dungeonKeys["instant.first"].state,"cleared");
 assert.ok(cleared.appliedRewardRefs.includes("evt.clear.earned"));
});
test("another monster's victory ref does not substitute for Igris class challenge",()=>{
 let s=player();s.systemLevel=40;
 s=issueSystemDungeonKey(s,{sourceRef:"evt.key.class",
  confirmedReward:true,dungeonId:"job.change"});
 s=enterSystemDungeon(s,{sourceRef:"evt.enter.class",
  confirmedEntry:true,dungeonId:"job.change",
  entranceLocationRef:"system.class.entrance"});
 s=commitBalancedMonsterDefeat(s,{
  sourceRef:"evt.knight.guard.dead",monsterId:"system.knight_guard",
  monsterRef:"mob.igris.fake",floor:1,confirmedDefeat:true,killer:"player"
 });
 assert.equal(verifySystemDungeonBossEvidence(s,"job.change"),false);
});
