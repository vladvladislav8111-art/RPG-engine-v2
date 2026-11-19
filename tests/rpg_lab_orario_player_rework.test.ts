import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation,newOrarioPlayerAwakening,activateOrarioPlayerSystem,
 awardJinwooEncounter,grantJinwooStoryUnlock,changeJinwooPhase,
 JINWOO_STORE,visibleJinwooStore,grantJinwooFalna,
 updateJinwooFalna,projectJinwooFalna} from
 "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {addConfirmedMagicStone,extractShadowFromMagicStone,
 sellConfirmedMagicStone,playerStoneLedger} from
 "../src/rpg_lab_v1/shadow_monarch_stones.ts";
import {previewDanmachiPlotKeys,grantDanmachiPlotKey,plotFlag} from
 "../src/rpg_lab_v1/danmachi_plot_keys.ts";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
function classed(){
 const s=newJinwooPreparation();s.systemLevel=40;
 s.storyFlags.push("quest.job_trial.complete");
 const n=changeJinwooPhase(s,{sourceRef:"evt.class.change",confirmed:true,
  to:"shadow_class",qualifyingStoryRef:"quest.job_trial.complete"});
 return grantJinwooStoryUnlock(n,{
  sourceRef:"evt.class.skill",confirmed:true,type:"skill",id:"shadow_extraction"});
}
const monster=(s:ReturnType<typeof newJinwooPreparation>,ref:string,level=5)=>{
 const killed=awardJinwooEncounter(s,{
  sourceRef:"kill."+ref,targetRef:ref,confirmed:true,
  xp:0,systemGold:10,killer:"player",isNewDefeat:true,gmThreatRated:true});
 return addConfirmedMagicStone(killed,{
  sourceRef:"loot."+ref,stoneId:"stone."+ref,monsterRef:ref,
  monsterName:"Монстр "+ref,confirmedLoot:true,intact:true,
  powerRating:level,powerTier:"common",guildValueValis:120,
  corruptedMana:false});
};
test("awakening happens in medical ward without any inherited Player gains",()=>{
 const pack=buildFreshDanmachiLabPack("orario_player_test");
 assert.ok(pack.locations["orario.medical_ward"]);
 const s=newOrarioPlayerAwakening();
 assert.equal(s.awaitingActivation,true);
 assert.deepEqual(visibleJinwooStore(s),[]);
 assert.equal(s.shadowRoster.length,0);
 assert.equal(s.falna.blessed,false);
 const active=activateOrarioPlayerSystem(s,{
  sourceRef:"evt.orario.first_login",confirmedAwakening:true});
 assert.equal(active.awaitingActivation,false);
 assert.equal(active.gold,0);
 assert.equal(active.systemLevel,1);
 assert.equal(active.falna.blessed,false);
});
test("intact stone creates one shadow and forgoes valis from the same stone",()=>{
 let s=monster(classed(),"mob.ore.goblin.1",2);
 assert.equal(s.magicStones["stone.mob.ore.goblin.1"].state,"held");
 const a=extractShadowFromMagicStone(s,{sourceRef:"extract.mob.ore.goblin.1",
  stoneId:"stone.mob.ore.goblin.1",roll:1,confirmedShadowCommand:true});
 assert.equal(a.success,true);assert.equal(a.stoneConsumed,true);
 assert.equal(a.next.magicStones["stone.mob.ore.goblin.1"].state,"consumed_by_shadow");
 assert.equal(a.next.shadowRoster.length,1);
 assert.equal(a.next.valis,0);
 assert.throws(()=>sellConfirmedMagicStone(a.next,{
  sourceRef:"sale.fake.1",stoneId:"stone.mob.ore.goblin.1",
  confirmedGuildExchange:true}),/NOT_VERIFIED/);
 assert.throws(()=>extractShadowFromMagicStone(a.next,{
  sourceRef:"extract.fake.2",stoneId:"stone.mob.ore.goblin.1",
  roll:1,confirmedShadowCommand:true}),/INTACT_REQUIRED/);
 const ledger=playerStoneLedger(a.next);
 assert.equal(ledger[0].guildValis,0);
});
test("selling intact stone yields valis once and prevents creating a shadow",()=>{
 const s=monster(classed(),"mob.ore.goblin.2",2);
 const after=sellConfirmedMagicStone(s,{sourceRef:"sale.goblin.2",
  stoneId:"stone.mob.ore.goblin.2",confirmedGuildExchange:true});
 assert.equal(after.valis,120);assert.equal(after.gold,10);
 assert.throws(()=>extractShadowFromMagicStone(after,{
  sourceRef:"extract.goblin.2",stoneId:"stone.mob.ore.goblin.2",
  roll:1,confirmedShadowCommand:true}),/INTACT_REQUIRED/);
 assert.throws(()=>sellConfirmedMagicStone(after,{
  sourceRef:"sale.goblin.again",stoneId:"stone.mob.ore.goblin.2",
  confirmedGuildExchange:true}),/NOT_VERIFIED/);
});
test("three extraction failures never provide duplicate attempts or free shadows",()=>{
 let s=monster(classed(),"mob.tough.1",65);
 for(let n=1;n<=3;n++){
  const r=extractShadowFromMagicStone(s,{sourceRef:"try.tough."+n,
   stoneId:"stone.mob.tough.1",confirmedShadowCommand:true,roll:100});
  assert.equal(r.success,false);s=r.next;
 }
 assert.equal(s.shadowRoster.length,0);
 const last=extractShadowFromMagicStone(s,{sourceRef:"try.tough.4",
  stoneId:"stone.mob.tough.1",confirmedShadowCommand:true,roll:1});
 assert.equal(last.reason,"three_attempts_expended");
 assert.equal(last.next,s);
 assert.equal(last.stoneConsumed,false);
});
test("no shadows before class, and invalid/shattered stones cannot be laundered",()=>{
 const s=monster(newJinwooPreparation(),"mob.early.1",1);
 assert.throws(()=>extractShadowFromMagicStone(s,{
  sourceRef:"extract.early",stoneId:"stone.mob.early.1",
  roll:1,confirmedShadowCommand:true}),/SHADOW_CLASS_REQUIRED/);
 assert.throws(()=>addConfirmedMagicStone(s,{
  sourceRef:"loot.another.stone",stoneId:"stone.another",
  monsterRef:"mob.early.1",monsterName:"Гоблин",
  powerRating:1,powerTier:"common",guildValueValis:100,
  confirmedLoot:true,intact:true,corruptedMana:false}),/NOT_VERIFIED/);
 assert.throws(()=>addConfirmedMagicStone(s,{
  sourceRef:"loot.broken",stoneId:"stone.broken",
  monsterRef:"mob.early.2",monsterName:"Гоблин",
  powerRating:1,powerTier:"common",guildValueValis:100,
  confirmedLoot:true,intact:false,corruptedMana:false}),/PROVENANCE_UNKNOWN|NOT_VERIFIED/);
});
test("verified gifts/trades allow extracting a creature not personally killed, no XP",()=>{
 let s=classed();
 const gifted=addConfirmedMagicStone(s,{
  sourceRef:"gift.goblin",stoneId:"stone.gift.1",monsterRef:"mob.gift.1",
  monsterName:"Подаренный камень",confirmedLoot:true,intact:true,
  powerRating:4,powerTier:"common",guildValueValis:90,
  corruptedMana:false,acquisition:"confirmed_gift",verifiedProvenance:true});
 assert.equal(gifted.systemLevel,s.systemLevel);
 assert.equal(gifted.xp,s.xp);
 assert.equal(gifted.defeatedTargetRefs.includes("mob.gift.1"),false);
 assert.equal(extractShadowFromMagicStone(gifted,{
  sourceRef:"extract.gift.1",stoneId:"stone.gift.1",
  roll:1,confirmedShadowCommand:true}).success,true);
 assert.throws(()=>addConfirmedMagicStone(s,{
  sourceRef:"gift.fake",stoneId:"stone.fake",monsterRef:"mob.fake",
  monsterName:"Неизвестно",confirmedLoot:true,intact:true,
  powerRating:999,powerTier:"elite",guildValueValis:99999,
  corruptedMana:false,acquisition:"confirmed_gift",verifiedProvenance:false
 }),/PROVENANCE_UNKNOWN/);
 s.valis=100;
 const trade=addConfirmedMagicStone(s,{
  sourceRef:"trade.good",stoneId:"stone.trade",monsterRef:"mob.trade",
  monsterName:"Торговый камень",confirmedLoot:true,intact:true,
  powerRating:6,powerTier:"common",guildValueValis:70,
  corruptedMana:false,acquisition:"confirmed_trade",verifiedProvenance:true,
  paidValis:80});
 assert.equal(trade.valis,20);
 assert.throws(()=>addConfirmedMagicStone(s,{
  sourceRef:"trade.overprice",stoneId:"stone.over",monsterRef:"mob.over",
  monsterName:"Дорогой",confirmedLoot:true,intact:true,
  powerRating:6,powerTier:"common",guildValueValis:70,
  corruptedMana:false,acquisition:"confirmed_trade",verifiedProvenance:true,
  paidValis:110}),/PAYMENT_INVALID/);
});
test("shop is diverse yet all purchases must respect levels, story keys, money",()=>{
 const s=newJinwooPreparation();
 assert.ok(JINWOO_STORE.length>=45);
 const types=new Set(JINWOO_STORE.map(x=>x.kind));
 for(const t of ["consumable","weapon","armor","utility","material","rune","quest"])
  assert.ok(types.has(t as never),t);
 assert.equal(new Set(JINWOO_STORE.map(x=>x.id)).size,JINWOO_STORE.length);
 assert.ok(visibleJinwooStore(s).some(x=>x.id==="rope_coil"));
 assert.ok(visibleJinwooStore(s).some(x=>x.id==="leather_armor"));
 assert.equal(visibleJinwooStore(s).some(x=>x.id==="rune_quicksilver"),false);
});
test("DanMachi arcs unlock only through source-bound causal story keys",()=>{
 let s=newOrarioPlayerAwakening();
 assert.equal(previewDanmachiPlotKeys(s,{
  worldDay:0,topicTags:["bell"],confirmedTrigger:"world_event"
 }).options.length,0);
 assert.throws(()=>grantDanmachiPlotKey(s,{
  sourceRef:"event.fake",keyId:"monstrophilia",worldDay:20,
  trigger:"world_event",gmConfirmed:true,eventRef:"event.fake"}),/UNAVAILABLE/);
 s=grantDanmachiPlotKey(s,{
  sourceRef:"event.arrival",keyId:"orario.arrival",worldDay:0,
  trigger:"world_event",gmConfirmed:true,eventRef:"event.arrival"});
 const options=previewDanmachiPlotKeys(s,{
  worldDay:0,topicTags:["bell","ganesha","awakening"],
  confirmedTrigger:null}).options.map(x=>x.id);
 assert.ok(options.includes("bell.first_minotaur"));
 assert.ok(options.includes("monstrophilia"));
 assert.ok(options.includes("player.awakening"));
 s=grantDanmachiPlotKey(s,{
  sourceRef:"event.first.login",keyId:"player.awakening",worldDay:0,
  trigger:"quest_outcome",gmConfirmed:true,eventRef:"event.first.login"});
 assert.ok(s.storyFlags.includes(plotFlag("player.awakening")));
 assert.throws(()=>grantDanmachiPlotKey(s,{
  sourceRef:"event.late.xenos",keyId:"xenos.open",worldDay:200,
  trigger:"world_event",gmConfirmed:true,eventRef:"event.late.xenos"}),/UNAVAILABLE/);
 assert.equal(s.systemLevel,1);
});
test("System XP and Falna bonuses remain distinct after battle and blessing",()=>{
 let s=newJinwooPreparation();
 s=grantJinwooFalna(s,{sourceRef:"evt.god.1",godId:"npc.hestia",
  godConfirmed:true});
 s=updateJinwooFalna(s,{
  sourceRef:"evt.god.status",godId:"npc.hestia",godConfirmed:true,
  newStatus:{strength:100,endurance:100,dexterity:100,agility:100,magic:100}});
 const prior=projectJinwooFalna(s);
 const after=awardJinwooEncounter(s,{
  sourceRef:"evt.mob.kill",targetRef:"mob.lizard.2",
  xp:100,systemGold:5,killer:"player",confirmed:true,isNewDefeat:true,
  gmThreatRated:true});
 assert.equal(after.systemLevel,2);
 assert.deepEqual(after.falna.status,s.falna.status);
 assert.equal(projectJinwooFalna(after).bonus.strength,prior.bonus.strength);
 assert.equal(projectJinwooFalna(after).total.strength,
  projectJinwooFalna(s).total.strength+1);
});
