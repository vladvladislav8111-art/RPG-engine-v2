import test from "node:test";
import assert from "node:assert/strict";
import {evaluateLabPack,type LabPack} from "../src/rpg_lab_v1/engine.ts";
import {validateLabSession,withSessionDefaults,type LabSession} from "../src/rpg_lab_v1/session.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {buildLabSceneBrief,dueLabWorldProjects,type LabWorldProject} from "../src/rpg_lab_v1/living_world.ts";
import {reviewLabSessionMemory} from "../src/rpg_lab_v1/memory_view.ts";
import {hydrateLabBridgeRequest} from "../src/rpg_lab_v1/bridge.ts";
import {dispatchWorldV3Batch,type WorldV3BatchRequest} from "../src/world_sim_v3/runtime_facade.ts";
import {reviewLabNarration} from "../src/rpg_lab_v1/narrative_guard.ts";

const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"orario_living_world",worldId:"danmachi.orario",
 formulas:{},resources:{hp:{min:0,max:100}},lootTables:{},prices:{},
 economy:{taxRate:0},locations:{workshop:{name:"Hephaestus shop",kind:"workshop",neighbors:{}}},
 npcProfiles:{
  "npc.loki":{name:"Loki",canonRef:"danmachi.loki",
   traits:["teasing","lustful","cunning","protective of familia"],
   goals:["enjoy life","protect familia"],knownFacts:[],speechStyle:"irreverent"},
  "npc.bete":{name:"Bete",canonRef:"danmachi.bete",traits:["proud","aggressive","resentful"],
   goals:["be strong"],knownFacts:[]},
  "npc.smith":{name:"Hephaestus craftswoman",canonRef:"danmachi.smith",
   traits:["practical","busy"],goals:["study effective materials"],knownFacts:[]},
  "npc.finn":{name:"Finn",canonRef:"danmachi.finn",traits:["strategic"],
   goals:["protect familia"],knownFacts:[]},
 },progression:{}
};
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,sessionId:"rpg_test",
 gameClock:"D0 08:00",player:{resources:{hp:100},stats:{},inventory:{}},
 discovered:["workshop"],npcs:{},events:[]
});
const evt=(sourceRef:string,time:string,changes:Partial<LabConfirmedEvent>={}):LabConfirmedEvent=>({
 sourceRef,time,kind:"scene",summary:"Confirmed encounter",knownBy:[],gmConfirmed:true,...changes,
});
const m=(day:number,hour:number)=>day*1440+hour*60;
function research(status:"accepted"|"active"|"blocked"|"completed",revision:number,
 lastReviewMinute:number,nextReviewMinute?:number,blockerReason?:string):LabWorldProject{
 return {ownerNpcId:"npc.smith",originRef:"evt.materials",title:"Test unusual thread",
  stage:status==="accepted"?"two 2mm tests queued":status==="active"?"2mm confirmed, 10mm pending":
   status==="blocked"?"request suitable equipment":"closed",
  status,startedMinute:m(0,9),lastReviewMinute,nextReviewMinute,revision,
  latestEvidenceRef:revision===1?"evt.materials":revision===2?"evt.tests":"evt.blocked",
  privacy:"hidden",...(blockerReason?{blockerReason}:{})};
}
test("unusual features remain individual across 40+ turns and rumor is not direct sight",()=>{
 let s=applyConfirmedLabEvent(fresh(),pack,evt("evt.halo","D0 09:00",{
  knownBy:["npc.loki"],features:[{npcId:"npc.loki",featureId:"daedalus.halo",
   channel:"seen",significance:"transformative",privacy:"private"}],
  observations:[{npcId:"npc.loki",channel:"seen",perceivedFact:"Daedalus has a glowing halo",
   learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}],
 }));
 for(let i=0;i<43;i++)s=applyConfirmedLabEvent(s,pack,evt("evt.time."+i,"D0 09:00"));
 const view=buildLabSceneBrief(pack,s,{npcIds:["npc.loki","npc.finn"],featureIds:["daedalus.halo"]});
 assert.equal(view.actors[0].featureAwareness[0].personallySeen,true);
 assert.equal(view.actors[1].featureAwareness[0].personallySeen,false);
 assert.equal(view.actors[1].featureAwareness[0].familiarity,"unfamiliar");
 assert.equal(view.actors[0].memories[0].perceivedFact,"Daedalus has a glowing halo");
 assert.equal(view.actors[0].canonAnchors.includes("lustful"),true);
 assert.equal(view.gmOnly,true);
});
test("anger remains after an apology until a sourced NPC-specific update",()=>{
 let s=applyConfirmedLabEvent(fresh(),pack,evt("evt.humiliate","D0 09:00",{
  knownBy:["npc.bete"],
  observations:[{npcId:"npc.bete",channel:"experienced",perceivedFact:"Public humiliation",
   learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}],
  moodChanges:[{npcId:"npc.bete",evidenceRefs:["evt.humiliate"],
   mood:{label:"furious",intensity:4,settleAfterMinute:m(2,9)}}],
 }));
 s=applyConfirmedLabEvent(s,pack,evt("evt.apology","D0 10:00"));
 const brief=buildLabSceneBrief(pack,s,{npcIds:["npc.bete"]});
 assert.equal(brief.actors[0].mood?.label,"furious");
 assert.equal(brief.actors[0].mood?.intensity,4);
 assert.equal(brief.actors[0].noAutomaticReconciliation,true);
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.fake_mood","D0 10:15",{
  moodChanges:[{npcId:"npc.finn",evidenceRefs:["evt.humiliate"],mood:{label:"furious",intensity:5}}]
 })),/LAB_NPC_MOOD_UNVERIFIED_MEMORY/);
});
test("smith proposal persists, overdue time cannot silently skip work; blockage must be grounded",()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,evt("evt.materials","D0 09:00",{
  knownBy:["npc.smith"],summary:"Smith accepts two 2mm tests and unverified 10mm claim",
  observations:[{npcId:"npc.smith",channel:"experienced",
   perceivedFact:"Saw two thin samples and a third untested 10mm sample",
   learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}],
  worldProjectChanges:[{projectId:"proj.heph.thread",expectedRevision:0,
   record:research("accepted",1,m(0,9),m(1,9))}],
 }));
 assert.equal(s.worldProjects!["proj.heph.thread"].status,"accepted");
 assert.equal(s.worldProjects!["proj.heph.thread"].latestEvidenceRef,"evt.materials");
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.player_monday","D1 12:00")),
 /LAB_WORLD_PROJECT_REVIEW_REQUIRED/);
 const preview=evaluateLabPack(pack,withSessionDefaults([{id:"tick",kind:"world_tick",args:{
   fromMinute:m(0,9),toMinute:m(1,12),npcIds:["npc.smith"],
  }}],s));
 const v=preview.results[0];
 assert.equal(v.ok,true);
 if(!v.ok)throw Error("world tick failed");
 const data=v.value as {unresolvedProjectReviews:string[];resolutionRequired:boolean;eventsResolved:boolean};
 assert.deepEqual(data.unresolvedProjectReviews,["proj.heph.thread"]);
 assert.equal(data.resolutionRequired,true);
 assert.equal(data.eventsResolved,false);
 const before=s;
 s=applyConfirmedLabEvent(s,pack,evt("evt.tests","D1 12:00",{
  kind:"world_review",
  worldActions:[{npcId:"npc.smith",action:"test samples",outcome:"2mm confirmed; 10mm untested",
   privacy:"hidden"}],
  worldProjectChanges:[{projectId:"proj.heph.thread",expectedRevision:1,
   record:research("active",2,m(1,12),m(2,9))}],
 }));
 assert.equal(before.worldProjects!["proj.heph.thread"].revision,1);
 assert.equal(s.worldProjects!["proj.heph.thread"].revision,2);
 assert.equal(s.worldProjects!["proj.heph.thread"].stage,"2mm confirmed, 10mm pending");
 assert.equal(reviewLabSessionMemory(pack,s,{npcIds:["npc.smith"]})
  .independentWorldEvents.length,0);
 s=applyConfirmedLabEvent(s,pack,evt("evt.blocked","D2 12:00",{
  kind:"world_review",
  worldActions:[{npcId:"npc.smith",action:"seek test stand",outcome:"no suitable fixture yet",
   privacy:"hidden"}],
  worldProjectChanges:[{projectId:"proj.heph.thread",expectedRevision:2,
   record:research("blocked",3,m(2,12),m(3,12),"No fixture for safe 25-tonne test")}],
 }));
 assert.equal(s.worldProjects!["proj.heph.thread"].status,"blocked");
 assert.equal(dueLabWorldProjects(s.worldProjects,m(3,12)).length,1);
 const privateBrief=buildLabSceneBrief(pack,s,{npcIds:["npc.smith"]});
 assert.equal(privateBrief.actors[0].activeResponsibilities[0].blockerReason,
  "No fixture for safe 25-tonne test");
});
test("forged project acceptance and clock rollback are rejected",()=>{
 const s=fresh();
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.fake","D0 09:00",{
  worldProjectChanges:[{projectId:"proj.fake",expectedRevision:0,
   record:{...research("accepted",1,m(0,9),m(1,9)),originRef:"evt.materials",
    latestEvidenceRef:"evt.fake"}}]
 })),/LAB_WORLD_PROJECT_ORIGIN_INVALID/);
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.fake2","D0 09:00",{
  worldProjectChanges:[{projectId:"proj.fake",expectedRevision:0,
   record:{...research("accepted",1,m(0,9),m(1,9)),originRef:"evt.fake2",
    latestEvidenceRef:"evt.fake2"}}]
 })),/LAB_WORLD_PROJECT_OWNER_UNAWARE/);
 assert.equal(s.worldProjects,undefined);
 assert.equal(validateLabSession(s,pack).gameClock,"D0 08:00");
});
test("GM-only scene brief never interprets absent eyewitness as a technical fact",()=>{
 let s=fresh();
 s=applyConfirmedLabEvent(s,pack,evt("evt.rifle","D0 09:00",{
  knownBy:["npc.finn"],
  observations:[{npcId:"npc.finn",channel:"seen",
   perceivedFact:"Projectile passed through both walls of an iron breastplate",
   learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}],
 }));
 const view=buildLabSceneBrief(pack,s,{npcIds:["npc.finn","npc.loki"],eventRef:"evt.rifle"});
 assert.equal(view.eventCommitted,true);
 assert.equal(view.actors[0].eventObservation,"direct");
 assert.equal(view.actors[1].eventObservation,"not_recorded");
 assert.equal(view.actors[0].memories[0].perceivedFact,
  "Projectile passed through both walls of an iron breastplate");
 assert.equal(view.actors[1].memories.length,0);
 assert.equal(view.notPlayerVisible,true);
});

