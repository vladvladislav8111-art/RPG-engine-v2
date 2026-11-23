import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {previewDaggerTechnique,recordConfirmedCombatTechnique,
 activateConfirmedPlayerSkill} from "../src/rpg_lab_v1/orario_player_skills.ts";
import {startConfirmedOrarioBattle,resolveConfirmedOrarioExchange} from
 "../src/rpg_lab_v1/orario_player_combat.ts";

test("43 documented dagger fights mean Lv2: damage and attack speed, no made-up stat",()=>{
 const s=newJinwooPreparation();
 s.unlockedSkills.push("dagger_mastery");
 s.combatTraining={dagger:{uses:43,enemyRefs:[],lastPracticeRef:"proof.43"}};
 const t=previewDaggerTechnique(s);
 assert.equal(t.unlocked,true);
 assert.equal(t.level,2);
 assert.equal(t.damageBonusPercent,12);
 assert.equal(t.attackSpeedBonusPercent,8);
 assert.equal(t.nextMilestone,64);
 assert.equal(t.evolved,false);
 assert.equal(t.consumesMana,false);
 assert.deepEqual(Object.keys(s.stats),["strength","stamina","agility","perception","intelligence"]);
});

test("dagger passive actually raises strike damage, not merely accuracy",()=>{
 const bare=newJinwooPreparation();
 bare.stats={strength:35,stamina:28,agility:42,perception:31,intelligence:10};
 bare.storyFlags.push("chroma.dual_daggers.verified");
 const trained=structuredClone(bare);
 trained.unlockedSkills.push("dagger_mastery");
 trained.combatTraining={dagger:{uses:43,enemyRefs:[],lastPracticeRef:"proof.43"}};
 const e={sourceRef:"battle.dagger.start",monsterId:"killer_ant",
  monsterRef:"mob.dagger.test.01",floor:7,
  playerCommitted:true as const,confirmedHostile:true as const};
 const a=startConfirmedOrarioBattle(bare,e);
 const b=startConfirmedOrarioBattle(trained,e);
 let proven=false;
 for(let i=0;i<150;i++){
  const attack={sourceRef:"battle.dagger.strike."+i,
   playerCommitted:true as const,move:"strike" as const,loadout:{}};
  const base=resolveConfirmedOrarioExchange(a,attack);
  const boosted=resolveConfirmedOrarioExchange(b,attack);
  if(base.dealt>=5&&boosted.dealt>base.dealt){
   assert.equal(base.daggerComboBonusDamage??0,0);
   assert.equal(boosted.daggerComboBonusDamage??0,0);
   proven=true;break;
  }
 }
 assert.equal(proven,true);
 assert.equal(trained.stats.strength,35,"passive skill does not mutate base STR");
});

test("attack tempo enables an extra cut only for a player-confirmed combo",()=>{
 const s=newJinwooPreparation();
 s.storyFlags.push("chroma.dual_daggers.verified");
 s.stats={strength:25,stamina:25,agility:45,perception:32,intelligence:10};
 s.unlockedSkills.push("dagger_mastery");
 s.combatTraining={dagger:{uses:43,enemyRefs:[],lastPracticeRef:"proof.43"}};
 const b=startConfirmedOrarioBattle(s,{sourceRef:"battle.combo.start",
  monsterId:"killer_ant",monsterRef:"mob.combo.test.01",floor:7,
  playerCommitted:true,confirmedHostile:true});
 let extra=false;
 for(let i=0;i<400;i++){
  const sourceRef="battle.combo.exchange."+i;
  const combo=resolveConfirmedOrarioExchange(b,{
   sourceRef,move:"strike",loadout:{},
   confirmedComboAttack:true,playerCommitted:true});
  const simple=resolveConfirmedOrarioExchange(b,{
   sourceRef,move:"strike",loadout:{},playerCommitted:true});
  assert.equal(simple.daggerComboBonusDamage??0,0);
  if(combo.daggerComboBonusDamage){
   assert.ok(combo.dealt>simple.dealt);
   extra=true;break;
  }
 }
 assert.equal(extra,true,"a timed speed follow-up eventually occurs on an explicit combo");
});

test("canonical skills unlock by matching verified practice, not generic kills",()=>{
 let n=newJinwooPreparation();
 for(let i=0;i<15;i++)n=recordConfirmedCombatTechnique(n,{
  kind:"weakpoint",enemyRef:"proof.weak.enemy."+i,
  sourceRef:"proof.weak.hit."+i,confirmedEffective:true});
 assert.ok(n.unlockedSkills.includes("critical_attack"));
 assert.equal(n.unlockedSkills.includes("mutilation"),false);
 for(let i=0;i<8;i++)n=recordConfirmedCombatTechnique(n,{
  kind:"throw",enemyRef:"proof.throw.enemy."+i,
  sourceRef:"proof.throw.hit."+i,confirmedEffective:true});
 assert.ok(n.unlockedSkills.includes("dagger_throw"));
 assert.equal(n.unlockedSkills.includes("dagger_rush"),false);
 const old=n;
 n=recordConfirmedCombatTechnique(n,{
  kind:"throw",enemyRef:"proof.throw.enemy.7",
  sourceRef:"proof.throw.repeat",confirmedEffective:true});
 assert.equal(n,old);
 const activated=activateConfirmedPlayerSkill(n,{
  sourceRef:"skill.critical.cast",skillId:"critical_attack",
  startMinute:10,durationMinutes:1,playerConfirmed:true});
 assert.equal(activated.mp,n.mp-12);
});

test("Master of Shortsword is earned through long proficiency, not granted at Lv2",()=>{
 const s=newJinwooPreparation();
 s.unlockedSkills.push("dagger_mastery","master_of_shortsword");
 s.combatTraining={dagger:{uses:180,enemyRefs:[],lastPracticeRef:"proof.180"}};
 const preview=previewDaggerTechnique(s);
 assert.equal(preview.evolved,true);
 assert.equal(preview.damageBonusPercent,33);
 assert.equal(preview.attackSpeedBonusPercent,20);
 assert.equal(preview.nextMilestone,null);
 const n=structuredClone(s);
 n.unlockedSkills=n.unlockedSkills.filter(x=>x!=="master_of_shortsword");
 assert.equal(previewDaggerTechnique(n).evolved,false);
});
