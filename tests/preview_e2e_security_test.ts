import { assertEquals, assertRejects } from "jsr:@std/assert";
import { config } from "../src/config.ts";
import { handleHttpRequest } from "../src/http.ts";
import { runIsolatedPreviewWriteE2E } from "../src/preview_e2e_runner.ts";

Deno.test("E2E route is absent outside the exact synthetic Preview fixture",async()=>{
  const prev=config.previewFixture;
  config.previewFixture=false;
  try{
    const page=await handleHttpRequest(new Request("https://preview.test/preview/e2e"));
    const run=await handleHttpRequest(new Request("https://preview.test/preview/e2e/run",{method:"POST"}));
    assertEquals(page.status,404);
    assertEquals(run.status,404);
  }finally{config.previewFixture=prev;}
});

Deno.test("Preview E2E write endpoint requires existing Bearer auth",async()=>{
  const prev=config.previewFixture;
  config.previewFixture=true;
  try{
    const denied=await handleHttpRequest(new Request("https://preview.test/preview/e2e/run",{method:"POST"}));
    assertEquals(denied.status,401);
    const page=await handleHttpRequest(new Request("https://preview.test/preview/e2e"));
    assertEquals(page.status,200);
    const html=await page.text();
    assertEquals(html.includes('fetch("/preview/e2e/run"'),true);
    assertEquals(html.includes("type=\"password\""),true);
  }finally{config.previewFixture=prev;}
});

Deno.test("Synthetic Preview E2E refuses all writes while ALLOW_WRITES=false",async()=>{
  const prev={fixture:config.previewFixture,writes:config.allowWrites};
  config.previewFixture=true;
  config.allowWrites=false;
  try{
    await assertRejects(()=>runIsolatedPreviewWriteE2E(),Error,"PREVIEW_E2E_WRITES_DISABLED");
  }finally{config.previewFixture=prev.fixture;config.allowWrites=prev.writes;}
});
