import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { config } from "../src/config.ts";
import { commitTurn, prepareCommit } from "../src/commit.ts";
import type { CommitRequest } from "../src/types.ts";

// A synthetic in-memory Sheets/Docs transport. Deno CI has no --allow-net;
// unexpected URLs throw and can never fall through to a live Google service.
Deno.test("semantic writer: dry-run, XP once, durable replay, collision and document recovery", async () => {
  const originalFetch = globalThis.fetch;
  const original = { ...config, google: { ...config.google }, files: { ...config.files } };
  const keys = await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
  const bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8",keys.privateKey));
  config.google.privateKey = "-----BEGIN PRIVATE KEY-----\n" + btoa(String.fromCharCode(...bytes)) + "\n-----END PRIVATE KEY-----";
  config.allowWrites = true; config.enableKv = false;
  config.files.TEMP_RUNTIME = "synthetic-runtime";
  config.files.LIVE_SESSION_LOG = "synthetic-journal";
  const data: Record<string, unknown[][]> = {
    CONTROL:[["Key","Value"],["save_id","TEST-S0"],["state","ACTIVE_COMMITTED"],["world_day",1],["world_time","12:00:00"],["current_location_id","loc.test"],["current_location_display","Test"],["current_scene_id","scene.test"]],
    PLAYER_RESOURCES:[["Resource","Current","Max/Threshold"],["HP",50,50],["Stamina",50,50],["General Level",1,100],["General XP",0,100],["Money copper",10,0]],
    SESSION_LOG:[["Turn ID","TX ID","Save ID","Inworld start","Inworld end","Scene ID","Action summary","Deltas JSON","New canon JSON","World advances JSON","Notes","Committed at","Ruleset version","State hash","Source","Version"]],
    PROGRESSION_EVENTS:[["TX ID","Inworld time","Event type","Modifiers JSON","Old XP","Delta","New XP","Old level","New level","Notes"]],
    PENDING_CHOICES:[["Choice ID","Status","Options JSON"]],
  };
  let writes=0, docWrites=0, docText="", failDoc=true;
  const reads:string[][]=[];
  let simulateConcurrentChange=false;
  globalThis.fetch = (async (raw: RequestInfo | URL, init?: RequestInit) => {
    const u=new URL(String(raw));
    const json=(x:unknown)=>Response.json(x);
    if(u.href==="https://oauth2.googleapis.com/token") return json({access_token:"synthetic-only",expires_in:3600});
    if(u.hostname==="sheets.googleapis.com" && u.pathname.includes("/synthetic-runtime/values:batchGet")) {
      const ranges=u.searchParams.getAll("ranges");reads.push(ranges);
      if (simulateConcurrentChange && ranges.includes("PLAYER_RESOURCES!A1:D100")) {
        data.CONTROL[1][1]="TEST-CONCURRENT";
      }
      return json({valueRanges:ranges.map(range=>{
        const [table,a1]=range.split("!");
        const cell=/^([A-Z])(\d+)$/.exec(a1);
        return {range,values:cell?[[data[table]?.[Number(cell[2])-1]?.[cell[1].charCodeAt(0)-65]??""]]:structuredClone(data[table]??[])};
      })});
    }
    if(u.hostname==="sheets.googleapis.com" && u.pathname.includes("/synthetic-runtime/values:batchUpdate")) {
      writes++;
      for(const w of JSON.parse(String(init?.body)).data) {
        const [table,a1]=w.range.split("!"); const row=Number(/^A(\d+)/.exec(a1)![1])-1;
        data[table]??=[];w.values.forEach((v:unknown[],i:number)=>{data[table][row+i]=v;});
      }
      return json({totalUpdatedCells:1});
    }
    if(u.hostname==="docs.googleapis.com" && u.pathname==="/v1/documents/synthetic-journal")
      return json({body:{content:[{paragraph:{elements:[{textRun:{content:docText}}]}}]},revisionId:"test-revision"});
    if(u.hostname==="docs.googleapis.com" && u.pathname==="/v1/documents/synthetic-journal:batchUpdate") {
      if(failDoc) {failDoc=false;return new Response("synthetic document failure",{status:503});}
      docWrites++;docText+=JSON.parse(String(init?.body)).requests[0].insertText.text;return json({});
    }
    throw Error("Unexpected external request in isolated writer test: "+u.href);
  }) as typeof fetch;
  const input:CommitRequest={turnId:"test-turn",txId:"test-replay-tx",expectedSaveId:"TEST-S0",saveTo:"TEST-S1",
    docAppends:[{documentKey:"LIVE_SESSION_LOG",text:"Synthetic achievement"}],
    semantic:{elapsedSeconds:0,resourceDeltas:[{resource:"Money copper",delta:3}],
      generalXpEvents:[{sourceType:"discovery",reason:"Synthetic source-backed discovery",sourceRef:"test.evidence",exactXpOverride:5}],
      session:{inworldStart:"Day1 12:00:00",actionSummary:"Synthetic test only"}}};
  try {
    const before=structuredClone(data);
    const dry=await commitTurn({...input,dryRun:true});
    assertEquals(dry.committed,false);assertEquals(writes,0);assertEquals(data,before);
    await assertRejects(()=>commitTurn(input),Error,"synthetic document failure");
    assertEquals(writes,1);assertEquals(data.CONTROL[1][1],"TEST-S1");
    assertEquals(data.PLAYER_RESOURCES[4][1],5);assertEquals(data.PLAYER_RESOURCES[5][1],13);
    assertEquals(data.PROGRESSION_EVENTS.length,2);assertEquals(data.SESSION_LOG.length,2);
    const committed=structuredClone(data);
    // Simulate a cold start and stricter feature gates after deployment.
    (globalThis as unknown as {__rpgRuntimeMemoryCache:Map<string,unknown>}).__rpgRuntimeMemoryCache.clear();
    config.turnProgressionReviewStrict=true;config.systemNotificationAckEnabled=false;
    reads.length=0;
    const retry=await commitTurn(input);
    assertEquals(retry.idempotentReplay,true);assertEquals(writes,1);assertEquals(docWrites,1);
    assertEquals(data,committed);assertEquals(reads.length,1);
    assertEquals(reads[0],["CONTROL!A1:D100","SESSION_LOG!A1:P5000"]);
    await commitTurn(input);assertEquals(docWrites,1);assertEquals(writes,1);
    await assertRejects(()=>commitTurn({...input,saveTo:"TEST-COLLISION"}),Error,"tx id collision");
    // A known legacy TX must not need newly gated tables or source templates.
    const legacy=structuredClone(input);
    legacy.semantic!.notificationAckEvents=[{notificationId:"test",sourceRef:"test",status:"SEEN"}] as NonNullable<typeof legacy.semantic>["notificationAckEvents"];
    legacy.semantic!.workDemandEvents=[{}] as NonNullable<typeof legacy.semantic>["workDemandEvents"];
    const receipt=await prepareCommit(legacy);
    assert("alreadyCommitted" in receipt && receipt.alreadyCommitted);
    assertEquals(writes,1);
    const fresh={...input,txId:"test-new-tx",turnId:"test-new-turn",expectedSaveId:"TEST-S1",saveTo:"TEST-S2"};
    await assertRejects(()=>prepareCommit(fresh),Error,"MISSING_REVIEW_FOR_GAMEPLAY_TURN");
    assertEquals(data,committed);
    assert(docText.includes("[TX:test-replay-tx]"));
    simulateConcurrentChange=true;
    await assertRejects(()=>prepareCommit(fresh),Error,"semantic snapshot changed during read");
    assertEquals(writes,1);
  } finally {
    globalThis.fetch=originalFetch;
    Object.assign(config,original);
  }
});
