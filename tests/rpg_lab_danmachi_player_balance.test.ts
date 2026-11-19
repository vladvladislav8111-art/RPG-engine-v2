import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation,grantJinwooFalna,updateJinwooFalna,
 grantJinwooStoryUnlock,awardJinwooEncounter,allocateJinwooPoints} from
 "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {ORARIO_MONSTER_BALANCE,ORARIO_MONSTER_BY_ID,
 comparePlayerToOrarioMonster,estimateFalnaAdventurerBenchmark,
 previewBalancedMonsterReward,commitBalancedMonsterDefeat,
 previewCombatExchange,CROSSOVER_BALANCE_NOTES} from
 "../src/rpg_lab_v1/danmachi_player_balance.ts";
test("floor references and template threat are verified before GM may use their numbers",()=>{
 assert.equal(ORARIO_MONSTER_BALANCE.length,9);
 assert.equal(new Set(ORARIO_MONSTER_BALANCE.map(m=>m.id)).size,9);
 assert.deepEqual([ORARIO_MONSTER_BY_ID.goblin.floorMin,
   ORARIO_MONSTER_BY_ID.goblin.floorMax],[1,4]);
 assert.equal(ORARIO_MONSTER_BY_ID.minotaur.approximateDanmachiLevel,2);
 assert.equal(ORARIO_MONSTER_BY_ID.goliath_17.approximateDanmachiLevel,4);
 assert.equal(ORARIO_MONSTER_BY_ID.goliath_17.floorMin,17);
 assert.ok(CROSSOVER_BALANCE_NOTES.some(x=>x.includes("not numerically identical")));
 const s=newJinwooPreparation();
 assert.throws(()=>comparePlayerToOrarioMonster(s,{
  monsterId:"minotaur",floor:5}),/OUTSIDE_KNOWN_FLOOR/);
 assert.equal(comparePlayerToOrarioMonster(s,{
  monsterId:"minotaur",floor:5,
  confirmedIrregularRef:"evt.bell.unusual_minotaur"}).monsterId,"minotaur");
 assert.throws(()=>comparePlayerToOrarioMonster(s,{
  monsterId:"goliath_17",floor:18}),/OUTSIDE_KNOWN_FLOOR/);
});
test("first-time Player can confront goblins; Minotaur and Goliath remain overwhelming",()=>{
 const s=newJinwooPreparation();
 const goblin=comparePlayerToOrarioMonster(s,{monsterId:"goblin",floor:1});
 const minotaur=comparePlayerToOrarioMonster(s,{monsterId:"minotaur",floor:15});
 const goliath=comparePlayerToOrarioMonster(s,{monsterId:"goliath_17",floor:17});
 assert.ok(["contested","advantaged"].includes(goblin.outlook),goblin.outlook);
 assert.equal(minotaur.outlook,"overwhelming");
 assert.equal(goliath.outlook,"overwhelming");
 assert.ok(goblin.estimatedEngagementRatio>minotaur.estimatedEngagementRatio);
 assert.ok(minotaur.estimatedEngagementRatio>goliath.estimatedEngagementRatio);
 assert.equal(goliath.noVictoryGuaranteed,true);
});
test("groups, exhaustion and terrain alter threat without giving free victories",()=>{
 const s=newJinwooPreparation();
 const one=comparePlayerToOrarioMonster(s,{monsterId:"goblin",floor:1});
 const three=comparePlayerToOrarioMonster(s,{monsterId:"goblin",floor:1,
  monsterCount:3});
 assert.ok(three.estimatedEngagementRatio<one.estimatedEngagementRatio);
 const healthy=previewCombatExchange(s,{monsterId:"goblin",floor:1,
  move:"strike",weaponPower:2,armorPower:1});
 const tired=previewCombatExchange({...s,fatigue:80},{
  monsterId:"goblin",floor:1,move:"strike",weaponPower:2,armorPower:1});
 assert.ok(tired.hitChancePercent<healthy.hitChancePercent);
 const ambush=previewCombatExchange(s,{monsterId:"goblin",floor:1,
  move:"strike",weaponPower:2,armorPower:1,positionBonus:15});
 assert.ok(ambush.hitChancePercent>healthy.hitChancePercent);
 assert.equal(healthy.noCommittedAttack,true);
 assert.equal(s.hp,300);
});
test("a one-time blessing adds real System power, not a copied System level",()=>{
 let s=newJinwooPreparation();
 const before=comparePlayerToOrarioMonster(s,{monsterId:"kobold",floor:2});
 s=grantJinwooFalna(s,{sourceRef:"evt.falna.given",godId:"npc.hestia",
  godConfirmed:true});
 s=updateJinwooFalna(s,{sourceRef:"evt.falna.growth",
  godId:"npc.hestia",godConfirmed:true,
  newStatus:{strength:300,endurance:300,dexterity:200,agility:250,magic:100}});
 const after=comparePlayerToOrarioMonster(s,{monsterId:"kobold",floor:2});
 assert.ok(after.estimatedEngagementRatio>before.estimatedEngagementRatio);
 assert.equal(s.systemLevel,1);
 assert.equal(s.stats.strength,10);
 assert.equal(after.player.strength,16);
});
test("Falna levels are a qualitative benchmark; no official fixed conversion is claimed",()=>{
 const rank0={strength:0,endurance:0,dexterity:0,agility:0,magic:0};
 const rank900={strength:900,endurance:900,dexterity:900,agility:900,magic:900};
 const a=estimateFalnaAdventurerBenchmark({divineLevel:1,currentStatus:rank0});
 const b=estimateFalnaAdventurerBenchmark({divineLevel:1,currentStatus:rank900});
 const c=estimateFalnaAdventurerBenchmark({divineLevel:2,currentStatus:rank0,
  legacyPerAbility:rank900});
 assert.ok(b.combat.strength>a.combat.strength);
 assert.ok(c.combat.strength>b.combat.strength);
 assert.equal(c.hiddenExceliaCarryIncluded,true);
 assert.equal(a.noAutomaticWin,true);
 assert.equal(a.model,"illustrative_not_official_stat_conversion");
 assert.throws(()=>estimateFalnaAdventurerBenchmark({
  divineLevel:1,currentStatus:{...rank0,strength:-5}}),/STATUS_INVALID/);
});
test("magic is not free simply because the System player invests in Intelligence",()=>{
 const s=newJinwooPreparation();s.stats.intelligence=100;s.mp=1000;
 assert.throws(()=>previewCombatExchange(s,{
  monsterId:"war_shadow",floor:5,move:"magic",
  weaponPower:0,armorPower:0,spellMpCost:20}),/MAGIC_NOT_AVAILABLE/);
 const withSkill=grantJinwooStoryUnlock(s,{sourceRef:"evt.skill.rulers",
  confirmed:true,type:"skill",id:"rulers_authority"});
 const spell=previewCombatExchange(withSkill,{monsterId:"war_shadow",floor:5,
  move:"magic",weaponPower:0,armorPower:0,spellMpCost:20});
 assert.equal(spell.attackerResourceCost.mp,20);
 assert.ok(spell.damageIfHit>0);
});
test("adventure weapon and defensive choices matter but neither auto-wins",()=>{
 const s=newJinwooPreparation();
 const bare=previewCombatExchange(s,{monsterId:"kobold",floor:2,
  move:"strike",weaponPower:0,armorPower:0});
 const sword=previewCombatExchange(s,{monsterId:"kobold",floor:2,
  move:"strike",weaponPower:9,armorPower:0});
 const guarded=previewCombatExchange(s,{monsterId:"kobold",floor:2,
  move:"guard",weaponPower:0,armorPower:10});
 assert.ok(sword.damageIfHit>bare.damageIfHit);
 assert.equal(guarded.damageIfHit,0);
 assert.ok(guarded.counterDamageIfHit<bare.counterDamageIfHit);
 assert.equal(guarded.noCommittedAttack,true);
 assert.throws(()=>previewCombatExchange(s,{monsterId:"kobold",floor:2,
  move:"strike",weaponPower:100000,armorPower:0}),/BATTLE_INPUT_INVALID/);
});
test("monster XP scales with danger and does not inflate from trivial farming",()=>{
 const s=newJinwooPreparation();
 const goblin=previewBalancedMonsterReward(s,{monsterId:"goblin",floor:1,
  monsterRef:"mob.goblin.01"});
 const killer=previewBalancedMonsterReward(s,{monsterId:"killer_ant",floor:7,
  monsterRef:"mob.ant.01"});
 assert.ok(killer.xp>goblin.xp);
 assert.ok(goblin.xp>0);
 assert.ok(goblin.systemGold>0);
 const veteran=newJinwooPreparation();
 veteran.systemLevel=70;veteran.stats={strength:300,stamina:300,
  agility:300,perception:300,intelligence:300};
 const weak=previewBalancedMonsterReward(veteran,{monsterId:"goblin",
  floor:1,monsterRef:"mob.goblin.02"});
 assert.equal(weak.xp,0);
 const party=previewBalancedMonsterReward(s,{monsterId:"goblin",floor:1,
  monsterRef:"mob.goblin.03",partySize:4,contributionPercent:50});
 assert.ok(party.xp<goblin.xp);
 assert.equal(goblin.lootIsSeparateFromXP,true);
 assert.equal(goblin.notAutoAwarded,true);
});
test("balanced XP is actually committed only after confirmed encounter and only once",()=>{
 const s=newJinwooPreparation();
 const input={sourceRef:"evt.goblin.kill",monsterId:"goblin",
  floor:1,monsterRef:"monster.goblin.kill",confirmedDefeat:true as const,
  killer:"player" as const};
 const preview=previewBalancedMonsterReward(s,input);
 assert.equal(s.xp,0);assert.equal(s.gold,0);
 assert.throws(()=>commitBalancedMonsterDefeat(s,{...input,
  confirmedDefeat:false}),/UNCONFIRMED_DEFEAT/);
 const n=commitBalancedMonsterDefeat(s,input);
 assert.equal(n.xp,preview.xp);
 assert.equal(n.gold,preview.systemGold);
 assert.equal(Object.keys(n.magicStones).length,0);
 assert.throws(()=>commitBalancedMonsterDefeat(n,{
  ...input,sourceRef:"evt.goblin.forged"}),/UNCONFIRMED_XP_OR_KILL/);
});
test("shadow victories need an owned soldier and cannot duplicate Player XP",()=>{
 const s=newJinwooPreparation();
 assert.throws(()=>commitBalancedMonsterDefeat(s,{
  sourceRef:"evt.phantom.kill",monsterId:"kobold",floor:2,
  monsterRef:"monster.kobold.phantom",confirmedDefeat:true,killer:"shadow"
 }),/SHADOW_KILL_NOT_OWNED/);
 s.phase="shadow_class";
 s.shadowRoster.push({id:"shadow.kobold.ally",name:"Союзная тень",
  originRef:"evt.shadow.origin",originalKind:"monster",powerTier:"common",
  defeatedCount:0,stored:false});
 const n=commitBalancedMonsterDefeat(s,{sourceRef:"evt.shadow.kill",
  monsterId:"kobold",floor:2,monsterRef:"monster.kobold.1",
  confirmedDefeat:true,killer:"shadow",shadowId:"shadow.kobold.ally"});
 assert.ok(n.xp>0);
 assert.throws(()=>commitBalancedMonsterDefeat(n,{sourceRef:"evt.player.steal.same",
  monsterId:"kobold",floor:2,monsterRef:"monster.kobold.1",
  confirmedDefeat:true,killer:"player"}),/UNCONFIRMED_XP_OR_KILL/);
});
test("house rule sanity: System level rises gradually but does not hard-equal DanMachi level",()=>{
 const s=newJinwooPreparation();
 let current=s;let slain=0;
 while(current.systemLevel===1&&slain<30){
  slain++;current=commitBalancedMonsterDefeat(current,{
   sourceRef:"evt.goblin."+slain,monsterId:"goblin",floor:1,
   monsterRef:"monster.goblin."+slain,
   confirmedDefeat:true,killer:"player"});
 }
 assert.ok(slain>=5&&slain<=15,`kills before level 2: ${slain}`);
 assert.equal(current.systemLevel,2);
 const after=comparePlayerToOrarioMonster(current,{monsterId:"minotaur",
  floor:15});
 assert.equal(after.outlook,"overwhelming");
});