test("existing Bridge returns source-bound private roleplay briefs, never creates NPC decisions",async()=>{
 const session=applyConfirmedLabEvent(fresh(),pack,evt("evt.seen","D0 09:00",{
  knownBy:["npc.loki"],observations:[{npcId:"npc.loki",channel:"seen",
   perceivedFact:"The inventor's eye has a mechanical dial",
   learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}],
 }));
 const load=async()=>({pack,packRevision:2,session,sessionRevision:4});
 const input:WorldV3BatchRequest={expectedSaveId:"TEST-SAVE",jobs:[{
  id:"roleplay",operation:"world_review",payload:{rpgLabSceneV1:{
   projectId:pack.projectId,sessionId:session.sessionId,
   npcIds:["npc.loki","npc.finn"],eventRef:"evt.seen",
  }}
 }]};
 const hydrated=await hydrateLabBridgeRequest(input,
  async()=>{throw Error("should not call pack loader")},undefined,load);
 const result=dispatchWorldV3Batch(hydrated,"TEST-SAVE").results[0].result;
 assert.equal(result.ok,true);
 if(!result.ok)throw Error("scene refused");
 const view=result.value as any;
 assert.equal(view.gmOnly,true);
 assert.equal(view.committed,false);
 assert.equal(view.actors[0].eventObservation,"direct");
 assert.equal(view.actors[1].eventObservation,"not_recorded");
 assert.equal(session.npcs["npc.finn"],undefined);
});
test("Bridge world tick uses saved project queue, checks clock, and proposes without mutation",async()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.materials","D0 09:00",{
  knownBy:["npc.smith"],observations:[{npcId:"npc.smith",channel:"seen",
   perceivedFact:"2mm thread present",learnedAt:"D0 09:00",
   confidence:"certain",salience:"important",privacy:"private"}],
  worldProjectChanges:[{projectId:"proj.heph.thread",expectedRevision:0,
   record:research("accepted",1,m(0,9),m(1,9))}],
 }));
 const load=async()=>({pack,packRevision:2,session,sessionRevision:4});
 const input:WorldV3BatchRequest={expectedSaveId:"TEST-SAVE",jobs:[{
  id:"tick",operation:"world_review",payload:{rpgLabTickV1:{
   projectId:pack.projectId,sessionId:session.sessionId,toMinute:m(1,12),
   npcIds:["npc.smith"],
  }}
 }]};
 const hydrated=await hydrateLabBridgeRequest(input,
  async()=>{throw Error("should not load pack separately")},undefined,load);
 const result=dispatchWorldV3Batch(hydrated,"TEST-SAVE").results[0].result;
 assert.equal(result.ok,true);
 if(!result.ok)throw Error("tick refused");
 const value=result.value as any;
 assert.equal(value.committed,false);
 assert.equal(value.results[0].value.resolutionRequired,true);
 assert.deepEqual(value.results[0].value.unresolvedProjectReviews,["proj.heph.thread"]);
 assert.equal(session.worldProjects!["proj.heph.thread"].revision,1);
 await assert.rejects(()=>hydrateLabBridgeRequest({
  ...input,jobs:[{id:"bad",operation:"world_review",payload:{rpgLabTickV1:{
   projectId:pack.projectId,sessionId:session.sessionId,fromMinute:m(0,8),
   toMinute:m(1,12),
  }}}],
 },async()=>{throw Error("should not load")},undefined,load),/LAB_TICK_BRIDGE_CLOCK_INVALID/);
});

