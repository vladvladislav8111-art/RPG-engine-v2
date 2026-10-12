const test = Deno.test;
import assert from 'node:assert/strict';
import {planNpcInitiativeV4} from '../src/npc_initiative_v4.ts';
const vesha={
 actorId:'npc.selarin.pool_2003',
 current:{'Importance':'KEY','Role':'bookseller/reference broker','Identity anchors':'fast, curious; cares about source marks','Current goal/activity':'Real catalog and customer duties'},
 activityRule:{'State':'ACTIVE','Primary anchors':'Independent Copy Market shop','Fixed obligations override':'YES: customers and duties first'},
 relationshipToShura:{'Actor ID':'npc.selarin.pool_2003','Toward ID':'player.shura','Status':'ACTIVE','Warmth':'Distinct growing warm personal attachment with boundaries','Current stance':'Warm, playful, independent; can refuse','Evidence refs':'T0647;T0717'},
 socialMemories:[{'Status':'ACTIVE','Participants':'player.shura;npc.selarin.pool_2003','Origin event':'T0774','Emotional tone':'warm but bounded'}],
 elapsedSeconds:60, verifiedCoPresenceWithShura:false,
};
test('same-room KEY NPC can start talking or express warmth unprompted',()=>{
 const p=planNpcInitiativeV4({...vesha,verifiedCoPresenceWithShura:true});
 assert.equal(p.spontaneousSpeechDoesNotNeedPlayerPrompt,true);
 assert(p.candidates.some(c=>c.type==='SPEAK_FIRST'));
 assert(p.candidates.some(c=>c.type==='EXPRESS_PERSONAL_STANCE'));
 assert(p.candidates.some(c=>c.type==='SET_BOUNDARY'));
 assert.equal(p.romanceOrPhysicalConsentInferred,false);
 assert.equal(p.committed,false);
});
test('different district: do not teleport or send a message without existing contact',()=>{
 const p=planNpcInitiativeV4(vesha);
 assert(!p.candidates.some(c=>c.type==='SPEAK_FIRST' || c.type==='OUTREACH'));
 assert(p.candidates.some(c=>c.type==='ACT_ON_OWN_GOAL'));
 assert(p.candidates.some(c=>c.type==='PRIORITIZE_OWN_DUTY'));
});
test('confirmed consented channel and discretionary time permit merely considering outreach',()=>{
 const p=planNpcInitiativeV4({...vesha,verifiedLiveCommunicationChannel:true,discretionaryWindowConfirmed:true});
 assert(p.candidates.some(c=>c.type==='OUTREACH'));
 assert.equal(p.socialContactGuaranteed,false);
});
test('time, identity and source obligations are valid gates',()=>{
 assert.throws(()=>planNpcInitiativeV4({...vesha,elapsedSeconds:-3}),/INVALID_INPUT/);
 const empty=planNpcInitiativeV4({...vesha,current:null});
 assert.equal(empty.readyForGMResolution,false);assert.equal(empty.candidates.length,0);
 const stale=planNpcInitiativeV4({...vesha,activityRule:null});
 assert.equal(stale.readyForGMResolution,false);
});
test('independent emotion needs relationship evidence rather than assumed attraction',()=>{
 const p=planNpcInitiativeV4({...vesha,verifiedCoPresenceWithShura:true,relationshipToShura:null,socialMemories:[]});
 assert(p.candidates.some(c=>c.type==='SPEAK_FIRST'));
 assert(!p.candidates.some(c=>c.type==='EXPRESS_PERSONAL_STANCE'));
});
test('source dedupe prevents repeating the same prompt from stale social events',()=>{
 const p=planNpcInitiativeV4({...vesha,verifiedCoPresenceWithShura:true,alreadyInitiatedSourceRefs:['T0647','T0717','T0774']});
 assert(!p.candidates.some(c=>c.type==='EXPRESS_PERSONAL_STANCE'));
});
test('outreach must not bypass existing shop duties even when channel exists',()=>{
 const p=planNpcInitiativeV4({...vesha,verifiedLiveCommunicationChannel:true,discretionaryWindowConfirmed:false});
 assert(!p.candidates.some(c=>c.type==='OUTREACH'));
});

test('another actor or reversed relationship cannot supply initiative evidence',()=>{
 const wrong=planNpcInitiativeV4({...vesha,current:{...vesha.current,'NPC ID':'npc.other'},verifiedCoPresenceWithShura:true});
 assert.equal(wrong.readyForGMResolution,false);
 assert.deepEqual(wrong.candidates,[]);
 const reversed=planNpcInitiativeV4({...vesha,verifiedCoPresenceWithShura:true,socialMemories:[],
 relationshipToShura:{'Actor ID':'player.shura','Toward ID':vesha.actorId,'Status':'ACTIVE','Warmth':'warm','Evidence refs':'tx.other'}});
 assert.equal(reversed.citedPersonalHistoryCount,0);
 assert(!reversed.candidates.some(c=>c.type==='EXPRESS_PERSONAL_STANCE'));
});
