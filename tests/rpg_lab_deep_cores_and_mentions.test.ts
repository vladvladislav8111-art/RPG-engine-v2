import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {DANMACHI_STARTING_NPC_COUNT} from "../src/rpg_lab_v1/danmachi_cast.ts";
import {DANMACHI_DEEP_CORE_COUNT} from "../src/rpg_lab_v1/danmachi_deep_cores.ts";
import {findLabNpcMentions,readLabMentionedNpcCores,
 recallLabNpcPersonalMemories} from "../src/rpg_lab_v1/npc_mentions.ts";
import {readLabMentionedNpcDialogue,readLabRoleplayScene}
 from "../src/rpg_lab_v1/roleplay_adapter.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent}
 from "../src/rpg_lab_v1/events.ts";
import {readLabPublicFog} from "../src/rpg_lab_v1/fog_of_war.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";

const pack=buildFreshDanmachiLabPack("danmachi_mentions_lab");
const newSession=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,
 sessionId:"npc_mentions_test",gameClock:"D0 08:00",roleplayGuard:"strict",
 player:{resources:{},stats:{},inventory:{},locationId:"orario.plaza"},
 discovered:["orario.plaza"],npcs:{},events:[]
});
const observed=(sourceRef:string,time:string,npcId:string,
 perceivedFact:string):LabConfirmedEvent=>({
 sourceRef,time,kind:"npc_background_contact",summary:perceivedFact,
 locationId:"orario.plaza",knownBy:[npcId],gmConfirmed:true,
 observations:[{npcId,channel:"experienced",perceivedFact,learnedAt:time,
  confidence:"certain",salience:"important",privacy:"private"}]
});
const withMemories=()=>{
 let session=newSession();
 session=applyConfirmedLabEvent(session,pack,observed(
  "evt.loki.armor","D0 08:10","npc.loki",
  "Локи собственными ушами слышала, как в мастерской жаловались на сломанный меч"));
 session=applyConfirmedLabEvent(session,pack,observed(
  "evt.finn.map","D0 08:20","npc.finn",
  "Финн получил закрытую карту маршрута экспедиции и не рассказывал её Локи"));
 session=applyConfirmedLabEvent(session,pack,observed(
  "evt.lili.money","D0 08:30","npc.lili",
  "Лили спрятала свой заработок в тайном кармане, никому о нём не сообщив"));
 return session;
};
test("70 character identities survive; major DanMachi actors have distinct detailed cores",()=>{
 assert.equal(Object.keys(pack.npcProfiles).length,DANMACHI_STARTING_NPC_COUNT);
 assert.equal(DANMACHI_STARTING_NPC_COUNT,70);
 assert.ok(DANMACHI_DEEP_CORE_COUNT>=45);
 const deep=Object.values(pack.npcProfiles).filter(n=>n.deepCore);
 assert.equal(deep.length,DANMACHI_DEEP_CORE_COUNT);
 for(const [id,npc] of Object.entries(pack.npcProfiles)){
  assert.ok(npc.name.length>0,id);
  assert.ok(npc.voice?.sampleLines.length,id);
  assert.ok(npc.habitualLogic?.limits.length,id);
  assert.ok(npc.habitualLogic?.socialBiases.some(x=>x.includes("доверия")),id);
  if(npc.deepCore){
   for(const field of ["publicFace","privateDrive","innerTension",
    "refusalBoundary","failurePattern","offscreenAgenda",
    "trustCondition","growthMargin","arcGuard"] as const)
    assert.ok(npc.deepCore[field].length>18,id+":"+field);
   assert.equal(npc.deepCore.sourceKind,"canon_informed_gm_interpretation");
  }
 }
 assert.notEqual(pack.npcProfiles["npc.loki"].deepCore?.trustCondition,
  pack.npcProfiles["npc.bete"].deepCore?.trustCondition);
 assert.notEqual(pack.npcProfiles["npc.finn"].deepCore?.failurePattern,
  pack.npcProfiles["npc.bell"].deepCore?.failurePattern);
 assert.equal(pack.npcProfiles["npc.lili"].faction,"soma");
 assert.equal(pack.npcProfiles["npc.welf"].faction,"hephaestus");
 assert.equal(pack.npcProfiles["npc.mikoto"].faction,"takemikazuchi");
 assert.equal(pack.npcProfiles["npc.haruhime"].faction,"ishtar");
 assert.equal(pack.npcProfiles["npc.haruhime"].entryArc,"ishtar");
});
test("Russian inflections and several named actors resolve to distinct IDs",()=>{
 const x=findLabNpcMentions(pack,
  "Риверией и Аки обсуждали Айз. Потом позвали Лилируку и Белла.");
 assert.deepEqual(new Set(x.npcIds),
  new Set(["npc.riveria","npc.aki","npc.ais","npc.lili","npc.bell"]));
 assert.equal(x.ambiguities.length,0);
 const twins=findLabNpcMentions(pack,"Тиона и Тионе тренировались.");
 assert.deepEqual(new Set(twins.npcIds),new Set(["npc.tiona","npc.tione"]));
 assert.deepEqual(findLabNpcMentions(pack,"Миах проверит счёт.").npcIds,["npc.miach"]);
 assert.deepEqual(findLabNpcMentions(pack,"Мия попросила не шуметь.").npcIds,["npc.mia"]);
 assert.equal(findLabNpcMentions(pack,"Миах проверит счёт.").npcIds.includes("npc.mia"),false);
 assert.deepEqual(findLabNpcMentions(pack,"Лилирука пришла.").npcIds,["npc.lili"]);
 assert.deepEqual(findLabNpcMentions(pack,"Прошу прощения, госпожа Гестия.").npcIds,["npc.hestia"]);
});
test("ambiguous inflection and false common-noun name are not guessed",()=>{
 const ambiguous=findLabNpcMentions(pack,"Я беседовал с Тионой о снаряжении.");
 assert.equal(ambiguous.npcIds.length,0);
 assert.equal(ambiguous.ambiguities.length,1);
 assert.deepEqual(new Set(ambiguous.ambiguities[0].candidates),
  new Set(["npc.tiona","npc.tione"]));
 assert.equal(findLabNpcMentions(pack,"В этом была моя вина.").npcIds.includes("npc.wiene"),false);
 assert.deepEqual(findLabNpcMentions(pack,"Вина попросила помочь ей.").npcIds,["npc.wiene"]);
 assert.deepEqual(findLabNpcMentions(pack,"Вчера сломался меч.").npcIds,[]);
 assert.deepEqual(findLabNpcMentions(pack,"Беллочка улыбается.").npcIds,[]);
 assert.throws(()=>findLabNpcMentions(pack,"a".repeat(6001)),/LAB_NPC_DIALOGUE_LOOKUP_INVALID/);
});
test("mention retrieval includes only each NPC's own saved memories, never knowledge by association",async()=>{
 const session=withMemories();
 const before=JSON.stringify(session);
 const loader=async()=>({pack,session,packRevision:3,sessionRevision:7});
 const ctx=await readLabMentionedNpcDialogue(loader,{
  projectId:pack.projectId,sessionId:session.sessionId,
  dialogueText:"Локи, что произошло со сломанным мечом? А Финн знает?",
  maxActors:4,maxMemories:8
 });
 assert.equal(ctx.gmOnly,true);
 assert.equal(ctx.readOnly,true);
 assert.equal(ctx.committed,false);
 assert.equal(ctx.sourceAttestedBySave,true);
 assert.equal(ctx.actors.length,2);
 const loki=ctx.actors.find(x=>x.npcId==="npc.loki")!;
 const finn=ctx.actors.find(x=>x.npcId==="npc.finn")!;
 assert.ok(loki.deepCore?.innerTension);
 assert.ok(finn.deepCore?.trustCondition);
 assert.deepEqual(loki.personalMemories.map(m=>m.sourceRef),["evt.loki.armor"]);
 assert.deepEqual(finn.personalMemories.map(m=>m.sourceRef),["evt.finn.map"]);
 assert.equal(JSON.stringify(loki).includes("evt.lili.money"),false);
 assert.equal(JSON.stringify(finn).includes("evt.lili.money"),false);
 assert.equal(loki.confirmedInCurrentScene,false);
 assert.equal(finn.observedDialogue,false);
 assert.equal(ctx.sessionRevision,7);
 assert.equal(JSON.stringify(session),before);
 assert.equal(readLabPublicFog(session).known.length,0);
});
test("same encounter can auto-select GM scene actors by dialogueText without guessing their presence",async()=>{
 const session=withMemories();
 const loader=async()=>({pack,session,packRevision:3,sessionRevision:7});
 const scene=await readLabRoleplayScene(loader,{
  projectId:pack.projectId,sessionId:session.sessionId,
  dialogueText:"Лили, ты говорила с Локи о стоимости меча?",
  maxMemories:4
 });
 assert.deepEqual(new Set(scene.actors.map(x=>x.npcId)),
  new Set(["npc.lili","npc.loki"]));
 assert.ok(scene.actors.every(a=>a.deepCanonCore?.refusalBoundary));
 assert.equal(scene.actors.find(a=>a.npcId==="npc.lili")?.eventObservation,"not_recorded");
 assert.deepEqual(scene.dialogueRelevantPersonalMemories
  ?.find(x=>x.npcId==="npc.lili")?.memories.map(m=>m.sourceRef),
  ["evt.lili.money"]);
 assert.equal(scene.dialogueLookupDoesNotProveWitnessing,true);
 assert.equal(scene.readOnly,true);
 assert.equal(scene.committed,false);
});
test("topic ranking does not invent a memory and an unknown name remains unresolved",()=>{
 const session=withMemories();
 assert.deepEqual(recallLabNpcPersonalMemories(session,"npc.bell",
  "Что ты помнишь о мече?",8),[]);
 assert.deepEqual(readLabMentionedNpcCores(pack,session,
  "А что думает неизвестный кузнец Фардин?").actors,[]);
 const old=JSON.stringify(session);
 const result=readLabMentionedNpcCores(pack,session,"Гермес и Асфи хотят поговорить.");
 assert.deepEqual(new Set(result.actors.map(x=>x.npcId)),
  new Set(["npc.hermes","npc.asfi"]));
 assert.equal(JSON.stringify(session),old);
});