test("NPCs quarrel independently: both remember, outsider does not, conflict persists",()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.argument","D0 09:00",{
  kind:"world_scene",summary:"Loki and Bete argued without player present",
  npcInteractions:[{initiatorNpcId:"npc.bete",recipientNpcId:"npc.loki",
   action:"Bete sharply insults Loki's judgement",
   outcome:"Loki fires back and neither apologizes",
   salience:"important",privacy:"private"}],
  moodChanges:[{npcId:"npc.bete",evidenceRefs:["evt.argument"],
   mood:{label:"furious",intensity:4,settleAfterMinute:m(1,9)}}],
  npcSocial:[{npcId:"npc.loki",evidenceRefs:["evt.argument"],
   relationships:{"npc.bete":"irritated about insult, no reconciliation"}}],
 }));
 assert.equal(session.worldEvents?.length,1);
 assert.equal(session.npcs["npc.bete"].mood?.label,"furious");
 assert.equal(session.npcs["npc.loki"].relationships?.["npc.bete"],
  "irritated about insult, no reconciliation");
 assert.equal(session.npcs["npc.bete"].memories[0].sourceRef,"evt.argument");
 assert.equal(session.npcs["npc.loki"].memories[0].sourceRef,"evt.argument");
 assert.equal(session.npcs["npc.finn"],undefined);
 const gm=reviewLabSessionMemory(pack,session,{
  npcIds:["npc.loki"],includePrivate:true});
 assert.equal(gm.independentWorldEvents.length,1);
 assert.equal(gm.independentWorldEvents[0].targetNpcId,"npc.loki");
 assert.equal(reviewLabSessionMemory(pack,session,{
  npcIds:["npc.loki"],includePrivate:false}).independentWorldEvents.length,0);
 const next=applyConfirmedLabEvent(session,pack,evt("evt.later","D0 10:00"));
 assert.equal(next.npcs["npc.bete"].mood?.label,"furious");
 assert.equal(next.npcs["npc.loki"].relationships?.["npc.bete"],
  "irritated about insult, no reconciliation");
});
test("NPC interactions do not manufacture witnesses or leak private information",()=>{
 const session=fresh();
 const forged=evt("evt.fake_witness","D0 09:00",{
  npcInteractions:[{initiatorNpcId:"npc.bete",recipientNpcId:"npc.loki",
   action:"Private insult",outcome:"Both heard it",salience:"ordinary",
   privacy:"private",witnessNpcIds:["npc.finn"]}],
 });
 assert.throws(()=>applyConfirmedLabEvent(session,pack,forged),
 /LAB_NPC_INTERACTION_INVALID/);
 assert.equal(session.events.length,0);
});

