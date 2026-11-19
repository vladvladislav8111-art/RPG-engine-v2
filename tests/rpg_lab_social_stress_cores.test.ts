import test from "node:test";
import assert from "node:assert/strict";
import {buildDanmachiCanonCast,DANMACHI_STARTING_NPC_COUNT} from "../src/rpg_lab_v1/danmachi_cast.ts";
import {DANMACHI_SOCIAL_STRESS_CORE_COUNT} from "../src/rpg_lab_v1/danmachi_social_stress.ts";
test("all DanMachi NPCs resist automatic attachment; 21 have distinct stress cores",()=>{
 const cast=buildDanmachiCanonCast();
 assert.ok(DANMACHI_STARTING_NPC_COUNT>=70);
 assert.equal(Object.keys(cast).length,DANMACHI_STARTING_NPC_COUNT);
 assert.equal(DANMACHI_SOCIAL_STRESS_CORE_COUNT,21);
 for(const npc of Object.values(cast)){
  assert.ok(npc.habitualLogic?.socialBiases.some(x=>x.includes("окончательный уход")),npc.name);
 }
 const deep=Object.values(cast).filter(npc=>npc.responsePatterns?.unexpected_mercy);
 assert.equal(deep.length,21);
 for(const npc of deep){
  for(const key of ["unexpected_mercy","trust_request","boundary_violation","disengagement"]){
   assert.ok(npc.responsePatterns?.[key]?.[0]?.condition,npc.name+":"+key);
  }
 }
 assert.notEqual(cast["npc.bete"].responsePatterns?.trust_request?.[0].emotion,
  cast["npc.bell"].responsePatterns?.trust_request?.[0].emotion);
 assert.notEqual(cast["npc.finn"].responsePatterns?.disengagement?.[0].emotion,
  cast["npc.tiona"].responsePatterns?.disengagement?.[0].emotion);
});
test("Lili keeps the option to walk away, not to return loot or seek adoption",()=>{
 const cast=buildDanmachiCanonCast(),lili=cast["npc.lili"];
 assert.match(lili.responsePatterns!.unexpected_mercy[0].emotion,/Подозревает подвох/);
 assert.match(lili.responsePatterns!.disengagement[0].emotion,/исчезнуть навсегда/);
 assert.match(lili.voice!.avoidCaricature.at(-1)!,/Не вынуждать возвращать/);
 assert.match(cast["npc.hestia"].responsePatterns!.trust_request[0].emotion,/Сама решает/);
 assert.match(cast["npc.ais"].responsePatterns!.trust_request[0].emotion,/не равен/);
 assert.match(cast["npc.ottar"].responsePatterns!.trust_request[0].emotion,/проверку силы/);
});
