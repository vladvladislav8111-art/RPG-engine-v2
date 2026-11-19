import test from "node:test";
import assert from "node:assert/strict";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {applyGuardedLabEvent} from "../src/rpg_lab_v1/turn_guard.ts";
import {requiredLabWorldCycleActors} from "../src/rpg_lab_v1/living_world_cycle_v2.ts";
import {readLabRoleplayScene} from "../src/rpg_lab_v1/roleplay_adapter.ts";

const at=(day:number,hour:number)=>day*1440+hour*60;
const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"daedalus_seven_days",
 worldId:"danmachi.orario",formulas:{},resources:{hp:{min:0,max:100}},
 lootTables:{},prices:{},economy:{taxRate:0},progression:{},
 locations:{
  gate:{name:"Orario city gate",kind:"gate",neighbors:{}},
  guild:{name:"Guild",kind:"office",neighbors:{}},
  heph:{name:"Hephaestus Familia workshop",kind:"workshop",neighbors:{}},
  manor:{name:"Twilight Manor",kind:"residence",neighbors:{}},
  range:{name:"Loki Familia private range",kind:"training",neighbors:{}},
 },
 npcProfiles:{
  "npc.tsubaki":{name:"Tsubaki",canonRef:"danmachi.tsubaki",
   traits:["direct","curious","playful","master smith"],goals:["forge good weapons"],knownFacts:[]},
  "npc.hephaestus":{name:"Hephaestus",canonRef:"danmachi.hephaestus",
   traits:["professional","stern","craftsmanship"],goals:["develop excellent smiths"],knownFacts:[]},
  "npc.loki":{name:"Loki",canonRef:"danmachi.loki",
   traits:["irreverent","teasing","protective","pragmatic"],goals:["support own familia"],knownFacts:[]},
  "npc.finn":{name:"Finn",canonRef:"danmachi.finn",
   traits:["strategic","pragmatic"],goals:["familia security"],knownFacts:[]},
  "npc.tiona":{name:"Tiona",canonRef:"danmachi.tiona",
   traits:["curious","impulsive","friendly"],goals:["explore"],knownFacts:[]},
  "npc.bete":{name:"Bete",canonRef:"danmachi.bete",
   traits:["blunt","rude","competitive"],goals:["get stronger"],knownFacts:[]},
  "npc.riveria":{name:"Riveria",canonRef:"danmachi.riveria",
   traits:["responsible","serious"],goals:["protect the familia"],knownFacts:[]},
  "npc.lefiya":{name:"Lefiya",canonRef:"danmachi.lefiya",
   traits:["shy","studious"],goals:["improve magic"],knownFacts:[]},
  "npc.guild":{name:"Guild clerk",canonRef:"danmachi.guild",
   traits:["organized"],goals:["record familia memberships"],knownFacts:[]},
  "npc.raoul":{name:"Raul",canonRef:"danmachi.raoul",
   traits:["earnest","careful"],goals:["serve Loki Familia"],knownFacts:[]},
 },};
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,sessionId:"seven_day_check",
 roleplayGuard:"strict",gameClock:"D0 08:00",
 player:{resources:{hp:100},stats:{},inventory:{}},discovered:[],npcs:{},
 events:[],worldEvents:[],
});
const evt=(id:string,clock:string,other:Partial<LabConfirmedEvent>={}):LabConfirmedEvent=>({
 sourceRef:id,time:clock,kind:"scene",summary:id,
 knownBy:[],gmConfirmed:true,...other,
});
const observation=(npcId:string,perceivedFact:string,learnedAt:string,
 salience:"ordinary"|"important"|"life_defining"="important",
 privacy:"public"|"small_group"|"private"="small_group")=>({
 npcId,channel:"seen" as const,perceivedFact,learnedAt,
 confidence:"certain" as const,salience,privacy,
});
const project=(status:"accepted"|"active"|"blocked"|"rejected",revision:number,
 lastReviewMinute:number,nextReviewMinute?:number)=>({
 ownerNpcId:"npc.tsubaki",originRef:"evt.heph_apply",
 title:"Daedalus applicant screening (NOT membership)",
 stage:status==="accepted"?"Technical check received, await review":
   status==="active"?"Candidate interview pending":
   status==="blocked"?"Verify existing Loki blessing; cannot admit twice":
   "Applicant already belongs to Loki Familia; no second blessing",
 status,privacy:"hidden" as const,locationId:"heph",
 startedMinute:at(0,11),lastReviewMinute,
 ...(nextReviewMinute!==undefined?{nextReviewMinute}:{}),
 revision,latestEvidenceRef:"",
 ...(status==="blocked"?{blockerReason:"Candidate has an existing confirmed Familia blessing"}:{}),
});

