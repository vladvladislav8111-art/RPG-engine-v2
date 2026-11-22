import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {ORARIO_MONSTER_BY_ID,previewBalancedMonsterReward,
 previewCombatExchange} from "../src/rpg_lab_v1/danmachi_player_balance.ts";
import {activateConfirmedPlayerSkill,getPlayerSkillBattleModifiers,
 recordConfirmedSkillPractice,skillMasteryLevel} from "../src/rpg_lab_v1/orario_player_skills.ts";
import {startConfirmedOrarioBattle,
 resolveConfirmedOrarioExchange} from "../src/rpg_lab_v1/orario_player_combat.ts";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {applyConfirmedLabEvent} from "../src/rpg_lab_v1/events.ts";
import {validateLabSession,type LabSession} from "../src/rpg_lab_v1/session.ts";
import {CHROMA_GM_WELCOME_CARD,CHROMA_GM_FIVE_POST_CHECK}
 from "../src/rpg_lab_v1/gm_guide.ts";

test("system monster levels distinguish danger from Falna level",()=>{
 const data=ORARIO_MONSTER_BY_ID;
 assert.deepEqual([data.goblin.systemThreatLevel,data.kobold.systemThreatLevel,
  data.dungeon_lizard.systemThreatLevel,data.war_shadow.systemThreatLevel,
  data.killer_ant.systemThreatLevel],[1,2,3,7,8]);
 assert.equal(data.war_shadow.approximateDanmachiLevel,1);
 assert.equal(data.war_shadow.baseXp,96);
 assert.equal(data.killer_ant.baseXp,116);
});

test("growing stronger does not tax base XP, but same kill cannot be paid twice",()=>{
 const s=newJinwooPreparation();
 const powerful=structuredClone(s);
 powerful.systemLevel=70;
 powerful.stats={strength:300,stamina:300,agility:300,perception:300,intelligence:300};
 const input={monsterId:"goblin",floor:1,monsterRef:"mob.test.reward.01"};
 const a=previewBalancedMonsterReward(s,input);
 const b=previewBalancedMonsterReward(powerful,input);
 assert.equal(a.xp,13);
 assert.equal(b.xp,13);
 assert.ok(b.systemGold>=0);
 assert.equal(previewBalancedMonsterReward(s,{
  monsterId:"war_shadow",floor:5,monsterRef:"mob.test.shadow.01"}).xp,96);
});

test("one effective skill practice per encounter and later activation uses higher level",()=>{
 const s=newJinwooPreparation();
 s.unlockedSkills.push("sprint");
 const activation=activateConfirmedPlayerSkill(s,{sourceRef:"evt.skill.activation.01",
  skillId:"sprint",startMinute:100,durationMinutes:1,playerConfirmed:true});
 assert.equal(skillMasteryLevel(activation,"sprint"),1);
 assert.equal(activation.skillMastery,undefined,"activation alone grants no mastery");
 let n=activation;
 for(let k=0;k<4;k++){
  const proof={skillId:"sprint" as const,enemyRef:"mob.skill."+k,
   sourceRef:"evt.skill.practice."+k,threatLevel:7,
   confirmedEffective:true as const};
  const old=n;
  n=recordConfirmedSkillPractice(n,proof);
  const repeat=recordConfirmedSkillPractice(n,{...proof,sourceRef:proof.sourceRef+".again"});
  assert.equal(repeat,n,"multiple attacks against the same enemy give no extra XP");
  assert.ok(n.skillMastery!.sprint.uses>=(old.skillMastery?.sprint.uses??0));
 }
 assert.equal(skillMasteryLevel(n,"sprint"),2);
 n.activeSkills=[];
 const stronger=activateConfirmedPlayerSkill(n,{sourceRef:"evt.skill.activation.02",
  skillId:"sprint",startMinute:200,durationMinutes:1,playerConfirmed:true});
 assert.equal(getPlayerSkillBattleModifiers(stronger,200).speedMultiplier,1.4);
 assert.equal(stronger.activeSkills![0].agilityBonus,4);
});

test("high-speed hit and run removes a reachable counter, paint requires evidence",()=>{
 const s=newJinwooPreparation();s.stats.agility=40;
 const b=startConfirmedOrarioBattle(s,{sourceRef:"evt.battle.started",
  monsterId:"goblin",monsterRef:"mob.tactic.01",floor:1,
  playerCommitted:true,confirmedHostile:true});
 assert.throws(()=>resolveConfirmedOrarioExchange(b,{sourceRef:"evt.tactic.paint.bad",
  move:"strike",loadout:{},playerCommitted:true,tacticalApproach:"paint_blind"}),
  /PLAYER_PAINT_NOT_CONFIRMED/);
 let found=false;
 for(let k=0;k<300;k++){
  const out=resolveConfirmedOrarioExchange(b,{
   sourceRef:"evt.tactic.run."+k,move:"strike",loadout:{},playerCommitted:true,
   tacticalApproach:"hit_and_run"});
  if(out.dealt>0&&out.outcome==="ongoing"){
   assert.equal(out.taken,0);found=true;break;
  }
 }
 assert.equal(found,true);
 const before=previewCombatExchange(s,{
  monsterId:"goblin",floor:1,move:"strike",weaponPower:0,armorPower:0});
 assert.ok(before.attackerResourceCost.fatigue<1,
  "END-scaled seconds-long exchange should not cost a fixed 3% fatigue");
});

test("five GM posts, not five mechanical subevents, trigger the reminder",()=>{
 const pack=buildFreshDanmachiLabPack("chroma_gm_post_cadence_test");
 let s:LabSession={schema:"RPG_LAB_SESSION_V1",
  projectId:pack.projectId,sessionId:"chroma_gm_test",gameClock:"D0 09:00",
  player:{resources:{},stats:{},inventory:{},locationId:"orario.gate"},
  discovered:["orario.gate"],npcs:{},events:[],worldEvents:[]};
 let rev=0;
 const step=(post:string)=>{
  rev++;
  s=applyConfirmedLabEvent(s,pack,{
   sourceRef:"evt.gm.counter."+rev,time:"D0 09:00",summary:"A short test post",
   kind:"player_turn",knownBy:[],gmPostRef:post,gmConfirmed:true});
 };
 step("gm.post.001");
 step("gm.post.001"); // two engine subevents, only one narrated post
 assert.equal(s.gmPostCadence!.count,1);
 for(let k=2;k<=5;k++)step("gm.post.00"+k);
 assert.equal(s.gmPostCadence!.count,5);
 assert.equal(s.gmPostCadence!.count%5,0);
 assert.ok(CHROMA_GM_WELCOME_CARD.narrativeFormat.length>=4);
 assert.equal(CHROMA_GM_FIVE_POST_CHECK.length,6);
 assert.throws(()=>step("gm.post.001"),/LAB_GM_POST_REF_REUSE_INVALID/);
 validateLabSession(s,pack);
});
