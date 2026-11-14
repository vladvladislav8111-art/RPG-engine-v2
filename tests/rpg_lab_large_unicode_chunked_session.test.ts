import test from "node:test";
import assert from "node:assert/strict";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
import {validateLabSession} from "../src/rpg_lab_v1/session.ts";
import {applyConfirmedLabEvent} from "../src/rpg_lab_v1/events.ts";
import {decodeLabSession,encodeLabSession,sessionKvHead,
 type LabSessionStored} from "../src/rpg_lab_v1/session_storage.ts";
import {prepareLabSessionHead,decodeLabSessionFromKv} from "../src/rpg_lab_v1/session_kv.ts";

const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"danmachi_core",worldId:"danmachi.orario",
 formulas:{},resources:{},lootTables:{},prices:{},economy:{taxRate:0},
 locations:{},npcProfiles:{},progression:{}
};
for(let i=0;i<12;i++){
 const id="npc."+String(i).padStart(2,"0");
 pack.npcProfiles[id]={name:"Персонаж "+i,canonRef:"canon."+i,
  traits:["действует самостоятельно"],goals:["занимается своими делами"],knownFacts:[]};
}
const base=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:"danmachi_core",
 sessionId:"linos_big_unicode_v2",gameClock:"D1 08:30",
 player:{resources:{},stats:{},inventory:{}},discovered:[],npcs:{},events:[],
});
function randomCyrillic(length:number,seed:number){
 const alphabet="абвгдежзийклмнопрстуфхцчшщыэюя";
 let n=seed||1,text="";
 for(let j=0;j<length;j++){
  n^=n<<13;n^=n>>>17;n^=n<<5;
  text+=alphabet[(n>>>0)%alphabet.length];
 }
 return text;
}
function hugeSession(){
 const s=base();
 for(let p=0;p<12;p++){
  const npcId="npc."+String(p).padStart(2,"0");
  const memories=Array.from({length:70},(_,i)=>{
   const id="evt."+p+"."+i;
   const description="Наблюдение "+p+"."+i+": "+randomCyrillic(360,10000+p*100+i);
   return {sourceRef:id,summary:description,perceivedFact:description,
    learnedAt:"D1 08:30",knownBy:[npcId],salience:"ordinary",
    privacy:"private",channel:"seen"};
  });
  s.npcs[npcId]={knownFacts:memories.map(m=>m.sourceRef),memories};
 }
 return s;
}
test("a 100k+ character Russian NPC session is valid and stored as content-addressed chunks",async()=>{
 const session=hugeSession();
 const size=JSON.stringify(session).length;
 assert.ok(size>100000,"fixture must exceed old 100k LAB_SESSION_SCHEMA");
 assert.ok(size<1000000,"fixture must stay within the expanded safe bound");
 assert.equal(validateLabSession(session,pack),session);
 const encoded=await encodeLabSession(session,pack,12);
 assert.equal(encoded.codec,"gzip-session-chunks-v2");
 assert.ok(encoded.sessionChunkCount!>1,"fixture must exceed gzip 50k limit");
 assert.equal(encoded.sessionGzipChunks?.length,encoded.sessionChunkCount);
 const head=sessionKvHead(encoded);
 assert.equal(head.sessionGzipChunks,undefined,"KV head must not embed chunks");
 assert.deepEqual(await decodeLabSession(encoded,pack),session);
 await assert.rejects(()=>decodeLabSession(head,pack),/LAB_SESSION_CHUNK_MISSING/);
});
test("Deno KV persists chunks first and reloads a complete NPC memory snapshot",async()=>{
 const kv=await Deno.openKv(":memory:");
 try{
  const session=hugeSession(),encoded=await encodeLabSession(session,pack,15);
  const head=await prepareLabSessionHead(kv,session.projectId,session.sessionId,encoded);
  const key=["rpg-lab-v1","sessions",session.projectId,session.sessionId];
  const pre=await kv.get<LabSessionStored>(key);
  assert.equal(pre.value,null,"snapshot not visible before CAS");
  const written=await kv.atomic().check(pre).set(key,head).commit();
  assert.equal(written.ok,true);
  const persisted=await kv.get<LabSessionStored>(key);
  assert.equal(persisted.value?.revision,15);
  const restored=await decodeLabSessionFromKv(kv,session.projectId,session.sessionId,persisted.value!,pack);
  assert.deepEqual(restored,session);
  const next=applyConfirmedLabEvent(restored,pack,{
   sourceRef:"evt.next",time:"D1 08:31",kind:"scene",
   summary:"Утверждённый очередной игровой ход.",knownBy:[],gmConfirmed:true,
  });
  const latest=await encodeLabSession(next,pack,16);
  const latestHead=await prepareLabSessionHead(kv,session.projectId,session.sessionId,latest);
  const commit=await kv.atomic().check(persisted).set(key,latestHead).commit();
  assert.equal(commit.ok,true);
  const loaded=await kv.get<LabSessionStored>(key);
  const reloaded=await decodeLabSessionFromKv(kv,session.projectId,session.sessionId,loaded.value!,pack);
  assert.equal(reloaded.events[0].sourceRef,"evt.next");
  assert.equal(reloaded.npcs["npc.00"].memories.length,70);
  assert.equal(reloaded.gameClock,"D1 08:31");
  // A stale second writer must not roll back the current campaign.
  const stale=await kv.atomic().check(persisted).set(key,head).commit();
  assert.equal(stale.ok,false);
 }finally{kv.close();}
});
test("chunk integrity validation refuses corrupted compressed content",async()=>{
 const session=hugeSession(),encoded=await encodeLabSession(session,pack,15);
 const original=encoded.sessionGzipChunks![0];
 const bad=original.slice();
 bad[0]^=1;
 const altered={...encoded,sessionGzipChunks:[bad,...encoded.sessionGzipChunks!.slice(1)]};
 await assert.rejects(()=>decodeLabSession(altered,pack),/LAB_SESSION_CHUNK_HASH_MISMATCH/);
});
test("mismatched project ID has a specific diagnostic instead of LAB_SESSION_SCHEMA",()=>{
 const wrong={...base(),projectId:"different_world"};
 assert.throws(()=>validateLabSession(wrong,pack),/LAB_SESSION_PROJECT_MISMATCH/);
});
