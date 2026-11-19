import test from "node:test";
import assert from "node:assert/strict";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {previewLabLivingWorldCycle} from "../src/rpg_lab_v1/living_world_cycle_v2.ts";
import {readLabRoleplayScene,readLabRoleplayWorldCycle} from "../src/rpg_lab_v1/roleplay_adapter.ts";
import {applyGuardedLabEvent} from "../src/rpg_lab_v1/turn_guard.ts";
import {validateLabSession,type LabSession} from "../src/rpg_lab_v1/session.ts";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";

const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"orario_lw2",worldId:"danmachi.orario",
 formulas:{},resources:{hp:{min:0,max:100}},lootTables:{},prices:{},
 economy:{taxRate:0},locations:{
  workshop:{name:"Hephaestus workshop",kind:"smith",neighbors:{}},
  manor:{name:"Twilight Manor",kind:"residence",neighbors:{}},
  guild:{name:"Guild",kind:"office",neighbors:{}},
 },
 npcProfiles:{
  "npc.smith":{name:"Hephaestus craftswoman",canonRef:"danmachi.smith",
   traits:["pragmatic","cautious"],goals:["research equipment and materials"],
   speechStyle:"technical and skeptical",knownFacts:[]},
  "npc.loki":{name:"Loki",canonRef:"danmachi.loki",
   traits:["teasing","lustful","protective","cunning"],goals:["protect the familia"],
   speechStyle:"irreverent and playful",knownFacts:[]},
  "npc.bete":{name:"Bete",canonRef:"danmachi.bete",
   traits:["aggressive","proud","blunt"],goals:["grow strong"],knownFacts:[]},
  "npc.finn":{name:"Finn",canonRef:"danmachi.finn",
   traits:["strategic","cautious"],goals:["protect the familia and security"],knownFacts:[]},
 },progression:{}
};
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,sessionId:"living_cycle",
 roleplayGuard:"strict",gameClock:"D0 08:00",
 player:{resources:{hp:100},stats:{},inventory:{}},
 discovered:[],npcs:{},events:[],
});
const e=(sourceRef:string,time:string,over:Partial<LabConfirmedEvent>={}):LabConfirmedEvent=>({
 sourceRef,time,summary:"confirmed world event",kind:"world_scene",knownBy:[],
 gmConfirmed:true,...over,
});
const seen=(npcId:string,fact:string,time="D0 09:00")=>({
 npcId,channel:"seen" as const,perceivedFact:fact,learnedAt:time,
 confidence:"certain" as const,salience:"important" as const,
 privacy:"public" as const,
});
const time=(day:number,hour:number)=>day*1440+hour*60;

