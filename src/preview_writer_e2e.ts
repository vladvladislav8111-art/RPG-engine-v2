import { config } from "./config.ts";
import { sheetsBatchGet, docsGet } from "./google.ts";
import { commitTurn, prepareCommit } from "./commit.ts";
import { npcHeatStateHashV2 } from "./npc_heat_receipt_writer.ts";
import { PREVIEW_TEST_TEMP_RUNTIME_ID, testPreviewTimeline,
  testDocsPinned } from "./preview_test_storage.ts";
import type { CommitRequest, DocKey } from "./types.ts";

export const TEST_E2E_FROM = "TEST-S2";
export const TEST_E2E_TO = "TEST-S3";
export const TEST_E2E_TX = "TEST-NPC-HEAT-V2-REMOTE-E2E-20261012-001";
const TEST_E2E_TURN = "TEST-NPC-HEAT-V2-REMOTE-TURN-001";
const TEST_NPC = "npc.test.only";
const TEST_DOC: DocKey = "LIVE_TRANSACTION_ARCHIVE";
const TEST_TIME = "17:21:00";
const TEST_MONEY_BEFORE = 10;
const TEST_MONEY_AFTER = 11;
const pinnedId = PREVIEW_TEST_TEMP_RUNTIME_ID;

const REQUEST: CommitRequest = {
  turnId: TEST_E2E_TURN, txId: TEST_E2E_TX,
  expectedSaveId: TEST_E2E_FROM, saveTo: TEST_E2E_TO,
  docAppends:[{documentKey:TEST_DOC,text:"TEST NPC Heat V2 Preview exactly-once writer check. No live Shura changes."}],
  semantic:{
    elapsedSeconds:0,
    sceneActorIds:[TEST_NPC],
    resourceDeltas:[{resource:"Money copper",delta:1}],
    session:{
      inworldStart:"Day67 "+TEST_TIME,sceneId:"scene.test_only",
      actionSummary:"Synthetic V2 receipt, one copper and one doc TX marker",
      source:"ENGINE_FASTPATH",
    },
  },
};

export function fixedWriterE2EGate(input:{
  timeline:string;workbookId:string;isolatedWorkbookId:string;
  docs:Record<DocKey,string>;allowWrites:boolean;allowRawCommits:boolean;
  testWriterEnabled:boolean;kvEnabled:boolean;
}):boolean{
  return testPreviewTimeline(input.timeline) &&
    input.workbookId===pinnedId && input.isolatedWorkbookId===pinnedId &&
    testDocsPinned(input.docs) && input.allowWrites && !input.allowRawCommits &&
    input.testWriterEnabled && input.kvEnabled;
}

export type WriterEvidence = {
  saveId:string;worldTime:string;receiptCount:number;docMarkerCount:number;
  copper:number|null;stateDigestValid:boolean;v2ReceiptCount:number;
  v2ReceiptActorValid:boolean;v2EnvelopeValid:boolean;
};
export async function readFixedWriterEvidence(
  spec:{txId:string;turnId:string;saveTo:string}={
    txId:TEST_E2E_TX,turnId:TEST_E2E_TURN,saveTo:TEST_E2E_TO,
  },
):Promise<WriterEvidence>{
  const data=await sheetsBatchGet(pinnedId,[
    "CONTROL!B2","CONTROL!B5","PLAYER_RESOURCES!A1:D75",
    "SESSION_LOG!A1:P5000",
  ]);
  const saveId=String(data["CONTROL!B2"]?.[0]?.[0]??"");
  const worldTime=String(data["CONTROL!B5"]?.[0]?.[0]??"");
  const resources=data["PLAYER_RESOURCES!A1:D75"]??[];
  const resourceColumns=(resources[0]??[]).map(String);
  const resourceName=resourceColumns.indexOf("Resource");
  const resourceValue=resourceColumns.indexOf("Current");
  if(resourceName<0||resourceValue<0)throw Error("TEST_E2E_RESOURCES_SCHEMA");
  const moneyRow=resources.slice(1).find(r=>String(r[resourceName])==="Money copper");
  const copperRaw=moneyRow?.[resourceValue];
  const copper=copperRaw==null||String(copperRaw).trim()===""?
    null:Number(copperRaw);
  if(copper!==null&&!Number.isSafeInteger(copper))throw Error("TEST_E2E_MONEY_INVALID");
  const log=data["SESSION_LOG!A1:P5000"]??[];
  const columns=(log[0]??[]).map(String);
  for(const key of ["TX ID","Save ID","Turn ID","Source","Version",
    "State hash","World advances JSON","Inworld end","Scene ID"])
    if(!columns.includes(key))throw Error("TEST_E2E_SESSION_SCHEMA");
  const col=(name:string)=>columns.indexOf(name);
  const receipts=log.slice(1).filter(r=>String(r[col("TX ID")]??"")===spec.txId);
  let stateDigestValid=false,v2ReceiptCount=0,v2ReceiptActorValid=false,
    v2EnvelopeValid=false;
  if(receipts.length===1){
    const r=receipts[0],worldJson=String(r[col("World advances JSON")]??"");
    let content:Record<string,unknown>={};
    try {
      const parsed:unknown=JSON.parse(worldJson);
      if(parsed && typeof parsed==="object" && !Array.isArray(parsed))
        content=parsed as Record<string,unknown>;
    }catch { /* inconsistent data fail closed below */ }
    const records=content.engineNpcAttentionReceipts;
    const v2=Array.isArray(records)?records:[];
    v2ReceiptCount=v2.length;
    v2ReceiptActorValid=v2.length===1 &&
      v2[0]?.actorId===TEST_NPC && v2[0]?.txId===spec.txId &&
      v2[0]?.kind==="SCENE_PRESENCE" && v2[0]?.committed===true &&
      v2[0]?.sourceRef==="scene:scene.test_only";
    v2EnvelopeValid=
      String(r[col("Save ID")])===spec.saveTo &&
      String(r[col("Turn ID")])===spec.turnId &&
      String(r[col("Source")])==="ENGINE_FASTPATH" &&
      String(r[col("Version")])==="2" &&
      String(r[col("Scene ID")])==="scene.test_only" &&
      content.engineNpcReceiptEpoch==="TEST_ONLY_V2";
    stateDigestValid=(await npcHeatStateHashV2({
      saveTo:String(r[col("Save ID")]),
      inworldEnd:String(r[col("Inworld end")]),
      sceneId:String(r[col("Scene ID")]),
      txId:String(r[col("TX ID")]),
      worldAdvancesJson:worldJson,
    }))===String(r[col("State hash")]).toLowerCase();
  }
  // The configured Doc key is mapped exclusively to the isolated TEST Doc.
  const doc=await docsGet(config.files[TEST_DOC]);
  const marker="[TX:"+spec.txId+"]";
  const docMarkerCount=doc.text.split(marker).length-1;
  return {saveId,worldTime,receiptCount:receipts.length,docMarkerCount,
    copper,stateDigestValid,v2ReceiptCount,v2ReceiptActorValid,v2EnvelopeValid};
}