test("an NPC can open their own hidden research project without the player's presence",()=>{
 const session=applyConfirmedLabEvent(fresh(),pack,evt("evt.materials","D0 09:00",{
  kind:"world_scene",knownBy:[],
  worldActions:[{npcId:"npc.smith",action:"chooses to research the samples",
   outcome:"sets aside a morning testing slot",privacy:"hidden"}],
  worldProjectChanges:[{projectId:"proj.self.started",expectedRevision:0,
   record:research("accepted",1,m(0,9),m(1,9))}],
 }));
 assert.equal(session.worldProjects!["proj.self.started"].status,"accepted");
 assert.equal(reviewLabSessionMemory(pack,session,{
  npcIds:["npc.smith"]}).independentWorldEvents.length,0);
 assert.equal(reviewLabSessionMemory(pack,session,{
  npcIds:["npc.smith"],includePrivate:true}).independentWorldEvents.length,1);
});

test("NPC decisions have separate durable topic history and require their own evidence",()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.insult","D0 09:00",{
  npcInteractions:[{initiatorNpcId:"npc.bete",recipientNpcId:"npc.loki",
   action:"Bete mocks Loki",outcome:"Loki does not forgive the mockery",
   salience:"important",privacy:"private"}],
  npcDecisionChanges:[{npcId:"npc.loki",subjectId:"bete.trust",
   stance:"avoid",reason:"Bete crossed a personal line",evidenceRefs:["evt.insult"],
   privacy:"private"}],
 }));
 for(let i=0;i<28;i++)session=applyConfirmedLabEvent(session,pack,evt("evt.quiet."+i,"D0 09:00"));
 const v=buildLabSceneBrief(pack,session,{npcIds:["npc.loki"]});
 assert.equal(v.actors[0].priorDecisions[0].stance,"avoid");
 assert.equal(v.actors[0].priorDecisions[0].reason,"Bete crossed a personal line");
 assert.equal(session.npcs["npc.loki"].decisions?.["bete.trust"].revision,1);
 assert.throws(()=>applyConfirmedLabEvent(session,pack,evt("evt.unauthorized","D0 10:00",{
  npcDecisionChanges:[{npcId:"npc.finn",subjectId:"bete.trust",
   stance:"accept",reason:"Forgive automatically",evidenceRefs:["evt.insult"],
   privacy:"private"}],
 })),/LAB_NPC_DECISION_UNVERIFIED_EVIDENCE/);
 session=applyConfirmedLabEvent(session,pack,evt("evt.reconcile","D0 10:00",{
  knownBy:["npc.loki"],
  observations:[{npcId:"npc.loki",channel:"heard",perceivedFact:"Bete explained himself",
   learnedAt:"D0 10:00",confidence:"certain",salience:"ordinary",privacy:"private"}],
  npcDecisionChanges:[{npcId:"npc.loki",subjectId:"bete.trust",
   stance:"counteroffer",reason:"Willing to cooperate, not instantly trust",
   evidenceRefs:["evt.reconcile"],privacy:"private"}],
 }));
 assert.equal(session.npcs["npc.loki"].decisions?.["bete.trust"].revision,2);
 assert.equal(session.npcs["npc.loki"].decisions?.["bete.trust"].stance,"counteroffer");
});

