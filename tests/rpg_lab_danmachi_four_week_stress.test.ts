import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
import {actorHasEraFact,readDanmachiEraNpcContext} from "../src/rpg_lab_v1/danmachi_era_cores_v2.ts";
import {proposeDanmachiNpcIntentCycle} from "../src/rpg_lab_v1/danmachi_intentions_v2.ts";
import {auditDanmachiEraScene} from "../src/rpg_lab_v1/danmachi_scene_audit_v2.ts";

const pack=buildFreshDanmachiLabPack("danmachi_long_stress");
const fresh=():LabSession=>({schema:"RPG_LAB_SESSION_V1",
 projectId:pack.projectId,sessionId:"four_week_stress",gameClock:"D0 09:00",
 player:{resources:{hp:100,mp:100,stamina:100},stats:{},inventory:{}},
 discovered:[],npcs:{},events:[]});
const direct=(id:string,summary:string,time:string) => ({
 npcId:id,channel:"experienced" as const,perceivedFact:summary,learnedAt:time,
 confidence:"certain" as const,salience:"important" as const,privacy:"private" as const
});
const event=(ref:string,time:string,kind:string,summary:string,ids:string[]=[]):
 LabConfirmedEvent=>({sourceRef:ref,time,kind,summary,knownBy:ids,
 gmConfirmed:true,observations:ids.map(id=>direct(id,summary,time))});
const add=(s:LabSession,e:LabConfirmedEvent)=>applyConfirmedLabEvent(s,pack,e);

