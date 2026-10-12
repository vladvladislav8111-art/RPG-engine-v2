import assert from "node:assert/strict";
import {
  isPreviewTimeline,previewKvGateChecks,previewKvGate,
  PREVIEW_KV_SETUP_PAGE,SYNTHETIC_PREVIEW_WORKBOOK_ID,
} from "../src/preview_kv_probe.ts";
import { handleHttpRequest } from "../src/http.ts";
import { config } from "../src/config.ts";
const id=SYNTHETIC_PREVIEW_WORKBOOK_ID;
function sample(){return {
  timeline:"preview/revision-id",enabled:true,writesEnabled:false,
  rawWritesEnabled:false,npcHeatWriterEnabled:false,kvEnabled:true,
  configuredWorkbookId:id,isolatedWorkbookId:id,
};}
Deno.test("diagnostics returns named gate states but no workbook identity or secrets",()=>{
 const tests=previewKvGateChecks(sample());
 assert.equal(Object.values(tests).every(Boolean),true);
 assert.equal(previewKvGate(sample()),true);
 assert.equal(isPreviewTimeline("git-branch/feature"),true);
 assert.equal(isPreviewTimeline("production"),false);
 assert.equal(previewKvGateChecks({...sample(),configuredWorkbookId:"prod"}).isolatedTempWorkbook,false);
 assert.equal(previewKvGateChecks({...sample(),enabled:false}).probeEnabled,false);
 assert.equal(PREVIEW_KV_SETUP_PAGE.includes(id),false);
 assert.equal(PREVIEW_KV_SETUP_PAGE.includes("RUNTIME_API_KEY"),false);
 assert.match(PREVIEW_KV_SETUP_PAGE,/diagnostics/);
});
Deno.test("setup route works only on Preview timeline; diagnostics require bearer",async()=>{
 const originalTimeline=Deno.env.get("DENO_TIMELINE");
 const originalKey=config.apiKey;
 const originalFlag=config.previewKvRaceEnabled;
 try {
  config.apiKey="ci-synthetic-bearer-not-a-secret";
  config.previewKvRaceEnabled=true;
  Deno.env.set("DENO_TIMELINE","preview/test-revision");
  const url="https://synthetic-preview.example/preview/kv-race/setup";
  const page=await handleHttpRequest(new Request(url));
  assert.equal(page.status,200);
  assert.match(page.headers.get("content-security-policy")??"",/connect-src 'self'/);
  assert.match(await page.text(),/Проверить условия Preview/);
  const denied=await handleHttpRequest(
    new Request("https://synthetic-preview.example/preview/kv-race/diagnostics"));
  assert.equal(denied.status,401);
  const yes=await handleHttpRequest(new Request(
    "https://synthetic-preview.example/preview/kv-race/diagnostics",{
      headers:{"authorization":"Bearer "+config.apiKey}
    }));
  assert.equal(yes.status,200);
  const result=await yes.json();
  assert.equal(result.testOnly,true);
  assert.deepEqual(Object.keys(result).sort(),
    ["checks","failedChecks","googleCallsPerformed","kvWritesPerformed","ready","testOnly"].sort());
  assert.equal(result.googleCallsPerformed,0);
  assert.equal(result.kvWritesPerformed,0);
  assert.equal(JSON.stringify(result).includes(id),false);
  Deno.env.set("DENO_TIMELINE","production");
  const blocked=await handleHttpRequest(new Request(url));
  assert.equal(blocked.status,404);
  const productionDiagnostic=await handleHttpRequest(new Request(
    "https://synthetic-preview.example/preview/kv-race/diagnostics",{
      headers:{"authorization":"Bearer "+config.apiKey}
    }));
  assert.equal(productionDiagnostic.status,404);
 }finally {
   if(originalTimeline===undefined) Deno.env.delete("DENO_TIMELINE");
   else Deno.env.set("DENO_TIMELINE",originalTimeline);
   config.apiKey=originalKey;
   config.previewKvRaceEnabled=originalFlag;
 }
});
