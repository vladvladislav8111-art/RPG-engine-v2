import test from "node:test";
import assert from "node:assert/strict";
import {JINWOO_CAMPAIGN_PRESET,JINWOO_CANON_VS_ADAPTATION,
 JINWOO_STORE,awardJinwooEncounter,allocateJinwooPoints,
 attemptJinwooShadowExtraction,changeJinwooPhase,completeJinwooDaily,
 grantJinwooStoryUnlock,newJinwooPreparation,projectJinwooFalna,
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
 assert.throws(()=>awardJinwooEncounter(old,{...e,confirmed:false}),/UNCONFIRMED/);
 assert.throws(()=>awardJinwooEncounter(old,{...e,isNewDefeat:false}),/UNCONFIRMED/);
 const shadow=awardJinwooEncounter(old,{...e,killer:"shadow",sourceRef:"kill.goblin.2",
  targetRef:"enemy.goblin.2"});
 assert.equal(shadow.systemLevel,2);
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
test("Extraction respects three attempts, mana corruption and stronger-than-owner limits",()=>{
 let s=classed();
 for(let i=0;i<3;i++){
  const r=attemptJinwooShadowExtraction(s,{
   sourceRef:"evt.try."+i,targetRef:"enemy.strong.1",
   confirmedDeath:true,originalKind:"monster",name:"Великан",
   powerTier:"elite",targetPower:"stronger",corpsePresent:true,
   magicStoneIntact:true,residualImprint:false,corruptedMana:false,
   minutesSinceDeath:0,roll:100});
  assert.equal(r.success,false);s=r.next;
 }
 const fourth=attemptJinwooShadowExtraction(s,{
   sourceRef:"evt.try.4",targetRef:"enemy.strong.1",
   confirmedDeath:true,originalKind:"monster",name:"Великан",
   powerTier:"elite",targetPower:"stronger",corpsePresent:true,
   magicStoneIntact:true,residualImprint:false,corruptedMana:false,
   minutesSinceDeath:0,roll:1});
 assert.equal(fourth.success,false);assert.equal(fourth.reason,"attempts_exhausted");
 const demon=attemptJinwooShadowExtraction(classed(),{
   sourceRef:"evt.try.corrupt",targetRef:"enemy.corrupt.1",
   confirmedDeath:true,originalKind:"other",name:"Искажённый",
   powerTier:"knight",targetPower:"peer",corpsePresent:true,
   magicStoneIntact:true,residualImprint:false,corruptedMana:true,
   minutesSinceDeath:0,roll:1});
 assert.equal(demon.reason,"corrupt_mana");
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
test("Falna is only a translated window, not 2nd free level progression",()=>{
 const s=newJinwooPreparation();
 const n={...s,stats:{strength:30,stamina:40,agility:35,perception:25,
  intelligence:15},falna:{blessed:true,divineLevel:1,lastUpdatedRef:"evt.blessing"}};
 const p=projectJinwooFalna(n);
 assert.deepEqual(p.display,{strength:240,endurance:360,dexterity:240,agility:300,magic:60});
 assert.equal(p.divineLevel,1);assert.equal(p.sourceOfCombatPower,"SYSTEM_NOT_FALNA");
 assert.equal(n.stats.strength,30);
 const over=projectJinwooFalna({...n,stats:{...n.stats,strength:200}});
 assert.equal(over.display?.strength,999);assert.equal(over.overRank,true);
 assert.equal(over.divineLevel,1);
});
