import test from "node:test";
import assert from "node:assert/strict";
import {hydrateLabBridgeRequest} from "../src/rpg_lab_v1/bridge.ts";
import {dispatchWorldV3Batch,type WorldV3BatchRequest} from "../src/world_sim_v3/runtime_facade.ts";
const spec:WorldV3BatchRequest={expectedSaveId:"TEST-01",jobs:[
 {id:"sources.loki",operation:"world_review",payload:{rpgLabSourcesV1:{projectId:"danmachi_01",query:"loki",maxResults:2}}}
]};
const sample={projectId:"danmachi_01",modifiedAt:"2026-11-13T22:00:00Z",notes:[
 {fileId:"drive.file.01",name:"loki_lore.md",modifiedTime:"2026-11-13T20:00:00Z",excerpt:"She is playful, but serious when her family is threatened."},
 {fileId:"drive.file.02",name:"riveria_notes.txt",modifiedTime:"2026-11-13T20:00:00Z",excerpt:"The elf protects her companions."},
]};
test("Bridge loads only matching source excerpts from bound project",async()=>{
 const hydrated=await hydrateLabBridgeRequest(spec,async()=>{throw Error("not a pack lookup")},async(id)=>{
  assert.equal(id,"danmachi_01");return sample;
 });
 const packet=hydrated.jobs[0].payload.rpgLabSourcesResolvedV1 as {sources:{name:string}[]};
 assert.deepEqual(packet.sources.map(s=>s.name),["loki_lore.md"]);
 const result=dispatchWorldV3Batch(hydrated,"TEST-01");
 assert.equal(result.committed,false);
 assert.equal(result.results[0].result.ok,true);
 if(result.results[0].result.ok){
  const value=result.results[0].result.value as Record<string,unknown>;
  assert.equal(value.sourceAttested,false);
  assert.equal(value.committed,false);
 }
});
test("source excerpts are bounded by maximum results",async()=>{
 const r=await hydrateLabBridgeRequest({...spec,jobs:[{...spec.jobs[0],payload:{rpgLabSourcesV1:{projectId:"danmachi_01",maxResults:1}}}]},
 async()=>{throw Error("not a pack lookup")},async()=>sample);
 const selected=r.jobs[0].payload.rpgLabSourcesResolvedV1 as {sources:unknown[]};
 assert.equal(selected.sources.length,1);
});
test("invalid lookup does not load another project or leak sources",async()=>{
 const bad={...spec,jobs:[{...spec.jobs[0],payload:{rpgLabSourcesV1:{projectId:"../private",maxResults:5}}}]};
 await assert.rejects(()=>hydrateLabBridgeRequest(bad as WorldV3BatchRequest,
 async()=>{throw Error("no")},async()=>{throw Error("must not call")}),/LAB_SOURCE_LOOKUP_INVALID/);
});
test("source lookup requires injected authoritative loader",async()=>{
 await assert.rejects(()=>hydrateLabBridgeRequest(spec,async()=>{throw Error("no")}),/LAB_SOURCE_LOOKUP_INVALID/);
});