test("narrator guard rejects borrowed knowledge, unearned stance and missed relevant memory",async()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.rifle.scene","D0 09:00",{
  knownBy:["npc.finn"],
  observations:[{npcId:"npc.finn",channel:"seen",
   perceivedFact:"Projectile pierced an iron chestplate",
   learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}],
 }));
 const input={npcIds:["npc.loki","npc.finn"],expectedSessionRevision:7,
  requiredMemoryRefs:[{npcId:"npc.finn",sourceRef:"evt.rifle.scene"}],
  beats:[{actorId:"npc.loki",kind:"speech" as const,
   summary:"Loki incorrectly knows Finn's witnessed armor test",
   factRefs:["evt.rifle.scene"],decision:{subjectId:"rifle.invention",stance:"accept" as const}}]};
 const broken=reviewLabNarration(pack,session,input,7);
 assert.equal(broken.readyToRender,false);
 assert.ok(broken.failures.some(x=>x.code==="NPC_NOT_PERSONALLY_INFORMED"));
 assert.ok(broken.failures.some(x=>x.code==="NPC_DECISION_NOT_COMMITTED"));
 assert.ok(broken.failures.some(x=>x.code==="RELEVANT_MEMORY_OMITTED"));
 const good=reviewLabNarration(pack,session,{...input,beats:[
  {actorId:"npc.finn",kind:"speech" as const,
   summary:"Acknowledges observed plate penetration, does not assert velocity",
   factRefs:["evt.rifle.scene"]}]},7);
 assert.equal(good.readyToRender,true);
 assert.equal(good.narrativeTextSemanticsVerified,false);
 assert.throws(()=>reviewLabNarration(pack,session,input,8),
  /LAB_NARRATIVE_REVIEW_SOURCE_INVALID/);
 const request:WorldV3BatchRequest={expectedSaveId:"TEST-SAVE",jobs:[{
  id:"narration",operation:"world_review",payload:{rpgLabNarrationV1:{
   projectId:pack.projectId,sessionId:session.sessionId,...input,
  }}
 }]};
 const hydrated=await hydrateLabBridgeRequest(request,
  async()=>{throw Error("wrong loader")},undefined,
  async()=>({pack,packRevision:2,session,sessionRevision:7}));
 const outcome=dispatchWorldV3Batch(hydrated,"TEST-SAVE").results[0].result;
 assert.equal(outcome.ok,true);
 if(!outcome.ok)throw Error("guard failed");
 assert.equal((outcome.value as {readyToRender:boolean}).readyToRender,false);
});
test("narrator guard denies made-up feature familiarity and unrelated project ownership",()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.halo","D0 09:00",{
  knownBy:["npc.loki"],features:[{npcId:"npc.loki",featureId:"daedalus.halo",
   channel:"seen",privacy:"private"}],
 }));
 const result=reviewLabNarration(pack,session,{
  npcIds:["npc.loki","npc.bete"],expectedSessionRevision:1,
  beats:[{actorId:"npc.bete",kind:"reaction",summary:"Bete claims to know the halo",
   factRefs:[],featureRefs:[{featureId:"daedalus.halo",knowledge:"seen"}],
   projectId:"proj.heph.thread"}]
 },1);
 assert.equal(result.readyToRender,false);
 assert.ok(result.failures.some(x=>x.code==="NPC_FEATURE_KNOWLEDGE_MISSING"));
 assert.ok(result.failures.some(x=>x.code==="NPC_NOT_PROJECT_OWNER"));
});