function runScenario(){
 let state=fresh(),rev=1;
 const commit=(event:LabConfirmedEvent)=>{state=applyConfirmedLabEvent(state,pack,event);rev++;};
 commit(evt("evt.character","D0 08:10",{
  kind:"character_setup",playerFeatureChanges:[
   {featureId:"daedalus.halo",action:"set",expectedRevision:0,playerApproved:true,
    feature:{description:"Floating luminous halo",significance:"transformative",visibility:"obvious"}},
   {featureId:"daedalus.clock_eyes",action:"set",expectedRevision:0,playerApproved:true,
    feature:{description:"Bronze-gold mechanical eyes with rotating clock hands",
     significance:"transformative",visibility:"obvious"}},
   {featureId:"daedalus.glowing_marks",action:"set",expectedRevision:0,playerApproved:true,
    feature:{description:"Glowing patterns on the skin",significance:"notable",visibility:"obvious"}},
  ],
 }));
 commit(evt("evt.arrival","D0 09:00",{
  locationId:"gate",knownBy:["npc.guild"],
  observations:[observation("npc.guild",
   "Sixteen-year-old arrival introduced himself as Daedalus; halo and clock eyes",
   "D0 09:00")],
  features:[
   {npcId:"npc.guild",featureId:"daedalus.halo",
    channel:"seen",significance:"transformative",privacy:"small_group"},
   {npcId:"npc.guild",featureId:"daedalus.clock_eyes",
    channel:"seen",significance:"transformative",privacy:"small_group"},
  ],
 }));
 const received=project("accepted",1,at(0,11),at(2,12));
 received.latestEvidenceRef="evt.heph_apply";
 commit(evt("evt.heph_apply","D0 11:00",{
  locationId:"heph",knownBy:["npc.tsubaki"],
  observations:[observation("npc.tsubaki",
   "Saw Daedalus complete an engineering evaluation and submit membership application",
   "D0 11:00")],
  features:[{npcId:"npc.tsubaki",featureId:"daedalus.halo",
   channel:"seen",significance:"transformative",privacy:"small_group"}],
  worldProjectChanges:[{projectId:"heph.application",expectedRevision:0,record:received}],
 }));
 commit(evt("evt.loki_join","D0 18:00",{
  locationId:"manor",knownBy:["npc.loki","npc.finn","npc.raoul"],
  observations:[
   observation("npc.loki","Loki personally bestowed Falna on Daedalus",
    "D0 18:00","life_defining"),
   observation("npc.finn","Saw Daedalus become a Loki Familia member",
    "D0 18:00","important"),
   observation("npc.raoul","Saw Daedalus admitted into Loki Familia",
    "D0 18:00","important"),
  ],
  features:[{npcId:"npc.loki",featureId:"daedalus.halo",channel:"seen",
   significance:"transformative",privacy:"small_group"}],
  worldEvidence:[{factId:"daedalus.falna",kind:"observed",level:"established",
   statement:"Daedalus received Loki's Falna, one Familia affiliation",
   scope:"Only Loki admission; not a second Hephaestus blessing",
   significance:"transformative",observedBy:["npc.loki","npc.finn","npc.raoul"]}],
 }));
 // Guild learns of the joining via actual actor-to-actor document delivery.
 commit(evt("evt.guild_register","D1 09:00",{
  locationId:"guild",
  npcInteractions:[{initiatorNpcId:"npc.raoul",recipientNpcId:"npc.guild",
   action:"Raul registers Loki's new follower",outcome:"Guild confirms Loki membership",
   salience:"important",privacy:"public"}],
  observations:[{npcId:"npc.guild",channel:"report",sourceActor:"npc.raoul",
   relayedSourceRef:"evt.loki_join",
   perceivedFact:"Raul reported that Daedalus received Loki's Falna",
   learnedAt:"D1 09:00",confidence:"certain",salience:"important",privacy:"public"}],
  rumorRelays:[{speakerNpcId:"npc.raoul",listenerNpcId:"npc.guild",
   sourceMemoryRef:"evt.loki_join"}],
 }));
 commit(evt("evt.loki_first_dinner","D1 11:00",{
  locationId:"manor",knownBy:["npc.tiona","npc.bete","npc.riveria","npc.lefiya"],
  observations:[
   observation("npc.tiona","Met Daedalus with a halo and unusual eyes","D1 11:00"),
   observation("npc.bete","Saw strange-looking new Loki Familia recruit Daedalus","D1 11:00"),
   observation("npc.riveria","Met Daedalus; observed halo and mechanical-looking eyes","D1 11:00"),
   observation("npc.lefiya","Met unfamiliar recruit Daedalus with mechanical eyes","D1 11:00")
  ],
  features:["npc.tiona","npc.bete","npc.riveria","npc.lefiya"].map(npcId=>({
   npcId,featureId:"daedalus.clock_eyes",channel:"seen" as const,
   significance:"transformative" as const,privacy:"small_group" as const
  })),
  npcInteractions:[{initiatorNpcId:"npc.tiona",recipientNpcId:"npc.bete",
   action:"Tiona asks whether Bete noticed the newcomer's clockwork eyes",
   outcome:"Bete dismisses the theatrical appearance",salience:"ordinary",
   privacy:"small_group"}],
 }));
 const reviewing=project("active",2,at(2,12),at(4,12));
 reviewing.latestEvidenceRef="evt.heph_review";
 commit(evt("evt.heph_review","D2 12:00",{
  locationId:"heph",
  worldActions:[{npcId:"npc.tsubaki",action:"Reviews engineering trial and application",
   outcome:"Recommends personal meeting with Hephaestus",privacy:"hidden",
   locationId:"heph"}],
  npcInteractions:[{initiatorNpcId:"npc.tsubaki",recipientNpcId:"npc.hephaestus",
   action:"Tsubaki briefs her goddess about tested apprentice Daedalus",
   outcome:"Hephaestus decides to ask for an interview",salience:"important",
   privacy:"small_group"}],
  observations:[{npcId:"npc.hephaestus",channel:"report",
   sourceActor:"npc.tsubaki",relayedSourceRef:"evt.heph_apply",
   perceivedFact:"Tsubaki reports an unusual applicant passed an engineering evaluation",
   learnedAt:"D2 12:00",confidence:"likely",salience:"important",
   privacy:"small_group"}],
  rumorRelays:[{speakerNpcId:"npc.tsubaki",listenerNpcId:"npc.hephaestus",
   sourceMemoryRef:"evt.heph_apply"}],
  worldProjectChanges:[{projectId:"heph.application",expectedRevision:1,
   record:reviewing}],
 }));
 commit(evt("evt.musket","D3 12:00",{
  locationId:"range",knownBy:["npc.finn","npc.tiona","npc.bete"],
  observations:[
   observation("npc.finn","Witnessed precise shots from a musket at 50 m",
    "D3 12:00"),
   observation("npc.tiona","Witnessed musket demonstration on practice targets",
    "D3 12:00"),
   observation("npc.bete","Witnessed weapon hit a target from distance",
    "D3 12:00")
  ],
  worldEvidence:[{factId:"weapon.musket.50m",kind:"observed",
   level:"established",statement:"Musket achieved accurate hits at tested range",
   scope:"Observed target hits at 50m, not speed or maximum range",
   significance:"transformative",observedBy:["npc.finn","npc.tiona","npc.bete"]}],
 }));
 const blocked=project("blocked",3,at(4,12),at(7,11));
 blocked.latestEvidenceRef="evt.heph_eligibility";
 commit(evt("evt.heph_eligibility","D4 12:00",{
  locationId:"guild",
  worldActions:[{npcId:"npc.tsubaki",action:"Checks applicant's affiliation with Guild",
   outcome:"Discovers he already belongs to Loki Familia",privacy:"hidden",
   locationId:"guild"}],
  npcPositions:[{npcId:"npc.tsubaki",locationId:"guild"}],
  npcInteractions:[{initiatorNpcId:"npc.tsubaki",recipientNpcId:"npc.guild",
   action:"Tsubaki verifies application eligibility against Guild registry",
   outcome:"Guild confirms Loki's registered blessing",salience:"important",
   privacy:"small_group"}],
  observations:[{npcId:"npc.tsubaki",channel:"report",
   sourceActor:"npc.guild",relayedSourceRef:"evt.guild_register",
   perceivedFact:"Guild reports that Daedalus joined Loki on Day 0",
   learnedAt:"D4 12:00",confidence:"certain",salience:"important",privacy:"small_group"}],
  rumorRelays:[{speakerNpcId:"npc.guild",listenerNpcId:"npc.tsubaki",
   sourceMemoryRef:"evt.guild_register"}],
  worldProjectChanges:[{projectId:"heph.application",expectedRevision:2,
   record:blocked}],
 }));
 commit(evt("evt.communication","D5 13:00",{
  locationId:"manor",knownBy:["npc.finn","npc.riveria","npc.lefiya"],
  observations:[
   observation("npc.finn","Saw Daedalus assemble a communication apparatus; range not measured",
    "D5 13:00"),
   observation("npc.riveria","Observed assembled device with magic-stone components",
    "D5 13:00"),
   observation("npc.lefiya","Observed a completed communications prototype",
    "D5 13:00")
  ],
  worldEvidence:[{factId:"device.communication.prototype",kind:"observed",
   level:"established",statement:"Communication apparatus has been assembled",
   scope:"Existence of prototype only; working range and reliability not measured",
   significance:"notable",
   observedBy:["npc.finn","npc.riveria","npc.lefiya"]}],
 }));
 commit(evt("evt.awp","D6 15:00",{
  locationId:"range",knownBy:["npc.finn","npc.tiona","npc.bete"],
  observations:[
   observation("npc.finn","Witnessed long rifle penetrate an iron breastplate at 100m",
    "D6 15:00"),
   observation("npc.tiona","Saw AWP-type rifle perforate both sides of iron breastplate",
    "D6 15:00"),
   observation("npc.bete","Saw weapon penetrate iron breastplate with a single shot",
    "D6 15:00")
  ],
  worldEvidence:[{factId:"weapon.awp.armor",kind:"observed",
   level:"established",
   statement:"A long rifle shot pierced both walls of a particular iron breastplate",
   scope:"Observed at 100m with this plate; no projectile velocity, magic defense or Ottar testing",
   significance:"transformative",
   observedBy:["npc.finn","npc.tiona","npc.bete"]}],
 }));
 return {state,rev,commit};
}
test("Daedalus first week: dossier, patron, musket, communication and rifle stay source-bound",async()=>{
 const {state:s}=runScenario();
 assert.equal(s.player.visibleFeatures?.["daedalus.halo"].description,
  "Floating luminous halo");
 assert.equal(s.worldProjects?.["heph.application"].status,"blocked");
 assert.equal(s.worldProjects?.["heph.application"].blockerReason,
  "Candidate has an existing confirmed Familia blessing");
 assert.equal(s.worldEvidence?.["daedalus.falna"].level,"established");
 assert.equal(s.npcs["npc.tsubaki"].memories.some(m=>
  m.relayedSourceRef==="evt.guild_register"),true);
 assert.equal(s.npcs["npc.hephaestus"].memories.some(m=>
  m.relayedSourceRef==="evt.heph_apply"),true);
 assert.equal(s.npcs["npc.hephaestus"].memories.some(m=>
  m.relayedSourceRef==="evt.guild_register"),false);
 assert.equal(s.npcs["npc.hephaestus"].memories.some(m=>
  m.sourceRef==="evt.musket"||m.sourceRef==="evt.awp"),false);
 assert.equal(s.npcs["npc.finn"].memories.some(m=>m.sourceRef==="evt.awp"),true);
 assert.equal(s.npcs["npc.riveria"].memories.some(m=>m.sourceRef==="evt.awp"),false);
 assert.equal(s.npcs["npc.riveria"].memories.some(m=>
  m.sourceRef==="evt.communication"),true);
 const load=async()=>({pack,session:s,sessionRevision:11,packRevision:3});
 const heph=await readLabRoleplayScene(load,{
  projectId:pack.projectId,sessionId:s.sessionId,
  npcIds:["npc.hephaestus","npc.tsubaki","npc.finn"]});
 assert.equal(heph.actors.find(x=>x.npcId==="npc.hephaestus")!
  .knownWorldEvidence.some(x=>x.factId==="weapon.awp.armor"),false);
 assert.equal(heph.actors.find(x=>x.npcId==="npc.finn")!
  .knownWorldEvidence.some(x=>x.factId==="weapon.awp.armor"),true);
 assert.equal(heph.actors.find(x=>x.npcId==="npc.tsubaki")!
  .activeResponsibilities.some(x=>x.projectId==="heph.application"),true);
 assert.equal(heph.livingWorldCycle?.work.length,0);
});
test("Day 7: pending application must be reviewed and professionally resolved",()=>{
 const {state:s}=runScenario();
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.day7.skip","D7 12:00")),
  /LAB_WORLD_PROJECT_REVIEW_REQUIRED/);
 const closed=project("rejected",4,at(7,11));
 closed.latestEvidenceRef="evt.heph_decision";
 const event=evt("evt.heph_decision","D7 11:00",{
  locationId:"heph",
  worldActions:[
   {npcId:"npc.tsubaki",action:"Closes screening as ineligible after Guild confirmation",
    outcome:"Recruitment declined, potential external collaboration remains open",
    privacy:"hidden",locationId:"heph"},
   {npcId:"npc.hephaestus",action:"Reviews Tsubaki's eligibility report",
    outcome:"Refuses second Familia admission but may invite independent craftsmanship",
    privacy:"hidden",locationId:"heph"}
  ],
  npcInteractions:[{initiatorNpcId:"npc.tsubaki",
   recipientNpcId:"npc.hephaestus",
   action:"Tsubaki submits Guild-confirmed affiliation",
   outcome:"Hephaestus rules Daedalus cannot join while blessed by Loki",
   salience:"important",privacy:"small_group"}],
  observations:[{npcId:"npc.hephaestus",channel:"report",
   sourceActor:"npc.tsubaki",relayedSourceRef:"evt.heph_eligibility",
   perceivedFact:"Tsubaki verified Daedalus already belongs to Loki",
   learnedAt:"D7 11:00",confidence:"certain",
   salience:"important",privacy:"small_group"}],
  rumorRelays:[{speakerNpcId:"npc.tsubaki",listenerNpcId:"npc.hephaestus",
   sourceMemoryRef:"evt.heph_eligibility"}],
  worldProjectChanges:[{projectId:"heph.application",expectedRevision:3,record:closed}],
 });
 // State cannot be mutated without a review of the living world after 12+ hours.
 assert.throws(()=>applyGuardedLabEvent(s,pack,event,12),
  /LAB_STRICT_WORLD_CYCLE_REVIEW_REQUIRED/);
 const actors=requiredLabWorldCycleActors(s,at(7,11));
 assert.ok(actors.includes("npc.tsubaki"));
 const guarded={...event,
  worldCycleReview:{fromMinute:at(6,15),toMinute:at(7,11),
   actorReviews:actors.map(npcId=>({
    npcId,status:(npcId==="npc.tsubaki"||
     npcId==="npc.hephaestus"?"acted":"no_change") as "acted"|"no_change",
    reason:"Reviewed actor's saved responsibilities and evidence without inventing offscreen actions",
   }))},
  narrationPlan:{npcIds:["npc.tsubaki","npc.hephaestus"],beats:[
   {actorId:"npc.tsubaki",kind:"action" as const,
    summary:"Tsubaki tells Hephaestus the candidate already joined Loki",
    factRefs:["evt.heph_decision"],projectId:"heph.application"},
   {actorId:"npc.hephaestus",kind:"speech" as const,
    summary:"Hephaestus refuses second admission, keeps collaboration possible",
    factRefs:["evt.heph_decision"]},
  ]}
 };
 const accepted=applyGuardedLabEvent(s,pack,guarded,12);
 assert.equal(accepted.guardVerified,true);
 assert.equal(accepted.next.worldProjects?.["heph.application"].status,"rejected");
 assert.equal(accepted.next.worldProjects?.["heph.application"].revision,4);
 assert.equal(accepted.next.gameClock,"D7 11:00");
 assert.equal(s.worldProjects?.["heph.application"].status,"blocked");
 assert.equal(accepted.next.npcs["npc.hephaestus"].memories.some(x=>
  x.relayedSourceRef==="evt.heph_eligibility"),true);
 assert.equal(accepted.next.npcs["npc.hephaestus"].memories.some(x=>
  x.sourceRef==="evt.awp"),false);
});
