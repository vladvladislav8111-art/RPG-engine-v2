const test = Deno.test;
import assert from 'node:assert/strict';
import {planNpcInnerMotivesV4, type NpcInnerMotivesInput} from '../src/npc_inner_motives_v4.ts';
import {planNpcInitiativeV4} from '../src/npc_initiative_v4.ts';
const vesha: NpcInnerMotivesInput={
 actorId:'npc.selarin.pool_2003',
 current:{'NPC ID':'npc.selarin.pool_2003','Identity anchors':'curious, honest bookseller',
  'Current goal/activity':'catalog actual new books and serve clients'},
 activityRule:{'State':'ACTIVE','Primary anchors':'open bookstall, existing buyers'},
 elapsedSeconds:300,
 verifiedCoPresentActorIds:['player.shura'],
 relationships:[{'Relationship ID':'relationship.vesha_shura','Actor ID':'npc.selarin.pool_2003',
 'Toward ID':'player.shura','Status':'ACTIVE','Warmth':'warm but bounded'}],
};
const observed={sourceRef:'TX.demo.public-new-info',kind:'NEW_INFORMATION' as const,
 witnessedByNpc:true,currentDecisionWindow:true,targetActorId:'player.shura'};
test('independent curiosity can emerge in a real scene without player utterance',()=>{
 const p=planNpcInnerMotivesV4({...vesha,stimuli:[observed]});
 const cur=p.motivations.find(m=>m.kind==='SEEK_UNDERSTANDING');
 assert(cur);
 assert.equal(cur.possibleExpression,'IN_PERSON_IF_CHOSEN');
 assert.equal(cur.emotionEstablished,false);
 assert.equal(p.committed,false);
});
test('another NPC can independently evoke concern: no Shura-centric hardwiring',()=>{
 const p=planNpcInnerMotivesV4({...vesha,verifiedCoPresentActorIds:['npc.shop.assistant'],
 stimuli:[{sourceRef:'TX.demo.injury',kind:'OBSERVED_DISTRESS',
 witnessedByNpc:true,currentDecisionWindow:true,targetActorId:'npc.shop.assistant'}]});
 const m=p.motivations.find(m=>m.kind==='OFFER_CONCERN');
 assert.equal(m?.targetActorId,'npc.shop.assistant');
 assert.equal(m?.priority,'BOUNDARY_OR_SAFETY');
 assert.equal(m?.possibleExpression,'IN_PERSON_IF_CHOSEN');
 assert.equal(m?.actionCommitted,false);
});
test('remote NPC can want to say something but not contact without actual channel and time',()=>{
 const s={sourceRef:'TX.demo.new-contact-reason',kind:'POSITIVE_SOCIAL_EVENT' as const,
 witnessedByNpc:true,currentDecisionWindow:true,targetActorId:'player.shura'};
 const remote=planNpcInnerMotivesV4({...vesha,verifiedCoPresentActorIds:[],stimuli:[s]});
 assert.equal(remote.motivations.find(m=>m.kind==='EXPRESS_CONNECTION')?.possibleExpression,'PRIVATE_ONLY');
 const channel=planNpcInnerMotivesV4({...vesha,verifiedCoPresentActorIds:[],
 verifiedContactActorIds:['player.shura'],discretionaryWindowConfirmed:true,stimuli:[s]});
 assert.equal(channel.motivations.find(m=>m.kind==='EXPRESS_CONNECTION')?.possibleExpression,
 'CONTACT_IF_CHANNEL_AND_TIME_CONFIRMED');
});
test('personal boundaries take precedence over shop work and conversation',()=>{
 const p=planNpcInnerMotivesV4({...vesha,stimuli:[{sourceRef:'TX.demo.pressure',
 kind:'BOUNDARY_PRESSURE',targetActorId:'player.shura',witnessedByNpc:true,currentDecisionWindow:true}]});
 assert.equal(p.motivations[0].kind,'DEFEND_BOUNDARIES');
 assert(p.motivations.some(m=>m.kind==='HONOR_OBLIGATION'));
});
test('old or unknown event cannot trigger a new desire',()=>{
 const p=planNpcInnerMotivesV4({...vesha,stimuli:[
 {sourceRef:'TX.demo.old',kind:'SOCIAL_FRICTION',targetActorId:'player.shura',witnessedByNpc:true,currentDecisionWindow:false},
 {sourceRef:'TX.demo.unknown',kind:'NEW_INFORMATION',witnessedByNpc:false,currentDecisionWindow:true},
 ]});
 assert(!p.motivations.some(m=>m.kind==='ADDRESS_TENSION'||m.kind==='SEEK_UNDERSTANDING'));
 assert.equal(p.invalidStimulusRefs.length,2);
});
test('a recorded stimulus cannot be reused as if it happened again',()=>{
 const p=planNpcInnerMotivesV4({...vesha,stimuli:[observed],consumedStimulusRefs:[observed.sourceRef]});
 assert(!p.motivations.some(m=>m.kind==='SEEK_UNDERSTANDING'));
});
test('zero game time and missing real current state cannot lead to new motives',()=>{
 const zero=planNpcInnerMotivesV4({...vesha,elapsedSeconds:0,stimuli:[observed]});
 assert.equal(zero.readyForDecision,false);
 assert.equal(zero.motivations.length,0);
 const missing=planNpcInnerMotivesV4({...vesha,current:null,stimuli:[observed]});
 assert.equal(missing.readyForDecision,false);
 assert.equal(missing.motivations.length,0);
});
test('initiative plan attaches causal inner motives but creates no autonomous commit',()=>{
 const p=planNpcInitiativeV4({actorId:vesha.actorId,current:vesha.current,
 activityRule:vesha.activityRule,elapsedSeconds:120,verifiedCoPresenceWithShura:true,
 observedStimuli:[observed]});
 assert(p.innerMotives.motivations.some(m=>m.kind==='SEEK_UNDERSTANDING'));
 assert.equal(p.committed,false);
 assert.equal(p.innerMotives.committed,false);
});
test('bounded motives batch never expands into unbounded NPC work',()=>{
 assert.throws(()=>planNpcInnerMotivesV4({...vesha,stimuli:Array.from({length:13},(_,k)=>({...observed,sourceRef:'new.'+k}))}),/BATCH_LIMIT/);
});
test('socially kind event is not a blanket licence for romance or touch',()=>{
 const p=planNpcInnerMotivesV4({...vesha,stimuli:[{
 sourceRef:'TX.demo.shared-public-positive',kind:'POSITIVE_SOCIAL_EVENT',
 witnessedByNpc:true,currentDecisionWindow:true,targetActorId:'player.shura'}]});
 const connection=p.motivations.find(m=>m.kind==='EXPRESS_CONNECTION');
 assert(connection);
 assert.equal(connection.emotionEstablished,false);
 assert.equal(p.noNewEmotionalFacts,true);
});
