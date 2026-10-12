import assert from 'node:assert/strict';
const test = Deno.test;
import {planNpcContextHeat, type CommittedNpcAttentionEvent} from '../src/npc_attention_ladder.ts';
const base = {actorId:'npc.example',importance:'RECURRING',nowDay:67,nowTime:'18:00:00',
  historyComplete:true,durableIdentityAvailable:true,independentLifeRuleAvailable:true};
const ev = (id:string,day:number,scene:string,kind:CommittedNpcAttentionEvent['kind'],time='12:00:00'):CommittedNpcAttentionEvent =>({
  eventId:id,actorId:'npc.example',txId:'tx.'+id,sourceRef:'journal.'+id,
  sceneId:scene,day,time,kind,committed:true,counterpartIds:["player.shura"],
  ...(kind.includes('MEANINGFUL')||kind==='INDEPENDENT_CHARACTER_EVENT'?{meaningfulEvidence:'Verified personal decision with independently observed causal consequences.'}:{})
});
test('background NPC has tier zero; first actual sighting caches one game day',()=>{
 const cold=planNpcContextHeat({...base,events:[]});
 assert.equal(cold.activeTier,0);
 const spotted=planNpcContextHeat({...base,events:[ev('one',67,'scene.one','SCENE_PRESENCE')]});
 assert.equal(spotted.activeTier,1);
 assert.equal(spotted.cacheLoad,'SCENE_DAY_CACHE');
 assert.equal(spotted.cacheExpiresInSeconds,18*3600);
});
test('tier one expires in 24h but durable depth is never deleted',()=>{
 const history=[ev('one',66,'scene.one','SCENE_PRESENCE'),ev('a',66,'s2','SUBSTANTIVE_EXCHANGE'),ev('b',66,'s3','SUBSTANTIVE_EXCHANGE')];
 const p=planNpcContextHeat({...base,events:history});
 assert.equal(p.earnedTier,2);
 assert.equal(p.activeTier,0);
 assert.equal(p.profileTier,2);
 assert.equal(p.noNpcMemoriesDeleted,true);
});
test('same daily greetings and sales do not grind toward complex biography',()=>{
 const events=Array.from({length:20},(_,i)=>ev('r'+i,67,'s'+i,'ROUTINE_CONTACT'));
 const p=planNpcContextHeat({...base,events});
 assert.equal(p.activeTier,1);
 assert.equal(p.distinctMeaningfulDays,0);
});
test('replay receipts and multiple events in one scene do not double warmth',()=>{
 const e=ev('one',67,'s1','SUBSTANTIVE_EXCHANGE');
 const p=planNpcContextHeat({...base,events:[e,e,ev('two',67,'s1','SUBSTANTIVE_EXCHANGE')]});
 assert.equal(p.uniqueEventCount,2);
 assert.equal(p.earnedTier,1);
 assert.throws(()=>planNpcContextHeat({...base,events:[e,{...e,kind:'MEANINGFUL_RELATIONSHIP_EVENT',meaningfulEvidence:'A real and independent social change with a legitimate source.'}]}),/COLLISION/);
});
test('tier two requires two substantive scenes, not one long repeated monologue',()=>{
 const a=planNpcContextHeat({...base,events:[ev('s1',67,'s1','SUBSTANTIVE_EXCHANGE'),ev('s2',67,'s2','SUBSTANTIVE_EXCHANGE')]});
 assert.equal(a.earnedTier,2);
 const b=planNpcContextHeat({...base,events:[ev('s1',67,'s1','SUBSTANTIVE_EXCHANGE'),ev('s2',67,'s1','SUBSTANTIVE_EXCHANGE')]});
 assert.equal(b.earnedTier,1);
});
test('tiers three and four require multiple distinct meaningful days',()=>{
 const e=Array.from({length:5},(_,i)=>ev('m'+i,63+i,'meaning'+i,'MEANINGFUL_RELATIONSHIP_EVENT'));
 const p=planNpcContextHeat({...base,events:e});
 assert.equal(p.earnedTier,4);
 assert.equal(p.activeTier,4);
 assert.equal(p.cacheLoad,'SOURCE_BACKED_HISTORY');
 assert.equal(p.promotionReviewEligible,false);
 const two=planNpcContextHeat({...base,events:e.slice(3)});
 assert.equal(two.earnedTier,2); // two days cannot reach tier 3 without six capped points
});
test('six meaningful days permit a KEY review but never change importance',()=>{
 const events=Array.from({length:6},(_,i)=>ev('meaning'+i,62+i,'scene'+i,'MEANINGFUL_RELATIONSHIP_EVENT'));
 const p=planNpcContextHeat({...base,events});
 assert.equal(p.earnedTier,4);
 assert.equal(p.promotionReviewEligible,true);
 assert.equal(p.keyPromotionAutomatic,false);
 assert.equal(p.activeTier,4);
 const incomplete=planNpcContextHeat({...base,events,historyComplete:false});
 assert.equal(incomplete.promotionReviewEligible,false);
 assert.equal(incomplete.profileTier,1);
});
test('existing KEY such as Vesha is never demoted by empty attention history',()=>{
 const p=planNpcContextHeat({...base,importance:'KEY',events:[],historyComplete:false});
 assert.equal(p.earnedTier,5);
 assert.equal(p.activeTier,5);
 assert.equal(p.cacheLoad,'KEY_LIFEV4');
});
test('invalid or predicted future events cannot give attention',()=>{
 const p=planNpcContextHeat({...base,events:[ev('next',68,'s1','MEANINGFUL_RELATIONSHIP_EVENT'),
   {...ev('fake',67,'s2','SUBSTANTIVE_EXCHANGE'),committed:false as true},
   {...ev('thin',67,'s3','MEANINGFUL_RELATIONSHIP_EVENT'),meaningfulEvidence:'Likes him'}]});
 assert.equal(p.activeTier,0);
 assert.equal(p.ignoredEventCount,3);
});
test('other NPC actors do not receive warmth from someone else events',()=>{
 const p=planNpcContextHeat({...base,events:[{...ev('one',67,'s1','MEANINGFUL_RELATIONSHIP_EVENT'),actorId:'npc.other'}]});
 assert.equal(p.activeTier,0);
});

