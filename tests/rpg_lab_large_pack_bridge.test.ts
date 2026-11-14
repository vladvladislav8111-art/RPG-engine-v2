import test from "node:test";
import assert from "node:assert/strict";
import {hydrateLabBridgeRequest} from "../src/rpg_lab_v1/bridge.ts";
import {dispatchWorldV3Batch,type WorldV3BatchRequest} from "../src/world_sim_v3/runtime_facade.ts";
import type {LabPack} from "../src/rpg_lab_v1/engine.ts";
const pack:LabPack={
 schema:"RPG_LAB_PACK_V1",projectId:"danmachi_core",worldId:"danmachi.orario",
 formulas:{score:"4*3"},resources:{},lootTables:{},prices:{},economy:{taxRate:0},
 locations:{},npcProfiles:{},progression:{},bestiary:{}
};
for(let i=0;i<125;i++)pack.bestiary!["monster_"+i]={
 name:"Вымышленный тестовый монстр "+i,floorMin:1,floorMax:50,origin:"H",
 rarity:"обычный",note:"Служебное описание тестового монстра с длинным текстом. ".repeat(5)
};
test("large stored project evaluates before bridge payload, avoiding 64 KB envelope",async()=>{
 const req:WorldV3BatchRequest={expectedSaveId:"TEST-01",jobs:[
  {id:"lab.preview",operation:"world_review",payload:{
   rpgLabV1:{projectId:"danmachi_core",jobs:[{id:"score.1",kind:"formula",args:{formulaId:"score"}}]}
  }}
 ]};
 const hydrated=await hydrateLabBridgeRequest(req,async()=>({pack,revision:7}));
 assert.equal(hydrated.jobs[0].payload.rpgLabV1,undefined);
 assert.ok(hydrated.jobs[0].payload.rpgLabEvaluatedV1);
 const sim=dispatchWorldV3Batch(hydrated,"TEST-01");
 assert.equal(sim.committed,false);
 const result=sim.results[0].result;
 assert.equal(result.ok,true);
 if(result.ok){
  const preview=result.value as {packRevision:number;results:{ok:boolean;value:{value:number}}[]};
  assert.equal(preview.packRevision,7);
  assert.equal(preview.results[0].value.value,12);
 }
});
