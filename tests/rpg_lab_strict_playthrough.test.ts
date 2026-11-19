import test from "node:test";
import assert from "node:assert/strict";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
import type {LabTurnWithPlan} from "../src/rpg_lab_v1/turn_guard.ts";
import {applyGuardedLabEvent} from "../src/rpg_lab_v1/turn_guard.ts";
import {hydrateLabBridgeRequest} from "../src/rpg_lab_v1/bridge.ts";
import {dispatchWorldV3Batch,type WorldV3BatchRequest} from "../src/world_sim_v3/runtime_facade.ts";

const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"strict_play_demo",worldId:"danmachi.orario",
 formulas:{},resources:{hp:{min:0,max:100}},lootTables:{},prices:{},
 economy:{taxRate:0},locations:{workshop:{name:"Hephaestus workshop",
 kind:"workshop",neighbors:{}}},
 npcProfiles:{
  "npc.loki":{name:"Loki",canonRef:"danmachi.loki",
   traits:["perverse","teasing","pragmatic","protective"],goals:["family"],knownFacts:[]},
  "npc.finn":{name:"Finn",canonRef:"danmachi.finn",
   traits:["strategic","cautious"],goals:["familia security"],knownFacts:[]},
  "npc.smith":{name:"Hephaestus smith",canonRef:"danmachi.smith",
   traits:["curious","busy"],goals:["improve equipment"],knownFacts:[]},
 },progression:{},
};
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,
 sessionId:"strict_demo",gameClock:"D0 08:00",roleplayGuard:"strict",
 player:{resources:{hp:100},stats:{},inventory:{}},discovered:[],
 npcs:{},events:[],worldEvents:[],
});
const event=(ref:string,time:string,parts:Partial<LabTurnWithPlan>={}):LabTurnWithPlan=>({
 sourceRef:ref,time,kind:"scene",summary:"Confirmed gameplay",knownBy:[],
 gmConfirmed:true,...parts,
});
function demo(){
 let session=fresh(),rev=1;
 const write=(e:LabTurnWithPlan)=>{
  const res=applyGuardedLabEvent(session,pack,e,rev);
  session=res.next;rev++;return res;
 };
 const read=async()=>({pack,packRevision:7,session,sessionRevision:rev});
 const v3=async(payload:Record<string,unknown>)=>{
  const req:WorldV3BatchRequest={expectedSaveId:"TEST-SAVE",jobs:[
   {id:"roleplay",operation:"world_review",payload}
  ]};
  const pre=await hydrateLabBridgeRequest(req,
    async()=>{throw Error("wrong bridge loader")},undefined,read);
  return dispatchWorldV3Batch(pre,"TEST-SAVE").results[0].result;
 };
 return {write,v3,current:()=>session,revision:()=>rev};
}
test("full 40-turn playthrough: scene brief -> strict commit -> narration check -> new NPC first encounter",async()=>{
 const x=demo();
 x.write(event("evt.char","D0 08:05",{
  kind:"character_setup",
  playerFeatureChanges:[{featureId:"daedalus.halo",expectedRevision:0,
    action:"set",playerApproved:true,
    feature:{description:"Radiant halo over the head",
     significance:"transformative",visibility:"obvious"}}],
 }));
 let v=await x.v3({rpgLabSceneV1:{
  projectId:pack.projectId,sessionId:"strict_demo",
  npcIds:["npc.loki","npc.finn"]}});
 assert.equal(v.ok,true);
 if(!v.ok)throw Error("scene load failed");
 const first=v.value as any;
 assert.equal(first.actors[0].featureAwareness[0].possibleFirstSighting,true);
 assert.equal(first.actors[1].featureAwareness[0].personallySeen,false);
 assert.throws(()=>x.write(event("evt.halo","D0 09:00",{
  knownBy:["npc.loki"],
  features:[{npcId:"npc.loki",featureId:"daedalus.halo",channel:"seen",
    significance:"transformative",privacy:"private"}],
  observations:[{npcId:"npc.loki",channel:"seen",perceivedFact:"Saw Daedalus's halo",
    learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}]
 })),/LAB_STRICT_NARRATION_PLAN_REQUIRED/);
 assert.equal(x.revision(),2);
 x.write(event("evt.halo","D0 09:00",{
  knownBy:["npc.loki"],
  features:[{npcId:"npc.loki",featureId:"daedalus.halo",channel:"seen",
    significance:"transformative",privacy:"private"}],
  observations:[{npcId:"npc.loki",channel:"seen",perceivedFact:"Saw Daedalus's halo",
    learnedAt:"D0 09:00",confidence:"certain",salience:"important",privacy:"private"}],
  narrationPlan:{npcIds:["npc.loki"],beats:[{
   actorId:"npc.loki",kind:"reaction",summary:"Loki notices the halo and teases",
   factRefs:["evt.halo"],
   featureRefs:[{featureId:"daedalus.halo",knowledge:"seen"}]}]}
 }));
 v=await x.v3({rpgLabNarrationV1:{
  projectId:pack.projectId,sessionId:"strict_demo",npcIds:["npc.loki"],
  expectedSessionRevision:x.revision(),contextEventRef:"evt.halo",
  beats:[{actorId:"npc.loki",kind:"speech",summary:"So, a halo? You're interesting~",
   factRefs:["evt.halo"],
   featureRefs:[{featureId:"daedalus.halo",knowledge:"seen"}]}],
 }});
 assert.equal(v.ok,true);
 if(!v.ok)throw Error("narration review failed");
 assert.equal((v.value as any).readyToRender,true);
 for(let i=0;i<40;i++)x.write(event("evt.quiet."+i,"D0 09:00"));
 v=await x.v3({rpgLabSceneV1:{
  projectId:pack.projectId,sessionId:"strict_demo",
  npcIds:["npc.loki","npc.finn"]}});
 assert.equal(v.ok,true);
 if(!v.ok)throw Error("context after 40 turns unavailable");
 const later=v.value as any;
 assert.equal(later.actors[0].featureAwareness[0].personallySeen,true);
 assert.equal(later.actors[1].featureAwareness[0].possibleFirstSighting,true);
 assert.equal(later.actors[1].memories.length,0);
});
test("full workshop cycle: source evidence, delayed obligations and no omniscient gods",async()=>{
 const x=demo();
 // An ordinary non-NPC event can precede research without a fabricated reaction.
 x.write(event("evt.enter","D0 08:05",{summary:"Arrived in Orario"}));
 const material=event("evt.submit","D0 10:00",{
  knownBy:["npc.smith"],
  observations:[{npcId:"npc.smith",channel:"experienced",
   perceivedFact:"Two 2mm samples actually held 1500 kgf, 10mm claim untested",
   learnedAt:"D0 10:00",confidence:"certain",salience:"important",privacy:"private"}],
  worldEvidence:[
   {factId:"fiber.2mm.measured",statement:"Two 2mm threads resisted 1500 kgf",
    scope:"Two measured samples only",kind:"measured",level:"established",
    significance:"transformative",observedBy:["npc.smith"],method:"Workshop load rig"},
   {factId:"fiber.10mm.claim",statement:"Claimed 10mm load of 25 tonnes",
    scope:"Untested 10mm piece",kind:"reported",level:"unverified",
    significance:"transformative",observedBy:[]},
  ],
  worldProjectChanges:[{projectId:"proj.heph.tests",expectedRevision:0,
   record:{ownerNpcId:"npc.smith",originRef:"evt.submit",
    title:"Rare thread testing",stage:"2mm measured; determine 10mm fixture",
    status:"accepted",privacy:"hidden",startedMinute:600,lastReviewMinute:600,
    nextReviewMinute:1980,revision:1,latestEvidenceRef:"evt.submit"}}],
  narrationPlan:{npcIds:["npc.smith"],beats:[{
   actorId:"npc.smith",kind:"reaction",
   summary:"Smith confirms two measurements and schedules more testing",
   factRefs:["evt.submit"],projectId:"proj.heph.tests",
   worldClaims:[{factId:"fiber.2mm.measured",assertion:"established"},
    {factId:"fiber.10mm.claim",assertion:"reported"}]}]},
 });
 assert.equal(x.write(material).guardVerified,true);
 const beforeRevision=x.revision();
 assert.throws(()=>x.write(event("evt.skip","D2 12:00")),
  /LAB_WORLD_PROJECT_REVIEW_REQUIRED/);
 assert.equal(x.revision(),beforeRevision);
 let v=await x.v3({rpgLabTickV1:{
  projectId:pack.projectId,sessionId:"strict_demo",
  toMinute:2040,npcIds:["npc.smith"]}});
 assert.equal(v.ok,true);
 if(!v.ok)throw Error("work review load failed");
 assert.equal((v.value as any).results[0].value.resolutionRequired,true);
 assert.deepEqual((v.value as any).results[0].value.unresolvedProjectReviews,
  ["proj.heph.tests"]);
 assert.equal(x.current().npcs["npc.loki"],undefined);
 const updated=event("evt.research","D1 10:00",{
  kind:"world_review",
  worldActions:[{npcId:"npc.smith",
   action:"continues thread research",
   outcome:"No suitable heavy-duty fixture; seeks alternative",
   privacy:"hidden"}],
  worldProjectChanges:[{projectId:"proj.heph.tests",expectedRevision:1,
   record:{...material.worldProjectChanges![0].record,
    status:"blocked",stage:"Investigate non-destructive test",
    blockerReason:"No calibrated 25-tonne fixture",
    nextReviewMinute:3420,lastReviewMinute:2039,revision:2,
    latestEvidenceRef:"evt.research"}}],
  narrationPlan:{npcIds:["npc.smith"],beats:[{
   actorId:"npc.smith",kind:"action",
   summary:"Smith cannot test 10mm yet and seeks appropriate equipment",
   factRefs:[],projectId:"proj.heph.tests"}]},
 });
 // The strict ledger requires an exact review timestamp.
 assert.throws(()=>x.write(updated),/LAB_WORLD_PROJECT_REVISION_CONFLICT/);
 const valid={...updated,time:"D1 10:00",
  worldProjectChanges:[{...updated.worldProjectChanges![0],
   record:{...updated.worldProjectChanges![0].record,lastReviewMinute:2040}}]};
 // The journal keeps both test confirmations and the blocked research stage.
 const done=x.write(valid);
 assert.equal(done.guardVerified,true);
 assert.equal(x.current().worldProjects?.["proj.heph.tests"].status,"blocked");
 assert.equal(x.current().worldEvidence?.["fiber.10mm.claim"].level,"unverified");
});
