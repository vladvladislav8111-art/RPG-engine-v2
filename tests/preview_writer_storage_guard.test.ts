import assert from "node:assert/strict";
import type {DocKey} from "../src/types.ts";
import { PREVIEW_TEST_DOC_IDS,PREVIEW_TEST_TEMP_RUNTIME_ID,
 testPreviewStorage,resolveTestDoc,assertTestGoogleTarget,testDocsPinned } from "../src/preview_test_storage.ts";
import {previewWriterReadinessGate} from "../src/preview_writer_readiness.ts";
import {handleHttpRequest} from "../src/http.ts";
const id=PREVIEW_TEST_TEMP_RUNTIME_ID;
const docs={...PREVIEW_TEST_DOC_IDS};
const good={timeline:"preview/test",tempId:id,docs,
 allowWrites:false,rawWrites:false,heatWriter:false,kvEnabled:true};
Deno.test("TEST Preview all nine doc IDs are pinned but ordinary production IDs unchanged",()=>{
 assert.equal(testDocsPinned(docs),true);
 assert.equal(testPreviewStorage("preview/abc",id),true);
 assert.equal(testPreviewStorage("production",id),false);
 for(const key of Object.keys(docs) as DocKey[]){
   assert.equal(resolveTestDoc("preview/abc",id,key,"prod-doc"),docs[key]);
   assert.equal(resolveTestDoc("production",id,key,"prod-doc"),"prod-doc");
   assert.equal(resolveTestDoc("preview/abc","real-game",key,"prod-doc"),"prod-doc");
 }
});
Deno.test("Google requests in TEST workbook cannot target Production Docs or Sheets",()=>{
 for(const target of [id,...Object.values(docs)])
  assert.doesNotThrow(()=>assertTestGoogleTarget(id,target,"write","gm"));
 assert.doesNotThrow(()=>assertTestGoogleTarget(id,"gm","read","gm"));
 assert.throws(()=>assertTestGoogleTarget(id,"gm","write","gm"),/TEST_PREVIEW_GOOGLE_SCOPE_VIOLATION/);
 assert.throws(()=>assertTestGoogleTarget(id,"prod-live-sheet","write","gm"),/TEST_PREVIEW_GOOGLE_SCOPE_VIOLATION/);
 assert.throws(()=>assertTestGoogleTarget(id,"prod-live-doc","read","gm"),/TEST_PREVIEW_GOOGLE_SCOPE_VIOLATION/);
 assert.doesNotThrow(()=>assertTestGoogleTarget("real-game","prod-live-doc","write","gm"));
});
Deno.test("readiness gate blocks if any Preview variable or any pinned TEST doc mismatches",()=>{
 assert.equal(previewWriterReadinessGate(good),true);
 const cases=[
 {timeline:"production"},{tempId:"real-game"},
 {allowWrites:true},{rawWrites:true},{heatWriter:true},{kvEnabled:false},
 {docs:{...docs,LIVE_SESSION_LOG:"prod-doc"}},
 ];
 for(const x of cases)assert.equal(previewWriterReadinessGate({...good,...x}),false);
});
Deno.test("unauthorized Production never triggers Google read readiness",async()=>{
 const response=await handleHttpRequest(new Request(
  "https://synthetic.invalid/preview/writer-readiness"));
 assert.equal(response.status,404);
 assert.deepEqual(await response.json(),{error:"not_found"});
});