test("2mm test result remains verified but 10mm/25-tonne claim stays unverified",()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.load_tests","D0 09:00",{
  knownBy:["npc.smith"],
  observations:[{npcId:"npc.smith",channel:"experienced",
   perceivedFact:"Two 2mm load tests passed; the 10mm rating was only a claim",
   learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}],
  worldEvidence:[
   {factId:"material.2mm.test",statement:"Two tested 2mm threads held 1500 kgf",
    scope:"Only two samples, tested fixtures and loads",kind:"measured",
    level:"established",significance:"transformative",
    method:"Workshop tensile loading rig",observedBy:["npc.smith"]},
   {factId:"material.10mm.claim",statement:"10mm thread reportedly holds 25 tonnes",
    scope:"Single untested claimed 10mm sample",kind:"reported",
    level:"unverified",significance:"transformative",observedBy:[]},
  ],
 }));
 const brief=buildLabSceneBrief(pack,session,{npcIds:["npc.smith","npc.loki"]});
 assert.equal(brief.actors[0].knownWorldEvidence.length,2);
 assert.equal(brief.actors[1].knownWorldEvidence.length,0);
 assert.equal(brief.actors[0].knownWorldEvidence.find(
  x=>x.factId==="material.10mm.claim")?.level,"unverified");
 const common={npcIds:["npc.smith"],expectedSessionRevision:2};
 const bad=reviewLabNarration(pack,session,{...common,beats:[{
  actorId:"npc.smith",kind:"speech",summary:"25 tonnes are guaranteed",
  factRefs:["evt.load_tests"],
  worldClaims:[{factId:"material.10mm.claim",assertion:"established"}]}]},2);
 assert.equal(bad.readyToRender,false);
 assert.ok(bad.failures.some(x=>x.code==="UNVERIFIED_CLAIM_UPGRADED"));
 const good=reviewLabNarration(pack,session,{...common,beats:[{
  actorId:"npc.smith",kind:"speech",
  summary:"Two 2mm tests are measured; 10mm capacity is unverified",
  factRefs:["evt.load_tests"],worldClaims:[
   {factId:"material.2mm.test",assertion:"established"},
   {factId:"material.10mm.claim",assertion:"reported"}]}]},2);
 assert.equal(good.readyToRender,true);
 assert.throws(()=>applyConfirmedLabEvent(session,pack,evt("evt.lie","D0 09:01",{
  worldEvidence:[{factId:"material.fake.test",
   statement:"25 tonnes proved",scope:"No test",kind:"reported",
   level:"established",significance:"transformative",observedBy:[]}]
 })),/LAB_WORLD_EVIDENCE_UNVERIFIED_UPGRADE/);
});
test("important weapon demonstration is not magically known by every god",()=>{
 let session=fresh();
 session=applyConfirmedLabEvent(session,pack,evt("evt.armor","D0 09:00",{
  knownBy:["npc.finn"],observations:[{npcId:"npc.finn",channel:"seen",
   perceivedFact:"Projectile traversed both iron breastplate walls",
   learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}],
  worldEvidence:[{factId:"rifle.iron.plate",
   statement:"One rifle shot pierced both sides of a particular iron breastplate",
   scope:"At demonstrated distance, specific plate; no tested effect against Ottar",
   kind:"observed",level:"established",significance:"transformative",
   observedBy:["npc.finn"]}],
 }));
 const bad=reviewLabNarration(pack,session,{
  npcIds:["npc.loki"],expectedSessionRevision:1,beats:[{
  actorId:"npc.loki",kind:"speech",summary:"I already know the armor penetration test",
  factRefs:[],worldClaims:[{factId:"rifle.iron.plate",assertion:"established"}]}]
 },1);
 assert.equal(bad.readyToRender,false);
 assert.ok(bad.failures.some(x=>x.code==="NPC_NOT_INFORMED_OF_WORLD_EVIDENCE"));
 const fin=buildLabSceneBrief(pack,session,{npcIds:["npc.finn"]});
 assert.equal(fin.actors[0].knownWorldEvidence[0].scope.includes("no tested effect against Ottar"),true);
 assert.equal(fin.actors[0].knownWorldEvidence[0].noExtrapolation,true);
});