test("one-month narrative: witnesses, reports, secrecy and independent actions do not leak",()=>{
 let s=fresh();
 s=add(s,event("evt.bell.minotaur","D0 09:10","rescue",
  "Айз лично спасла Белла от первого минотавра",["npc.bell","npc.ais"]));
 assert.equal(s.npcs["npc.hestia"],undefined);
 assert.equal(actorHasEraFact(s,"npc.finn","xenos.loki.alliance"),false);

 s=add(s,{sourceRef:"evt.bell.tells.hestia",time:"D0 10:00",
  kind:"report",summary:"Белл рассказал Гестии, что Айз спасла его",knownBy:[],
  gmConfirmed:true,observations:[{npcId:"npc.hestia",channel:"report",
   sourceActor:"npc.bell",relayedSourceRef:"evt.bell.minotaur",
   perceivedFact:"Белл рассказал, что был спасён Айз",
   learnedAt:"D0 10:00",confidence:"likely",salience:"important",privacy:"private"}]});
 assert.ok(s.npcs["npc.hestia"].memories.some(x=>x.relayedSourceRef==="evt.bell.minotaur"));
 assert.equal(s.npcs["npc.eina"],undefined);

 const family=["npc.freya","npc.ottar","npc.allen","npc.hedin","npc.horn"];
 s=add(s,event("evt.san.assault","D2 12:00","assault",
  "Незнакомец атаковал владения Фрейи и без тяжёлых травм удерживал бойцов в воздухе",
  family));
 const signal=family.map(actorId=>({actorId,sourceRef:"evt.san.assault",
  kind:"freya_threat" as const}));
 const intents=proposeDanmachiNpcIntentCycle(pack,s,{
  npcIds:family,fromMinute:3600,toMinute:3600,signals:signal});
 assert.equal(intents.intents.filter(x=>x.kind==="reactive").length,5);
 assert.ok(intents.intents.find(x=>x.actorId==="npc.allen")?.action.includes("атаки"));
 assert.ok(intents.intents.find(x=>x.actorId==="npc.hedin")?.action.includes("подходы"));
 assert.ok(intents.intents.every(x=>x.alreadyOccurred===false));
 assert.equal(s.worldEvents?.length??0,0);
 assert.equal(s.npcs["npc.finn"],undefined);

 const disguise=auditDanmachiEraScene(pack,s,[
  {actorId:"npc.horn",publicIdentityClaim:"horn_sees_souls"}]);
 assert.equal(disguise.readyToRender,false);
 const freyaDisguise=auditDanmachiEraScene(pack,s,[
  {actorId:"npc.horn",publicIdentityClaim:"npc.freya"}]);
 assert.equal(freyaDisguise.readyToRender,true);

 s=add(s,event("evt.san.departure","D2 13:00","departure",
  "Незнакомец ушёл, Фрейя не смогла объяснить ситуацию",family));
 s=add(s,event("evt.letter.one","D9 00:10","unknown_letter",
  "В стену ворот прилетел первый металлический штырь",["npc.ottar","npc.hedin"]));
 assert.equal(s.npcs["npc.freya"].memories.some(x=>x.sourceRef==="evt.letter.one"),false);

 const agenda=proposeDanmachiNpcIntentCycle(pack,s,{
  npcIds:["npc.ottar","npc.hedin","npc.freya"],
  fromMinute:9*1440+10,toMinute:16*1440+10,
  signals:[{actorId:"npc.hedin",sourceRef:"evt.letter.one",kind:"unknown_letter"}]});
 assert.ok(agenda.intents.some(x=>x.actorId==="npc.hedin"&&x.kind==="reactive"));
 assert.ok(agenda.intents.some(x=>x.actorId==="npc.freya"&&x.kind==="routine"));
 assert.equal(agenda.committed,false);

 s=add(s,event("evt.letter.two","D16 00:15","unknown_letter",
  "Второй штырь с письмом найден стражниками",["npc.ottar"]));
 s=add(s,event("evt.letter.three","D23 00:20","unknown_letter",
  "Третий штырь найден ночью у ворот",["npc.ottar"]));
 s=add(s,event("evt.maxim.return","D28 18:00","appearance",
  "Максим появился в Фольквангре, тело постепенно рассеивалось",
  ["npc.freya","npc.ottar","npc.horn","npc.hedin"]));
 assert.equal(s.npcs["npc.finn"],undefined);
 assert.equal(actorHasEraFact(s,"npc.ottar","history.maxim.last_battle"),true);
 assert.equal(actorHasEraFact(s,"npc.hedin","history.maxim.last_battle"),false);

 s=add(s,{sourceRef:"evt.freya.soul_sight",time:"D28 18:02",
  kind:"observation",summary:"Фрейя лично не обнаружила душу у Максима",
  knownBy:["npc.freya"],gmConfirmed:true,
  observations:[direct("npc.freya",
   "Божественным зрением Фрейя не обнаружила душу Максима","D28 18:02")],
  worldEvidence:[{
   factId:"freya.soul.of.maxim.absent",
   statement:"Фрейя лично не видит душу Максима",
   scope:"Только божественное наблюдение Фрейи в Фольквангре",
   kind:"observed",level:"established",significance:"transformative",
   observedBy:["npc.freya"]
  }]});
 assert.equal(actorHasEraFact(s,"npc.freya","freya.soul.of.maxim.absent"),true);
 assert.equal(actorHasEraFact(s,"npc.ottar","freya.soul.of.maxim.absent"),false);
 assert.equal(auditDanmachiEraScene(pack,s,[{actorId:"npc.freya",
  claims:[{factId:"freya.soul.of.maxim.absent",assertion:"certain"}]}]).readyToRender,true);
 assert.equal(auditDanmachiEraScene(pack,s,[{actorId:"npc.ottar",
  claims:[{factId:"freya.soul.of.maxim.absent",assertion:"certain"}]}]).readyToRender,false);

 // Freya speaks directly to Ottar: a new observation grants reported,
 // never first-hand divine sight.
 s=add(s,{sourceRef:"evt.freya.tells.ottar",time:"D28 18:04",
  kind:"report",summary:"Фрейя сказала Оттару об отсутствии души",
  knownBy:[],gmConfirmed:true,
  observations:[{npcId:"npc.ottar",channel:"report",
   sourceActor:"npc.freya",relayedSourceRef:"evt.freya.soul_sight",
   perceivedFact:"Фрейя сообщила, что не видит души Максима",
   learnedAt:"D28 18:04",confidence:"likely",
   salience:"life_defining",privacy:"small_group"}]});
 assert.equal(actorHasEraFact(s,"npc.ottar","freya.soul.of.maxim.absent"),true,
  "An actor who heard a source-bound report must be able to state it as REPORTED");
 assert.equal(auditDanmachiEraScene(pack,s,[{actorId:"npc.ottar",
  claims:[{factId:"freya.soul.of.maxim.absent",assertion:"reported"}]}]).readyToRender,true);
 assert.equal(auditDanmachiEraScene(pack,s,[{actorId:"npc.ottar",
  claims:[{factId:"freya.soul.of.maxim.absent",assertion:"certain"}]}]).readyToRender,false);

 const finn=readDanmachiEraNpcContext(pack,s,["npc.finn"],"Максим воскрес Ксеносы");
 assert.equal(finn?.actors[0].knownCanon.some(f=>f.id==="freya.soul.of.maxim.absent"),false);
 assert.equal(s.events.length,9);
});
