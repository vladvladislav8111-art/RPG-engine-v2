import assert from "node:assert/strict";
import { config } from "../src/config.ts";
import { diagnoseMcp, handleMcp } from "../src/mcp.ts";
import { handleHttpRequest } from "../src/http.ts";
import { bridgeFeatureStatus } from "../src/bridge_integration.ts";
import { dispatchWorldV3Batch,type WorldV3Job } from "../src/world_sim_v3/runtime_facade.ts";

const mandatoryTools=[
  "runtime_health","get_turn_context","prepare_turn","commit_turn",
  "rng_int","render_current_hud","simulate_world_v3",
];
function parseRpc(text:string):any {
  try{return JSON.parse(text);}catch {
    const found=text.split(/\r?\n/).find(s=>s.startsWith("data:"));
    if(!found)throw Error("MCP_SMOKE_UNPARSEABLE_RESPONSE");
    return JSON.parse(found.slice(5).trim());
  }
}
Deno.test("release freeze: MCP protocol starts and advertises the seven unchanged tools",async()=>{
  const handshake=await diagnoseMcp();
  assert.equal(handshake.ok,true);
  assert.equal(handshake.toolsCapability,true);
  const response=await handleMcp(new Request("https://release.test/mcp",{
    method:"POST",
    headers:{"content-type":"application/json","accept":"application/json, text/event-stream"},
    body:JSON.stringify({jsonrpc:"2.0",id:79,method:"tools/list",params:{}}),
  }));
  assert.equal(response.ok,true);
  const json=parseRpc(await response.text());
  assert.ok(Array.isArray(json.result?.tools));
  const names=new Set(json.result.tools.map((t:{name:string})=>t.name));
  for(const required of mandatoryTools)assert.equal(names.has(required),true,required);
});
Deno.test("release freeze: synthetic test writer, ACK drop and raw commits stay disabled in CI",()=>{
  assert.equal(config.npcHeatTestWriterEnabled,false);
  assert.equal(config.previewGoogleAckDropEnabled,false);
  assert.equal(config.allowRawCommits,false);
  assert.equal(config.allowWrites,false);
  const bridge=bridgeFeatureStatus();
  assert.equal(bridge.releaseStage,"READ_ONLY_PHASE_1");
  assert.equal(bridge.gated.ec06LedgerAndPaidOffers,
    "BLOCKED_UNTIL_VERIFIED_ATOMIC_SOURCE_WRITER");
  assert.equal(bridge.gated.automatedGameplayCommit,"NOT_AUTHORIZED");
});
Deno.test("release freeze: protected Preview writer endpoints not available in safe mode",async()=>{
  for(const [method,path] of [
    ["GET","/preview/ack-drop"],
    ["POST","/preview/ack-drop/run"],
    ["POST","/preview/writer-e2e/run"],
    ["POST","/preview/kv-cross-revision/run"],
  ] as const){
    const response=await handleHttpRequest(new Request("https://release.test"+path,{method}));
    assert.equal(response.status,404,path);
  }
});
Deno.test("release freeze: 200 bounded V3 read-only batches never mutate inputs",()=>{
  const saveId="TEST-FREEZE-READONLY";
  const jobs:WorldV3Job[]=Array.from({length:12},(_,i)=>({
    id:"release.calc."+i,operation:"npc_presence",
    payload:{npcId:"npc.synthetic."+i,at:100,shifts:[],commitments:[]},
  }));
  const request={expectedSaveId:saveId,jobs};
  const frozen=JSON.stringify(request);
  const start=performance.now();
  for(let i=0;i<200;i++){
    const batch=dispatchWorldV3Batch(request,saveId);
    assert.equal(batch.results.length,12);
    assert.equal(batch.committed,false);
    assert.equal(batch.sourceAttested,false);
    assert.equal(batch.requiresSemanticCommit,true);
  }
  assert.equal(JSON.stringify(request),frozen);
  // CPU-only synthetic microbenchmark. No real Google latency or turn-SLA
  // claims, no mutation and no event writes.
  const elapsedMs=Math.round(performance.now()-start);
  console.log("RELEASE_FREEZE_LOCAL_CPU_2400_PROPOSALS_MS="+elapsedMs);
});
