import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {dispatchWorldV3Batch,WORLD_V3_OPERATIONS,type WorldV3Job} from '../src/world_sim_v3/runtime_facade.ts';
import {ACHIEVEMENTS_V3,TITLES_V3} from '../src/world_sim_v3/achievement_catalog.ts';
const save='V2-S0721';
const one=(operation:WorldV3Job['operation'],payload:Record<string,unknown>)=>dispatchWorldV3Batch({expectedSaveId:save,jobs:[{id:'calc.1',operation,payload}]},save).results[0].result;
test('all supported domains are routable through a one-request, immutable calculation facade',()=>{
 assert(WORLD_V3_OPERATIONS.length>=22);
 assert.equal(new Set(WORLD_V3_OPERATIONS).size,WORLD_V3_OPERATIONS.length);
 assert.equal(WORLD_V3_OPERATIONS.includes('capability_check'),true);
 const q=dispatchWorldV3Batch({expectedSaveId:save,jobs:[
  {id:'npc',operation:'npc_presence',payload:{npcId:'npc.test.person',at:100,shifts:[],commitments:[]}},
  {id:'combat',operation:'combat',payload:{distanceCm:300,reachCm:100,lineOfEffect:true,staminaNow:9,staminaCost:1,attackForce:5,armorAbsorption:1,targetExposed:true,uncertain:true}},
  {id:'route',operation:'travel',payload:{start:'loc.a',routeIds:['edge.a'],edges:[{id:'edge.a',from:'loc.a',to:'loc.b',distanceMeters:100,terrain:'road',open:true,feeCopper:0}],speedMetersPerMinute:10,loadMultiplier:1,weatherMultiplier:1,knownCopper:2}},
  {id:'offer',operation:'offer_board',payload:{demands:[],seed:'seed.test',now:100}},
  {id:'archive',operation:'world_review',payload:{window:{start:10,end:20},processes:[],opportunities:[],evidenceIds:[]}},
  {id:'stock',operation:'inventory_transfer',payload:{lots:[],req:{lotId:'lot.a',quantity:1,fromCustodian:'npc.a',toCustodian:'npc.b',destination:'loc.b',causeRef:'contract.a'}}},
  {id:'title_effect',operation:'title_effects',payload:{ownedTitleIds:TITLES_V3.map(t=>t.id),activatedTitleIds:TITLES_V3.map(t=>t.id),trigger:TITLES_V3[0].effect.trigger}},
  {id:'craft',operation:'workshop_capacity',payload:{staffMinutes:40,slots:[{orderId:'order.a',acceptedAt:10,neededMinutes:80,priorityClass:'contracted'}]}},
 ]},save);
 assert.equal(q.results.length,8);assert.equal(q.committed,false);assert.equal(q.requiresSemanticCommit,true);assert.equal(q.sourceAttested,false);
 assert.deepEqual(q.catalog,{achievements:90,titles:27});
 assert.deepEqual(q.results.map(x=>x.result.ok),[true,false,true,true,true,false,true,true]);
 assert.deepEqual((q.results[6].result as {value:unknown[]}).value,[]);
 assert.equal(JSON.stringify(q).includes('committed":true'),false);
});
test('every candidate achievement and title remains inactive despite client-provided activation claim',()=>{
 for(const d of ACHIEVEMENTS_V3){const r=one('achievement',{definitionId:d.id,subjectId:'actor.shura',subjectType:'SYSTEM_USER',gmAuthorizationRef:'gm.fake',evidence:[],alreadyEarnedIds:[],existingAwardOrigins:[],canonActivatedIds:[d.id]});assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'CATALOG_DRAFT');}
 for(const d of TITLES_V3){const r=one('title',{definitionId:d.id,subjectId:'actor.shura',gmAuthorizationRef:'gm.fake',evidence:[],alreadyHeld:[],earnedAchievementIds:d.prerequisiteAchievementIds,activatedTitleIds:[d.id]});assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'TITLE_DRAFT');}
 const objective=one('objective_reward',{objectiveId:'objective.test',subjectId:'actor.shura',playerAccepted:true,canonActiveIds:['objective.test'],alreadyRewardedIds:[],completionEvidence:[],gmAuthorizationRef:'gm.fake',sup:3});assert.equal(objective.ok,false);
});
test('protect against stale save, unknown operations, repeated IDs and oversized batches',()=>{
 const ok={expectedSaveId:save,jobs:[{id:'x',operation:'npc_presence' as const,payload:{npcId:'npc.a',at:0,shifts:[],commitments:[]}}]};
 assert.throws(()=>dispatchWorldV3Batch(ok,'V2-S9999'),/STALE_SAVE/);
 assert.throws(()=>dispatchWorldV3Batch({...ok,jobs:Array(13).fill(ok.jobs[0])},save),/BATCH_BOUNDS/);
 assert.throws(()=>dispatchWorldV3Batch({...ok,jobs:[ok.jobs[0],ok.jobs[0]]},save),/INVALID_JOB/);
 assert.throws(()=>dispatchWorldV3Batch({...ok,jobs:[{...ok.jobs[0],operation:'rng_mint_coins' as WorldV3Job['operation']}]},save),/INVALID_JOB/);
});
test('deny oversized data, corrupt Set encoding and unknown object values before engine invocation',()=>{
 assert.throws(()=>one('travel',{start:'loc.a',routeIds:[],edges:[],speedMetersPerMinute:1,loadMultiplier:1,weatherMultiplier:1,knownCopper:1,unsafe:'x'.repeat(5000)}),/STRING_TOO_LARGE/);
 const s=one('world_review',{window:{start:1,end:2},processes:[],opportunities:[],evidenceIds:{evil:true}});assert.equal(s.ok,false);
 const t=one('craft_advance',{order:{},holidays:'pretendSet'});assert.equal(t.ok,false);
});
test('explicit player SUP purchase is only a NONCOMMITTED calculation and cannot spend unsupported balance',()=>{
 const denied=one('sup_purchase',{subjectId:'actor.shura',offerId:'system.test',priceSUP:2,playerChoiceRef:'',availableSUP:0,alreadyPurchasedNonrepeatable:false});assert.equal(denied.ok,false);
 const allowed=one('sup_purchase',{subjectId:'actor.shura',offerId:'system.test',priceSUP:2,playerChoiceRef:'player.actual.choice',availableSUP:5,alreadyPurchasedNonrepeatable:false});assert.equal(allowed.ok,true);if(allowed.ok){assert.equal((allowed.value as {committed:boolean}).committed,false);assert.equal((allowed.value as {supDelta:number}).supDelta,-2);}
});
test('source-backed offer cannot fabricate unpaid NPC work',()=>{
 const r=one('generate_offer',{demand:{id:'demand.test',issuerId:'npc.employer',locationId:'loc.a',locationTag:'workshop',kind:'paid_order',templateIds:['offer.tools.repair'],postedAt:0,deadline:20,remainingSlots:1,fundedCopper:0,escrowId:null,physicalSources:[],sourceRef:'proof.test',systemRewardAuthorized:false},seed:'test',now:2});assert.equal(r.ok,false);
});
