import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {applyConfirmedLabEvent} from "../src/rpg_lab_v1/events.ts";
import {readPrivateNpcSuspicion} from "../src/rpg_lab_v1/danmachi_suspicion.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
const pack=buildFreshDanmachiLabPack("suspicion_npc_test");
const fresh=():LabSession=>({schema:"RPG_LAB_SESSION_V1",
 projectId:pack.projectId,sessionId:"suspicion_example",
 gameClock:"D0 12:00",roleplayGuard:"strict",
 player:{resources:{},stats:{},inventory:{},locationId:"orario.guild"},
 discovered:["orario.guild"],npcs:{},events:[]});
test("Eina can personally suspect unusual inventory without Freya or Finn acquiring her memory",()=>{
 const s=fresh();
 const next=applyConfirmedLabEvent(s,pack,{
  sourceRef:"evt.eina.sees.inventory",time:"D0 12:01",
  kind:"player_turn",summary:"Эйна видит, как возле героя появляется предмет",
  knownBy:["npc.eina"],gmConfirmed:true,
  observations:[{
   npcId:"npc.eina",channel:"seen",perceivedFact:"Перед героем появился неизвестный предмет",
   learnedAt:"D0 12:01",confidence:"certain",salience:"important",privacy:"private"
  }],
  npcSuspicionChanges:[{
   npcId:"npc.eina",sourceRef:"evt.eina.sees.inventory",
   tag:"unusual_inventory",delta:20,
   context:"Лично увидела внезапное появление снаряжения"
  }]
 });
 assert.equal(next.npcs["npc.eina"].suspicion?.score,20);
 assert.ok(next.npcs["npc.eina"].memories.some(m=>m.sourceRef==="evt.eina.sees.inventory"));
 assert.equal(next.npcs["npc.freya"],undefined);
 assert.equal(next.npcs["npc.finn"],undefined);
 assert.equal(readPrivateNpcSuspicion(next,["npc.eina"])[0].notKnowledgeOfActualSystem,true);
 assert.equal(s.npcs["npc.eina"],undefined);
 assert.throws(()=>applyConfirmedLabEvent(next,pack,{
  sourceRef:"evt.repeat.no.evidence",time:"D0 12:02",
  kind:"player_turn",summary:"Второе начисление без личного наблюдения",
  knownBy:["npc.eina"],gmConfirmed:true,
  npcSuspicionChanges:[{
   npcId:"npc.eina",sourceRef:"evt.eina.sees.inventory",
   tag:"same_evidence",delta:15,context:"Попытка повторного учёта"
  }]
 }),/DUPLICATE_EVIDENCE/);
});
test("one actor's observation cannot be used as another actor's suspicion proof",()=>{
 const s=fresh();
 assert.throws(()=>applyConfirmedLabEvent(s,pack,{
  sourceRef:"evt.seen.by.eina",time:"D0 12:01",
  kind:"player_turn",summary:"Эйна видела аномалию",
  knownBy:["npc.eina","npc.freya"],gmConfirmed:true,
  observations:[{
   npcId:"npc.eina",channel:"seen",perceivedFact:"Видела странный инвентарь",
   learnedAt:"D0 12:01",confidence:"certain",salience:"important",privacy:"private"
  }],
  npcSuspicionChanges:[{
   npcId:"npc.freya",sourceRef:"evt.seen.by.eina",
   tag:"inventory",delta:20,context:"Фрейя не видела этого события"
  }]
 }),/NOT_PERSONALLY_KNOWN/);
});
