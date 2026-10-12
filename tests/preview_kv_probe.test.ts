import assert from "node:assert/strict";
import { previewKvGate, previewKvSession, SYNTHETIC_PREVIEW_WORKBOOK_ID,
  PREVIEW_KV_PAGE } from "../src/preview_kv_probe.ts";
const id=SYNTHETIC_PREVIEW_WORKBOOK_ID;
const good={timeline:"git-branch/feat-npc-heat-kv-proof",enabled:true,
  writesEnabled:false,rawWritesEnabled:false,npcHeatWriterEnabled:false,
  kvEnabled:true,configuredWorkbookId:id,isolatedWorkbookId:id};
Deno.test("preview KV probe needs exact synthetic workbook, preview timeline and writes disabled",()=>{
  assert.equal(previewKvGate(good),true);
  assert.equal(previewKvGate({...good,timeline:"preview/1234"}),true);
  for(const x of [
    {timeline:"production"},{timeline:""},{enabled:false},
    {writesEnabled:true},{rawWritesEnabled:true},{npcHeatWriterEnabled:true},
    {kvEnabled:false},{configuredWorkbookId:"live"},
    {isolatedWorkbookId:"live"},{timeline:"build"},
  ])assert.equal(previewKvGate({...good,...x}),false);
});
Deno.test("synthetic session IDs must be fresh UUID-like TEST names",()=>{
  const fresh="TEST-"+crypto.randomUUID();
  assert.equal(previewKvSession(fresh),fresh.toLowerCase());
  for(const bad of ["V2-S0795","TEST-S2","TEST-/prod","",0,null,{},[]])
    assert.throws(()=>previewKvSession(bad),/INVALID_SYNTHETIC_SESSION/);
});
Deno.test("preview test page does not contain secrets or production actions",()=>{
  assert.match(PREVIEW_KV_PAGE,/Google Sheets и Docs не записываются/);
  assert.match(PREVIEW_KV_PAGE,/contendersRejected/);
  assert.equal(PREVIEW_KV_PAGE.includes("ALLOW_WRITES=true"),false);
  assert.equal(PREVIEW_KV_PAGE.includes("Production deploy"),false);
});
