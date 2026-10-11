import assert from 'node:assert/strict';
const test = Deno.test;
import {planAttentionReadBudget} from '../src/npc_attention_load_router.ts';
const base={saveId:'V2-S1000',sceneActorIds:['npc.a','npc.b','npc.c','npc.d'],
 snapshots:[{actorId:'npc.a',activeTier:1,importance:'LOCAL',sourceSaveId:'V2-S1000'},
 {actorId:'npc.b',activeTier:4,importance:'RECURRING',sourceSaveId:'V2-S1000'},
 {actorId:'npc.c',activeTier:3,importance:'RECURRING',sourceSaveId:'OLD'}]};
test('scene bystanders use graduated load; stale tier is never trusted',()=>{
 const p=planAttentionReadBudget(base);
 assert.deepEqual(p.reads.map(x=>x.readDepth),['SHELL','HISTORY','SHELL','SHELL']);
});
test('direct NPC interaction bypasses heat and incidental budget',()=>{
 const p=planAttentionReadBudget({...base,explicitlyRequestedActorIds:['npc.d'],maxIncidentalActors:1});
 assert.equal(p.reads.find(x=>x.actorId==='npc.d')?.readDepth,'FULL');
 assert.equal(p.criticalActorsNeverDropped,true);
 assert.ok(p.deferredIncidentalActorIds.length>0);
});
test('source-approved KEY scheduled offscene receives full load without scene leak',()=>{
 const p=planAttentionReadBudget({...base,sceneActorIds:[],dueKeyLifeReviewIds:['npc.vesha'],
 snapshots:[{actorId:'npc.vesha',importance:'KEY',activeTier:5,sourceSaveId:'V2-S1000'}]});
 assert.deepEqual(p.reads.map(x=>x.readDepth),['FULL']);
});
test('many cold actors cannot cause unbounded full-memory reads',()=>{
 const p=planAttentionReadBudget({saveId:'S',sceneActorIds:Array.from({length:500},(_,i)=>'npc.'+i),snapshots:[],maxIncidentalActors:6});
 assert.equal(p.incidentalActorsLoaded,6);
 assert.equal(p.deferredIncidentalActorIds.length,494);
 assert.ok(p.reads.every(x=>x.readDepth==='SHELL'));
});
test('KEY in scene loads fully even without player request',()=>{
 const p=planAttentionReadBudget({...base,sceneActorIds:['npc.vesha'],snapshots:[
 {actorId:'npc.vesha',importance:'KEY',activeTier:5,sourceSaveId:'V2-S1000'}],maxIncidentalActors:0});
 assert.equal(p.reads[0].readDepth,'FULL');
});

test('unfamiliar attackers and witnesses are never dropped merely because they are cold',()=>{
 const p=planAttentionReadBudget({...base,causallyRelevantActorIds:['npc.c'],maxIncidentalActors:0});
 assert.equal(p.reads.find(x=>x.actorId==='npc.c')?.readDepth,'FULL');
 assert.equal(p.reads.find(x=>x.actorId==='npc.c')?.forced,true);
});
