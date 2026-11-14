import test from "node:test";
import assert from "node:assert/strict";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {validateLabSession,withSessionDefaults,type LabSession,type LabMemory} from "../src/rpg_lab_v1/session.ts";
import {reviewLabSessionMemory} from "../src/rpg_lab_v1/memory_view.ts";
import {encodeLabSession,decodeLabSession} from "../src/rpg_lab_v1/session_storage.ts";
import {hydrateLabBridgeRequest} from "../src/rpg_lab_v1/bridge.ts";
import {dispatchWorldV3Batch,type WorldV3BatchRequest} from "../src/world_sim_v3/runtime_facade.ts";
const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"danmachi_test",worldId:"danmachi.orario",
 formulas:{},resources:{hp:{min:0,max:100}},
 lootTables:{},prices:{},economy:{taxRate:0},
 locations:{dungeon_f07:{name:"7-й этаж",kind:"dungeon_floor",neighbors:{}}},
 npcProfiles:{
  "npc.loki":{name:"Локи",canonRef:"canon.loki",traits:["observant"],goals:["family"],knownFacts:[]},
  "npc.finn":{name:"Финн",canonRef:"canon.finn",traits:["calm"],goals:["safety"],knownFacts:[]},
  "npc.lefiya":{name:"Лефия",canonRef:"canon.lefiya",traits:["earnest"],goals:["study"],knownFacts:[]},
 },progression:{}
};
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:"danmachi_test",sessionId:"linos_test",
 gameClock:"Day 1 06:00",player:{resources:{hp:95},stats:{STR:100},inventory:{}},
 discovered:["dungeon_f07"],npcs:{},events:[]
});
const baseEvent:LabConfirmedEvent={
 sourceRef:"evt.thread",time:"D1 09:10",kind:"training",
 summary:"A spider adventurer demonstrated a thread",knownBy:["npc.loki"],
 locationId:"dungeon_f07",gmConfirmed:true,
 observations:[{npcId:"npc.loki",channel:"seen",
 perceivedFact:"Я видела, как Линос использует особую нить",
 learnedAt:"D1 09:10",confidence:"certain",salience:"important",privacy:"private"}]
};
function chained(){
 const seen=applyConfirmedLabEvent(fresh(),pack,baseEvent);
 const report:LabConfirmedEvent={
  sourceRef:"evt.report",time:"D1 09:30",kind:"conversation",
  summary:"Loki tells Finn about the thread",knownBy:[],gmConfirmed:true,
  observations:[{npcId:"npc.finn",channel:"report",sourceActor:"npc.loki",
   relayedSourceRef:"evt.thread",perceivedFact:"Локи рассказала о необычной нити",
   learnedAt:"D1 09:30",confidence:"likely",salience:"ordinary",privacy:"small_group"}]
 };
 return applyConfirmedLabEvent(seen,pack,report);
}
test("verified gossip requires a real source with previous observation",()=>{
 const x=chained();
 assert.equal(x.npcs["npc.loki"].memories[0].sourceRef,"evt.thread");
 assert.equal(x.npcs["npc.finn"].memories[0].relayedSourceRef,"evt.thread");
 assert.equal(x.npcs["npc.finn"].memories[0].sourceActor,"npc.loki");
 assert.equal(x.npcs["npc.lefiya"],undefined);
 assert.equal(x.events.length,2);
 assert.equal(x.gameClock,"D1 09:30");
});
test("unobserved report cannot be passed off as verified relay",()=>{
 const event:LabConfirmedEvent={
  sourceRef:"evt.fake",time:"D1 09:40",kind:"rumor",summary:"Unverified Finn report",
  knownBy:[],gmConfirmed:true,
  observations:[{npcId:"npc.lefiya",channel:"rumor",sourceActor:"npc.finn",
   relayedSourceRef:"evt.thread",perceivedFact:"Финн якобы знает все особенности нити",
   learnedAt:"D1 09:40",confidence:"uncertain",salience:"ordinary",privacy:"public"}]
 };
 assert.throws(()=>applyConfirmedLabEvent(fresh(),pack,event),/LAB_EVENT_RELAY_SOURCE_UNVERIFIED/);
});
test("multi-hop hearsay preserves separate knowledge owners and changing confidence",()=>{
 const one=chained();
 const event:LabConfirmedEvent={
  sourceRef:"evt.gossip",time:"D1 10:00",kind:"conversation",summary:"Lefiya hears a rumor",
  knownBy:[],gmConfirmed:true,
  observations:[{npcId:"npc.lefiya",channel:"rumor",sourceActor:"npc.finn",
   relayedSourceRef:"evt.report",perceivedFact:"Кто-то назвал нить совершенно непробиваемой",
   learnedAt:"D1 10:00",confidence:"uncertain",salience:"ordinary",privacy:"public"}]
 };
 const two=applyConfirmedLabEvent(one,pack,event);
 const view=reviewLabSessionMemory(pack,two,{npcIds:["npc.loki","npc.finn","npc.lefiya"]});
 assert.equal(view.npcSummaries[0].memories.length,0);
 assert.equal(view.npcSummaries[1].memories.length,0);
 assert.equal(view.npcSummaries[2].memories.length,1);
 assert.equal(view.npcSummaries[2].memories[0].confidence,"uncertain");
 assert.equal(view.npcSummaries[2].memories[0].objectiveTruthGuaranteed,false);
 const privateView=reviewLabSessionMemory(pack,two,{npcIds:["npc.loki","npc.finn"],includePrivate:true});
 assert.equal(privateView.npcSummaries[0].memories[0].sourceRef,"evt.thread");
 assert.equal(privateView.npcSummaries[1].memories[0].relayedSourceRef,"evt.thread");
});
test("resuming a session supplies the actual NPC memory refs to read-only evaluation",()=>{
 const one=chained();
 const jobs=withSessionDefaults([{id:"npc.test",kind:"npc",args:{
  npcId:"npc.finn",event:{kind:"conversation",sourceRef:"evt.finn_next",witnessedByNpc:true}
 }}],one);
 assert.deepEqual(jobs[0].args.memoryRefs,["evt.report"]);
 assert.deepEqual(jobs[0].args.knownFactIds,["evt.report"]);
});
test("clock rollback is rejected but previous clock remains intact",()=>{
 const one=chained();
 const e={...baseEvent,sourceRef:"evt.back",time:"D1 08:00"};
 assert.throws(()=>applyConfirmedLabEvent(one,pack,e),/LAB_EVENT_CLOCK_REGRESSION/);
 assert.equal(one.gameClock,"D1 09:30");
});
test("read-only memory bridge retrieves only requested NPCs without scene commit",async()=>{
 const remembered=chained();
 const req:WorldV3BatchRequest={expectedSaveId:"TEST-SAVE",jobs:[
  {id:"danmachi.memory",operation:"world_review",payload:{rpgLabSessionV1:{
   projectId:"danmachi_test",sessionId:"linos_test",
   npcIds:["npc.finn"],maxPerNpc:5,includePrivate:true
  }}}
 ]};
 const loaded=await hydrateLabBridgeRequest(req,
  async()=>{throw Error("pack loader should not be touched")},
  undefined,
  async(projectId,sessionId)=>{
   assert.equal(projectId,"danmachi_test");
   assert.equal(sessionId,"linos_test");
   return {pack,packRevision:3,session:remembered,sessionRevision:2};
  });
 const sim=dispatchWorldV3Batch(loaded,"TEST-SAVE");
 assert.equal(sim.committed,false);
 const one=sim.results[0].result;
 assert.equal(one.ok,true);
 if(!one.ok)throw Error("LAB_MEMORY_BRIDGE_TEST_FAILED");
 const v=one.value as {npcSummaries:{npcId:string;memories:unknown[]}[];sessionRevision:number};
 assert.equal(v.sessionRevision,2);
 assert.equal(v.npcSummaries.length,1);
 assert.equal(v.npcSummaries[0].npcId,"npc.finn");
 assert.equal(v.npcSummaries[0].memories.length,1);
});
test("cross-project session retrieval is denied by bridge",async()=>{
 const request:WorldV3BatchRequest={expectedSaveId:"TEST-SAVE",jobs:[{
  id:"bad_memory",operation:"world_review",payload:{rpgLabSessionV1:{
   projectId:"danmachi_test",sessionId:"linos_test",npcIds:["npc.finn"]
  }}
 }]};
 await assert.rejects(()=>hydrateLabBridgeRequest(request,
 async()=>{throw Error("should not load")},undefined,
 async()=>({pack:{...pack,projectId:"other_world"},packRevision:3,session:fresh(),sessionRevision:1})),
 /LAB_SESSION_BRIDGE_PROJECT_MISMATCH/);
});
test("large memory sessions use compressed KV record, and legacy records still decode",async()=>{
 const large=fresh();
 const long="Длинное воспоминание о событии: "+"нить звенела под потолком ".repeat(14);
 const mem:LabMemory[]=[];
 for(let i=0;i<87;i++)mem.push({
  sourceRef:"evt."+i,summary:long,perceivedFact:long,learnedAt:"D1 09:10",
  knownBy:["npc.loki"],salience:"ordinary",privacy:"private",
 });
 large.npcs["npc.loki"]={knownFacts:mem.map(m=>m.sourceRef),memories:mem};
 validateLabSession(large,pack);
 assert.ok(new TextEncoder().encode(JSON.stringify(large)).length>45000);
 const stored=await encodeLabSession(large,pack,2);
 assert.ok(stored.sessionGzip);
 assert.ok(stored.sessionGzip!.length<50000);
 assert.deepEqual(await decodeLabSession(stored,pack),large);
 const legacy={revision:1,updatedAt:"2026-11-14",session:fresh()};
 assert.deepEqual(await decodeLabSession(legacy,pack),legacy.session);
});
test("false witness list and unconfirmed events never become a memory",()=>{
 const fake={...baseEvent,knownBy:[]};
 assert.throws(()=>applyConfirmedLabEvent(fresh(),pack,fake),/LAB_EVENT_NO_DIRECT_WITNESS_EVIDENCE/);
 assert.equal(fresh().events.length,0);
});
