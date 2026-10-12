import { withKvWriterLease, type LeaseKv } from "./writer_kv_lease.ts";

/**
 * Synthetic Preview-only **Deno KV** contention. Absolutely no Google calls.
 * All feature/session/workbook/timeline guards must pass before KV opens.
 */
export const SYNTHETIC_PREVIEW_WORKBOOK_ID = "1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8";
const INSTANCE_ID = crypto.randomUUID();
const SESSION_RE = /^TEST-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOLD_MS = 12_000;

export type PreviewKvGate = {
  timeline: string; enabled: boolean; writesEnabled: boolean;
  rawWritesEnabled: boolean; npcHeatWriterEnabled: boolean;
  kvEnabled: boolean; configuredWorkbookId: string;
  isolatedWorkbookId: string;
};

export function isPreviewTimeline(timeline: string): boolean {
  return timeline.startsWith("git-branch/") || timeline.startsWith("preview/");
}

/** Safe, named diagnostics only: no secrets, IDs, tokens or ENV values. */
export function previewKvGateChecks(g: PreviewKvGate) {
  return {
    previewTimeline: isPreviewTimeline(g.timeline),
    probeEnabled: g.enabled,
    kvEnabled: g.kvEnabled,
    googleWritesDisabled: !g.writesEnabled,
    rawCommitsDisabled: !g.rawWritesEnabled,
    heatTestWriterDisabled: !g.npcHeatWriterEnabled,
    isolatedTempWorkbook: g.configuredWorkbookId === SYNTHETIC_PREVIEW_WORKBOOK_ID,
    isolatedWriterWorkbook: g.isolatedWorkbookId === SYNTHETIC_PREVIEW_WORKBOOK_ID,
  };
}
export function previewKvGate(g: PreviewKvGate): boolean {
  return Object.values(previewKvGateChecks(g)).every(Boolean);
}

export function previewKvSession(sessionId: unknown): string {
  if (typeof sessionId !== "string" || !SESSION_RE.test(sessionId))
    throw Error("PREVIEW_KV_INVALID_SYNTHETIC_SESSION");
  return sessionId.toLowerCase();
}
function syntheticKey(sessionId: string): string {
  return "TEST-PREVIEW-REMOTE-KV-RACE:" + previewKvSession(sessionId);
}
async function openSharedKv(): Promise<{kv:LeaseKv;close:()=>void}> {
  const runtime = (globalThis as unknown as {
    Deno?: {openKv?: ()=>Promise<LeaseKv & {close?:()=>void}>};
  }).Deno;
  if (!runtime?.openKv) throw Error("PREVIEW_KV_DENO_RUNTIME_REQUIRED");
  const kv = await runtime.openKv();
  return {kv,close:()=>kv.close?.()};
}

export async function previewKvStatus(sessionId:string) {
  const {kv,close}=await openSharedKv();
  try {
    const key=["rpg-v2","semantic-writer-lock",syntheticKey(sessionId)];
    const current=await kv.get(key);
    return {testOnly:true,held:current.value!==null,serverInstanceId:INSTANCE_ID};
  } finally {close();}
}
export async function previewKvHold(sessionId:string) {
  const {kv,close}=await openSharedKv();
  try {
    const result=await withKvWriterLease({
      kv,workbookId:syntheticKey(sessionId),txId:"TEST-PREVIEW-HOLDER",
      releaseOnError:false,
      action:async()=>{
        await new Promise(resolve=>setTimeout(resolve,HOLD_MS));
        return {acquired:true,serverInstanceId:INSTANCE_ID};
      },
    });
    return {...result,testOnly:true,holdMs:HOLD_MS,googleWritesPerformed:0};
  } finally {close();}
}
export async function previewKvContend(sessionId:string) {
  const {kv,close}=await openSharedKv();
  try {
    try {
      await withKvWriterLease({
        kv,workbookId:syntheticKey(sessionId),txId:"TEST-PREVIEW-RIVAL",
        releaseOnError:false,action:async()=>true,
      });
      return {denied:false,testOnly:true,serverInstanceId:INSTANCE_ID};
    } catch(e) {
      if(String(e).includes("WRITER_LEASE_BUSY_RETRY_LATER"))
        return {denied:true,testOnly:true,serverInstanceId:INSTANCE_ID};
      throw e;
    }
  } finally {close();}
}

