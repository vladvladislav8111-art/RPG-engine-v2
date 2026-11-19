import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {DANMACHI_EARLY_ANCHOR,readDanmachiEraNpcContext,
 actorHasEraFact} from "../src/rpg_lab_v1/danmachi_era_cores_v2.ts";
import {proposeDanmachiNpcIntentCycle} from "../src/rpg_lab_v1/danmachi_intentions_v2.ts";
import {auditDanmachiEraScene} from "../src/rpg_lab_v1/danmachi_scene_audit_v2.ts";
import {readLabRoleplayScene,reviewLabRoleplayScene,
 readLabMentionedNpcDialogue} from "../src/rpg_lab_v1/roleplay_adapter.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";

const pack=buildFreshDanmachiLabPack("danmachi_era_v2_test");
const empty=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,
 sessionId:"danmachi_era_v2",gameClock:"D0 09:00",
 player:{resources:{hp:100,mp:100,stamina:100},stats:{},inventory:{}},
 discovered:[],npcs:{},events:[]
});
const heard=(s:LabSession,id:string,ref:string)=>{
 const state=s.npcs[id]??{knownFacts:[],memories:[]};
 state.memories.push({sourceRef:ref,summary:"Персонаж лично услышал свидетельство",
  perceivedFact:"Персонаж лично услышал свидетельство",
  learnedAt:"D0 09:00",knownBy:[id],confidence:"likely",
  salience:"important",privacy:"private"});
 s.npcs[id]=state;return s;
};
test("Bell's join precedes first Ais minotaur rescue; no invented absolute calendar date",()=>{
 assert.equal(DANMACHI_EARLY_ANCHOR.relativeDay,0);
 assert.equal(DANMACHI_EARLY_ANCHOR.calendarDateKnown,false);
 assert.ok(DANMACHI_EARLY_ANCHOR.before.includes("bell.joined.hestia"));
 assert.equal(DANMACHI_EARLY_ANCHOR.openingIncident,"bell.first_minotaur_rescue_by_ais");
 assert.ok(DANMACHI_EARLY_ANCHOR.notYet.includes("xenos.loki.alliance"));
});
test("knowledge is per actor and early-Xenos information does not leak to Loki leaders",()=>{
 const s=empty();
 assert.equal(actorHasEraFact(s,"npc.ouranos","xenos.ouranos.fels"),true);
 assert.equal(actorHasEraFact(s,"npc.fels","xenos.ouranos.fels"),true);
 assert.equal(actorHasEraFact(s,"npc.finn","xenos.ouranos.fels"),false);
 assert.equal(actorHasEraFact(s,"npc.riveria","xenos.loki.alliance"),false);
 assert.equal(actorHasEraFact(s,"npc.ottar","history.maxim.last_battle"),true);
 assert.equal(actorHasEraFact(s,"npc.hedin","history.maxim.last_battle"),false);
 assert.equal(actorHasEraFact(s,"npc.freya","bell.parentage.meteria"),false);
 const x=readDanmachiEraNpcContext(pack,s,
  ["npc.finn","npc.riveria","npc.ottar","npc.horn"],"Максим и Ксеносы")!;
 assert.ok(x.actors[2].knownCanon.some(k=>k.id==="history.maxim.last_battle"));
 assert.ok(x.actors[0].cannotAssume.includes("xenos.loki.alliance"));
 assert.ok(x.actors[3].kernel?.hardBoundary.includes("секрет"));
});
test("narration audit rejects future spoilers, other character's memory and impossible Horn ability",()=>{
 const s=empty();
 const review=auditDanmachiEraScene(pack,s,[
  {actorId:"npc.finn",claims:[{factId:"xenos.loki.alliance",assertion:"certain"}]},
  {actorId:"npc.hedin",claims:[{factId:"history.maxim.last_battle",assertion:"certain"}]},
  {actorId:"npc.horn",publicIdentityClaim:"horn_sees_souls"},
  {actorId:"npc.freya",claims:[{factId:"bell.parentage.meteria",assertion:"certain"}]},
  {actorId:"npc.ottar",claims:[{factId:"history.maxim.last_battle",assertion:"certain"}]},
 ]);
 assert.equal(review.readyToRender,false);
 const codes=review.failures.map(f=>f.code);
 assert.ok(codes.includes("FUTURE_CANON_LEAK"));
 assert.ok(codes.includes("OTHER_ACTOR_KNOWLEDGE_LEAK"));
 assert.ok(codes.includes("CANON_ABILITY_CONTRADICTION"));
 assert.equal(review.failures.some(f=>f.actorId==="npc.ottar"),false);
});
test("narration audit prevents accidental reveal, gratuitous trust, repeated shouting and invented result",()=>{
 const r=auditDanmachiEraScene(pack,empty(),[
  {actorId:"npc.horn",publicIdentityClaim:"reveal_syr_secret"},
  {actorId:"npc.allen",mannerismTag:"shouts"},
  {actorId:"npc.allen",mannerismTag:"shouts"},
  {actorId:"npc.allen",mannerismTag:"shouts",newTrustWithoutEvent:true,
   outcome:{sourceRef:"evt.false_victory",status:"completed"}},
 ]);
 assert.equal(r.readyToRender,false);
 for(const code of ["PREMATURE_SECRET_REVEAL","REPETITIVE_REACTION_PATTERN",
  "UNCOMMITTED_OUTCOME","UNSUPPORTED_RELATIONSHIP_FLIP"])
  assert.ok(r.failures.some(x=>x.code===code),code);
});
test("independent agenda requires personal sources, does not grant success and is deterministic",()=>{
 const s=heard(empty(),"npc.ottar","evt.maxim_return");
 const input={npcIds:["npc.ottar","npc.finn"],fromMinute:0,toMinute:1440,
  signals:[{actorId:"npc.ottar",sourceRef:"evt.maxim_return",
   kind:"maxim_appearance" as const}]};
 const before=JSON.stringify(s);
 const result=proposeDanmachiNpcIntentCycle(pack,s,input);
 assert.deepEqual(result,proposeDanmachiNpcIntentCycle(pack,s,input));
 assert.equal(result.committed,false);
 assert.equal(JSON.stringify(s),before);
 assert.ok(result.intents.some(x=>x.actorId==="npc.ottar"&&
  x.triggerRef==="evt.maxim_return"&&x.kind==="reactive"));
 assert.ok(result.intents.some(x=>x.actorId==="npc.finn"&&x.kind==="routine"));
 assert.ok(result.intents.every(x=>!x.alreadyOccurred&&x.requiresConfirmation));
 assert.throws(()=>proposeDanmachiNpcIntentCycle(pack,s,{
  ...input,signals:[{actorId:"npc.finn",sourceRef:"evt.maxim_return",
   kind:"maxim_appearance"}]}),/SIGNAL_NOT_PERSONALLY_KNOWN/);
});
test("Maxim regression: private witness can respond, others must not magically share his return",()=>{
 const s=heard(empty(),"npc.freya","evt.maxim_return");
 heard(s,"npc.ottar","evt.maxim_return");
 const proposed=proposeDanmachiNpcIntentCycle(pack,s,{
  npcIds:["npc.freya","npc.ottar","npc.finn"],fromMinute:0,toMinute:100,
  signals:[{actorId:"npc.freya",sourceRef:"evt.maxim_return",kind:"maxim_appearance"},
    {actorId:"npc.ottar",sourceRef:"evt.maxim_return",kind:"maxim_appearance"}]
 });
 assert.deepEqual(new Set(proposed.intents.filter(i=>i.kind==="reactive").map(i=>i.actorId)),
  new Set(["npc.freya","npc.ottar"]));
 assert.equal(proposed.intents.some(i=>i.actorId==="npc.finn"&&i.kind==="reactive"),false);
 assert.equal(actorHasEraFact(s,"npc.finn","freya.soul.of.maxim.absent"),false);
 const claim=auditDanmachiEraScene(pack,s,[
   {actorId:"npc.finn",claims:[{factId:"freya.soul.of.maxim.absent",assertion:"certain"}]}
 ]);
 assert.equal(claim.readyToRender,false);
});
test("roleplay bridge surfaces eras and autonomous drafts without leaking to player",async()=>{
 const s=empty();const load=async()=>({pack,session:s,packRevision:1,sessionRevision:5});
 const scene=await readLabRoleplayScene(load,{projectId:pack.projectId,sessionId:s.sessionId,
   npcIds:["npc.finn","npc.ottar"],dialogueText:"Максим и Оттар",
   toMinute:1440});
 assert.ok(scene.danmachiEraContext?.actors.length===2);
 assert.ok(scene.danmachiNpcIntents);
 assert.equal(scene.danmachiNpcIntents?.committed,false);
 const mentions=await readLabMentionedNpcDialogue(load,{projectId:pack.projectId,
  sessionId:s.sessionId,dialogueText:"Оттар помнит старый бой"});
 assert.ok(mentions.danmachiEraContext?.actors.some(x=>x.npcId==="npc.ottar"));
});
test("the review endpoint merges the new audit with old narrative validation",async()=>{
 const s=empty();const load=async()=>({pack,session:s,packRevision:1,sessionRevision:5});
 const out=await reviewLabRoleplayScene(load,{projectId:pack.projectId,sessionId:s.sessionId,
   npcIds:["npc.finn"],expectedSessionRevision:5,
   beats:[{actorId:"npc.finn",kind:"speech",summary:"Обсуждает факт",factRefs:[]}],
   danmachiAuditBeats:[{actorId:"npc.finn",
     claims:[{factId:"xenos.loki.alliance",assertion:"certain"}]}]});
 assert.equal(out.readyToRender,false);
 assert.ok(out.danmachiEraAudit?.failures.some(f=>f.code==="FUTURE_CANON_LEAK"));
});
