import assert from "node:assert/strict";
import {shouldInjectTestAckDrop,TEST_ACK_DROP_TX,TEST_ACK_DROP_TURN,
 TEST_ACK_DROP_SAVE_FROM,TEST_ACK_DROP_SAVE_TO}
 from "../src/preview_google_ack_drop.ts";
import {ackDropGate} from "../src/preview_google_ack_drop_runner.ts";
import {PREVIEW_TEST_DOC_IDS,PREVIEW_TEST_TEMP_RUNTIME_ID}
 from "../src/preview_test_storage.ts";
import {PREVIEW_ACK_DROP_PAGE} from "../src/preview_google_ack_drop_ui.ts";
import {handleHttpRequest} from "../src/http.ts";
const sheet=PREVIEW_TEST_TEMP_RUNTIME_ID;
const gate={timeline:"preview/test-revision",tempId:sheet,isolatedId:sheet,
 docs:{...PREVIEW_TEST_DOC_IDS},allowWrites:true,allowRawCommits:false,
 writerEnabled:true,kvEnabled:true,ackFlag:true,hmacSecret:""};
const predicate={
 enabled:true,timeline:"preview/test-revision",allowWrites:true,
 allowRawCommits:false,testWriterEnabled:true,enableKv:true,
 workbookId:sheet,isolatedWorkbookId:sheet,txId:TEST_ACK_DROP_TX,
 turnId:TEST_ACK_DROP_TURN,expectedSaveId:TEST_ACK_DROP_SAVE_FROM,
 saveTo:TEST_ACK_DROP_SAVE_TO,isSemantic:true,source:"ENGINE_FASTPATH",
};
Deno.test("lost-ACK simulator requires every exact TEST save, TX and Preview gate",()=>{
 assert.equal(ackDropGate(gate),true);
 assert.equal(shouldInjectTestAckDrop(predicate),true);
 for(const change of [
  {timeline:"production"},{enabled:false},{allowWrites:false},
  {allowRawCommits:true},{testWriterEnabled:false},{enableKv:false},
  {workbookId:"PRODUCTION"},{isolatedWorkbookId:"PRODUCTION"},
  {txId:"TEST-OTHER"},{turnId:"TEST-OTHER"},
  {expectedSaveId:"V2-S0795"},{saveTo:"V2-S0796"},
  {isSemantic:false},{source:"GM_MANUAL"},
 ]){
  assert.equal(shouldInjectTestAckDrop({...predicate,...change}),false);
 }
 for(const change of [
  {timeline:"production"},{ackFlag:false},{allowWrites:false},
  {rawWrites:true},{writerEnabled:false},{kvEnabled:false},
  {isolatedId:"prod"},{tempId:"prod"},{hmacSecret:"set"},
  {docs:{...PREVIEW_TEST_DOC_IDS,LIVE_TRANSACTION_ARCHIVE:"PRODUCTION"}},
 ]){
  assert.equal(ackDropGate({...gate,...change}),false);
 }
});
Deno.test("no default route, no secret, no caller payload or arbitrary test workbook",async()=>{
 assert.match(PREVIEW_ACK_DROP_PAGE,/тестовую Google Sheets/);
 assert.equal(PREVIEW_ACK_DROP_PAGE.includes(sheet),false);
 assert.equal(PREVIEW_ACK_DROP_PAGE.includes("RUNTIME_API_KEY"),false);
 for(const [path,method] of [
  ["/preview/ack-drop","GET"],["/preview/ack-drop/run","POST"],
 ] as const){
  const response=await handleHttpRequest(new Request(
    "https://synthetic.invalid"+path,{method}));
  assert.equal(response.status,404);
 }
});
