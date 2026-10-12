import assert from "node:assert/strict";
import {config} from "../src/config.ts";
import {commitTurn} from "../src/commit.ts";
import type {CommitRequest} from "../src/types.ts";
import {PREVIEW_TEST_TEMP_RUNTIME_ID,PREVIEW_TEST_DOC_IDS} from "../src/preview_test_storage.ts";

/** CI-only Google transport stub. No external Google or player workbook request. */
Deno.test("TEST writer: persisted Sheets plus lost ACK retains KV lock and prevents second money / NPC receipt",async()=>{
  const saved={...config,google:{...config.google},files:{...config.files}};
  const priorFetch=globalThis.fetch;
  const keys=await crypto.subtle.generateKey({
    name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256",
  },true,["sign","verify"]);
  const bytes=new Uint8Array(await crypto.subtle.exportKey("pkcs8",keys.privateKey));
  const sheet=PREVIEW_TEST_TEMP_RUNTIME_ID;
  const oldTimeline=Deno.env.get("DENO_TIMELINE");
  Deno.env.set("DENO_TIMELINE","preview/ci-ack-only");
  const docId=PREVIEW_TEST_DOC_IDS.LIVE_SESSION_LOG;
  const tx="TEST-NPC-CHAOS-TX";
  const lockKey=["rpg-v2","semantic-writer-lock",sheet] as const;
  config.google.privateKey="-----BEGIN PRIVATE KEY-----\n"+
    btoa(String.fromCharCode(...bytes))+"\n-----END PRIVATE KEY-----";
  config.allowWrites=true;config.allowRawCommits=false;config.enableKv=true;
  config.npcHeatTestWriterEnabled=true;
  config.npcHeatTestWorkbookId=sheet;
  config.files.TEMP_RUNTIME=sheet;
  config.files.LIVE_SESSION_LOG=docId;
  const data:Record<string,unknown[][]>={
    CONTROL:[["Key","Value"],["save_id","TEST-S0"],
      ["state","ACTIVE_COMMITTED"],["world_day",1],["world_time","12:00:00"],
      ["current_location_id","loc.test"],["current_location_display","Test"],
      ["current_scene_id","scene.test"]],
    PLAYER_RESOURCES:[["Resource","Current","Max/Threshold"],
      ["HP",50,50],["Stamina",50,50],["General Level",1,100],
      ["General XP",0,100],["Money copper",10,0]],
    SESSION_LOG:[["Save ID","Turn ID","TX ID","Inworld start","Inworld end",
      "Scene ID","Action summary","Deltas JSON","New canon JSON",
      "World advances JSON","Notes","Committed at","Ruleset version",
      "State hash","Source","Version"]],
    PENDING_CHOICES:[["Choice ID","Status","Options JSON"]],
    PROGRESSION_EVENTS:[["TX ID","Inworld time","Event type","Modifiers JSON",
      "Old XP","Delta","New XP","Old level","New level","Notes"]],
    NPC_CURRENT:[["NPC ID","Display","Importance","Current/last-known location",
      "Current goal/activity"],["npc.test","Test NPC","RECURRING","loc.test","work"]],
  };
  let batches=0,allowFirstLost=true;
  globalThis.fetch=(async (request:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(String(request));
    const json=(body:unknown)=>Response.json(body);
    if(url.hostname==="oauth2.googleapis.com"&&url.pathname==="/token")
      return json({access_token:"test-token",expires_in:3600});
    if(url.hostname==="sheets.googleapis.com"&&
       url.pathname.includes("/"+sheet+"/values:batchGet")){
      return json({valueRanges:url.searchParams.getAll("ranges").map(range=>{
        const [table,a1]=range.split("!");
        const cell=/^([A-Z])(\d+)$/.exec(a1);
        return {range,values:cell?[[
          data[table]?.[Number(cell[2])-1]?.[cell[1].charCodeAt(0)-65]??""]]
          :structuredClone(data[table]??[])};
      })});
    }
    if(url.hostname==="sheets.googleapis.com"&&
       url.pathname.includes("/"+sheet+"/values:batchUpdate")){
      batches++;
      for(const item of JSON.parse(String(init?.body)).data){
        const [table,a1]=String(item.range).split("!");
        const row=Number(/^A(\d+)/.exec(a1)?.[1]);
        if(!row)throw Error("UNEXPECTED_WRITE_RANGE");
        data[table]??=[];
        for(const [i,value] of (item.values as unknown[][]).entries())
          data[table][row-1+i]=value;
      }
      if(allowFirstLost){allowFirstLost=false;
        return new Response("TEST_GOOGLE_LOST_ACK_AFTER_PERSIST",{status:503});}
      return json({totalUpdatedCells:1});
    }
    throw Error("NO_REAL_EXTERNAL_NETWORK_ALLOWED_"+url.href);
  }) as typeof fetch;
  let kv:Deno.Kv|null=null;
  const input:CommitRequest={
    turnId:"TEST-NPC-TURN",txId:tx,expectedSaveId:"TEST-S0",saveTo:"TEST-S1",
    semantic:{
      elapsedSeconds:0,sceneActorIds:["npc.test"],
      resourceDeltas:[{resource:"Money copper",delta:3}],
      session:{inworldStart:"Day1 12:00:00",actionSummary:"TEST-only 503 simulation",
        source:"ENGINE_FASTPATH"},
    },
  };
  try{
    await assert.rejects(()=>commitTurn(input),/TEST_GOOGLE_LOST_ACK_AFTER_PERSIST/);
    assert.equal(batches,1);
    assert.equal(data.CONTROL[1][1],"TEST-S1");
    assert.equal(data.PLAYER_RESOURCES[5][1],13);
    assert.equal(data.SESSION_LOG.length,2);
    const cols=data.SESSION_LOG[0].map(String);
    const row=data.SESSION_LOG[1];
    const advances=JSON.parse(String(row[cols.indexOf("World advances JSON")]));
    assert.equal(advances.engineNpcAttentionReceipts.length,1);
    assert.equal(advances.engineNpcAttentionReceipts[0].actorId,"npc.test");
    assert.equal(advances.engineNpcReceiptEpoch,"TEST_ONLY_V2");
    assert.match(String(row[cols.indexOf("State hash")]),/^sha256:[a-f0-9]{64}$/);
    assert.equal(row[cols.indexOf("Version")],2);
    kv=await Deno.openKv();
    assert.equal((await kv.get<{txId:string}>(lockKey)).value?.txId,tx);
    await assert.rejects(()=>commitTurn({
      ...input,txId:"TEST-NPC-CHAOS-RIVAL",turnId:"TEST-RIVAL",
      expectedSaveId:"TEST-S1",saveTo:"TEST-S2",
    }),/WRITER_LEASE_BUSY_RETRY_LATER/);
    assert.equal(batches,1);
    assert.equal(data.PLAYER_RESOURCES[5][1],13);
    assert.equal(data.SESSION_LOG.length,2);
    assert.equal((await kv.get<{txId:string}>(lockKey)).value?.txId,tx);
  }finally{
    // This fixture has no running workers and no external Google side effects.
    // Test-only KV cleanup is not a production recovery procedure.
    if(kv){
      await kv.delete(lockKey);
      kv.close();
    }
    if(oldTimeline===undefined)Deno.env.delete("DENO_TIMELINE");
    else Deno.env.set("DENO_TIMELINE",oldTimeline);
    globalThis.fetch=priorFetch;
    config.google=saved.google;
    config.files=saved.files;
    config.allowWrites=saved.allowWrites;
    config.allowRawCommits=saved.allowRawCommits;
    config.enableKv=saved.enableKv;
    config.npcHeatTestWriterEnabled=saved.npcHeatTestWriterEnabled;
    config.npcHeatTestWorkbookId=saved.npcHeatTestWorkbookId;
  }
});
