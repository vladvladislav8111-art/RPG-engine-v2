import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewNpcPragmaticsV1} from '../src/npc_pragmatics_v1.ts';
import {reviewNpcPersonalityContinuityV1} from '../src/npc_personality_continuity_v1.ts';
const social={
 actorId:'npc.loki', speakerId:'player.test',utteranceRef:'tx.scene.100',perceivedByNpc:true,
 languageComprehension:'UNDERSTOOD' as const,contextSourceRefs:['canon.loki.1'],
 candidateReadings:[{id:'reading.1',kind:'DOUBLE_MEANING' as const,evidenceRef:'tx.scene.100',requiresSharedKnowledge:false,requiresLexicalComprehension:true}],
};
const change={
 actorId:'npc.bete',baselineCanonRef:'canon.bete.v1',previousPattern:'Avoids showing trust',
 proposedPattern:'Privately trusts proven teammate',scope:'STABLE_PERSONALITY' as const,
 causalExplanation:'Two independently experienced rescues across different days challenged his original distrust.',
 observedBehaviorRef:'tx.bete.12',evidence:[
 {id:'evt.1',sourceRef:'tx.bete.1',inWorldDay:1,personallyExperiencedOrKnown:true,significance:'meaningful' as const},
 {id:'evt.2',sourceRef:'tx.bete.9',inWorldDay:9,personallyExperiencedOrKnown:true,significance:'meaningful' as const},
 ],
};
test('teasing and double meaning are possible, never certified understanding',()=>{
 const r=reviewNpcPragmaticsV1(social);assert.equal(r.ok,true);
 if(!r.ok)return;assert.equal(r.candidateReadings[0].status,'CANDIDATE_FOR_GM');
 assert.equal(r.npcUnderstoodJoke,false);assert.equal(r.committed,false);
});
test('unknown language blocks verbal interpretation but not tone',()=>{
 const r=reviewNpcPragmaticsV1({...social,languageComprehension:'NOT_UNDERSTOOD',candidateReadings:[...social.candidateReadings,{id:'reading.2',kind:'HUMOROUS_TONE',evidenceRef:'tx.scene.100',requiresSharedKnowledge:false,requiresLexicalComprehension:false}]});
 assert.equal(r.ok,true);if(!r.ok)return;
 assert.equal(r.candidateReadings[0].status,'BLOCKED');
 assert.equal(r.candidateReadings[1].status,'CANDIDATE_FOR_GM');
});
test('external joke cannot be recognized without actual knowledge',()=>{
 const r=reviewNpcPragmaticsV1({...social,candidateReadings:[{id:'reading.3',kind:'CULTURAL_REFERENCE',evidenceRef:'tx.scene.100',requiresSharedKnowledge:true,requiresLexicalComprehension:true}]});
 assert.equal(r.ok,true);if(!r.ok)return;assert.equal(r.candidateReadings[0].status,'BLOCKED');
});
test('unheard speech cannot trigger social responses',()=>{
 const r=reviewNpcPragmaticsV1({...social,perceivedByNpc:false});
 assert.equal(r.ok,true);if(!r.ok)return;assert.deepEqual(r.candidateResponses,['NO_RESPONSE_NO_PERCEPTION']);
});
test('duplicate reading identifiers are rejected',()=>{
 const r=reviewNpcPragmaticsV1({...social,candidateReadings:[...social.candidateReadings,...social.candidateReadings]});
 assert.equal(r.ok,false);
});
test('deep change with two meaningful events is reviewable, not canon',()=>{
 const r=reviewNpcPersonalityContinuityV1(change);assert.equal(r.ok,true);
 if(!r.ok)return;assert.equal(r.eligibleForHumanReview,true);assert.equal(r.canonRewriteAuthorized,false);
});
test('a routine compliment cannot rewrite personality',()=>{
 const r=reviewNpcPersonalityContinuityV1({...change,evidence:[{...change.evidence[0],significance:'routine' as const}]});
 assert.equal(r.ok,true);if(!r.ok)return;assert.equal(r.eligibleForHumanReview,false);
});
test('two events from same day are insufficient for deep durable change',()=>{
 const r=reviewNpcPersonalityContinuityV1({...change,evidence:[change.evidence[0],{...change.evidence[1],inWorldDay:1}]});
 assert.equal(r.ok,true);if(!r.ok)return;assert.equal(r.eligibleForHumanReview,false);
});
test('landmark can justify early review but not automatic rewrite',()=>{
 const r=reviewNpcPersonalityContinuityV1({...change,evidence:[{...change.evidence[0],significance:'landmark'}]});
 assert.equal(r.ok,true);if(!r.ok)return;assert.equal(r.eligibleForHumanReview,true);assert.equal(r.canonRewriteAuthorized,false);
});
test('unaware actor cannot acquire personality-change evidence',()=>{
 const r=reviewNpcPersonalityContinuityV1({...change,evidence:change.evidence.map(e=>({...e,personallyExperiencedOrKnown:false}))});
 assert.equal(r.ok,true);if(!r.ok)return;assert.equal(r.eligibleForHumanReview,false);
});
