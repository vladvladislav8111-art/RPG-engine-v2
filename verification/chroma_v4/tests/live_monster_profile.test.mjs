import test from 'node:test';
import assert from 'node:assert/strict';
import {listV4CombatCards,getV4MonsterCard,adaptMonsterForV4} from '../../../src/rpg_lab_v1/live_monster_profile.ts';
import rawBestiary from '../../../src/data/bestiary_v2.json' with {type:'json'};

const natural=(monsterId,floor,eventProofRef='battle.proof.real.1')=>adaptMonsterForV4({monsterId,floor,eventProofRef,mode:'natural',confirmedStoryTrigger:false});
test('all 135 catalog combat records have physical HP from agreed bestiary',()=>{
 assert.equal(listV4CombatCards().length,135);
 for(const id of listV4CombatCards()){
  const c=getV4MonsterCard(id);
  assert.ok(Number.isSafeInteger(c.hp)&&c.hp>0,`HP invalid: ${id}`);
 }
});
test('orc XP and stone prices match approved v2 bestiary, not stale legacy numbers',()=>{
 const r=natural('orc',10);
 assert.equal(r.hp,660);
 assert.equal(r.baseXp,340);
 assert.equal(r.magicStoneValis,5450);
 assert.ok(r.systemThreatLevel>=15&&r.systemThreatLevel<=17);
});
test('monster levels are deterministic and never caller-specified',()=>{
 const a=natural('imp',10,'proof.encounter.812');
 assert.equal(a.systemThreatLevel,natural('imp',10,'proof.encounter.812').systemThreatLevel);
 assert.ok(a.systemThreatLevel>=11&&a.systemThreatLevel<=13);
});
test('no normal wild Goliath or special papilio',()=>{
 assert.throws(()=>natural('goliath_17',17),/FORBIDDEN/);
 assert.throws(()=>natural('blue_papilio',7),/FORBIDDEN/);
 const p=adaptMonsterForV4({monsterId:'blue_papilio',floor:7,eventProofRef:'proof.papilio',mode:'scripted',confirmedStoryTrigger:true});
 assert.equal(p.hp,30);
});
test('no spawning at disjoint floor gap or wrong floor',()=>{
 assert.throws(()=>natural('goblin',5),/FLOOR/);
 assert.equal(natural('goblin',8).hp,80);
});
test('system instances cannot masquerade as ordinary dungeon monsters',()=>{
 assert.throws(()=>natural('sl_igris',18),/FORBIDDEN/);
 assert.throws(()=>adaptMonsterForV4({monsterId:'sl_igris',floor:null,eventProofRef:'proof.igris',mode:'system_instance',confirmedStoryTrigger:false}),/PROOF/);
});
test('no arbitrary story-only or invented monster IDs',()=>{
 assert.throws(()=>natural('faux_new_super_boss',10),/NOT_IN_COMBAT_CATALOG/);
 assert.throws(()=>natural('orc',10,'bad-ref!'),/PROOF_REF_INVALID/);
});

test('Every battle HP matches the user-approved original bestiary, not an inferred formula',()=>{
 const source=new Map(rawBestiary.cards.map(c=>[c.id,c]));
 for(const id of listV4CombatCards()){
  const combat=getV4MonsterCard(id);
  const original=source.get(id);
  assert.ok(original,`missing approved source card for ${id}`);
  assert.equal(combat.hp,original.HP_ориентир,`${id}: HP source of truth mismatch`);
  assert.equal(combat.baseXp,original.XP_база,`${id}: base XP drift`);
  assert.equal(combat.baseGold,original.золото_база,`${id}: System gold drift`);
  assert.equal(combat.priceMagicStoneValis,
   original.камень_база_валисов>0?original.камень_база_валисов:null,`${id}: stone price drift`);
 }
});
