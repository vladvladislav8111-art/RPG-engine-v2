import test from 'node:test';import assert from 'node:assert/strict';
import {startHiveQuest,applyHiveAction,applyVerifiedHiveAction} from '../../../src/rpg_lab_v1/quests_and_timeline.ts';
const world={verifyAntDefeat:()=>true,verifyQueenDefeat:()=>true,verifyNestDestroyed:()=>true};
test('Hive quest needs unique ants, queen and actual nest destruction',()=>{
 let q=startHiveQuest('hive.77',9,100,360);
 for(let i=0;i<30;i++)q=applyVerifiedHiveAction(q,{kind:'ant_defeated',monsterRef:`ant.${i}`,alarmConfirmed:i%2===0,floor:9,minute:101+i},world).quest;
 q=applyVerifiedHiveAction(q,{kind:'nest_destroyed',proofRef:'nest.1',floor:9,minute:140},world).quest;
 assert.equal(q.status,'active');
 q=applyVerifiedHiveAction(q,{kind:'queen_defeated',queenRef:'ant.queen.1',proofRef:'queen.1',floor:9,minute:141},world).quest;
 assert.equal(q.status,'completed');assert.equal(q.queenDefeatedRef,'ant.queen.1');
});
test('No caller-only evidence for queen, nest and ant victories',()=>{
 const q=startHiveQuest('hive.88',9,100,360);
 assert.throws(()=>applyVerifiedHiveAction(q,{kind:'ant_defeated',monsterRef:'fake.1',alarmConfirmed:false,floor:9,minute:101},
  {...world,verifyAntDefeat:()=>false}),/NOT_CONFIRMED/);
 assert.throws(()=>applyVerifiedHiveAction(q,{kind:'queen_defeated',queenRef:'queen.fake',proofRef:'fake.2',floor:9,minute:102},
  {...world,verifyQueenDefeat:()=>false}),/NOT_CONFIRMED/);
 assert.throws(()=>applyVerifiedHiveAction(q,{kind:'nest_destroyed',proofRef:'fake.3',floor:9,minute:103},
  {...world,verifyNestDestroyed:()=>false}),/NOT_CONFIRMED/);
 assert.equal(q.killedAnts.length,0);
});
