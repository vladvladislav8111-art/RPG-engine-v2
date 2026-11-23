import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation,projectJinwooFalna} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {consumeConfirmedSystemItem,applyConfirmedCombatDamage,applyConfirmedInjury} from "../src/rpg_lab_v1/orario_player_survival.ts";
import {sellConfirmedMagicStoneBatch} from "../src/rpg_lab_v1/shadow_monarch_stones.ts";
import {validateOrarioPlayerState} from "../src/rpg_lab_v1/orario_player_validation.ts";
const boss="chroma.instant.kasaka.01";
function ready(){
 const s=newJinwooPreparation();
 s.stats.strength=26;s.stats.stamina=26;s.stats.agility=28;
 s.stats.perception=22;s.stats.intelligence=22;
 s.falna.blessed=true;s.falna.godId="npc.loki";
 s.falna.divineLevel=1;
 s.storyFlags.push("chroma_falna_v2");
 s.inventory.kasaka_venom=1;s.defeatedTargetRefs.push(boss);s.systemDropRefs=[boss];
 s.defeatEvidence={[boss]:{monsterId:"system.kasaka",sourceRef:"boss.victory",floor:7}};
 s.appliedRewardRefs.push("boss.victory");
 return s;
}
test("Kasaka venom: physical mitigation20%, permanent -35 effective Strength, no free antidote",()=>{
 const s=ready();assert.equal(projectJinwooFalna(s).total.strength,38);
 const v=consumeConfirmedSystemItem(s,{
  sourceRef:"venom.drink.01",itemId:"kasaka_venom",confirmedUse:true});
 assert.equal(v.inventory.kasaka_venom,undefined);
 assert.equal(v.stats.strength,26);
 assert.equal(projectJinwooFalna(v).total.strength,3);
 assert.equal(v.unlockedSkills.includes("detoxification"),false);
 assert.ok(v.storyFlags.includes("status.kasaka_armor_scales_20"));
 assert.ok(v.storyFlags.includes("status.kasaka_weakened_muscles_35"));
 v.hp=700;
 const injured=applyConfirmedCombatDamage(v,{sourceRef:"damage.01",
  confirmedHit:true,damage:100});
 assert.equal(injured.hp,620);
 assert.equal(validateOrarioPlayerState(injured),injured);
 assert.throws(()=>consumeConfirmedSystemItem(v,{
  sourceRef:"venom.drink.02",itemId:"kasaka_venom",confirmedUse:true
 }),/KASAKA_VENOM_NOT_OWNED_OR_ALREADY_USED/);
});
test("Double Dungeon Kandiaru blessing already counters Kasaka's toxin",()=>{
 const s=ready();
 s.storyFlags.push("blessing.kandiaru_poison_immunity");
 const v=consumeConfirmedSystemItem(s,{
  sourceRef:"venom.blessed.drink",itemId:"kasaka_venom",confirmedUse:true});
 assert.equal(v.inventory.kasaka_venom,undefined);
 assert.equal(projectJinwooFalna(v).total.strength,38);
 assert.equal(v.storyFlags.includes("status.kasaka_weakened_muscles_35"),false);
 assert.ok(v.storyFlags.includes("status.kasaka_armor_scales_20"));
 assert.ok(v.storyFlags.includes("blessing.kandiaru_poison_immunity"));
 assert.equal(v.unlockedSkills.includes("detoxification"),false);
 const threatened=v.hp;
 const prevented=applyConfirmedInjury(v,{
  sourceRef:"poison.hit.blocked",injuryId:"poison.attempt.01",location:"torso",
  kind:"poison",severity:1,damage:77,confirmedCause:true});
 assert.equal(prevented.hp,threatened);
 assert.deepEqual(prevented.injuries??[],v.injuries??[]);
 assert.equal(validateOrarioPlayerState(prevented),prevented);
});
test("Verified 47 Orario stones have one atomic Guild sale, all amounts preserved",()=>{
 const s=ready();
 for(let i=0;i<47;i++){
  const id="stone.chroma."+i;
  s.magicStones[id]={id,monsterRef:"monster.chroma."+i,
   monsterName:"Verified creature",kind:"monster",powerRating:4,
   powerTier:"common",guildValueValis:75+i,
   corruptedMana:false,intact:true,state:"held",collectedRef:"collect."+i};
 }
 const before=s.valis;
 const n=sellConfirmedMagicStoneBatch(s,{sourceRef:"sell.47",
  expectedHeldCount:47,confirmedGuildExchange:true});
 assert.equal(n.valis,before+47*75+1081);
 assert.equal(Object.values(n.magicStones).filter(x=>x.state==="sold").length,47);
 assert.equal(Object.values(s.magicStones).filter(x=>x.state==="held").length,47);
 assert.throws(()=>sellConfirmedMagicStoneBatch(n,{sourceRef:"sell.again",
  expectedHeldCount:47,confirmedGuildExchange:true}),/COUNT_OR_PROOF_INVALID/);
 assert.throws(()=>sellConfirmedMagicStoneBatch(s,{sourceRef:"wrong.count",
  expectedHeldCount:46,confirmedGuildExchange:true}),/COUNT_OR_PROOF_INVALID/);
 assert.equal(validateOrarioPlayerState(n),n);
});
