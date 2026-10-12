const test = Deno.test;
import assert from 'node:assert/strict';
import {buildTurnTriage} from '../src/turn_triage.ts';
const base = () => ({
  turnClass:'NORMAL',tags:[],memory:{depth:'FAST' as const,missingSources:[] as string[]},
  worldPlan:null,actorContextRequired:false,actorContextReady:true,pendingChoices:[] as Record<string,unknown>[],
});
test('simple meta prompt costs no time and does no autonomous work',()=>{
 const r=buildTurnTriage(base());
 assert.equal(r.gameplayCommitted,false);assert.equal(r.timeAdvancedSeconds,0);
 assert.equal(r.extraGoogleReads,0);assert.equal(r.taskCodes.length,0);
});
test('source-bound NPC and world reviews do not promise outcome',()=>{
 const r=buildTurnTriage({...base(),memory:{depth:'TARGETED_DEEP',missingSources:['lookup.history']},
   actorContextRequired:true,actorContextReady:false,
   worldPlan:{elapsedSeconds:3600,keyNpcDueCount:2,processDueCount:1,truncated:true}});
 assert(r.blockers.includes('NPC_CONTEXT_GATE_BLOCKED'));
 assert(r.blockers.includes('WORLD_PLAN_TRUNCATED'));
 assert(r.taskCodes.includes('RESOLVE_KEY_NPC_LIFEV4'));
 assert(r.taskCodes.includes('RESOLVE_WORLD_PROCESSES'));
 assert.equal(r.suggestPrepare,true);
});
test('uncanonical choice is for GM repair not selectable by Shura',()=>{
 const r=buildTurnTriage({...base(),pendingChoices:[{ 'Choice ID':'choice.1',Status:'AWAITING_CHOICE','Options JSON':'[]'}]});
 assert.equal(r.pendingChoices[0].state,'NEEDS_CANONICAL_OPTIONS');
 assert(r.tasks.every(x=>x.kind!=='PLAYER_CHOICE'));
});
test('only attested active canonical options permit asking player',()=>{
 const opts=[{id:'milestone.a',name:'Real adaptation',type:'PASSIVE',trigger:'Real trigger',effect:'Real effect text',limits:'Real limits text',scalingState:'v1',sourceRef:'canon.fact.1',canonStatus:'CANON_ACTIVE'},
 {id:'milestone.b',name:'Real technique',type:'ACTIVE',trigger:'Another trigger',effect:'Another effect text',limits:'Another limit text',scalingState:'v1',sourceRef:'canon.fact.2',canonStatus:'CANON_ACTIVE'}];
 const r=buildTurnTriage({...base(),pendingChoices:[{ 'Choice ID':'choice.1',Status:'AWAITING_CHOICE','Options JSON':JSON.stringify(opts)}]});
 assert.equal(r.pendingChoices[0].state,'READY_FOR_PLAYER');
 assert(r.tasks.some(x=>x.kind==='PLAYER_CHOICE'));
});

test('duplicate option IDs, missing effects or unapproved status must NOT become player choices',()=>{
 const valid=(id:string)=>({id,name:'Verified ability',type:'PASSIVE',trigger:'Known threshold',effect:'Source proved effect',limits:'Source proves limits',scalingState:'v1',sourceRef:'canon.entry.1',canonStatus:'CANON_ACTIVE'});
 const options=[valid('milestone.same'), valid('milestone.same')];
 const r=buildTurnTriage({...base(),pendingChoices:[{'Choice ID':'choice.dupe',Status:'AWAITING_CHOICE','Options JSON':JSON.stringify(options)}]});
 assert.equal(r.pendingChoices[0].state,'NEEDS_CANONICAL_OPTIONS');
 assert(r.tasks.every(t=>t.kind!=='PLAYER_CHOICE'));
 const missing=buildTurnTriage({...base(),pendingChoices:[{'Choice ID':'choice.missing',Status:'AWAITING_CHOICE','Options JSON':JSON.stringify([valid('milestone.one'),{...valid('milestone.two'),effect:''}])}]});
 assert.equal(missing.pendingChoices[0].state,'NEEDS_CANONICAL_OPTIONS');
});
test('GM instructions are de-duplicated even with several pending choices',()=>{
 const r=buildTurnTriage({...base(),pendingChoices:[
  {'Choice ID':'choice.old1',Status:'PENDING_GENERATION','Options JSON':'[]'},
  {'Choice ID':'choice.old2',Status:'PENDING_GENERATION','Options JSON':'[]'},
 ]});
 assert.equal(r.pendingChoices.length,2);
 assert.equal(r.tasks.filter(t=>t.code==='LOAD_CANONICAL_CHOICES').length,1);
});

test('duplicate live choice row disables player selection, even if options look valid',()=>{
 const opt=(id:string)=>({id,name:'Real technique',type:'PASSIVE',trigger:'Real trigger',effect:'Real effect text',limits:'Real limits text',scalingState:'v1',sourceRef:'canon.fact.1',canonStatus:'CANON_ACTIVE'});
 const one={'Choice ID':'choice.same',Status:'AWAITING_CHOICE','Options JSON':JSON.stringify([opt('milestone.a'),opt('milestone.b')])};
 const r=buildTurnTriage({...base(),pendingChoices:[one,{...one}]});
 assert.equal(r.pendingChoices.length,1);
 assert.equal(r.pendingChoices[0].state,'NEEDS_CANONICAL_OPTIONS');
 assert(r.blockers.includes('DUPLICATE_LIVE_MILESTONE_CHOICES'));
 assert(r.tasks.every(t=>t.kind!=='PLAYER_CHOICE'));
});

test('time advance with independent KEY NPC or world clock recommends prepare instead of a risky direct commit',()=>{
 const world={elapsedSeconds:1800,keyNpcDueCount:1,processDueCount:0,truncated:false};
 const r=buildTurnTriage({...base(),worldPlan:world});
 assert.equal(r.suggestPrepare,true);
 assert(r.taskCodes.includes('RESOLVE_KEY_NPC_LIFEV4'));
 assert.equal(r.gameplayCommitted,false);
});

test('routine LifeV4 review is GM work without forced contact or automatic event',()=>{
 const result=buildTurnTriage({
  turnClass:'NORMAL',tags:['WORLD'],memory:{depth:'FAST',missingSources:[]},
  worldPlan:{elapsedSeconds:1800,keyNpcDueCount:0,processDueCount:0,truncated:false},
  npcRoutineCadence:{eligibleCount:1,truncated:false},
  actorContextRequired:false,actorContextReady:true,pendingChoices:[],
 });
 assert(result.taskCodes.includes('REVIEW_ROUTINE_KEY_NPC_INITIATIVE'));
 assert.equal(result.gameplayCommitted,false);
});
