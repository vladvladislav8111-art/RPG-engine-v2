import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation,CHROMA_BALANCE_FLAG,
 effectiveJinwooMaxHp,effectiveJinwooMaxMp} from
 "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {validateOrarioPlayerState} from
 "../src/rpg_lab_v1/orario_player_validation.ts";
import {CHROMA_REPAIR_EVIDENCE,CHROMA_RECOVERED_KILLS,
 CHROMA_FULL_REPAIR_REF,reconcileChromaD3ThroughWolf02} from
 "../src/rpg_lab_v1/chroma_campaign_reconcile.ts";
import {previewBalancedMonsterReward} from
 "../src/rpg_lab_v1/danmachi_player_balance.ts";
import {activateConfirmedPlayerSkill,evolveConfirmedSprint,
 recordConfirmedCombatTechnique,getPlayerSkillBattleModifiers} from
 "../src/rpg_lab_v1/orario_player_skills.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";

const makeSession=()=>{
 const n=newJinwooPreparation();
 n.systemLevel=2;n.xp=150;
 n.stats={strength:15,stamina:15,agility:17,perception:11,intelligence:11};
 n.storyFlags.push(CHROMA_BALANCE_FLAG);
 n.falna={blessed:true,godId:"npc.loki",divineLevel:1,
  lastUpdatedRef:"chroma.loki.falna.first_blessing.032",
  status:{strength:0,endurance:0,dexterity:0,agility:0,magic:0},skills:[]};
 n.hp=1438;n.mp=108;n.fatigue=72;n.gold=171;n.valis=28830;
 n.inventory={potion_mp_small:2,daily_status_recovery_charge:1,
  chocolate_cake_whole:1,ointment_burn:1};
 n.unlockedSkills=["sprint"];
 for(let i=0;i<6;i++){
  const id="stone.previously.held."+i;
  const ref="chroma.d3.previously.defeated."+i;
  n.defeatedTargetRefs.push(ref);
  n.magicStones[id]={id,monsterRef:ref,monsterName:"Старый монстр",
   kind:"monster",powerRating:2,powerTier:"common",
   guildValueValis:30,corruptedMana:false,intact:true,
   state:"held",collectedRef:"chroma.d3.old.stone.collect."+i};
 }
 return {
  projectId:"chroma_orario_main_20261120",
  sessionId:"chroma_day0_20261120",
  player:{hero:{id:"hero.chroma",name:"Хрома"},jinwoo:n},
  events:CHROMA_REPAIR_EVIDENCE.map(sourceRef=>({
   sourceRef,time:"D3 17:12",summary:"Recorded campaign event",knownBy:[]}))
 } as unknown as LabSession;
};
const approval={sourceRef:CHROMA_FULL_REPAIR_REF,eventTime:"D3 17:12",
 playerApproved:true,confirmLedgerThrough510:true};

test("one CAS repair reconciles all 43 post-base kills and 47 physical stones",()=>{
 const s=makeSession();
 const old=structuredClone(s.player.jinwoo!);
 assert.equal(CHROMA_RECOVERED_KILLS.length,43);
 const r=reconcileChromaD3ThroughWolf02(s,approval);
 validateOrarioPlayerState(r);
 assert.equal(r.systemLevel,7);
 assert.equal(r.xp,1075);
 assert.equal(r.freeStatPoints,25);
 assert.deepEqual(r.stats,{strength:20,stamina:20,agility:22,
  perception:16,intelligence:16});
 assert.equal(r.hp,2396);
 assert.equal(r.mp,87);
 assert.equal(r.fatigue,32.3);
 assert.equal(r.hp,effectiveJinwooMaxHp(r));
 assert.equal(effectiveJinwooMaxMp(r),238);
 assert.equal(Object.values(r.magicStones).filter(x=>x.state==="held").length,47);
 assert.equal(Object.values(r.magicStones).filter(x=>
  x.collectedRef==="chroma.d3_f7_snack_retrieve_stones.494").length,3);
 assert.equal(r.dungeonKeys["instant.first"].state,"entered");
 assert.equal(r.inventory.system_instant_dungeon_key??0,0);
 assert.equal(r.skillMastery?.sprint?.level,5);
 assert.equal(r.skillMastery?.quicksilver?.xp,46);
 assert.ok(r.unlockedSkills.includes("dagger_mastery"));
 assert.equal(r.activeSkills?.[0]?.id,"quicksilver");
 assert.equal(getPlayerSkillBattleModifiers(r,5352).reactionMultiplier,1.2);
 assert.equal(old.systemLevel,2,"an unrelated reference cannot be modified");
 assert.equal(s.player.jinwoo?.xp,150,"existing session not mutated");
 s.player.jinwoo=r;
 assert.throws(()=>reconcileChromaD3ThroughWolf02(s,approval),
  /CHROMA_FULL_REPAIR_SOURCE_OR_BASE_INVALID/);
});

