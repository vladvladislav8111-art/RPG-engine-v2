import {assert, assertEquals} from 'jsr:@std/assert';
import {planNpcInitiativeV4} from '../src/npc_initiative_v4.ts';
import {planNpcInnerMotivesV4} from '../src/npc_inner_motives_v4.ts';
import {shouldLoadSceneActors} from '../src/context_hotpath_budget.ts';
import {reviewNpcRoutineCadence} from '../src/npc_cadence_review.ts';
Deno.test('Vesha may initiate warm speech only during a true co-present scene',()=>{
 const base={actorId:'npc.selarin.pool_2003',
  current:{'Importance':'KEY','Role':'bookseller','Identity anchors':'practical curious',
   'Current goal/activity':'independent shop catalog and customers'},
  activityRule:{'State':'ACTIVE','Primary anchors':'independent stall','Fixed obligations override':'YES'},
  relationshipToShura:{'Actor ID':'npc.selarin.pool_2003','Toward ID':'player.shura','Status':'ACTIVE','Warmth':'warm but self-respecting','Evidence refs':'T0647;T0774'},
  elapsedSeconds:120,verifiedCoPresenceWithShura:true};
 const present=planNpcInitiativeV4(base);
 assert(present.candidates.some(x=>x.type==='SPEAK_FIRST'));
 assert(present.candidates.some(x=>x.type==='EXPRESS_PERSONAL_STANCE'));
 assert(present.candidates.some(x=>x.type==='SET_BOUNDARY'));
 assertEquals(present.romanceOrPhysicalConsentInferred,false);
 const distant=planNpcInitiativeV4({...base,verifiedCoPresenceWithShura:false});
 assert(!distant.candidates.some(x=>x.type==='OUTREACH'||x.type==='SPEAK_FIRST'));
 assert(!distant.committed);
});
Deno.test('Only true MICRO read-only requests skip incidental scene actors',()=>{
 assertEquals(shouldLoadSceneActors({turnClass:'MICRO',tags:['HUD']}).loadSceneActors,false);
 assertEquals(shouldLoadSceneActors({turnClass:'NORMAL',tags:['HUD']}).loadSceneActors,true);
 assertEquals(shouldLoadSceneActors({turnClass:'MICRO',tags:['NPC']}).loadSceneActors,true);
 assertEquals(shouldLoadSceneActors({turnClass:'MICRO',tags:['HUD'],actorRefs:['Веша']}).loadSceneActors,true);
});

Deno.test('real 30-minute KEY cadence flags autonomous LifeV4 review without forcing contact',()=>{
 const sparse={
  'NPC_CURRENT!A1:D500':[['NPC ID','Display','Role','Importance'],['npc.selarin.pool_2003','Веша','bookseller','KEY']],
  'NPC_ACTIVITY_RULES!A1:C200':[['NPC ID','Display','State'],['npc.selarin.pool_2003','Веша','ACTIVE']],
  'NPC_ACTIVITY_RULES!G1:G200':[['Minimum elapsed'],['30 in-world minutes for routine review']],
  'NPC_ACTIVITY_RULES!K1:K200':[['Last activity tick'],['Day67 17:21:00']],
 };
 const r=reviewNpcRoutineCadence({worldDay:67,worldTime:'17:21:00',elapsedSeconds:1800,sparse});
 assertEquals(r.eligibleCount,1);assertEquals(r.committed,false);
});

Deno.test('Inner drive can arise toward another NPC but cannot invent contact or resolved feelings',()=>{
 const r=planNpcInnerMotivesV4({actorId:'npc.selarin.pool_2003',
  current:{'NPC ID':'npc.selarin.pool_2003','Identity anchors':'curious, principled',
   'Current goal/activity':'real bookstore duties'}, elapsedSeconds:180,
  verifiedCoPresentActorIds:['npc.copy.assistant'],
  stimuli:[{sourceRef:'tx.synthetic.assistant',kind:'OBSERVED_DISTRESS',
   witnessedByNpc:true,currentDecisionWindow:true,targetActorId:'npc.copy.assistant'}]});
 assertEquals(r.motivations.find(x=>x.kind==='OFFER_CONCERN')?.possibleExpression,'IN_PERSON_IF_CHOSEN');
 assertEquals(r.motivations.find(x=>x.kind==='OFFER_CONCERN')?.targetActorId,'npc.copy.assistant');
 assertEquals(r.noNewEmotionalFacts,true);
 assertEquals(r.committed,false);
});
Deno.test('Internal motive is not recycled from stale or unobserved memory',()=>{
 const r=planNpcInnerMotivesV4({actorId:'npc.selarin.pool_2003',
  current:{'NPC ID':'npc.selarin.pool_2003','Identity anchors':'bookseller',
   'Current goal/activity':'fulfill a real catalog task'}, elapsedSeconds:60,
  stimuli:[{sourceRef:'old.event.known',kind:'SOCIAL_FRICTION',
   witnessedByNpc:true,currentDecisionWindow:false,targetActorId:'player.shura'}]});
 assert(!r.motivations.some(x=>x.kind==='ADDRESS_TENSION'));
 assertEquals(r.invalidStimulusRefs,['old.event.known']);
});
