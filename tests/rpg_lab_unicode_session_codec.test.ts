import test from "node:test";
import assert from "node:assert/strict";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
import {validateLabSession} from "../src/rpg_lab_v1/session.ts";
import {applyConfirmedLabEvent} from "../src/rpg_lab_v1/events.ts";
import {encodeLabSession,decodeLabSession} from "../src/rpg_lab_v1/session_storage.ts";

const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"danmachi_core",worldId:"danmachi.orario",
 formulas:{},resources:{},lootTables:{},prices:{},economy:{taxRate:0},
 locations:{},npcProfiles:{"npc.finn":{
  name:"Финн",canonRef:"danmachi.finn",traits:[],goals:[],knownFacts:[],
 }},progression:{}
};
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:"danmachi_core",
 sessionId:"linos_unicode_test",gameClock:"D1 08:20",
 player:{resources:{},stats:{},inventory:{}},discovered:[],npcs:{},events:[],
});
test("valid Cyrillic memory payload above old 150 KB inflate cap can be reloaded and committed",async()=>{
 const s=fresh();
 const detail=("Линос заметил, что воспоминание сохранило точные обстоятельства разговора, свидетелей, временную отметку и источник слуха. ").repeat(3);
 const mem=Array.from({length:100},(_,i)=>({
  sourceRef:"scene."+i,summary:detail,perceivedFact:detail,
  learnedAt:"D1 08:20",knownBy:["npc.finn"],salience:"ordinary",privacy:"private",
 }));
 s.npcs["npc.finn"]={knownFacts:mem.map(m=>m.sourceRef),memories:mem};
 validateLabSession(s,pack);
 const plain=JSON.stringify(s);
 assert.ok(plain.length<100000,"Valid UTF-16 character bound");
 assert.ok(new TextEncoder().encode(plain).length>150000,
  "Regression fixture must exceed the old byte bound");
 const stored=await encodeLabSession(s,pack,21);
 assert.equal(stored.codec,"gzip-session-v1");
 assert.ok(stored.sessionGzip!.byteLength<50000);
 const restored=await decodeLabSession(stored,pack);
 assert.deepEqual(restored,s);
 const next=applyConfirmedLabEvent(restored,pack,{
  sourceRef:"scene.next",time:"D1 08:21",kind:"scene",
  summary:"Подтверждённая следующая сцена.",knownBy:[],gmConfirmed:true,
 });
 assert.equal(next.events.length,1);
 const saved=await encodeLabSession(next,pack,22);
 assert.deepEqual(await decodeLabSession(saved,pack),next);
});
test("decompression is still bounded against gzip bombs",async()=>{
 const bytes=new TextEncoder().encode("Д".repeat(2200000));
 const gz=new Uint8Array(await new Response(
   new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
 ).arrayBuffer());
 await assert.rejects(()=>decodeLabSession({
  revision:1,updatedAt:"2026-11-14",codec:"gzip-session-v1",sessionGzip:gz,
 },pack),/LAB_SESSION_CODEC_LIMIT/);
});
