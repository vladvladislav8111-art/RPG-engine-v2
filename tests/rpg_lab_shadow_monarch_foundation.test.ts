import test from "node:test";
import assert from "node:assert/strict";
import {JINWOO_CAMPAIGN_PRESET,JINWOO_CANON_VS_ADAPTATION,
 JINWOO_STORE,awardJinwooEncounter,allocateJinwooPoints,
 attemptJinwooShadowExtraction,changeJinwooPhase,completeJinwooDaily,
 grantJinwooStoryUnlock,grantJinwooFalna,updateJinwooFalna,newJinwooPreparation,
 newOrarioPlayerAwakening,activateOrarioPlayerSystem,projectJinwooFalna,
 purchaseJinwooItem,resurrectJinwooShadow,shadowCapacity,
 shopAvailable,visibleJinwooStore,xpToNextLevel
} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";

const granted=(amount:number)=>{
 const s=newJinwooPreparation();
 return {...s,gold:amount};
};
const classed=()=>{
 const s=newJinwooPreparation();
 s.systemLevel=40;
 s.storyFlags.push("quest.job_trial.complete");
 let n=changeJinwooPhase(s,{sourceRef:"evt.job.complete",confirmed:true,
   to:"shadow_class",qualifyingStoryRef:"quest.job_trial.complete"});
 n=grantJinwooStoryUnlock(n,{sourceRef:"evt.shadow.extraction.unlock",
   confirmed:true,type:"skill",id:"shadow_extraction"});
 return n;
};