test("unified cycle 1/6: world significance, measured/claimed separation and personality",()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,e("evt.thread","D0 09:00",{
  knownBy:["npc.smith"],observations:[seen("npc.smith","Two 2mm threads tested")],
  worldEvidence:[
   {factId:"thread.2mm",kind:"measured",level:"established",
    statement:"Two 2mm steel-like magic fibers held 1500 kgf",
    scope:"Only these two fibers under the workshop test rig",
    significance:"transformative",method:"calibrated loading rig",
    observedBy:["npc.smith"]},
   {factId:"thread.10mm",kind:"reported",level:"unverified",
    statement:"10mm sample allegedly holds 25 tonnes",
    scope:"Untested thicker thread, no calibrated rig",
    significance:"transformative",observedBy:[]}
  ]
 }));
 const cycle=previewLabLivingWorldCycle(pack,s,{
  npcIds:["npc.smith","npc.loki","npc.bete"],fromMinute:time(0,9),
  toMinute:time(0,9),focusEventRef:"evt.thread"});
 assert.equal(cycle.schema,"RPG_LAB_LIVING_WORLD_CYCLE_V2");
 const smith=cycle.significance.find(x=>x.npcId==="npc.smith")!;
 assert.equal(smith.knowledge.length,2);
 assert.equal(smith.knowledge.find(x=>x.factId==="thread.10mm")?.claimLevel,"unverified");
 assert.equal(smith.knowledge.find(x=>x.factId==="thread.2mm")?.observedPersonally,true);
 assert.equal(cycle.significance.find(x=>x.npcId==="npc.loki")!.knowledge.length,0);
 assert.equal(cycle.significance.find(x=>x.npcId==="npc.bete")!.knowledge.length,0);
 assert.equal(smith.knowledge[0].attentionNotAdmiration,true);
 assert.equal(cycle.generatedFacts,false);
 assert.equal(cycle.committed,false);
});
test("unified cycle 2+4/6: independently chosen temperament, lasting refusals, no instant pardon",()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,e("evt.insult","D0 09:00",{
  npcInteractions:[{initiatorNpcId:"npc.bete",recipientNpcId:"npc.loki",
   action:"Bete ridicules Loki's leadership",outcome:"Loki retorts angrily",
   salience:"important",privacy:"private"}],
  socialDynamics:[{npcId:"npc.loki",towardNpcId:"npc.bete",
   tensionDelta:4,trustDelta:-2,affinityDelta:-2,evidenceRefs:["evt.insult"]}],
  npcDecisionChanges:[{npcId:"npc.loki",subjectId:"bete.trust",
   stance:"avoid",reason:"Public insult",evidenceRefs:["evt.insult"],privacy:"private"}],
  moodChanges:[{npcId:"npc.loki",evidenceRefs:["evt.insult"],
   mood:{label:"annoyed",intensity:4}}]
 }));
 s=applyConfirmedLabEvent(s,pack,e("evt.apology","D0 10:00"));
 const c=previewLabLivingWorldCycle(pack,s,{npcIds:["npc.loki","npc.bete"],
  fromMinute:time(0,10),toMinute:time(0,10)});
 const loki=c.decisions.find(x=>x.npcId==="npc.loki")!;
 const bete=c.decisions.find(x=>x.npcId==="npc.bete")!;
 assert.ok(loki.toneCandidates.some(x=>x.includes("teasing")));
 assert.ok(loki.toneCandidates.some(x=>x.includes("flirt")));
 assert.ok(bete.toneCandidates.some(x=>x.includes("confrontation")));
 assert.ok(loki.options.includes("maintain_prior_refusal_or_grudge"));
 assert.ok(loki.options.includes("react_from_current_mood_without_automatic_reset"));
 assert.equal(s.npcs["npc.loki"].mood?.label,"annoyed");
 assert.equal(s.npcs["npc.loki"].socialDynamics?.["npc.bete"]?.tension,4);
 assert.equal(s.npcs["npc.bete"].socialDynamics?.["npc.loki"],undefined);
 assert.equal(c.decisions[0].noForcedAgreement,true);
 assert.equal(c.automaticRelationshipsChanged,false);
});
test("unified cycle 3/6: overbooked Hephaestus smith has bounded decisions, no magical work",()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,e("evt.work","D0 09:00",{
  worldActions:[{npcId:"npc.smith",action:"accepted a materials study",
   outcome:"reserved time",privacy:"hidden"}],
  worldProjectChanges:[{projectId:"proj.thread",expectedRevision:0,
   record:{ownerNpcId:"npc.smith",originRef:"evt.work",title:"Study threads",
    stage:"testing 2 mm",status:"accepted",privacy:"hidden",
    startedMinute:time(0,9),lastReviewMinute:time(0,9),
    nextReviewMinute:time(1,9),revision:1,latestEvidenceRef:"evt.work"}},
   {projectId:"proj.armor",expectedRevision:0,
   record:{ownerNpcId:"npc.smith",originRef:"evt.work",title:"Repair armor",
    stage:"prepare clamps",status:"accepted",privacy:"hidden",
    startedMinute:time(0,9),lastReviewMinute:time(0,9),
    nextReviewMinute:time(1,9),revision:1,latestEvidenceRef:"evt.work"}}]
 }));
 const c=previewLabLivingWorldCycle(pack,s,{npcIds:["npc.smith","npc.loki"],
  fromMinute:time(0,9),toMinute:time(7,9)});
 assert.equal(c.work.length,2);
 assert.equal(c.work.every(p=>p.ownerOpenWorkload===2),true);
 assert.ok(c.work.every(p=>p.availableReviewChoices.includes("prioritize_queue")));
 assert.equal(c.work.every(p=>p.autoProgress===false),true);
 assert.equal(s.worldProjects!["proj.thread"].revision,1);
 assert.equal(s.worldProjects!["proj.armor"].status,"accepted");
 assert.ok(c.unresolvedWork.includes("proj.thread"));
 assert.throws(()=>applyConfirmedLabEvent(s,pack,e("evt.skip","D2 10:00")),
  /LAB_WORLD_PROJECT_REVIEW_REQUIRED/);
});
test("unified cycle 5+6/6: social contact and rumors require confirmed shared location",()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,e("evt.smith.here","D0 09:00",{
  worldActions:[{npcId:"npc.smith",action:"works in shop",
   outcome:"present at bench",locationId:"workshop",privacy:"hidden"}],
  npcPositions:[{npcId:"npc.smith",locationId:"workshop"}],
 }));
 s=applyConfirmedLabEvent(s,pack,e("evt.loki.there","D0 09:10",{
  worldActions:[{npcId:"npc.loki",action:"visits manor",
   outcome:"present in dining hall",locationId:"manor",privacy:"hidden"}],
  npcPositions:[{npcId:"npc.loki",locationId:"manor"}],
 }));
 s=applyConfirmedLabEvent(s,pack,e("evt.smith.finding","D0 09:20",{
  knownBy:["npc.smith"],observations:[seen("npc.smith",
   "Measured two 2mm strands with 1500 kgf","D0 09:20")],
 }));
 const apart=previewLabLivingWorldCycle(pack,s,{
  npcIds:["npc.smith","npc.loki"],fromMinute:time(0,9),toMinute:time(0,10)});
 assert.equal(apart.contacts.length,0);
 assert.equal(apart.rumors.length,0);
 s=applyConfirmedLabEvent(s,pack,e("evt.loki.visit","D0 10:00",{
  worldActions:[{npcId:"npc.loki",action:"visits the workshop",
   outcome:"arrived at the forge",locationId:"workshop",privacy:"hidden"}],
  npcPositions:[{npcId:"npc.loki",locationId:"workshop"}],
 }));
 const near=previewLabLivingWorldCycle(pack,s,{
  npcIds:["npc.smith","npc.loki"],fromMinute:time(0,10),toMinute:time(0,11)});
 assert.equal(near.contacts.length,1);
 assert.equal(near.contacts[0].sameLocationNotProofOfConversation,true);
 assert.ok(near.rumors.some(x=>x.speakerNpcId==="npc.smith"&&
   x.listenerNpcId==="npc.loki"&&x.sourceMemoryRef==="evt.smith.finding"));
 assert.equal(s.npcs["npc.loki"].memories.length,0);
 assert.throws(()=>applyConfirmedLabEvent(s,pack,e("evt.fake.rumor","D0 11:00",{
  observations:[{npcId:"npc.loki",channel:"report",sourceActor:"npc.smith",
   relayedSourceRef:"evt.smith.finding",perceivedFact:"Smith told of tested threads",
   learnedAt:"D0 11:00",confidence:"likely",salience:"important",privacy:"public"}],
  rumorRelays:[{speakerNpcId:"npc.smith",listenerNpcId:"npc.loki",
   sourceMemoryRef:"evt.smith.finding"}],
 })),/LAB_RUMOR_ENCOUNTER_MISSING/);
 s=applyConfirmedLabEvent(s,pack,e("evt.rumor.real","D0 11:00",{
  npcInteractions:[{initiatorNpcId:"npc.smith",recipientNpcId:"npc.loki",
   action:"Smith gives Loki preliminary data",
   outcome:"Loki hears of strength test",salience:"important",privacy:"public"}],
  observations:[{npcId:"npc.loki",channel:"report",sourceActor:"npc.smith",
   relayedSourceRef:"evt.smith.finding",
   perceivedFact:"Smith reported load test of threads",
   learnedAt:"D0 11:00",confidence:"likely",salience:"important",privacy:"public"}],
  rumorRelays:[{speakerNpcId:"npc.smith",listenerNpcId:"npc.loki",
   sourceMemoryRef:"evt.smith.finding"}],
 }));
 assert.equal(s.npcs["npc.loki"].memories.filter(x=>
   x.sourceRef==="evt.rumor.real").length,1);
 assert.equal(s.npcs["npc.loki"].memories.some(x=>
   x.relayedSourceRef==="evt.smith.finding"),true);
 const after=previewLabLivingWorldCycle(pack,s,{
  npcIds:["npc.smith","npc.loki"],fromMinute:time(0,11),toMinute:time(0,11)});
 assert.equal(after.rumors.some(x=>x.sourceMemoryRef==="evt.smith.finding"&&
   x.listenerNpcId==="npc.loki"),false);
 assert.equal(s.npcs["npc.bete"],undefined);
 validateLabSession(s,pack);
});
test("rumors cannot leak private knowledge without explicit disclosure and a real encounter",()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,e("evt.private","D0 09:00",{
  knownBy:["npc.smith"],
  observations:[{...seen("npc.smith","Secret weapon blueprint"),
   privacy:"private"}],
 }));
 const relay=e("evt.rumor","D0 09:30",{
  npcInteractions:[{initiatorNpcId:"npc.smith",recipientNpcId:"npc.loki",
   action:"Smith speaks privately with Loki",
   outcome:"They discuss hidden invention",salience:"important",privacy:"private"}],
  observations:[{npcId:"npc.loki",channel:"report",sourceActor:"npc.smith",
   relayedSourceRef:"evt.private",perceivedFact:"Heard a secret",
   learnedAt:"D0 09:30",confidence:"uncertain",
   salience:"important",privacy:"private"}],
  rumorRelays:[{speakerNpcId:"npc.smith",listenerNpcId:"npc.loki",
   sourceMemoryRef:"evt.private"}],
 });
 assert.throws(()=>applyConfirmedLabEvent(s,pack,relay),
  /LAB_RUMOR_PRIVATE_SOURCE_NO_DISCLOSURE/);
 s=applyConfirmedLabEvent(s,pack,{...relay,rumorRelays:[{
  ...relay.rumorRelays![0],breachConfidence:true}]});
 assert.equal(s.npcs["npc.loki"].memories.filter(x=>x.sourceRef==="evt.rumor").length,1);
});
test("Living World V2 source-bound tool + RPG Lab scene context share one cycle",async()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,e("evt.smith.work","D0 09:00",{
  worldActions:[{npcId:"npc.smith",action:"accepts tests",
   outcome:"seeking equipment",privacy:"hidden"}],
  worldProjectChanges:[{projectId:"proj.test",expectedRevision:0,
   record:{ownerNpcId:"npc.smith",originRef:"evt.smith.work",
    title:"Investigate rare metal",stage:"test samples",
    status:"accepted",privacy:"hidden",startedMinute:time(0,9),
    lastReviewMinute:time(0,9),nextReviewMinute:time(1,9),
    revision:1,latestEvidenceRef:"evt.smith.work"}}],
 }));
 const load=async()=>({pack,packRevision:8,session:s,sessionRevision:4});
 const result=await readLabRoleplayWorldCycle(load,{
  projectId:pack.projectId,sessionId:s.sessionId,
  npcIds:["npc.smith"],toMinute:time(2,9)});
 assert.equal(result.schema,"RPG_LAB_LIVING_WORLD_CYCLE_V2");
 assert.equal(result.sourceAttestedBySave,true);
 assert.equal(result.sessionRevision,4);
 assert.equal(result.work.length,1);
 const scene=await readLabRoleplayScene(load,{
  projectId:pack.projectId,sessionId:s.sessionId,
  npcIds:["npc.smith"],toMinute:time(2,9)});
 assert.equal(scene.livingWorldCycle?.work.length,1);
 assert.equal(scene.roleplayGuard,"strict");
 assert.equal(scene.readOnly,true);
 assert.equal(scene.livingWorldCycle?.committed,false);
 assert.equal(s.worldProjects!["proj.test"].status,"accepted");
 await assert.rejects(()=>readLabRoleplayWorldCycle(load,{
  projectId:pack.projectId,sessionId:s.sessionId,
  npcIds:["npc.smith"],toMinute:time(9,9)}),
 /LAB_LIVING_CYCLE_REQUEST_INVALID/);
});

