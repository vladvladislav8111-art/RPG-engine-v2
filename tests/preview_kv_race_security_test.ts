import { assertEquals, assertRejects } from "jsr:@std/assert";
import { config } from "../src/config.ts";
import { handleHttpRequest } from "../src/http.ts";
import { remoteKvRaceStatus, remoteKvRaceHold } from "../src/preview_kv_race.ts";

Deno.test("Preview remote KV diagnostics absent in Production, denied without Bearer in Preview",async()=>{
  const previous=config.previewFixture;
  try{
    config.previewFixture=false;
    assertEquals((await handleHttpRequest(new Request("https://test.local/preview/kv-race"))).status,404);
    assertEquals((await handleHttpRequest(new Request("https://test.local/preview/kv-race/hold",{method:"POST"}))).status,404);
    config.previewFixture=true;
    assertEquals((await handleHttpRequest(new Request("https://test.local/preview/kv-race/contend",{method:"POST"}))).status,401);
    assertEquals((await handleHttpRequest(new Request("https://test.local/preview/kv-race/status?session=garbage"))).status,401);
    const page=await handleHttpRequest(new Request("https://test.local/preview/kv-race"));
    assertEquals(page.status,200);
    const html=await page.text();
    assertEquals(html.includes("type=\"password\""),true);
    assertEquals(html.includes("googleWritesPerformed:0"),true);
  }finally{config.previewFixture=previous;}
});
Deno.test("KV race test refuses non-fixture, invalid IDs, and write-enabled Preview",async()=>{
  const prev={fixture:config.previewFixture,writes:config.allowWrites};
  const uuid="TEST-12345678-1234-1234-1234-123456789abc";
  try{
    config.previewFixture=false;
    await assertRejects(()=>remoteKvRaceStatus(uuid),Error,"PREVIEW_KV_RACE_NOT_SYNTHETIC_FIXTURE");
    config.previewFixture=true;
    config.allowWrites=false;
    await assertRejects(()=>remoteKvRaceStatus("LIVE-12345678-1234-1234-1234-123456789abc"),Error,"PREVIEW_KV_RACE_INVALID_SESSION");
    config.allowWrites=true;
    await assertRejects(()=>remoteKvRaceHold(uuid),Error,"PREVIEW_KV_RACE_REQUIRES_GOOGLE_WRITES_DISABLED");
  }finally{config.previewFixture=prev.fixture;config.allowWrites=prev.writes;}
});