test("Solo Leveling attributes and DanMachi Falna remain different, no premature gifts",()=>{
 const s=newJinwooPreparation();
 assert.equal(JINWOO_CAMPAIGN_PRESET.startingAppearance,null);
 assert.equal(s.phase,"player_system");
 assert.equal(s.falna.blessed,false);
 assert.equal(projectJinwooFalna(s).display,null);
 assert.equal(s.shadowRoster.length,0);
 assert.equal(s.inventory.knight_killer,undefined);
 assert.equal(s.gold,0);
 assert.equal(xpToNextLevel(1),100);
 assert.ok(JINWOO_CANON_VS_ADAPTATION.adaptation.some(x=>x.includes("prices")));
});
test("confirmed monster kill grants System XP once, including shadow kills; no Falna doubling",()=>{
 const old=newJinwooPreparation();
 const e={sourceRef:"kill.goblin.1",targetRef:"enemy.goblin.1",confirmed:true,
  xp:100,systemGold:160,killer:"player" as const,
  isNewDefeat:true,gmThreatRated:true};
 const s=awardJinwooEncounter(old,e);
 assert.equal(s.systemLevel,2);assert.equal(s.freeStatPoints,5);
 assert.equal(s.stats.strength,11);assert.equal(s.stats.intelligence,11);
 assert.equal(s.gold,160);assert.equal(s.xp,0);
 assert.equal(s.falna.divineLevel,0);
 assert.throws(()=>awardJinwooEncounter(s,e),/DUPLICATE/);
 assert.throws(()=>awardJinwooEncounter(s,{...e,sourceRef:"kill.goblin.rewritten"}),/UNCONFIRMED/,
  "Changing the sourceRef cannot re-award XP from a defeated target");
 assert.throws(()=>awardJinwooEncounter(old,{...e,confirmed:false}),/UNCONFIRMED/);
 assert.throws(()=>awardJinwooEncounter(old,{...e,isNewDefeat:false}),/UNCONFIRMED/);
 assert.throws(()=>awardJinwooEncounter(old,{...e,killer:"shadow",
  sourceRef:"kill.goblin.no_shadow",targetRef:"enemy.goblin.no_shadow"}),
  /SHADOW_KILL_NOT_OWNED/);
 const shadowOwner=classed();
 shadowOwner.shadowRoster.push({id:"shadow.ally.1",name:"Тень союзника",
  originRef:"evt.shadow.ally",originalKind:"monster",powerTier:"common",
  defeatedCount:0,stored:false});
 const shadow=awardJinwooEncounter(shadowOwner,{...e,killer:"shadow",
  shadowId:"shadow.ally.1",sourceRef:"kill.goblin.2",
  targetRef:"enemy.goblin.2"});
 assert.equal(shadow.systemLevel,shadowOwner.systemLevel);
 assert.equal(shadow.xp,100);
});
test("daily quest gives 3 points once a day; spend only earned points",()=>{
 const s=completeJinwooDaily(newJinwooPreparation(),{
  day:0,sourceRef:"daily.day0.done",proofConfirmed:true});
 assert.equal(s.freeStatPoints,3);
 assert.throws(()=>completeJinwooDaily(s,{
  day:0,sourceRef:"daily.day0.duplicate",proofConfirmed:true}),/DUPLICATE/);
 const n=allocateJinwooPoints(s,{strength:2,perception:1});
 assert.equal(n.stats.strength,12);
 assert.equal(n.stats.perception,11);
 assert.equal(n.freeStatPoints,0);
 assert.throws(()=>allocateJinwooPoints(n,{agility:1}),/INSUFFICIENT/);
 assert.throws(()=>completeJinwooDaily(s,{day:1,sourceRef:"daily.day1.fake",
  proofConfirmed:false}),/NOT_CONFIRMED/);
});
test("Store has explicit fixed catalog, gated rare items and separate gold",()=>{
 const s=granted(250);
 assert.ok(visibleJinwooStore(s).some(x=>x.id==="potion_hp_small"));
 assert.equal(visibleJinwooStore(s).some(x=>x.id==="knight_killer"),false);
 const n=purchaseJinwooItem(s,{sourceRef:"buy.hp.1",itemId:"potion_hp_small",quantity:2});
 assert.equal(n.gold,50);assert.equal(n.inventory.potion_hp_small,2);
 assert.equal(s.gold,250);
 assert.throws(()=>purchaseJinwooItem(n,{sourceRef:"buy.hp.1",itemId:"potion_hp_small",
  quantity:1}),/DUPLICATE/);
 assert.throws(()=>purchaseJinwooItem(s,{sourceRef:"buy.knight.1",itemId:"knight_killer",
  quantity:1}),/LOCKED/);
 const k=granted(20000);k.systemLevel=30;
 const bought=purchaseJinwooItem(k,{sourceRef:"buy.knight.2",itemId:"knight_killer",quantity:1});
 assert.equal(bought.gold,13500);
 assert.throws(()=>purchaseJinwooItem(bought,{
  sourceRef:"buy.knight.3",itemId:"knight_killer",quantity:1}),/UNIQUE/);
 assert.ok(JINWOO_STORE.every(x=>Number.isSafeInteger(x.goldPrice)&&x.goldPrice>=0));
});
test("Job quest cannot be skipped and shadow class is unlocked only with a real story flag",()=>{
 const s=newJinwooPreparation();
 assert.throws(()=>changeJinwooPhase(s,{sourceRef:"evt.cheat",confirmed:true,
  to:"shadow_class",qualifyingStoryRef:"job.complete"}),/MISSING/);
 const n=classed();
 assert.equal(n.phase,"shadow_class");
 assert.equal(shadowCapacity(n),30);
 assert.ok(n.unlockedSkills.includes("shadow_extraction"));
 assert.equal(shopAvailable(n),true);
});
test("True Monarch removes the original menus, unless AU interface is explicitly requested",()=>{
 const n=classed();n.storyFlags.push("quest.ashborn.complete");
 const a=changeJinwooPhase(n,{sourceRef:"evt.succession.complete",confirmed:true,
  to:"true_monarch",qualifyingStoryRef:"quest.ashborn.complete"});
 assert.equal(a.phase,"true_monarch");
 assert.equal(shopAvailable(a),false);
 assert.deepEqual(visibleJinwooStore(a),[]);
 assert.throws(()=>awardJinwooEncounter(a,{
  sourceRef:"evt.kill.after_succession",targetRef:"enemy.1",confirmed:true,
  xp:100,systemGold:100,killer:"player",isNewDefeat:true,gmThreatRated:true
 }),/CANON_SYSTEM_REMOVED/);
 const au={...a,postAscensionInterface:"crossover_persists" as const};
 assert.equal(shopAvailable(au),true);
 const progressed=awardJinwooEncounter(au,{
  sourceRef:"evt.kill.after_au",targetRef:"enemy.2",confirmed:true,
  xp:200,systemGold:100,killer:"player",isNewDefeat:true,gmThreatRated:true});
 assert.equal(progressed.gold,100);
});
test("DanMachi stone removed or destroyed prevents ordinary shadow extraction",()=>{
 const s=classed();
 const e={sourceRef:"evt.extract.1",targetRef:"enemy.orario.goblin.1",
  confirmedDeath:true as const,name:"Гоблин",originalKind:"monster" as const,
  powerTier:"common" as const,targetPower:"weaker" as const,
  corpsePresent:false,magicStoneIntact:false,residualImprint:false,
  corruptedMana:false,minutesSinceDeath:0,roll:10};
 const r=attemptJinwooShadowExtraction(s,e);
 assert.equal(r.success,false);assert.equal(r.reason,"no_remains");
 assert.equal(r.next.shadowRoster.length,0);
 assert.equal(r.next.extractionAttempts[e.targetRef],1);
 const preserved=attemptJinwooShadowExtraction(s,{...e,
  sourceRef:"evt.extract.2",targetRef:"enemy.orario.goblin.2",
  corpsePresent:true,magicStoneIntact:true});
 assert.equal(preserved.success,true);
 assert.equal(preserved.next.shadowRoster.length,1);
 assert.throws(()=>attemptJinwooShadowExtraction(preserved.next,{...e,
  sourceRef:"evt.extract.3",targetRef:"enemy.orario.goblin.2",
  corpsePresent:true,magicStoneIntact:true}),/ALREADY_OWNED/);
});
test("a deceased human can be extracted without a monster core when remains exist",()=>{
 const s=classed();
 const extracted=attemptJinwooShadowExtraction(s,{
  sourceRef:"evt.human.extract.1",targetRef:"deceased.bandit.1",
  confirmedDeath:true,originalKind:"human",name:"Бандит",
  powerTier:"common",targetPower:"weaker",corpsePresent:true,
  magicStoneIntact:false,residualImprint:false,corruptedMana:false,
  minutesSinceDeath:2,roll:1});
 assert.equal(extracted.success,true);
 assert.equal(extracted.next.shadowRoster[0].originalKind,"human");
});
test("ordinary extraction allows one final attempt, no reroll with a new event id",()=>{
 let s=classed();
 const request={sourceRef:"evt.try.1",targetRef:"enemy.strong.1",
  confirmedDeath:true as const,originalKind:"monster" as const,name:"Великан",
  powerTier:"elite" as const,targetPower:"stronger" as const,corpsePresent:true,
  magicStoneIntact:true,residualImprint:false,corruptedMana:false,
  minutesSinceDeath:0,roll:100};
 const failed=attemptJinwooShadowExtraction(s,request);
 assert.equal(failed.success,false);s=failed.next;
 assert.equal(s.extractionAttempts["enemy.strong.1"],1);
 const again=attemptJinwooShadowExtraction(s,{...request,sourceRef:"evt.try.2",roll:1});
 assert.equal(again.success,false);
 assert.equal(again.reason,"attempts_exhausted");
 assert.equal(again.next,s);
 const demon=attemptJinwooShadowExtraction(classed(),{
   sourceRef:"evt.try.corrupt",targetRef:"enemy.corrupt.1",
   confirmedDeath:true,originalKind:"other",name:"Искажённый",
   powerTier:"knight",targetPower:"peer",corpsePresent:true,
   magicStoneIntact:true,residualImprint:false,corruptedMana:true,
   minutesSinceDeath:0,roll:1});
 assert.equal(demon.reason,"corrupt_mana");
});
test("True Monarch extraction has no random failure, even against stronger enemies",()=>{
 const s=classed();s.storyFlags.push("quest.ashborn.complete");
 const pure=changeJinwooPhase(s,{sourceRef:"evt.true.no_roll",confirmed:true,
  to:"true_monarch",qualifyingStoryRef:"quest.ashborn.complete"});
 const r=attemptJinwooShadowExtraction(pure,{
  sourceRef:"evt.monarch.extraction",targetRef:"enemy.slayer.1",
  confirmedDeath:true,originalKind:"monster",name:"Высший зверь",
  powerTier:"marshal",targetPower:"overwhelming",corpsePresent:true,
  magicStoneIntact:true,residualImprint:false,corruptedMana:false,
  minutesSinceDeath:100});
 assert.equal(r.success,true);assert.equal(r.chance,100);
 assert.equal(r.next.shadowRoster[0].id,"enemy.slayer.1");
});
test("True Monarch's spiritual imprint requires explicitly enabled crossover rule",()=>{
 const s=classed();s.storyFlags.push("quest.ashborn.complete");
 const pure=changeJinwooPhase(s,{sourceRef:"evt.true",confirmed:true,
  to:"true_monarch",qualifyingStoryRef:"quest.ashborn.complete"});
 const input={sourceRef:"evt.imprint.1",targetRef:"enemy.dragon.1",
  confirmedDeath:true as const,originalKind:"monster" as const,name:"Дракон",
  powerTier:"elite" as const,targetPower:"peer" as const,
  corpsePresent:false,magicStoneIntact:false,residualImprint:true,
  corruptedMana:false,minutesSinceDeath:1,roll:10};
 assert.equal(attemptJinwooShadowExtraction(pure,input).reason,"no_remains");
 const adapted={...pure,shadowTraceRule:"monarch_imprint" as const};
 assert.equal(attemptJinwooShadowExtraction(adapted,input).success,true);
});
test("Shadow regeneration is costly and source-confirmed, not free extra army",()=>{
 const n=classed();
 const extracted=attemptJinwooShadowExtraction(n,{
  sourceRef:"evt.extract.good",targetRef:"enemy.good.1",
  confirmedDeath:true,originalKind:"monster",name:"Волк",
  powerTier:"common",targetPower:"weaker",corpsePresent:true,
  magicStoneIntact:true,residualImprint:false,corruptedMana:false,
  minutesSinceDeath:0,roll:1}).next;
 const restored=resurrectJinwooShadow(extracted,{sourceRef:"evt.shadow.defeat1",
  shadowId:"enemy.good.1",confirmedDefeat:true,manaCost:15});
 assert.equal(restored.mp,extracted.mp-15);
 assert.equal(restored.shadowRoster[0].defeatedCount,1);
 assert.throws(()=>resurrectJinwooShadow(extracted,{sourceRef:"evt.fake",
  shadowId:"enemy.good.1",confirmedDefeat:false,manaCost:15}),/UNAVAILABLE/);
});
test("Player awakens in Orario without inherited Jinwoo biography",()=>{
 const s=newOrarioPlayerAwakening();
 assert.equal(s.awaitingActivation,true);
 assert.equal(JINWOO_CAMPAIGN_PRESET.heroIdentity,null);
 assert.equal(JINWOO_CAMPAIGN_PRESET.heroIsSungJinwoo,false);
 assert.equal(visibleJinwooStore(s).length,0);
 assert.throws(()=>awardJinwooEncounter(s,{
  sourceRef:"evt.early.kill",targetRef:"mob.1",xp:10,systemGold:1,
  confirmed:true,isNewDefeat:true,killer:"player",gmThreatRated:true
 }),/NOT_ACTIVATED/);
 const activated=activateOrarioPlayerSystem(s,{sourceRef:"evt.first_login",confirmedAwakening:true});
 assert.equal(activated.awaitingActivation,false);
 assert.ok(visibleJinwooStore(activated).length>0);
 assert.throws(()=>activateOrarioPlayerSystem(activated,{sourceRef:"evt.second_login",
  confirmedAwakening:true}),/NOT_CONFIRMED/);
});
test("Falna is earned independently and grants an additive System enhancement",()=>{
 const base=newJinwooPreparation();
 base.stats={strength:30,stamina:40,agility:35,perception:25,intelligence:15};
 assert.equal(projectJinwooFalna(base).total.strength,30);
 const b=grantJinwooFalna(base,{sourceRef:"evt.hestia.blessing",
  godId:"npc.hestia",godConfirmed:true});
 const noGrowth=projectJinwooFalna(b);
 assert.deepEqual(noGrowth.display,{strength:0,endurance:0,dexterity:0,agility:0,magic:0});
 assert.equal(noGrowth.total.strength,30);
 assert.throws(()=>updateJinwooFalna(b,{sourceRef:"evt.falna.fake",godId:"npc.loki",
  godConfirmed:true,newStatus:{strength:300,endurance:200,dexterity:100,agility:250,magic:100}
 }),/GOD_CONSENT/);
 const grown=updateJinwooFalna(b,{sourceRef:"evt.status.1",godId:"npc.hestia",
  godConfirmed:true,newStatus:{strength:300,endurance:200,dexterity:100,agility:250,magic:100}});
 const p=projectJinwooFalna(grown);
 assert.deepEqual(p.display,{strength:300,endurance:200,dexterity:100,agility:250,magic:100});
 assert.deepEqual(p.bonus,{strength:6,stamina:4,agility:5,perception:2,intelligence:2});
 assert.deepEqual(p.total,{strength:36,stamina:44,agility:40,perception:27,intelligence:17});
 assert.equal(p.divineLevel,1);assert.equal(p.sourceOfCombatPower,"SYSTEM_PLUS_FALNA");
 assert.equal(grown.stats.strength,30,"System stats do not rise when Falna is updated");
 assert.equal(grown.systemLevel,1,"Falna stats do not raise System level");
 const over=projectJinwooFalna({...grown,falna:{
  ...grown.falna,status:{...grown.falna.status,strength:1200}}});
 assert.equal(over.overRank,true);assert.equal(over.display?.strength,1200);
 grown.storyFlags.push("feat.boss.victory");
 const lvl=updateJinwooFalna(grown,{sourceRef:"evt.divine.2",
  godId:"npc.hestia",godConfirmed:true,
  newStatus:grown.falna.status,levelUpFeatRef:"feat.boss.victory"});
 assert.equal(lvl.falna.divineLevel,2);
 assert.equal(projectJinwooFalna(lvl).total.strength,41);
});
