import test from 'node:test';import assert from 'node:assert/strict';
import {TITLE_DEFS,grantVerifiedTitle,equipVerifiedTitle,activeTitleImpact,
 activateTitleAbility} from '../../../src/rpg_lab_v1/title_rules_v45.ts';
const p=()=>({systemLevel:8,xp:10,gold:10,stats:{strength:20,stamina:20,agility:20,perception:20,intelligence:20},
 freeStatPoints:0,hp:500,mp:200,fatigue:0,confirmedDefeats:[],confirmedRewardRefs:[],
 titleIds:[],activeTitle:null,runeStones:{},learnedSkills:[]});
const facts=(overrides={})=>({tags:[],weakPointConfirmed:false,jointStrikeConfirmed:false,
 physicalAttack:true,...overrides});
const ledger=()=>({battleId:'battle.1',spentAbilityKeys:[],activeUntil:{},appliedSourceRefs:[]});
const abilityHost={verifyEventProof:()=>true};
test('All nine titles have unique definitions, event-verifiable conditions',()=>{
 assert.equal(Object.keys(TITLE_DEFS).length,9);
 assert.equal(new Set(Object.values(TITLE_DEFS).map(x=>x.name)).size,9);
});
test('Titles cannot be forged from an unverified or duplicate achievement',()=>{
 const host={verifyTitleClear:(id,ref)=>id==='wolf_slayer'&&ref==='battle.wolves.10'};
 assert.throws(()=>grantVerifiedTitle(p(),{titleId:'wolf_slayer',sourceRef:'claim.1',proofRef:'guess.1'},host),/NOT_VERIFIED/);
 const earned=grantVerifiedTitle(p(),{titleId:'wolf_slayer',sourceRef:'claim.1',proofRef:'battle.wolves.10'},host);
 assert.deepEqual(earned.titleIds,['wolf_slayer']);
 assert.throws(()=>grantVerifiedTitle(earned,{titleId:'wolf_slayer',sourceRef:'claim.2',proofRef:'battle.wolves.10'},host),/DUPLICATE/);
});
test('One title active at a time, Wolf Slayer only on beast targets',()=>{
 const player=p();player.titleIds=['wolf_slayer','giant_feller'];
 const wolf=equipVerifiedTitle(player,'wolf_slayer');
 assert.equal(activeTitleImpact(wolf,facts({tags:['beast']})).statMultiplier,1.4);
 assert.equal(activeTitleImpact(wolf,facts({tags:['humanoid']})).statMultiplier,1);
 const giant=equipVerifiedTitle(wolf,'giant_feller');
 assert.equal(activeTitleImpact(giant,facts({tags:['giant'],weakPointConfirmed:true})).physicalDamageMultiplier,1.35);
 assert.equal(activeTitleImpact(giant,facts({tags:['giant']})).physicalDamageMultiplier,1);
 assert.equal(player.activeTitle,null);
});
test('Hive detector, armor joint skills and anti-ambush effects are scoped',()=>{
 const player=p();player.titleIds=['nest_breaker','shellbreaker','counterhunter'];
 assert.equal(activeTitleImpact(equipVerifiedTitle(player,'nest_breaker'),facts()).detectHiveSignal,true);
 assert.equal(activeTitleImpact(equipVerifiedTitle(player,'nest_breaker'),
  facts({tags:['chitin'],jointStrikeConfirmed:true})).attackTempoMultiplier,1.3);
 assert.equal(activeTitleImpact(equipVerifiedTitle(player,'shellbreaker'),
  facts({tags:['armor'],jointStrikeConfirmed:true})).armorIgnoreFraction,.3);
 assert.equal(activeTitleImpact(equipVerifiedTitle(player,'shellbreaker'),
  facts({tags:['armor']})).armorIgnoreFraction,0);
 assert.equal(activeTitleImpact(equipVerifiedTitle(player,'counterhunter'),facts()).warnAmbushWithinMeters,5);
});
test('Floor breaker is passive access and never falsely masquerades as active combat buff',()=>{
 const player=p();player.titleIds=['floor_breaker'];
 assert.equal(activeTitleImpact(player,facts()).freeSystemInstanceAccess,true);
 assert.throws(()=>equipVerifiedTitle(player,'floor_breaker'),/NOT_EQUIPPABLE/);
});
test('Unbroken blocks 35% once per battle at critical HP, physical only',()=>{
 const player=p();player.titleIds=['unbroken'];const equipped=equipVerifiedTitle(player,'unbroken');
 const e={sourceRef:'guard.1',proofRef:'proof.guard.1',ability:'tenacity_critical_hp',
  nowSecond:10,currentHp:100,maxHp:1000,isPhysicalDamage:true,incomingDamage:200};
 const result=activateTitleAbility(equipped,ledger(),e,abilityHost);
 assert.equal(result.damagePrevented,70);
 assert.throws(()=>activateTitleAbility(equipped,result.ledger,{...e,sourceRef:'guard.2',proofRef:'proof.guard.2'},abilityHost),/NOT_AVAILABLE/);
 assert.throws(()=>activateTitleAbility(equipped,ledger(),{...e,isPhysicalDamage:false},abilityHost),/NOT_AVAILABLE/);
});
test('Quiet steps silence equipment noise, do not grant invisibility or rune skill',()=>{
 const player=p();player.titleIds=['silent_path'];
 const result=activateTitleAbility(equipVerifiedTitle(player,'silent_path'),ledger(),{
  sourceRef:'silent.1',proofRef:'proof.silent.1',ability:'silent_steps',
  nowSecond:1,currentHp:500,maxHp:1000},abilityHost);
 assert.equal(result.mpCost,8);assert.equal(result.durationSeconds,30);
 assert.equal(result.player.learnedSkills.length,0);
 assert.match(result.note,/not visibility/);
});
test('Depth survivor accuracy focus lasts 15 seconds, requires equipped title',()=>{
 const player=p();player.titleIds=['dungeon_survivor'];
 const result=activateTitleAbility(equipVerifiedTitle(player,'dungeon_survivor'),ledger(),{
  sourceRef:'focus.1',proofRef:'proof.focus.1',ability:'combat_composure',
  nowSecond:1,currentHp:500,maxHp:1000},abilityHost);
 assert.equal(result.durationSeconds,15);assert.equal(result.player.mp,182);
 assert.throws(()=>activateTitleAbility(player,ledger(),{
  sourceRef:'focus.2',proofRef:'proof.focus.2',ability:'combat_composure',
  nowSecond:2,currentHp:500,maxHp:1000},abilityHost),/NOT_PROVEN/);
});
test('Ambush warning only in 5m with proof, no future prediction',()=>{
 const player=p();player.titleIds=['counterhunter'];
 const item={sourceRef:'ambush.1',proofRef:'proof.ambush.1',ability:'ambush_warning',
  nowSecond:0,currentHp:500,maxHp:1000,ambushConfirmed:true,threatDistanceMeters:3};
 assert.throws(()=>activateTitleAbility(equipVerifiedTitle(player,'counterhunter'),ledger(),{
  ...item,threatDistanceMeters:12},abilityHost),/OUT_OF_RANGE/);
 assert.equal(activateTitleAbility(equipVerifiedTitle(player,'counterhunter'),ledger(),item,abilityHost).mpCost,0);
});
