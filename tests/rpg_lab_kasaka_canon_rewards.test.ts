import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {recordConfirmedMonsterDrop} from "../src/rpg_lab_v1/orario_player_loot.ts";
import {previewVerifiedLoadout,previewOwnedEquipmentEncounter} from
 "../src/rpg_lab_v1/danmachi_player_equipment.ts";
import {verifySystemDungeonBossEvidence} from
 "../src/rpg_lab_v1/orario_system_encounters.ts";

const bossRef="chroma.instant.kasaka.01";
function bossDefeated(){
 const s=newJinwooPreparation();
 s.defeatedTargetRefs.push(bossRef);
 s.defeatEvidence={[bossRef]:{
  monsterId:"system.kasaka",sourceRef:"chroma.d3_b3_kasaka_return_anchor_healthy_eye.637",
  floor:7
 }};
 return s;
}

test("Kasaka's canonical Fang and Venom are collected together only after proven kill",()=>{
 const s=bossDefeated();
 assert.equal(verifySystemDungeonBossEvidence(s,"instant.first"),true);
 assert.throws(()=>previewVerifiedLoadout(s,{weaponId:"kasaka_fang"}),
  /NOT_OWNED_OR_UNSUPPORTED/);
 const reward=recordConfirmedMonsterDrop(s,{
  sourceRef:"chroma.d3_b3_kasaka_search_loot.638",
  monsterId:"system.kasaka",monsterRef:bossRef,
  confirmedDefeat:true,confirmedSearch:true
 });
 assert.equal(reward.itemId,"kasaka_fang");
 assert.equal(reward.next.inventory.kasaka_fang,1);
 assert.equal(reward.next.inventory.kasaka_venom,1);
 assert.deepEqual(reward.next.systemDropRefs,[bossRef]);
 assert.equal(s.inventory.kasaka_fang,undefined);
 assert.equal(s.inventory.kasaka_venom,undefined);
 assert.equal(previewVerifiedLoadout(reward.next,{weaponId:"kasaka_fang"}).attack,25);
 assert.throws(()=>recordConfirmedMonsterDrop(reward.next,{
  sourceRef:"chroma.d3_b3_kasaka_duplicate.639",
  monsterId:"system.kasaka",monsterRef:bossRef,
  confirmedDefeat:true,confirmedSearch:true
 }),/DROP_NOT_EARNED/);
});
test("Forged defeated target cannot claim boss item from another monster",()=>{
 const s=bossDefeated();
 s.defeatEvidence={[bossRef]:{
  monsterId:"system.dungeon_wolf",sourceRef:"wolf.not.boss",floor:7
 }};
 assert.throws(()=>recordConfirmedMonsterDrop(s,{
  sourceRef:"fake.kasaka.drops",monsterId:"system.kasaka",
  monsterRef:bossRef,confirmedDefeat:true,confirmedSearch:true
 }),/KASAKA_DROP_BOSS_PROOF_REQUIRED/);
 s.inventory.kasaka_fang=1;
 s.systemDropRefs=[bossRef];
 assert.throws(()=>previewVerifiedLoadout(s,{weaponId:"kasaka_fang"}),
  /NOT_OWNED_OR_UNSUPPORTED/);
});
test("Boss fang is a usable earned dagger, not an extra item for every monster",()=>{
 const s=bossDefeated();
 const loot=recordConfirmedMonsterDrop(s,{
  sourceRef:"boss.first.search",monsterId:"system.kasaka",
  monsterRef:bossRef,confirmedDefeat:true,confirmedSearch:true
 }).next;
 const unarmed=previewOwnedEquipmentEncounter(loot,{
  monsterId:"goblin",floor:1,loadout:{},move:"strike"
 });
 const fang=previewOwnedEquipmentEncounter(loot,{
  monsterId:"goblin",floor:1,
  loadout:{weaponId:"kasaka_fang"},move:"strike"
 });
 assert.equal(fang.gear.attack,25);
 assert.ok(fang.exchange.damageIfHit>unarmed.exchange.damageIfHit);
 assert.equal(fang.exchange.noCommittedAttack,true);
 assert.equal(loot.inventory.kasaka_venom,1);
});