test("reconciliation requires source journal and explicit single-shot approval",()=>{
 const s=makeSession();
 assert.throws(()=>reconcileChromaD3ThroughWolf02(s,{
  ...approval,confirmLedgerThrough510:false}),/INVALID/);
 s.events=s.events.filter(x=>
  x.sourceRef!=="chroma.d3_instant_first_wolf02_finish.510");
 assert.throws(()=>reconcileChromaD3ThroughWolf02(s,approval),/INVALID/);
});

test("higher-level foes earn more XP; lower-level enemies do not pay less",()=>{
 const p=newJinwooPreparation();
 p.systemLevel=3;
 assert.equal(previewBalancedMonsterReward(p,{monsterId:"killer_ant",
  floor:7,monsterRef:"test.ant.1"}).xp,145);
 p.systemLevel=4;
 assert.equal(previewBalancedMonsterReward(p,{monsterId:"killer_ant",
  floor:7,monsterRef:"test.ant.2"}).xp,139);
 p.systemLevel=7;
 assert.equal(previewBalancedMonsterReward(p,{monsterId:"system.dungeon_wolf",
  floor:7,monsterRef:"test.wolf.1"}).xp,33);
});

test("evolved speed skill retains speed and adds reaction without stacking",()=>{
 const p=newJinwooPreparation();
 p.unlockedSkills.push("sprint");
 p.skillMastery={sprint:{level:5,xp:0,uses:19,
  trainedEnemyRefs:["enemy.01"],lastPracticeRef:"practice.01"}};
 const evolved=evolveConfirmedSprint(p,{
  sourceRef:"evolution.01",confirmedEvolution:true,playerApproved:true});
 const active=activateConfirmedPlayerSkill(evolved,{
  sourceRef:"active.quicksilver.01",skillId:"quicksilver",
  startMinute:500,durationMinutes:1,playerConfirmed:true});
 assert.equal(active.mp,evolved.mp-7);
 assert.equal(getPlayerSkillBattleModifiers(active,500).speedMultiplier,1.7);
 assert.equal(getPlayerSkillBattleModifiers(active,500).reactionMultiplier,1.2);
 assert.throws(()=>activateConfirmedPlayerSkill(active,{
  sourceRef:"active.sprint.invalid",skillId:"sprint",
  startMinute:500,durationMinutes:1,playerConfirmed:true}),
  /SPRINT_EVOLVED_TO_QUICKSILVER|PLAYER_SPEED_SKILLS_CANNOT_STACK/);
});

test("12 different, effective dagger encounters earn a passive skill once",()=>{
 let n=newJinwooPreparation();
 for(let i=0;i<12;i++)
  n=recordConfirmedCombatTechnique(n,{kind:"dagger",
   enemyRef:"verified.enemy."+i,sourceRef:"verified.hit."+i,
   confirmedEffective:true});
 assert.equal(n.combatTraining?.dagger.uses,12);
 assert.ok(n.unlockedSkills.includes("dagger_mastery"));
 const old=n;
 n=recordConfirmedCombatTechnique(n,{kind:"dagger",
  enemyRef:"verified.enemy.11",sourceRef:"verified.hit.repeat",
  confirmedEffective:true});
 assert.equal(n,old);
 assert.throws(()=>recordConfirmedCombatTechnique(old,{kind:"dagger",
  enemyRef:"verified.enemy.cheat",sourceRef:"verified.cheat",
  confirmedEffective:false as never}),/PLAYER_COMBAT_TECHNIQUE_EVIDENCE_INVALID/);
});