test("strict time skip requires NPC-independent world review, not a silent freeze",()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,e("evt.smith.origin","D0 09:00",{
  knownBy:["npc.smith"],
  observations:[seen("npc.smith","A difficult materials problem", "D0 09:00")],
 }));
 const base=e("evt.next.day","D1 09:00",{
  summary:"Player spent a day away from the forge",
 });
 assert.throws(()=>applyGuardedLabEvent(session,pack,base,2),
  /LAB_STRICT_WORLD_CYCLE_REVIEW_REQUIRED/);
 const empty={...base,worldCycleReview:{
  fromMinute:time(0,9),toMinute:time(1,9),actorReviews:[]}};
 assert.throws(()=>applyGuardedLabEvent(session,pack,empty,2),
  /LAB_STRICT_WORLD_CYCLE_ACTORS_MISSING/);
 const unsupported={...base,worldCycleReview:{
  fromMinute:time(0,9),toMinute:time(1,9),actorReviews:[{
   npcId:"npc.smith",status:"acted" as const,
   reason:"Invented an entire new technology overnight"}]}};
 assert.throws(()=>applyGuardedLabEvent(session,pack,unsupported,2),
  /LAB_STRICT_WORLD_CYCLE_CLAIMED_ACTION_MISSING/);
 const reviewed={...base,worldCycleReview:{
  fromMinute:time(0,9),toMinute:time(1,9),actorReviews:[{
   npcId:"npc.smith",status:"no_change" as const,
   reason:"The smith still has unresolved work and no new experimental evidence",
   sourceRefs:["evt.smith.origin"]}]}};
 const result=applyGuardedLabEvent(session,pack,reviewed,2);
 assert.equal(result.guardRequired,true);
 assert.equal(result.guardVerified,true);
 assert.equal(result.next.gameClock,"D1 09:00");
 assert.equal(session.gameClock,"D0 09:00");
 assert.equal(result.next.npcs["npc.smith"].memories.length,1);
});
