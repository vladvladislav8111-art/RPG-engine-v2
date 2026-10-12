const test = Deno.test; import assert from 'node:assert/strict';
import {reviewNpcRoutineCadence,parseNpcMinimumElapsedMinutes} from '../src/npc_cadence_review.ts';
const sparse={
 'NPC_CURRENT!A1:D500':[['NPC ID','Display','role','Importance'],['npc.selarin.pool_2003','Веша','bookseller','KEY'],['npc.local','Seller','','LOCAL']],
 'NPC_ACTIVITY_RULES!A1:C200':[['NPC ID','Display','State'],['npc.selarin.pool_2003','Веша','ACTIVE']],
 'NPC_ACTIVITY_RULES!G1:G200':[['Minimum elapsed'],['30 in-world minutes for routine offscreen advance']],
 'NPC_ACTIVITY_RULES!K1:K200':[['Last activity tick'],['Day67 17:21:00']],
};
test('a KEY NPC with actual 30-minute cadence enters optional life review',()=>{
 const p=reviewNpcRoutineCadence({worldDay:67,worldTime:'17:21:00',elapsedSeconds:1800,sparse});
 assert.equal(p.eligibleCount,1);assert.equal(p.eligible[0].actorId,'npc.selarin.pool_2003');
 assert.equal(p.committed,false);assert.equal(p.consequencesGuaranteed,false);
});
test('no imagined offscreen events during meta or before minimum',()=>{
 const p=reviewNpcRoutineCadence({worldDay:67,worldTime:'17:21:00',elapsedSeconds:0,sparse});
 assert.equal(p.eligibleCount,0);
});
test('incomplete schedule is a source blocker, not an auto-advance',()=>{
 const broken={...sparse,'NPC_ACTIVITY_RULES!G1:G200':[['Minimum elapsed'],['unknown']]};
 const p=reviewNpcRoutineCadence({worldDay:67,worldTime:'17:21:00',elapsedSeconds:3600,sparse:broken});
 assert.equal(p.eligibleCount,0);assert.equal(p.sourceIncompleteCount,1);
});
test('cadence rule parser accepts two canonical human-readable forms',()=>{
 assert.equal(parseNpcMinimumElapsedMinutes('>= 30m'),30);
 assert.equal(parseNpcMinimumElapsedMinutes('30 in-world minutes for routine'),30);
 assert.equal(parseNpcMinimumElapsedMinutes('no schedule'),null);
});
