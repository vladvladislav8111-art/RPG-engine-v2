import test from "node:test";
import assert from "node:assert/strict";
import {getRpgBridgeGmGuide,RPG_LAB_SCENE_REMINDER,
 RPG_BRIDGE_GM_GUIDE_VERSION} from "../src/rpg_lab_v1/gm_guide.ts";
import {readLabRoleplayScene} from "../src/rpg_lab_v1/roleplay_adapter.ts";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";
test("GM guide distinguishes legacy and RPG Lab tools, read-only vs write",()=>{
 const x=getRpgBridgeGmGuide();
 assert.equal(x.schema,RPG_BRIDGE_GM_GUIDE_VERSION);
 assert.equal(x.audience,"GM_ONLY");
 assert.equal(x.readOnly,true);
 assert.equal(x.modifiesSave,false);
 const names=x.tools.map(t=>t.name);
 assert.equal(new Set(names).size,names.length);
 for(const expected of [
  "runtime_health","get_turn_context","prepare_turn","commit_turn",
  "simulate_world_v3","rpg_runtime_guide","rpg_lab_create_campaign",
  "rpg_lab_read_session","rpg_lab_scene_context","rpg_lab_review_narration",
  "rpg_lab_commit_event","rpg_lab_read_event",
  "render_current_hud","render_system_event"]) {
  assert.equal(names.includes(expected),true,expected);
 }
 assert.equal(names.filter(x=>x==="rpg_runtime_guide").length,1);
 assert.equal(x.rpgLabQuickLoop.some(s=>s.includes("narrationPlan")),true);
 assert.equal(x.guardrails.some(s=>s.includes("deployed")),true);
 assert.equal(x.modifiesSave,false);
});
test("every direct RPG Lab NPC context carries concise read-only GM reminder",async()=>{
 const pack:LabPack={
  schema:"RPG_LAB_PACK_V1",projectId:"gm_guide_test",worldId:"test.world",
  formulas:{},resources:{},lootTables:{},prices:{},economy:{taxRate:0},
  locations:{},npcProfiles:{"npc.loki":{name:"Loki",canonRef:"danmachi.loki",
   traits:["teasing"],goals:["protect family"],knownFacts:[]}},
  progression:{},
 };
 const session:LabSession={
  schema:"RPG_LAB_SESSION_V1",projectId:pack.projectId,sessionId:"test_scene",
  roleplayGuard:"strict",gameClock:"D0 09:00",player:{resources:{},stats:{},inventory:{}},
  discovered:[],npcs:{},events:[],
 };
 const actual=await readLabRoleplayScene(async()=>({
  pack,packRevision:1,session,sessionRevision:1,
 }),{projectId:pack.projectId,sessionId:session.sessionId,npcIds:["npc.loki"]});
 assert.equal(actual.schema,"RPG_LAB_ROLEPLAY_CONTEXT_V1");
 assert.equal(actual.gmReminderVersion,RPG_BRIDGE_GM_GUIDE_VERSION);
 assert.deepEqual(actual.gmReminder,RPG_LAB_SCENE_REMINDER);
 assert.equal(actual.gmReminder.some(s=>s.includes("Strict RPG Lab commits")),true);
 assert.equal(actual.gmReminder.some(s=>s.includes("preview")),true);
 assert.equal(actual.gmOnly,true);
 assert.equal(actual.notPlayerVisible,true);
 assert.equal(actual.readOnly,true);
});
