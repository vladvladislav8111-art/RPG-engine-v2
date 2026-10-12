import { config } from "./config.ts";
import { docsGet,sheetsBatchGet } from "./google.ts";
import type { DocKey } from "./types.ts";
import { PREVIEW_TEST_TEMP_RUNTIME_ID, PREVIEW_TEST_DOC_IDS,
  testDocsPinned,testPreviewTimeline } from "./preview_test_storage.ts";

export function previewWriterReadinessGate(input:{
  timeline:string;tempId:string;docs:Record<DocKey,string>;
  allowWrites:boolean;rawWrites:boolean;heatWriter:boolean;kvEnabled:boolean;
}):boolean{
  return testPreviewTimeline(input.timeline) &&
    input.tempId===PREVIEW_TEST_TEMP_RUNTIME_ID &&
    testDocsPinned(input.docs) && !input.allowWrites &&
    !input.rawWrites && !input.heatWriter && input.kvEnabled;
}
/** Authorized read-only E2E readiness; returns no file IDs or document text. */
export async function previewWriterReadiness() {
  const keys=Object.keys(PREVIEW_TEST_DOC_IDS) as DocKey[];
  const statuses=await Promise.allSettled(keys.map(k=>docsGet(config.files[k])));
  const readable=Object.fromEntries(keys.map((key,i)=>[
    key,statuses[i].status==="fulfilled",
  ]));
  let saveId:string|null=null,spreadsheetReadable=false;
  try{
    const r=await sheetsBatchGet(config.files.TEMP_RUNTIME,["CONTROL!B2"]);
    saveId=String(r["CONTROL!B2"]?.[0]?.[0]??"");
    spreadsheetReadable=/^TEST-[A-Za-z0-9._-]+$/.test(saveId);
  }catch { /* Never leak Google API error or source IDs. */ }
  return {testOnly:true,googleWritesPerformed:0,kvWritesPerformed:0,
    isolatedSpreadsheetReadable:spreadsheetReadable,
    testSaveId:spreadsheetReadable?saveId:null,
    allNineTestDocsReadable:Object.values(readable).every(Boolean),
    docReadability:readable};
}
