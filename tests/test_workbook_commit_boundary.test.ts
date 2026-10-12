import assert from "node:assert/strict";
import { config } from "../src/config.ts";
import { commitTurn } from "../src/commit.ts";
import { PREVIEW_TEST_TEMP_RUNTIME_ID, PREVIEW_TEST_DOC_IDS } from "../src/preview_test_storage.ts";
import type { CommitRequest } from "../src/types.ts";

const sheet=PREVIEW_TEST_TEMP_RUNTIME_ID;
const attempt:CommitRequest={
  turnId:"TEST-DENIED-TURN",txId:"TEST-DENIED-TX",
  expectedSaveId:"TEST-S4",saveTo:"TEST-S5",
  semantic:{
    elapsedSeconds:0,sceneActorIds:[],
    session:{inworldStart:"Day67 17:21:00",
      sceneId:"scene.test_only",actionSummary:"Guarded isolated dry request",
      source:"ENGINE_FASTPATH"},
  },
};
Deno.test("isolated TEST workbook refuses write without explicit TEST writer, before network",async()=>{
 const prev={files:config.files,allowWrites:config.allowWrites,
   testWriter:config.npcHeatTestWriterEnabled};
 try {
  config.files={...config.files,TEMP_RUNTIME:sheet};
  config.allowWrites=true;config.npcHeatTestWriterEnabled=false;
  await assert.rejects(()=>commitTurn(attempt),
    /TEST_WORKBOOK_WRITES_REQUIRE_TEST_WRITER/);
 }finally{
  config.files=prev.files;config.allowWrites=prev.allowWrites;
  config.npcHeatTestWriterEnabled=prev.testWriter;
 }
});
Deno.test("isolated TEST workbook cannot write to an unpinned requested Google Doc",async()=>{
 const prev={files:config.files,allowWrites:config.allowWrites,
  testWriter:config.npcHeatTestWriterEnabled,
  isolatedId:config.npcHeatTestWorkbookId};
 const timeline=Deno.env.get("DENO_TIMELINE");
 try {
  Deno.env.set("DENO_TIMELINE","preview/guard-regression");
  config.files={...config.files,TEMP_RUNTIME:sheet,
    LIVE_TRANSACTION_ARCHIVE:"untrusted-target"};
  config.allowWrites=true;
  config.npcHeatTestWriterEnabled=true;
  config.npcHeatTestWorkbookId=sheet;
  await assert.rejects(()=>commitTurn({
    ...attempt,docAppends:[{
      documentKey:"LIVE_TRANSACTION_ARCHIVE",text:"TEST value",
    }],
  }),/TEST_WRITER_CONTEXT_NOT_ISOLATED/);
  config.files.LIVE_TRANSACTION_ARCHIVE=PREVIEW_TEST_DOC_IDS.LIVE_TRANSACTION_ARCHIVE;
  config.npcHeatTestWorkbookId="not-pinned";
  await assert.rejects(()=>commitTurn(attempt),
    /NPC_HEAT_TEST_WRITER_ISOLATION_GATE/);
 }finally{
  if(timeline===undefined)Deno.env.delete("DENO_TIMELINE");
  else Deno.env.set("DENO_TIMELINE",timeline);
  config.files=prev.files;config.allowWrites=prev.allowWrites;
  config.npcHeatTestWriterEnabled=prev.testWriter;
  config.npcHeatTestWorkbookId=prev.isolatedId;
 }
});
Deno.test("real workbook cannot accidentally activate isolated TEST writer",async()=>{
 const prev=config.npcHeatTestWriterEnabled;
 const files=config.files;
 try {
  config.files={...config.files,TEMP_RUNTIME:"ordinary-runtime-workbook"};
  config.npcHeatTestWriterEnabled=true;
  await assert.rejects(()=>commitTurn(attempt),
    /TEST_WRITER_CANNOT_TARGET_NON_TEST_WORKBOOK/);
 }finally{config.npcHeatTestWriterEnabled=prev;config.files=files;}
});
