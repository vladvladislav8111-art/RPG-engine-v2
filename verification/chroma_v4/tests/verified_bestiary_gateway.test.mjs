import test from 'node:test';
import assert from 'node:assert/strict';
import {
 catalogSummary, resolveMonsterFromCatalog, awardCatalogVerifiedDefeat, recoverPhysicalLoot
} from '../../../src/rpg_lab_v1/verified_bestiary_gateway.ts';
const stats=()=>({strength:26,stamina:26,agility:32,perception:26,intelligence:22});
const player=()=>({systemLevel:8,xp:820,gold:1020,stats:stats(),freeStatPoints:0,hp:1200,mp:300,fatigue:20,confirmedDefeats:[],confirmedRewardRefs:[],titleIds:[],activeTitle:null,runeStones:{},learnedSkills:[]});
const proof={battleProofRef:'combat.killer_ant.1',participationProofRef:'part.killer_ant.1'};
const host={getRecordedRoll:()=>0.99,getRestoredResources:()=>({hp:2000,mp:300}),
 verifyJournalProof:(ref,kind)=>kind==='battle_defeat'?ref.startsWith('combat.'):kind==='contribution'?ref.startsWith('part.'):ref.startsWith('trigger.')};
const valid={sourceRef:'award.killer_ant.1',targetRef:'ant.1',monsterId:'killer_ant',systemLevel:8,spawnMode:'natural',floor:8,evidence:proof};
test('catalog coverage and all rune types have a fixed skill id',()=>{
 assert.deepEqual(catalogSummary(),{entries:135,storyOnly:21,natural:60,runeSources:13});
 for (const [id] of Object.entries({blue_papilio:1,war_shadow:1,hellhound:1,carbuncle:1})){
  const c=resolveMonsterFromCatalog({monsterId:id,systemLevel:id==='war_shadow'?8:id==='blue_papilio'?6:id==='hellhound'?21:44,spawnMode:'scripted',floor:null,storyTriggerProofRef:'trigger.test'});
  assert.ok(c.card.runeId);
 }
});
test('natural monster gets reward from catalog, not caller assigned XP',()=>{
 const r=awardCatalogVerifiedDefeat(player(),valid,host);
 assert.equal(r.system.xp,116);
 assert.equal(r.danmachi.magicStoneRecoverable,true);
 assert.equal(r.danmachi.potentialStoneValis,1200);
 assert.ok(r.player.confirmedDefeats.includes('ant.1'));
 assert.equal(r.player.gold,1020+75);
});
test('evidence must be externally confirmed and reward is single use',()=>{
 assert.throws(()=>awardCatalogVerifiedDefeat(player(),{...valid,evidence:{...proof,battleProofRef:'forged.abc'}},host),/NOT_CONFIRMED/);
 assert.throws(()=>awardCatalogVerifiedDefeat(player(),{...valid,evidence:{...proof,battleProofRef:valid.sourceRef}},host),/SELF_ATTESTATION/);
 const once=awardCatalogVerifiedDefeat(player(),valid,host);
 assert.throws(()=>awardCatalogVerifiedDefeat(once.player,valid,host),/DUPLICATE/);
});
test('boss, system-only and story-only monsters cannot spawn naturally',()=>{
 for(const id of ['goliath_17','black_goliath','sl_igris','sl_kasaka']){
  assert.throws(()=>resolveMonsterFromCatalog({monsterId:id,systemLevel:50,spawnMode:'natural',floor:17}),/FORBIDDEN|OUT_OF_RANGE/);
 }
 assert.throws(()=>resolveMonsterFromCatalog({monsterId:'nidhogg',systemLevel:50,spawnMode:'scripted',floor:17,storyTriggerProofRef:'trigger.1'}),/UNKNOWN_OR_STORY_ONLY/);
});
test('natural floor gate prevents arbitrary low-floor elite spawn',()=>{
 assert.throws(()=>resolveMonsterFromCatalog({monsterId:'orc',systemLevel:16,spawnMode:'natural',floor:1}),/FLOOR_INVALID/);
 const card=resolveMonsterFromCatalog({monsterId:'orc',systemLevel:16,spawnMode:'natural',floor:10});
 assert.equal(card.card.baseXp,340);
});
test('event monsters require the verified trigger and system instance its own mode',()=>{
 assert.throws(()=>resolveMonsterFromCatalog({monsterId:'goliath_17',systemLevel:50,spawnMode:'scripted',floor:17}),/PROOF_REQUIRED|OUT_OF_RANGE/);
 assert.throws(()=>resolveMonsterFromCatalog({monsterId:'sl_igris',systemLevel:60,spawnMode:'scripted',floor:null,storyTriggerProofRef:'proof'}),/WRONG_MODE|OUT_OF_RANGE/);
});

