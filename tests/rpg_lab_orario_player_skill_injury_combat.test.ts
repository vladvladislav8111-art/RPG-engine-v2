import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {activateConfirmedPlayerSkill,
 getPlayerSkillBattleModifiers} from "../src/rpg_lab_v1/orario_player_skills.ts";
import {startConfirmedOrarioBattle,
 resolveConfirmedOrarioExchange} from "../src/rpg_lab_v1/orario_player_combat.ts";

test("paid Quicksilver improves an actual timed exchange, expires, and does not rewrite base agility",()=>{
 let initial=newJinwooPreparation();
 initial.unlockedSkills.push("quicksilver");
 const base=startConfirmedOrarioBattle(initial,{sourceRef:"evt.start.war",
  monsterId:"war_shadow",monsterRef:"mob.war.001",floor:5,
  playerCommitted:true,confirmedHostile:true});
 const active=activateConfirmedPlayerSkill(base,{sourceRef:"evt.skill.quicksilver",
  skillId:"quicksilver",startMinute:600,durationMinutes:3,
  playerConfirmed:true});
 assert.equal(active.stats.agility,base.stats.agility);
 assert.equal(active.mp,base.mp-11);
 assert.equal(getPlayerSkillBattleModifiers(active,601).agilityBonus,7);
 assert.equal(getPlayerSkillBattleModifiers(active,601).reactionMultiplier,1.2);
 assert.equal(getPlayerSkillBattleModifiers(active,603).agilityBonus,0);
 let found=false;
 for(let i=0;i<500;i++){
  const e={sourceRef:"evt.exchange.probe."+i,
   playerCommitted:true as const,move:"strike" as const,
   loadout:{},currentMinute:601};
  const original=resolveConfirmedOrarioExchange(base,e);
  const buffed=resolveConfirmedOrarioExchange(active,e);
  if(original.dealt===0&&buffed.dealt>0){
   found=true;
   const expired=resolveConfirmedOrarioExchange(active,{...e,currentMinute:604});
   assert.equal(expired.dealt,original.dealt);
   break;
  }
 }
 assert.equal(found,true,"Timed speed buff must influence actual hit resolution");
 assert.equal(base.stats.agility,10);
});
test("an untreated torso injury increases enemy damage rather than protecting the player",()=>{
 const initial=newJinwooPreparation();
 const battle=startConfirmedOrarioBattle(initial,{
  sourceRef:"evt.start.goblin",monsterId:"goblin",monsterRef:"mob.goblin.01",
  floor:1,playerCommitted:true,confirmedHostile:true});
 const hurt=structuredClone(battle);
 hurt.injuries=[{id:"injury.old.1",location:"torso",kind:"fracture",
  severity:2,createdRef:"evt.injury.old",treated:false,active:true}];
 let checked=false;
 for(let i=0;i<300;i++){
  const e={sourceRef:"evt.guard.probe."+i,playerCommitted:true as const,
   move:"guard" as const,loadout:{}};
  const noInjury=resolveConfirmedOrarioExchange(battle,e);
  if(noInjury.taken>0){
   const withInjury=resolveConfirmedOrarioExchange(hurt,e);
   assert.equal(withInjury.taken,noInjury.taken+8);
   checked=true;break;
  }
 }
 assert.equal(checked,true);
});