test('six days of solo work do not auto-qualify for social KEY promotion',()=>{
 const events=Array.from({length:6},(_,i)=>ev('solo'+i,62+i,'work'+i,'INDEPENDENT_CHARACTER_EVENT'));
 const p=planNpcContextHeat({...base,events});
 assert.equal(p.earnedTier,4);
 assert.equal(p.distinctMeaningfulSocialDays,0);
 assert.equal(p.promotionReviewEligible,false);
});
test('promotion readiness additionally needs verified independent LifeV4 source',()=>{
 const events=Array.from({length:6},(_,i)=>ev('bond'+i,62+i,'scene'+i,'MEANINGFUL_RELATIONSHIP_EVENT'));
 const p=planNpcContextHeat({...base,events,independentLifeRuleAvailable:false});
 assert.equal(p.promotionReviewEligible,false);
 assert.ok(p.promotionBlockedReasons.includes('KEY_LIFEV4_ACTIVITY_RULE_REVIEW_REQUIRED'));
});

test('NPC-to-NPC social history cannot substitute for six days with Shura',()=>{
 const events=Array.from({length:6},(_,i)=>({...ev('peer'+i,62+i,'scene'+i,'MEANINGFUL_RELATIONSHIP_EVENT'),counterpartIds:['npc.peer']}));
 const p=planNpcContextHeat({...base,events});
 assert.equal(p.earnedTier,4);
 assert.equal(p.distinctMeaningfulSocialDays,0);
 assert.equal(p.promotionReviewEligible,false);
});


test('exact 24 in-world hour boundary expires active cache without deleting earned identity',()=>{
 const sighting=ev('boundary',66,'scene.boundary','SCENE_PRESENCE','18:00:00');
 const before=planNpcContextHeat({...base,nowTime:'17:59:59',events:[sighting]});
 assert.equal(before.activeTier,1);
 assert.equal(before.cacheExpiresInSeconds,1);
 const exact=planNpcContextHeat({...base,nowTime:'18:00:00',events:[sighting]});
 assert.equal(exact.activeTier,0);
 assert.equal(exact.profileTier,1);
 assert.equal(exact.cacheExpiresInSeconds,0);
 assert.equal(exact.noNpcMemoriesDeleted,true);
});
test('same event id with different source receipt never replays as a second event',()=>{
 const initial=ev('original',67,'scene.original','SUBSTANTIVE_EXCHANGE');
 assert.throws(()=>planNpcContextHeat({...base,events:[initial,{...initial,txId:'tx.changed'}]}),/COLLISION/);
});
test('out-of-range timestamps are rejected and cannot raise heat',()=>{
 const badHour=ev('bad-hour',67,'scene.bad','SCENE_PRESENCE','24:00:00');
 const badMinute=ev('bad-minute',67,'scene.bad2','SUBSTANTIVE_EXCHANGE','12:60:00');
 const p=planNpcContextHeat({...base,events:[badHour,badMinute]});
 assert.equal(p.uniqueEventCount,0);
 assert.equal(p.activeTier,0);
 assert.equal(p.ignoredEventCount,2);
});
