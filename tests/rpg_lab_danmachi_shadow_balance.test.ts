import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation,awardJinwooEncounter,
 changeJinwooPhase,grantJinwooStoryUnlock} from
 "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {previewArmyBalance,previewShadowCombatStrength,
 previewShadowOrder,recordShadowVerifiedVictory,
 recoverShadowWithBalancedMana,previewMonarchDomain,
 shadowRevivalMpCost,SHADOW_BALANCE_PRESET} from
 "../src/rpg_lab_v1/danmachi_shadow_balance.ts";
function army(){
 const b=newJinwooPreparation();b.systemLevel=40;
 b.storyFlags.push("quest.job_trial.complete");
 let s=changeJinwooPhase(b,{sourceRef:"evt.class.shadow",
  confirmed:true,to:"shadow_class",qualifyingStoryRef:"quest.job_trial.complete"});
 s=grantJinwooStoryUnlock(s,{sourceRef:"evt.skill.extraction",
  confirmed:true,type:"skill",id:"shadow_extraction"});
 s.shadowRoster.push({id:"mob.goblin.shadow.1",name:"Теневой гоблин",
  originRef:"evt.shadow.extracted",originalKind:"monster",
  powerTier:"common",defeatedCount:0,stored:true});
 return s;
}
test("shadow storage and standing army do not continuously consume MP",()=>{
 const s=army();
 const a=previewArmyBalance(s);
 assert.equal(a.phase,"shadow_class");
 assert.equal(a.roster,1);
 assert.equal(a.passiveStorageManaPerMinute,0);
 assert.equal(a.slotsRemaining,29);
 assert.equal(s.mp,140);
 assert.equal(SHADOW_BALANCE_PRESET.noPassiveSummonUpkeep,true);
});
test("shadow strength comes from a verified monster origin; unknown origin is not invented",()=>{
 const s=army();
 const known=previewShadowCombatStrength(s,{shadowId:"mob.goblin.shadow.1",
  verifiedMonsterTemplateId:"goblin"});
 const other=previewShadowCombatStrength(s,{shadowId:"mob.goblin.shadow.1"});
 assert.ok(known.physicalIfOriginVerified);
 assert.equal(other.physicalIfOriginVerified,null);
 assert.equal(known.manaPerMinuteWhenSimplySummoned,0);
 assert.throws(()=>previewShadowCombatStrength(s,{shadowId:"mob.goblin.shadow.1",
  verifiedMonsterTemplateId:"nonexistent"}),/ORIGIN_UNKNOWN/);
});
test("NPC shadows can receive orders but success is never silently committed",()=>{
 const s=army();const before=JSON.stringify(s);
 const scouting=previewShadowOrder(s,{
  shadowIds:["mob.goblin.shadow.1"],action:"scout",
  confirmedLocationRef:"orario.dungeon.floor_3"});
 assert.equal(scouting.noAutomaticSuccess,true);
 assert.equal(scouting.independentNPCReactionRequired,true);
 assert.equal(JSON.stringify(s),before);
 assert.throws(()=>previewShadowOrder(s,{
  shadowIds:["mob.goblin.shadow.1"],action:"scout"
 }),/LOCATION_REQUIRED/);
 assert.throws(()=>previewShadowOrder(s,{
  shadowIds:["mob.goblin.shadow.1","mob.goblin.shadow.1"],action:"guard"
 }),/ORDER_INVALID/);
});
test("a verified shadow kill progresses its rank once and never duplicates System XP",()=>{
 let s=army();
 for(let i=0;i<8;i++){
  const targetRef="enemy.confirmed."+i;
  s=awardJinwooEncounter(s,{sourceRef:"evt.mob.kill."+i,
   targetRef,confirmed:true,xp:3,systemGold:1,killer:"shadow",
   isNewDefeat:true,gmThreatRated:true});
  s=recordShadowVerifiedVictory(s,{
   sourceRef:"evt.shadow.victory."+i,
   shadowId:"mob.goblin.shadow.1",targetRef,
   contributedToConfirmedKill:true,confirmedChallengeWorthXp:true
  });
 }
 const sh=s.shadowRoster[0];
 assert.equal(sh.victories,8);
 assert.equal(sh.powerTier,"elite");
 assert.equal(s.xp,24);
 assert.equal(s.gold,8);
 assert.throws(()=>recordShadowVerifiedVictory(s,{
  sourceRef:"evt.victory.fake",shadowId:sh.id,
  targetRef:"enemy.confirmed.1",contributedToConfirmedKill:true,
  confirmedChallengeWorthXp:true}),/DUPLICATE_VICTORY/);
 assert.throws(()=>recordShadowVerifiedVictory(s,{
  sourceRef:"evt.victory.unseen",shadowId:sh.id,
  targetRef:"enemy.not.defeated",contributedToConfirmedKill:true,
  confirmedChallengeWorthXp:true}),/NOT_CONFIRMED/);
});
test("low-value enemies cannot count toward shadow promotion merely for existing",()=>{
 const s=army();
 const k=awardJinwooEncounter(s,{sourceRef:"evt.weak.kill",
  targetRef:"enemy.weak",confirmed:true,xp:0,systemGold:0,
  killer:"shadow",isNewDefeat:true,gmThreatRated:true});
 assert.throws(()=>recordShadowVerifiedVictory(k,{
  sourceRef:"evt.shadow.weak",shadowId:"mob.goblin.shadow.1",
  targetRef:"enemy.weak",contributedToConfirmedKill:true,
  confirmedChallengeWorthXp:false}),/NOT_CONFIRMED/);
});
test("ranked regeneration costs MP and cannot duplicate a defeated shadow",()=>{
 const s=army();
 const cost=shadowRevivalMpCost("common","shadow_class");
 const restored=recoverShadowWithBalancedMana(s,{
  sourceRef:"evt.revive.01",shadowId:"mob.goblin.shadow.1",
  confirmedBodyDestroyed:true});
 assert.equal(cost,8);
 assert.equal(restored.mp,s.mp-cost);
 assert.equal(restored.shadowRoster.length,1);
 assert.equal(restored.shadowRoster[0].defeatedCount,1);
 assert.throws(()=>recoverShadowWithBalancedMana(s,{
  sourceRef:"evt.revive.fake",shadowId:"mob.goblin.shadow.1",
  confirmedBodyDestroyed:false}),/UNAVAILABLE/);
 const drained={...s,mp:3};
 assert.throws(()=>recoverShadowWithBalancedMana(drained,{
  sourceRef:"evt.revive.dry",shadowId:"mob.goblin.shadow.1",
  confirmedBodyDestroyed:true}),/UNAVAILABLE/);
});
test("Monarch Domain is an unlocked active skill with proportional MP, not passive free 50%",()=>{
 let s=army();
 assert.throws(()=>previewMonarchDomain(s,{
  confirmedActive:true,durationMinutes:5}),/DOMAIN_LOCKED/);
 s=grantJinwooStoryUnlock(s,{sourceRef:"evt.domain.unlocked",
  confirmed:true,type:"skill",id:"monarch_domain"});
 const preview=previewMonarchDomain(s,{
  confirmedActive:true,durationMinutes:5});
 assert.equal(preview.damageScale,1.5);
 assert.ok(preview.mpCost>0);
 assert.equal(preview.possible,true);
 assert.equal(preview.notAppliedUnlessCommitted,true);
 assert.equal(s.mp,140);
 assert.throws(()=>previewMonarchDomain(s,{
  confirmedActive:false,durationMinutes:5}),/DOMAIN_LOCKED/);
});
test("full Monarch reduces regeneration cost, not free infinite healing",()=>{
 assert.equal(shadowRevivalMpCost("marshal","shadow_class"),300);
 assert.equal(shadowRevivalMpCost("marshal","true_monarch"),105);
});
