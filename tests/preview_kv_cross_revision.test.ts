import assert from "node:assert/strict";
import {
 crossRevisionGate,crossRevisionProbeWith,CROSS_REVISION_PAGE,
 PINNED_OTHER_PREVIEW_REVISION,
} from "../src/preview_kv_cross_revision.ts";
import {handleHttpRequest} from "../src/http.ts";
import {SYNTHETIC_PREVIEW_WORKBOOK_ID} from "../src/preview_kv_probe.ts";
const pinned=SYNTHETIC_PREVIEW_WORKBOOK_ID;
const valid={timeline:"preview/revision",enabled:true,writesEnabled:false,
 rawWritesEnabled:false,npcHeatWriterEnabled:false,kvEnabled:true,
 configuredWorkbookId:pinned,isolatedWorkbookId:pinned};
const session="TEST-"+crypto.randomUUID();
const sleep=async (_millis:number)=>{};
Deno.test("cross-revision probe is locked to immutable same-app Preview host",()=>{
 assert.equal(crossRevisionGate(valid),true);
 assert.match(PINNED_OTHER_PREVIEW_REVISION,
  /^https:\/\/rpg-engine-v2-[a-z0-9]+\.vladvladislav8111\.deno\.net$/);
 assert.equal(CROSS_REVISION_PAGE.includes("RUNTIME_API_KEY"),false);
 assert.equal(CROSS_REVISION_PAGE.includes(pinned),false);
 for(const changed of [
  {timeline:"production"},{enabled:false},{writesEnabled:true},
  {rawWritesEnabled:true},{npcHeatWriterEnabled:true},{kvEnabled:false},
  {configuredWorkbookId:"game"},{isolatedWorkbookId:"game"},
 ])assert.equal(crossRevisionGate({...valid,...changed}),false);
});
Deno.test("two independent JS IDs observe held shared TEST KV and deny remote contender",async()=>{
 let holding=false;
 const out=await crossRevisionProbeWith({
  hold:async()=>{holding=true;await new Promise(resolve=>setTimeout(resolve,1));holding=false;
    return {acquired:true,serverInstanceId:"LOCAL_INSTANCE_01"};},
  localStatus:async()=>({held:holding}),
  remoteStatus:async()=>({testOnly:true,held:holding,
    serverInstanceId:"SECOND_REVISION_02"}),
  remoteContend:async()=>({testOnly:true,denied:true,
    serverInstanceId:"SECOND_REVISION_02"}),
  sleep,
 },session);
 assert.equal(out.crossRevisionSharedKv,true);
 assert.equal(out.remoteContenderRejected,true);
 assert.equal(out.independentJsInstancesObserved,2);
 assert.equal(out.googleWritesPerformed,0);
});
Deno.test("second revision must actually observe lock and deny writer; no false success",async()=>{
 for(const broken of ["no_remote_lock","writer_entered","same_instance"]){
  let holding=false;
  await assert.rejects(()=>crossRevisionProbeWith({
   hold:async()=>{holding=true;await new Promise(resolve=>setTimeout(resolve,2));
     holding=false;return {acquired:true,serverInstanceId:"LOCAL_INSTANCE_01"};},
   localStatus:async()=>({held:holding}),
   remoteStatus:async()=>({testOnly:true,held:broken==="no_remote_lock"?false:holding,
     serverInstanceId:broken==="same_instance"?"LOCAL_INSTANCE_01":"SECOND_REVISION_02"}),
   remoteContend:async()=>({testOnly:true,denied:broken!=="writer_entered",
     serverInstanceId:"SECOND_REVISION_02"}),
   sleep,
  },session),/CROSS_PREVIEW_/);
 }
});
Deno.test("production cannot expose cross-preview routes, even as static page",async()=>{
 for(const [path,method] of [
  ["/preview/kv-cross-revision","GET"],
  ["/preview/kv-cross-revision/run","POST"],
 ] as const){
  const r=await handleHttpRequest(new Request("https://preview.test.invalid"+path,{method}));
  assert.equal(r.status,404);
 }
});