function verifyFixedEvidence(e:WriterEvidence) {
  if(e.saveId!==TEST_E2E_TO||e.worldTime!==TEST_TIME||
     e.receiptCount!==1||e.docMarkerCount!==1||e.copper!==TEST_MONEY_AFTER||
     !e.stateDigestValid||e.v2ReceiptCount!==1||
     !e.v2ReceiptActorValid||!e.v2EnvelopeValid)
    throw Error("TEST_E2E_UNEXPECTED_DURABLE_STATE_MANUAL_RECONCILE");
}

/** Fixed, one-shot isolated transaction; never accept caller-specified TX/save. */
export async function runFixedWriterE2E(){
  const before=await readFixedWriterEvidence();
  const fresh=before.saveId===TEST_E2E_FROM && before.worldTime===TEST_TIME &&
    before.receiptCount===0 && before.docMarkerCount===0 &&
    before.copper===TEST_MONEY_BEFORE;
  const alreadyFinished=before.saveId===TEST_E2E_TO &&
    before.receiptCount===1 && before.docMarkerCount===1;
  if(!fresh && !alreadyFinished)
    throw Error("TEST_E2E_BASELINE_OR_PARTIAL_STATE_REQUIRES_REVIEW");

  if(fresh){
    const prepared=await prepareCommit({...REQUEST,dryRun:true});
    if(("alreadyCommitted" in prepared && prepared.alreadyCommitted) ||
        !prepared.validation?.every((v:{pass:boolean})=>v.pass))
      throw Error("TEST_E2E_SEMANTIC_PREPARE_FAILED");
  }
  // Protected by commitTurn's TEST-only no-TTL KV lock, including Sheets/Docs.
  const first=await commitTurn(REQUEST);
  if(!first.committed)throw Error("TEST_E2E_FIRST_COMMIT_NOT_CONFIRMED");
  const second=await commitTurn(REQUEST);
  if(!second.committed||second.idempotentReplay!==true)
    throw Error("TEST_E2E_REPLAY_NOT_IDEMPOTENT");
  const after=await readFixedWriterEvidence();
  verifyFixedEvidence(after);
  return {
    ok:true,testOnly:true,txId:TEST_E2E_TX,saveId:after.saveId,
    firstRunWasReplay:first.idempotentReplay===true,
    replayWasIdempotent:true,sessionReceiptCount:after.receiptCount,
    docTxMarkerCount:after.docMarkerCount,exactlyOneCopperApplied:true,
    npcHeatV2ReceiptValid:true,sha256ContentMatches:true,
    worldTimeUnchanged:true,productionTouched:false,
    remoteTwoInstanceEvidence:false,
  };
}
