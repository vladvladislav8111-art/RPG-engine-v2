import test from 'node:test';
import assert from 'node:assert/strict';
import {readCombatCondition,applyConfirmedImpacts,advanceEnemyStatuses,paralysisCounterPenalty} from '../../../src/rpg_lab_v1/chroma_live_combat_status.ts';
const make=(physiology='ordinary')=>readCombatCondition({enemyHp:1000,enemyMaxHp:1000,physiology});
const strike=(weaponId,physicalDamage,location='right_arm')=>({weaponId,physicalDamage,location,attackLanded:true,penetrated:true});
test('Two independent hits carry independent damage, Kasaka status only on its blade',()=>{
 const hit=applyConfirmedImpacts(make('large'),[strike('kasaka_fang',100),strike('steel_dagger',50,'left_leg')]);
 assert.equal(hit.target.hp,850);
 assert.equal(hit.kasakaWoundsAdded,1);
 assert.equal(hit.target.paralyzedLocations.length,1);
 assert.equal(paralysisCounterPenalty(hit.target),20);
});
test('Boss can bleed, multiple wounds stack and tick into lethal damage',()=>{
 const left=applyConfirmedImpacts(make('large'),[strike('kasaka_fang',10,'left_leg')]);
 const both=applyConfirmedImpacts(left.target,[strike('kasaka_fang',10,'right_arm')]);
 assert.equal(both.target.bleedingWounds.length,2);
 const tick=advanceEnemyStatuses(both.target,2);
 assert.equal(tick.hp,940);
 assert.equal(tick.bleedingWounds[0].secondsRemaining,8);
});
test('Small ordinary enemy paralysis suppresses retaliation temporarily',()=>{
 const hit=applyConfirmedImpacts(make(),[strike('kasaka_fang',20)]);
 assert.equal(hit.target.paralyzedLocations[0].location,'whole_body');
 assert.equal(paralysisCounterPenalty(hit.target),100);
 const expired=advanceEnemyStatuses(hit.target,3);
 assert.equal(paralysisCounterPenalty(expired),0);
});
test('A vital hit without journal-backed evidence never instantly kills',()=>{
 const hit=applyConfirmedImpacts(make(),[{...strike('steel_dagger',1,'head'),weakPoint:'brain'}]);
 assert.equal(hit.target.hp,999);assert.equal(hit.vitalKill,false);
 const confirmed=applyConfirmedImpacts(make(),[{...strike('steel_dagger',1,'head'),weakPoint:'brain',confirmedVitalEvidence:true}]);
 assert.equal(confirmed.target.hp,0);assert.equal(confirmed.vitalKill,true);
});
test('Misses and blocked hits do not apply poisons, wounds or damage',()=>{
 const misses=applyConfirmedImpacts(make(),[{...strike('kasaka_fang',400),attackLanded:false},{...strike('kasaka_fang',400),penetrated:false}]);
 assert.equal(misses.target.hp,1000);assert.equal(misses.target.bleedingWounds.length,0);
});
test('Status and tick validation fail closed',()=>{
 assert.throws(()=>readCombatCondition({enemyHp:1100,enemyMaxHp:1000,physiology:'large'}),/HEALTH/);
 assert.throws(()=>advanceEnemyStatuses(make(),120),/TICK_INVALID/);
 assert.throws(()=>applyConfirmedImpacts(make(),[strike('kasaka_fang',10),strike('kasaka_fang',10),strike('kasaka_fang',10)]),/MAX_TWO/);
});

test('Fractional percent bleeding produces durable integer HP for the next exchange',()=>{
 const small=readCombatCondition({enemyHp:165,enemyMaxHp:165,physiology:'ordinary'});
 const hit=applyConfirmedImpacts(small,[strike('kasaka_fang',10)]);
 const tick=advanceEnemyStatuses(hit.target,1);
 assert.ok(Number.isSafeInteger(tick.hp));
 assert.doesNotThrow(()=>readCombatCondition({enemyHp:tick.hp,enemyMaxHp:165,physiology:'ordinary',status:tick}));
});

test('Destroying an evidenced DanMachi magic stone is lethal, but System foes do not acquire fake stones',()=>{
 const regular=readCombatCondition({enemyHp:1000,enemyMaxHp:1000,physiology:'large',hasMagicStone:true});
 const proof={...strike('steel_dagger',1,'core'),weakPoint:'magic_stone',confirmedVitalEvidence:true};
 assert.equal(applyConfirmedImpacts(regular,[proof]).target.hp,0);
 assert.equal(applyConfirmedImpacts(make('large'),[proof]).target.hp,999);
});