test('physical loot is NOT awarded by killing; recovery uses separate verified search',()=>{
 const kills=awardCatalogVerifiedDefeat(player(),valid,host);
 assert.equal(kills.player.gold,1095);
 assert.equal(kills.danmachi.magicStoneRecoverable,true);
 const ledger={recoveredTargetRefs:[],recoveryRefs:[]};
 const recoveryHost={isConfirmedDefeat:(ref,id)=>ref==='ant.1'&&id==='killer_ant',
  verifySearchProof:(ref)=>ref.startsWith('search.'),getRecordedMaterialRoll:()=>0};
 const recovery=recoverPhysicalLoot(ledger,{
  sourceRef:'recover.ant.1',targetRef:'ant.1',monsterId:'killer_ant',
  stoneSurvived:true,searchProofRef:'search.ant.1'},recoveryHost);
 assert.equal(recovery.potentialMagicStoneValis,1200);
 assert.ok(recovery.materialRecovered);
 assert.deepEqual(ledger,{recoveredTargetRefs:[],recoveryRefs:[]});
 assert.throws(()=>recoverPhysicalLoot(recovery.ledger,{
  sourceRef:'recover.ant.2',targetRef:'ant.1',monsterId:'killer_ant',
  stoneSurvived:true,searchProofRef:'search.ant.1'},recoveryHost),/ALREADY_PROCESSED/);
});
test('broken stone is worthless, and unverified search gives nothing',()=>{
 const ledger={recoveredTargetRefs:[],recoveryRefs:[]};
 const recoveryHost={isConfirmedDefeat:(ref,id)=>ref==='ant.1'&&id==='killer_ant',
 verifySearchProof:(ref)=>ref.startsWith('search.'),getRecordedMaterialRoll:()=>0.99};
 assert.throws(()=>recoverPhysicalLoot(ledger,{sourceRef:'recover.1',targetRef:'ant.1',monsterId:'killer_ant',stoneSurvived:true,searchProofRef:'forged.abc'},recoveryHost),/UNVERIFIED/);
 const r=recoverPhysicalLoot(ledger,{sourceRef:'recover.1',targetRef:'ant.1',monsterId:'killer_ant',stoneSurvived:false,searchProofRef:'search.ant.1'},recoveryHost);
 assert.equal(r.potentialMagicStoneValis,null);
 assert.equal(r.materialRecovered,null);
});
test('cannot recover DanMachi stones from System instances',()=>{
 const ledger={recoveredTargetRefs:[],recoveryRefs:[]};
 assert.throws(()=>recoverPhysicalLoot(ledger,{sourceRef:'recover.1',targetRef:'sl.1',monsterId:'sl_igris',stoneSurvived:true,searchProofRef:'search.sl.1'},
 {isConfirmedDefeat:()=>true,verifySearchProof:()=>true,getRecordedMaterialRoll:()=>0}),/NOT_DANMACHI/);
});
test('disjoint canonical spawn floors must not collapse to one giant range',()=>{
 const goblin=(floor)=>resolveMonsterFromCatalog({monsterId:'goblin',
  systemLevel:2,spawnMode:'natural',floor});
 assert.doesNotThrow(()=>goblin(1));
 assert.doesNotThrow(()=>goblin(4));
 assert.throws(()=>goblin(6),/FLOOR_INVALID/);
 assert.doesNotThrow(()=>goblin(8));
 assert.throws(()=>goblin(10),/FLOOR_INVALID/);
});
