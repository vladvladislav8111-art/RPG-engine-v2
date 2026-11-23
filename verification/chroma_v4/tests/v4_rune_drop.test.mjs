import test from 'node:test';import assert from 'node:assert/strict';
import {v4RuneReceipt} from '../../../src/rpg_lab_v1/v4_rune_drop.ts';
import {getV4MonsterCard} from '../../../src/rpg_lab_v1/live_monster_profile.ts';
test('Only designated monster species may grant a skill rune',()=>{
 assert.equal(v4RuneReceipt({monsterId:'goblin',targetRef:'gob.1',sourceRef:'proof.1'}),null);
 assert.ok(v4RuneReceipt({monsterId:'blue_papilio',targetRef:'pap.1',sourceRef:'proof.2'}));
 assert.throws(()=>v4RuneReceipt({monsterId:'invented',targetRef:'fake.1',sourceRef:'proof.3'}),/NOT_REGISTERED/);
});
test('Fixed roll is repeatable and player cannot inject odds or skill ID',()=>{
 const r={monsterId:'war_shadow',targetRef:'war.55',sourceRef:'kill.war.55'};
 assert.deepEqual(v4RuneReceipt(r),v4RuneReceipt(r));
 const proof=v4RuneReceipt(r);
 assert.ok(proof.rollTenThousand>=0&&proof.rollTenThousand<10000);
 assert.equal(proof.chanceBasisPoints,Math.round(getV4MonsterCard('war_shadow').rune.percent*100));
});
test('Rune roll supports fractional percent, no integer-percent rounding',()=>{
 let successes=0;
 for(let n=0;n<5000;n++) successes+=+(v4RuneReceipt({monsterId:'war_shadow',targetRef:`war.${n}`,sourceRef:`kill.war.${n}`}).success);
 assert.ok(successes>0&&successes<5000);
});
