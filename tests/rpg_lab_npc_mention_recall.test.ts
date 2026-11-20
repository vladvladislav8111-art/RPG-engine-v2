import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {DANMACHI_STARTING_NPC_COUNT} from "../src/rpg_lab_v1/danmachi_cast.ts";
import {DANMACHI_DEEP_CORE_COUNT} from "../src/rpg_lab_v1/danmachi_deep_cores.ts";
import {DANMACHI_ALIAS_PROFILE_COUNT,findLabNpcMentions,
 readLabMentionedNpcCores,recallLabNpcPersonalMemories} from "../src/rpg_lab_v1/npc_mentions.ts";
import {readLabMentionedNpcDialogue,readLabRoleplayScene} from "../src/rpg_lab_v1/roleplay_adapter.ts";
import {validateLabPack} from "../src/rpg_lab_v1/engine.ts";
import {validateLabSession,type LabSession,type LabMemory} from "../src/rpg_lab_v1/session.ts";

const pack=buildFreshDanmachiLabPack("npc_mentions_lab");
const makeSession=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,sessionId:"mention_test",
 gameClock:"D0 08:00",roleplayGuard:"strict",
 player:{resources:{},stats:{},inventory:{},locationId:"orario.plaza"},
 discovered:["orario.plaza"],npcs:{},events:[]
});
const memory=(sourceRef:string,summary:string,npcId:string,salience="important"):LabMemory=>({
 sourceRef,summary,perceivedFact:summary,learnedAt:"D0 07:10",eventTime:"D0 07:10",
 knownBy:[npcId],locationId:"orario.plaza",channel:"seen",salience,
 confidence:"certain",privacy:"private"
});
test("70 distinct deep cores are meaningful, validated and canon character templates remain fixed",()=>{
 assert.equal(DANMACHI_STARTING_NPC_COUNT,70);
 assert.equal(DANMACHI_DEEP_CORE_COUNT,DANMACHI_STARTING_NPC_COUNT);
 assert.equal(DANMACHI_ALIAS_PROFILE_COUNT,53);
 validateLabPack(pack);
 assert.equal(Object.values(pack.npcProfiles).filter(p=>p.deepCore).length,DANMACHI_STARTING_NPC_COUNT);
 for(const [id,npc] of Object.entries(pack.npcProfiles)){
  if(!npc.deepCore)continue;
  const c=npc.deepCore;
  for(const prop of ["publicFace","privateDrive","innerTension","refusalBoundary",
   "failurePattern","offscreenAgenda","trustCondition","growthMargin","arcGuard"] as const)
   assert.ok(c[prop].length>=20,id+" lacks "+prop);
  assert.equal(c.sourceKind,"canon_informed_gm_interpretation");
  assert.ok(npc.habitualLogic?.limits.some(x=>x.includes(c.refusalBoundary)),id);
  assert.ok(npc.habitualLogic?.socialBiases.some(x=>x.includes(c.trustCondition)),id);
 }
 assert.match(pack.npcProfiles["npc.bete"].deepCore!.arcGuard,/дружбе/);
 assert.match(pack.npcProfiles["npc.finn"].deepCore!.refusalBoundary,/планами/);
 assert.match(pack.npcProfiles["npc.lili"].deepCore!.arcGuard,/Сомы/);
 assert.match(pack.npcProfiles["npc.ryuu"].deepCore!.arcGuard,/трагическое прошлое/);
 assert.match(pack.npcProfiles["npc.freya"].deepCore!.arcGuard,/Сир/);
 assert.ok(pack.npcProfiles["npc.alicia"].deepCore?.publicFace);
});
test("names and grammatical cases resolve individually with no forced scene presence",()=>{
 const found=findLabNpcMentions(pack,
  "Риверия ответила Лефии. Потом Локи упомянула Финна, Белла и Лили.");
 assert.deepEqual(found.npcIds,[
  "npc.riveria","npc.lefiya","npc.loki","npc.finn","npc.bell","npc.lili"
 ]);
 assert.equal(found.ambiguities.length,0);
 assert.equal(found.mentionDoesNotEstablishPresence,true);
 assert.equal(found.mentionDoesNotEstablishKnowledge,true);
 const noFalse=findLabNpcMentions(pack,"Мия рассказала Миаху о торговле.");
 assert.deepEqual(noFalse.npcIds,["npc.mia","npc.miach"]);
 const nested=findLabNpcMentions(pack,"Цубаки показала меч Риверии");
 assert.deepEqual(nested.npcIds,["npc.tsubaki","npc.riveria"]);
});
test("Tiona and Tione collisions are never guessed; full names are unambiguous",()=>{
 const unclear=findLabNpcMentions(pack,"Говорила с Тионой.");
 assert.equal(unclear.npcIds.length,0);
 assert.deepEqual(new Set(unclear.ambiguities[0].candidates),
  new Set(["npc.tiona","npc.tione"]));
 const certain=findLabNpcMentions(pack,"Тиона Хирьюте позвала Тионе Хирьюте");
 assert.deepEqual(certain.npcIds,["npc.tiona","npc.tione"]);
 assert.equal(certain.ambiguities.length,0);
});
test("single dialogue retrieves the mentioned NPC's OWN personal memory, never another's",()=>{
 const s=makeSession();
 s.npcs["npc.riveria"]={knownFacts:[],memories:[
  memory("evt.magic","Риверия проверила магические узоры Лефии","npc.riveria"),
  memory("evt.tea","Риверия выпила чай в своей комнате","npc.riveria","ordinary"),
 ]};
 s.npcs["npc.lefiya"]={knownFacts:[],memories:[
  memory("evt.tutor","Лефия запомнила ошибку в заклинании","npc.lefiya"),
  memory("evt.secret","Лефия рассказала секрет без Риверии","npc.lefiya"),
 ]};
 validateLabSession(s,pack);
 const before=JSON.stringify(s);
 const result=readLabMentionedNpcCores(pack,s,
  "Риверия вспоминает магические узоры Лефии",8,2);
 assert.deepEqual(result.actors.map(a=>a.npcId),["npc.riveria","npc.lefiya"]);
 assert.equal(result.gmOnly,true);
 assert.equal(result.notPlayerVisible,true);
 assert.equal(result.dialogueOnlyReference,true);
 assert.equal(result.actors[0].confirmedInCurrentScene,false);
 assert.equal(result.actors[0].personalMemories[0].sourceRef,"evt.magic");
 assert.ok(result.actors[0].personalMemories.every(m=>m.sourceRef!=="evt.tutor"));
 assert.ok(result.actors[1].personalMemories.every(m=>m.sourceRef!=="evt.magic"));
 assert.equal(result.actors[1].memoryOnlyFromOwnState,true);
 assert.equal(JSON.stringify(s),before);
});
test("a mention without NPC experience does not manufacture memories or relationships",()=>{
 const s=makeSession();
 const result=readLabMentionedNpcCores(pack,s,
  "Фрейя и Оттар обсуждают слухи о странном оружии");
 assert.deepEqual(result.actors.map(a=>a.npcId),["npc.freya","npc.ottar"]);
 for(const actor of result.actors){
  assert.deepEqual(actor.personalMemories,[]);
  assert.deepEqual(actor.relationshipState,{});
  assert.deepEqual(actor.socialDynamics,{});
  assert.equal(actor.confirmedInCurrentScene,false);
  assert.ok(actor.deepCore);
 }
 assert.equal(s.npcs["npc.freya"],undefined);
 assert.equal(s.npcs["npc.ottar"],undefined);
});
test("GM roleplay adapter supports dialogue-only lookup and carries separate relevant memory",async()=>{
 const s=makeSession();
 s.npcs["npc.loki"]={knownFacts:[],memories:[
  memory("evt.loki","Локи узнала секрет о запасах вина","npc.loki")
 ]};
 s.npcs["npc.finn"]={knownFacts:[],memories:[
  memory("evt.finn","Финн запомнил проблему на экспедиции","npc.finn")
 ]};
 const before=JSON.stringify(s);
 const load=async()=>({pack,session:s,packRevision:7,sessionRevision:11});
 const privateScene=await readLabRoleplayScene(load,{
  projectId:pack.projectId,sessionId:s.sessionId,
  dialogueText:"Локи вспоминает вино, а Финн готовит экспедицию",
  maxMemories:3
 });
 assert.equal(privateScene.actors.length,2);
 assert.deepEqual(privateScene.actors.map(x=>x.npcId),["npc.loki","npc.finn"]);
 assert.equal(privateScene.dialogueLookupDoesNotProveWitnessing,true);
 assert.equal(privateScene.resolvedByDialogue?.mentionDoesNotEstablishPresence,true);
 assert.equal(privateScene.dialogueRelevantPersonalMemories?.[0].memories[0].sourceRef,
  "evt.loki");
 assert.equal(privateScene.dialogueRelevantPersonalMemories?.[1].memories[0].sourceRef,
  "evt.finn");
 assert.equal(privateScene.packRevision,7);
 assert.equal(privateScene.sessionRevision,11);
 assert.equal(JSON.stringify(s),before);
 const tool=await readLabMentionedNpcDialogue(load,{
  projectId:pack.projectId,sessionId:s.sessionId,
  dialogueText:"Финн сказал Локи про экспедицию"
 });
 assert.equal(tool.sourceAttestedBySave,true);
 assert.equal(tool.actors.length,2);
 assert.equal(tool.actors[0].npcId,"npc.finn");
 assert.equal(tool.actors[0].personalMemories[0].sourceRef,"evt.finn");
 assert.equal(tool.actors[1].npcId,"npc.loki");
});
test("dialogue absent or ambiguous never invents a cast member",()=>{
 const s=makeSession();
 assert.deepEqual(findLabNpcMentions(pack,"Случайный кузнец чинит доспех").npcIds,[]);
 const unclear=readLabMentionedNpcCores(pack,s,"Кто-то говорил с Тионой.");
 assert.deepEqual(unclear.actors,[]);
 assert.equal(unclear.unresolvedAmbiguities.length,1);
 assert.throws(()=>readLabMentionedNpcCores(pack,s,"М".repeat(6001)),
  /LAB_NPC_DIALOGUE_LOOKUP_INVALID/);
 assert.throws(()=>recallLabNpcPersonalMemories(s,"npc.loki","Локи",25),
  /LAB_NPC_RECALL_REQUEST_INVALID/);
});
