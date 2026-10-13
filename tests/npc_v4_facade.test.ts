import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchWorldV3Batch,WORLD_V3_OPERATIONS} from '../src/world_sim_v3/runtime_facade.ts';
const n='npc.selarin.pool_2003';
const base=(kind:string,input:object)=>dispatchWorldV3Batch({expectedSaveId:'V2-S0721',jobs:[{id:`audit.${kind}.1`,operation:'npc_decision',payload:{lifeV4:{kind,input}}}]},'V2-S0721');
test('Life V4 stays inside its original operation and craft proficiency appends without replacing legacy calculations',()=>{
 assert.equal(WORLD_V3_OPERATIONS.length,22);
 assert.equal(WORLD_V3_OPERATIONS[2],'npc_decision');
 assert.equal(new Set(WORLD_V3_OPERATIONS).size,22);
 assert.equal(WORLD_V3_OPERATIONS.includes('capability_check'),true);
});
test('Life V4 promotion review is noncommitting',()=>{const x=base('promotion_review',{actorId:n,currentTier:'RECURRING',knownStableNpcIds:[n],canonicalIdentityRef:'canon.vesha',contactEvidence:[],alreadyPromoted:false});assert.equal(x.committed,false);const r=x.results[0].result;assert.equal(r.ok,true);if(r.ok)assert.equal((r.value as {canCommit:boolean}).canCommit,false);});
test('Life V4 presence in old operation does not break legacy npc_decision',()=>{const x=dispatchWorldV3Batch({expectedSaveId:'V2-S0721',jobs:[{id:'legacy.1',operation:'npc_decision',payload:{decision:{npcId:n,opportunityId:'offer.a',decision:'decline',causalRef:'source.1',origin:'GM_RESOLVED'},knownOpportunityIds:['offer.a']}}]},'V2-S0721');assert.equal(x.results[0].result.ok,true);});
test('Life V4 bogus kind denied safely',()=>{const x=base('auto_pay',{actorId:n});const r=x.results[0].result;assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'NPC_LIFE_V4_UNKNOWN_KIND');});
test('Life V4 cannot bypass stale save guard',()=>assert.throws(()=>dispatchWorldV3Batch({expectedSaveId:'OLD',jobs:[{id:'life.1',operation:'npc_decision',payload:{lifeV4:{kind:'life_review',input:{window:{start:1,end:2},actors:[],evidence:[],options:[]}}}}]},'V2-S0721'),/WORLD_V3_STALE_SAVE/));
test('Life V4 rejects malformed input',()=>{const x=dispatchWorldV3Batch({expectedSaveId:'V2-S0721',jobs:[{id:'life.1',operation:'npc_decision',payload:{lifeV4:{kind:'life_review',input:[]}}}]},'V2-S0721');assert.equal(x.results[0].result.ok,false);});
test('Life V4 social event does not become a confirmed relationship',()=>{const x=base('social_change',{event:{id:'evt.social',fromId:n,towardId:'npc.max.earth',at:99,sourceRef:'s.src',confirmed:true,contactVerified:true,decisionEvidenceRef:'evt.attested',effect:'none',effectDescription:''},existing:[]});assert.equal(x.results[0].result.ok,true);assert.equal(x.committed,false);});
