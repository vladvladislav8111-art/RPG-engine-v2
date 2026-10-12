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

export const PREVIEW_WRITER_READINESS_PAGE=`<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>RPG V2 — TEST Google readiness</title>
<style>body{font:16px system-ui;max-width:680px;margin:30px auto;padding:16px;background:#101827;color:#f1f5f9}
input,button{font:inherit;padding:12px;width:100%;box-sizing:border-box;border-radius:8px;margin-top:12px}
input{background:#263449;color:white;border:1px solid #738096}
button{background:#2563eb;color:white;border:0}
pre{background:#263449;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere}</style></head>
<body><h2>TEST Google — проверка чтения</h2>
<p>Только Preview. Проверяем таблицу и девять тестовых Docs. Никаких записей в Google или KV.</p>
<label>Текущий Bearer-ключ (вводить локально, не присылать в чат)
<input id="key" type="password" autocomplete="off" spellcheck="false"></label>
<button id="run" type="button">Проверить тестовые Google Docs</button>
<pre id="result">Не проверено.</pre>
<script>
document.querySelector("#run").addEventListener("click",async()=>{
 const btn=document.querySelector("#run"),pre=document.querySelector("#result");
 const key=document.querySelector("#key").value;
 document.querySelector("#key").value="";
 btn.disabled=true;
 try{
  const res=await fetch("/preview/writer-readiness",{
    method:"GET",cache:"no-store",referrerPolicy:"no-referrer",
    headers:{"authorization":"Bearer "+key},
  });
  const obj=await res.json();
  pre.textContent="HTTP "+res.status+String.fromCharCode(10)+JSON.stringify(obj,null,2);
 }catch(err){pre.textContent="Ошибка: "+String(err);}
 finally{btn.disabled=false;}
});
</script></body></html>`;
