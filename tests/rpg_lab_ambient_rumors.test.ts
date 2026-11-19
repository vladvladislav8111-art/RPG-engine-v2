import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {readLabAmbientRumors} from "../src/rpg_lab_v1/ambient_rumors.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
const pack=buildFreshDanmachiLabPack("rumor_mvp");
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,sessionId:"rumor_test",
 gameClock:"D0 08:00",roleplayGuard:"strict",
 player:{resources:{},stats:{},inventory:{},locationId:"orario.plaza"},
 discovered:["orario.plaza"],npcs:{},events:[]
});
const evt=(sourceRef:string,time:string,more:Partial<LabConfirmedEvent>):LabConfirmedEvent=>({
 sourceRef,time,kind:"player_turn",summary:sourceRef,knownBy:[],gmConfirmed:true,...more
});
test("public eyewitness seeds local unverified rumor without granting player or NPC knowledge",()=>{
 const s=applyConfirmedLabEvent(fresh(),pack,evt("evt.public","D0 08:01",{
  locationId:"orario.plaza",playerLocationId:"orario.plaza",playerWitnessed:true,
  ambientRumorChanges:[{rumorId:"rumor.one",topic:"weapon",claim:"Видели необычное оружие",
  locationId:"orario.plaza",sourceKind:"public_event"}]
 }));
 assert.equal(readLabAmbientRumors(s,"orario.plaza").length,1);
 assert.equal(readLabAmbientRumors(s,"orario.guild").length,0);
 assert.equal(s.ambientRumors?.["rumor.one"].status,"unverified");
 assert.equal(s.playerFog,undefined);
 assert.equal(s.npcs["npc.finn"],undefined);
});
test("unwitnessed story and unproven remote relay cannot be committed",()=>{
 assert.throws(()=>applyConfirmedLabEvent(fresh(),pack,evt("evt.fake","D0 08:01",{
  locationId:"orario.plaza",ambientRumorChanges:[{rumorId:"r.fake",topic:"visitor",
  claim:"Кто-то видел тайну",locationId:"orario.plaza",sourceKind:"public_event"}]
 })),/LAB_AMBIENT_RUMOR_WITNESS_REQUIRED/);
 const s=applyConfirmedLabEvent(fresh(),pack,evt("evt.public","D0 08:01",{
  locationId:"orario.plaza",playerLocationId:"orario.plaza",playerWitnessed:true,
  ambientRumorChanges:[{rumorId:"r.first",topic:"stranger",claim:"Кто-то что-то видел",
  locationId:"orario.plaza",sourceKind:"public_event"}]
 }));
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.teleport","D0 08:10",{
  locationId:"orario.guild",ambientRumorChanges:[{rumorId:"r.distant",topic:"stranger",
  claim:"Кто-то что-то видел",locationId:"orario.guild",sourceKind:"witness_relay",
  parentRumorId:"r.first",sourceNpcId:"npc.eina"}]
 })),/LAB_AMBIENT_RUMOR_UNVERIFIED_RELAY/);
});
test("publicly retold local rumor persists as separate variant",()=>{
 const s=applyConfirmedLabEvent(fresh(),pack,evt("evt.public","D0 08:01",{
  locationId:"orario.plaza",playerLocationId:"orario.plaza",playerWitnessed:true,
  ambientRumorChanges:[{rumorId:"r.first",topic:"stranger",claim:"Видели странный клинок",
  locationId:"orario.plaza",sourceKind:"public_event"}]
 }));
 assert.throws(()=>applyConfirmedLabEvent(s,pack,evt("evt.empty","D0 08:10",{
  locationId:"orario.plaza",ambientRumorChanges:[{rumorId:"r.repeat",topic:"stranger",
  claim:"Светящийся клинок",locationId:"orario.plaza",sourceKind:"local_repetition",
  parentRumorId:"r.first"}]
 })),/LAB_AMBIENT_RUMOR_NO_PUBLIC_REPETITION/);
 const repeated=applyConfirmedLabEvent(s,pack,evt("evt.retell","D0 08:11",{
  locationId:"orario.plaza",knownBy:["npc.eina","npc.misha"],
  npcInteractions:[{initiatorNpcId:"npc.eina",recipientNpcId:"npc.misha",
   action:"обсудили оружие",outcome:"слух изменился",salience:"ordinary",privacy:"public"}],
  ambientRumorChanges:[{rumorId:"r.repeat",topic:"stranger",claim:"Светящийся клинок",
   locationId:"orario.plaza",sourceKind:"local_repetition",parentRumorId:"r.first"}]
 }));
 assert.equal(Object.keys(repeated.ambientRumors??{}).length,2);
 assert.equal(repeated.ambientRumors?.["r.repeat"].originRef,"evt.public");
 assert.equal(repeated.ambientRumors?.["r.first"].claim,"Видели странный клинок");
});