export const PREVIEW_KV_PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>RPG V2 — изолированный Deno KV тест</title>
<style>
body{font:16px system-ui;max-width:640px;margin:30px auto;padding:16px;background:#121b2b;color:#e8edf5}
input,button{font:inherit;padding:12px;width:100%;box-sizing:border-box;border-radius:8px;margin-top:10px}
input{background:#27334a;color:white;border:1px solid #60708b}
button{border:0;background:#3976ea;color:white;cursor:pointer}
pre{background:#27334a;padding:15px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}
</style></head><body>
<h2>RPG V2 — удалённая конкуренция KV</h2>
<p>Только Preview и только отдельные синтетические ключи KV. Google Sheets и Docs не записываются.
В Production маршрут отключён.</p>
<label>Текущий Bearer-ключ (вводится только на этой странице; не присылайте его в чат)
<input id="secret" type="password" autocomplete="off" spellcheck="false"></label>
<button id="go" type="button">Проверить 12 параллельных запросов</button>
<pre id="result">Проверка ещё не запускалась.</pre>
<script>
document.querySelector("#go").addEventListener("click",async()=>{
 const btn=document.querySelector("#go"),out=document.querySelector("#result");
 btn.disabled=true;
 const key=document.querySelector("#secret").value;
 document.querySelector("#secret").value="";
 const sessionId="TEST-"+crypto.randomUUID();
 const post=async(action)=>{
   const response=await fetch("/preview/kv-race/"+action,{
     method:"POST",cache:"no-store",referrerPolicy:"no-referrer",
     headers:{"authorization":"Bearer "+key,"content-type":"application/json"},
     body:JSON.stringify({sessionId})
   });
   const result=await response.json();
   if(!response.ok)throw Error(action+": HTTP "+response.status+" "+JSON.stringify(result));
   return result;
 };
 const status=async()=>{
   const response=await fetch("/preview/kv-race/status?session="+encodeURIComponent(sessionId),{
     cache:"no-store",referrerPolicy:"no-referrer",
     headers:{"authorization":"Bearer "+key}
   });
   if(!response.ok)throw Error("status HTTP "+response.status);
   return await response.json();
 };
 let owner=null;
 try{
   out.textContent="Проверяется захват блокировки...";
   owner=post("hold");
   let held=false;
   for(let i=0;i<60;i++){
     await new Promise(resolve=>setTimeout(resolve,100));
     if((await status()).held){held=true;break;}
   }
   if(!held)throw Error("Блокировка не наблюдалась: холодный запуск или ошибка");
   const contenders=await Promise.all(Array.from({length:12},()=>post("contend")));
   const holder=await owner;
   const allDenied=contenders.every(c=>c.denied===true);
   const distinct=new Set([holder.serverInstanceId,...contenders.map(c=>c.serverInstanceId)]).size;
   out.textContent=JSON.stringify({
     ok:holder.acquired===true&&allDenied,
     contendersRejected:contenders.filter(c=>c.denied).length,
     totalContenders:12,distinctDenoInstancesObserved:distinct,
     remoteCrossInstanceEvidence:distinct>1,
     googleWritesPerformed:0,testOnly:true,
     note:distinct>1?"Более одного JS-экземпляра наблюдалось":
       "Облако обработало запросы в одном JS-экземпляре: мультиинстансность не доказана"
   },null,2);
 }catch(e){out.textContent="Тест не пройден: "+String(e);if(owner)owner.catch(()=>{});}
 finally{btn.disabled=false;}
});
</script></body></html>`;

/** HTML is static and hosted only on Deno's non-production timeline. */
export const PREVIEW_KV_SETUP_PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>RPG V2 — диагностика Preview</title>
<style>
body{font:16px system-ui;max-width:640px;margin:30px auto;padding:16px;background:#121b2b;color:#e8edf5}
input,button{font:inherit;padding:12px;width:100%;box-sizing:border-box;border-radius:8px;margin-top:10px}
input{background:#27334a;color:white;border:1px solid #60708b}
button{border:0;background:#3976ea;color:white;cursor:pointer}
pre{background:#27334a;padding:15px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}
a{color:#93bcff}
</style></head><body>
<h2>RPG V2 — проверка окружения Preview</h2>
<p>Никаких Google-записей или KV-модификаций. Показывает только названия пройденных условий.
Ключ вводится локально, не сохраняется и не отображается в ответе. Ничего секретного не присылай в чат.</p>
<label>Действующий Bearer-ключ
<input id="secret" type="password" autocomplete="off" spellcheck="false"></label>
<button type="button" id="diagnose">Проверить условия Preview</button>
<pre id="result">Ещё не проверено.</pre>
<p id="next"></p>
<script>
document.querySelector("#diagnose").addEventListener("click",async()=>{
 const btn=document.querySelector("#diagnose"),display=document.querySelector("#result");
 const secret=document.querySelector("#secret").value;
 document.querySelector("#secret").value="";
 btn.disabled=true;
 try {
  const response=await fetch("/preview/kv-race/diagnostics",{
    cache:"no-store",referrerPolicy:"no-referrer",headers:{"authorization":"Bearer "+secret}
  });
  const data=await response.json();
  display.textContent=JSON.stringify(data,null,2);
  if(response.ok&&data.ready===true){
   const next=document.querySelector("#next");
   next.textContent="Все условия выполнены. ";
   const link=document.createElement("a");
   link.href="/preview/kv-race";
   link.textContent="Открыть тест KV";
   next.appendChild(link);
  }
 }catch(error){display.textContent=String(error);}
 finally{btn.disabled=false;}
});
</script></body></html>`;
