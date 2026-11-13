import test from "node:test";
import assert from "node:assert/strict";
import {hydrateLabBridgeRequest} from "../src/rpg_lab_v1/bridge.ts";
import type {WorldV3BatchRequest} from "../src/world_sim_v3/runtime_facade.ts";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";
const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"demo_world",worldId:"demo.world",
 formulas:{damage:"attack-defense"},resources:{hp:{min:0,max:100}},
 lootTables:{},prices:{},economy:{taxRate:0},locations:{},
 npcProfiles:{},progression:{thresholds:[100]}
};
const input:WorldV3BatchRequest={
 expectedSaveId:"TEST-SAVE",jobs:[{id:"lab.demo",operation:"world_review",
  payload:{rpgLabV1:{projectId:"demo_world",expectedRevision:4,
    jobs:[{id:"calc.1",kind:"formula",args:{formulaId:"damage",variables:{attack:9,defense:2}}}]}}}]
};
test("stored project is resolved to full pack without a new MCP tool",async()=>{
 let calls=0;
 const result=await hydrateLabBridgeRequest(input,async(id,revision)=>{
  assert.equal(id,"demo_world");assert.equal(revision,4);calls++;return {pack,revision:4};
 });
 assert.equal(calls,1);
 const job=result.jobs[0].payload.rpgLabV1 as {pack:LabPack;packRevision:number;jobs:unknown[]};
 assert.equal(job.pack.projectId,"demo_world");assert.equal(job.packRevision,4);
 assert.equal(job.jobs.length,1);
 assert.equal((input.jobs[0].payload.rpgLabV1 as Record<string,unknown>).pack,undefined);
});
test("inline request remains intact without KV load",async()=>{
 const direct={...input,jobs:[{...input.jobs[0],payload:{rpgLabV1:{pack,jobs:[]}}}]};
 const result=await hydrateLabBridgeRequest(direct as WorldV3BatchRequest,async()=>{throw Error("should not load")});
 assert.deepEqual(result.jobs,direct.jobs);
});
test("invalid project identifier rejected before storage lookup",async()=>{
 const invalid={...input,jobs:[{...input.jobs[0],payload:{rpgLabV1:{projectId:"../shura",jobs:[]}}}]};
 await assert.rejects(()=>hydrateLabBridgeRequest(invalid as WorldV3BatchRequest,async()=>{throw Error("should not load")}),/LAB_BRIDGE_PROJECT_REF_INVALID/);
});
test("mismatched loaded project does not cross-contaminate games",async()=>{
 await assert.rejects(()=>hydrateLabBridgeRequest(input,async()=>({pack:{...pack,projectId:"another_world"},revision:4})),/LAB_BRIDGE_PROJECT_MISMATCH/);
});
test("large stored pack requires HTTP API instead of bloating World V3",async()=>{
 const oversized={...pack,npcProfiles:Object.fromEntries(Array.from({length:100},(_,i)=>[
   "npc."+i,{name:"Character "+i,canonRef:"canon.demo",traits:["x".repeat(1200)],goals:[],knownFacts:[]}
 ]))} as LabPack;
 await assert.rejects(()=>hydrateLabBridgeRequest(input,async()=>({pack:oversized,revision:4})),/LAB_BRIDGE_PACK_TOO_LARGE_USE_HTTP/);
});
