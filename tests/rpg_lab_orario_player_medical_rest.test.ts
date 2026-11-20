import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {completeConfirmedRest,receiveConfirmedMedicalCare,
 consumeConfirmedSystemItem} from "../src/rpg_lab_v1/orario_player_survival.ts";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {applyGuardedLabEvent} from "../src/rpg_lab_v1/turn_guard.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";

test("rest regenerates gradually, not instantly curing a fracture or generating free MP",()=>{
 const s=newJinwooPreparation();
 s.hp=45;s.mp=20;s.fatigue=80;
 s.injuries=[
  {id:"injury.1",location:"torso",kind:"bruise",severity:1,
   createdRef:"evt.old.1",active:true,treated:true},
  {id:"injury.2",location:"left_leg",kind:"fracture",severity:3,
   createdRef:"evt.old.2",active:true,treated:true}
 ];
 const after=completeConfirmedRest(s,{sourceRef:"evt.rest.8h",
  minutes:480,safeRestLocation:true,playerConfirmed:true});
 assert.ok(after.hp>s.hp&&after.hp<300);
 assert.ok(after.mp>s.mp&&after.mp<=140);
 assert.ok(after.fatigue<s.fatigue);
 assert.equal(after.injuries![0].active,false);
 assert.equal(after.injuries![1].active,true);
 assert.equal(s.injuries[0].active,true);
 assert.throws(()=>completeConfirmedRest(after,{sourceRef:"evt.rest.8h",
  minutes:480,safeRestLocation:true,playerConfirmed:true}),/SOURCE_DUPLICATE/);
});
test("an unconscious Player cannot self-administer potions and needs witnessed medical rescue",()=>{
 const pack=buildFreshDanmachiLabPack("orario_medic_test");
 const p=newJinwooPreparation();p.hp=0;p.valis=700;
 p.inventory.potion_hp_small=1;
 p.activeEncounter={enemyRef:"enemy.goblin.01",monsterId:"goblin",
  floor:1,enemyHp:40,round:3,startedRef:"evt.battle.0"};
 const s:LabSession={
  schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,
  sessionId:"medical_example",gameClock:"D0 09:00",
  roleplayGuard:"strict",player:{resources:{},stats:{},
   inventory:{},jinwoo:p,locationId:"orario.dungeon.upper"},
  discovered:["orario.dungeon.upper","orario.medical_ward"],
  npcs:{},events:[]
 };
 assert.throws(()=>consumeConfirmedSystemItem(p,{sourceRef:"evt.self.potion",
  itemId:"potion_hp_small",confirmedUse:true}),/UNCONSCIOUS/);
 const confirmed={
  sourceRef:"evt.medical.rescue",kind:"medical_care",
  time:"D0 10:00",summary:"Миах принимает раненого авантюриста в лазарете",
  knownBy:["npc.miach"],gmConfirmed:true as const,
  playerLocationId:"orario.medical_ward",
  observations:[{npcId:"npc.miach",channel:"experienced" as const,
   perceivedFact:"Лично оказал первую помощь тяжело раненому незнакомцу",
   learnedAt:"D0 10:00",confidence:"certain" as const,
   salience:"ordinary" as const,privacy:"private" as const}],
  playerSystem:{kind:"medical_care",playerApproved:false,
   args:{healerNpcId:"npc.miach",confirmedHealer:true,
    atOrarioWard:true,confirmedRescue:true,costValis:0}}
 };
 assert.throws(()=>applyGuardedLabEvent(s,pack,{
  ...confirmed,observations:[]
 },1),/HEALER_NOT_CONFIRMED/);
 const next=applyGuardedLabEvent(s,pack,confirmed,1).next;
 assert.equal(next.player.jinwoo!.activeEncounter,undefined);
 assert.ok(next.player.jinwoo!.hp>=1);
 assert.equal(next.player.jinwoo!.valis,700);
 assert.equal(next.player.locationId,"orario.medical_ward");
 assert.ok(next.npcs["npc.miach"].memories.some(x=>
  x.sourceRef==="evt.medical.rescue"));
 assert.equal(s.player.jinwoo!.hp,0);
});
test("verified care treats wounds but severe injuries need extended recovery",()=>{
 const s=newJinwooPreparation();s.hp=3;s.valis=500;
 s.injuries=[{id:"wound.a",location:"left_leg",kind:"fracture",
  severity:3,active:true,treated:false,createdRef:"evt.old"}];
 const short=receiveConfirmedMedicalCare(s,{sourceRef:"evt.care.30",
  minutes:60,confirmedHealer:true,atOrarioWard:true,costValis:200});
 assert.equal(short.injuries![0].treated,true);
 assert.equal(short.injuries![0].active,true);
 assert.equal(short.valis,300);
 const long=receiveConfirmedMedicalCare(short,{sourceRef:"evt.care.days",
  minutes:7200,confirmedHealer:true,atOrarioWard:true,costValis:250});
 assert.equal(long.injuries![0].active,false);
});
