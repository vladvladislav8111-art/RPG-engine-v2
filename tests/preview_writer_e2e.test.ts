import assert from "node:assert/strict";
import { fixedWriterE2EGate, runFixedWriterE2E, TEST_E2E_TX,
  TEST_E2E_TO } from "../src/preview_writer_e2e.ts";
import { PREVIEW_TEST_DOC_IDS, PREVIEW_TEST_TEMP_RUNTIME_ID } from "../src/preview_test_storage.ts";
import { config } from "../src/config.ts";
import { handleHttpRequest } from "../src/http.ts";

const sheet = PREVIEW_TEST_TEMP_RUNTIME_ID;
const docId = PREVIEW_TEST_DOC_IDS.LIVE_TRANSACTION_ARCHIVE;
const good = () => ({
  timeline:"preview/test-only-e2e", workbookId:sheet, isolatedWorkbookId:sheet,
  docs:{...PREVIEW_TEST_DOC_IDS},allowWrites:true,allowRawCommits:false,
  testWriterEnabled:true,kvEnabled:true,
});
Deno.test("fixed E2E gate refuses Production, wrong Docs/workbook and writes disabled",()=>{
  assert.equal(fixedWriterE2EGate(good()),true);
  for(const fail of [
    {timeline:"production"},{workbookId:"production"},{isolatedWorkbookId:"production"},
    {allowWrites:false},{allowRawCommits:true},{testWriterEnabled:false},
    {kvEnabled:false},{docs:{...PREVIEW_TEST_DOC_IDS,LIVE_TRANSACTION_ARCHIVE:"production"}},
  ]) assert.equal(fixedWriterE2EGate({...good(),...fail}),false);
});
Deno.test("normal non-Preview HTTP route cannot invoke the E2E writer",async()=>{
  for(const url of [
    "https://synthetic.invalid/preview/writer-e2e",
    "https://synthetic.invalid/preview/writer-e2e/run",
  ]) {
    const r=await handleHttpRequest(new Request(url,{
      method:url.endsWith("/run")?"POST":"GET"
    }));
    assert.equal(r.status,404);
    assert.deepEqual(await r.json(),{error:"not_found"});
  }
});
Deno.test("TEST-only real semantic writer with synthetic Google transport writes 1 receipt, 1 copper and 1 Doc TX",async()=>{
  const priorFetch=globalThis.fetch;
  const previous={...config,files:{...config.files},google:{...config.google}};
  const previousTimeline=Deno.env.get("DENO_TIMELINE");
  const keys=await crypto.subtle.generateKey({
    name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256",
  },true,["sign","verify"]);
  const bytes=new Uint8Array(await crypto.subtle.exportKey("pkcs8",keys.privateKey));
  const state:Record<string,unknown[][]>={
    CONTROL:[["Key","Value"],["save_id","TEST-S2"],["state","ACTIVE_COMMITTED"],
      ["world_day",67],["world_time","17:21:00"],
      ["current_location_id","loc.test_only"],
      ["current_location_display","Isolated test area"],
      ["current_scene_id","scene.test_only"]],
    PLAYER_RESOURCES:[["Entity ID","Name","Resource","Current"],
      ["player.shura","TEST PLAYER","HP",50],["player.shura","TEST PLAYER","Stamina",45],
      ["player.shura","TEST PLAYER","Mana",30],
      ["player.shura","TEST PLAYER","General Level",1],
      ["player.shura","TEST PLAYER","General XP",0],
      ["player.shura","TEST PLAYER","Money copper",10]],
    SESSION_LOG:[["Save ID","Turn ID","TX ID","Inworld start","Inworld end",
      "Scene ID","Action summary","Deltas JSON","New canon JSON",
      "World advances JSON","Notes","Committed at","Ruleset version",
      "State hash","Source","Version"]],
    NPC_CURRENT:[["NPC ID","Display","Age","Importance","Role",
      "Current/last-known location","Current goal/activity","Identity anchors"],
      ["npc.test.only","Test NPC","","RECURRING","test",
        "loc.test_only","test work","test identity"]],
    PENDING_CHOICES:[["Choice ID","Status","Options JSON"]],
    PROGRESSION_EVENTS:[["TX ID","Inworld time","Event type",
      "Modifiers JSON","Old XP","Delta","New XP","Old level","New level","Notes"]],
  };
  let docText="",sheetWrites=0,docInserts=0;
  globalThis.fetch=(async (input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(input));
    const json=(o:unknown)=>Response.json(o);
    if(url.href==="https://oauth2.googleapis.com/token")
      return json({access_token:"test-only-not-a-secret",expires_in:3600});
    if(url.hostname==="sheets.googleapis.com"&&
       url.pathname.includes("/"+sheet+"/values:batchGet")){
      return json({valueRanges:url.searchParams.getAll("ranges").map(range=>{
        const [table,a1]=range.split("!");
        const cell=/^([A-Z])(\d+)$/.exec(a1);
        return {range,values:cell?[[
          state[table]?.[Number(cell[2])-1]?.[cell[1].charCodeAt(0)-65]??""]]:
          structuredClone(state[table]??[])};
      })});
    }
    if(url.hostname==="sheets.googleapis.com"&&
       url.pathname.includes("/"+sheet+"/values:batchUpdate")){
      sheetWrites++;
      for(const w of JSON.parse(String(init?.body)).data){
        const [table,a1]=String(w.range).split("!");
        const row=Number(/^A(\d+)/.exec(a1)?.[1]);
        if(!row)throw Error("UNEXPECTED_TEST_RANGE");
        state[table]??=[];
        (w.values as unknown[][]).forEach((v,i)=>{
          state[table][row-1+i]=v;
        });
      }
      return json({totalUpdatedCells:4});
    }
    if(url.hostname==="docs.googleapis.com"&&
       url.pathname==="/v1/documents/"+docId)
      return json({revisionId:"rev-test",body:{content:[{
        paragraph:{elements:[{textRun:{content:docText}}]}
      }]}});
    if(url.hostname==="docs.googleapis.com"&&
       url.pathname==="/v1/documents/"+docId+":batchUpdate"){
      docInserts++;
      docText+=JSON.parse(String(init?.body)).requests[0].insertText.text;
      return json({});
    }
    throw Error("TEST_REQUEST_MUST_NOT_LEAVE_MOCK_"+url.href);
  }) as typeof fetch;
  let kv:Deno.Kv|null=null;
  try{
    Deno.env.set("DENO_TIMELINE","preview/test-e2e-ci");
    config.files.TEMP_RUNTIME=sheet;
    config.files.LIVE_TRANSACTION_ARCHIVE=docId;
    config.npcHeatTestWorkbookId=sheet;
    config.google.privateKey="-----BEGIN PRIVATE KEY-----\n"+
      btoa(String.fromCharCode(...bytes))+"\n-----END PRIVATE KEY-----";
    config.allowWrites=true;config.allowRawCommits=false;config.enableKv=true;
    config.npcHeatTestWriterEnabled=true;

    const first=await runFixedWriterE2E();
    assert.equal(first.ok,true);
    assert.equal(first.firstRunWasReplay,false);
    assert.equal(first.replayWasIdempotent,true);
    assert.equal(first.saveId,TEST_E2E_TO);
    assert.equal(first.npcHeatV2ReceiptValid,true);
    assert.equal(sheetWrites,1);
    assert.equal(docInserts,1);
    assert.equal(state.SESSION_LOG.length,2);
    assert.equal(state.PLAYER_RESOURCES[6][3],11);
    const second=await runFixedWriterE2E();
    assert.equal(second.ok,true);
    assert.equal(second.firstRunWasReplay,true);
    assert.equal(sheetWrites,1);
    assert.equal(docInserts,1);
    assert.equal((docText.match(new RegExp("\\[TX:"+TEST_E2E_TX+"\\]","g"))??[]).length,1);
    kv=await Deno.openKv();
    assert.equal((await kv.get([
      "rpg-v2","semantic-writer-lock",sheet])).value,null);
  }finally{
    if(kv)kv.close();
    globalThis.fetch=priorFetch;
    Object.assign(config,previous);
    config.files=previous.files;
    config.google=previous.google;
    if(previousTimeline===undefined)Deno.env.delete("DENO_TIMELINE");
    else Deno.env.set("DENO_TIMELINE",previousTimeline);
  }
});
