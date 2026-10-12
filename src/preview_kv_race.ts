import { config } from "./config.ts";
import { requireWriterKv } from "./cache.ts";
import { withKvWriterLease } from "./writer_kv_lease.ts";

// Instance identity is unique per JS isolate; never used for authorization.
const INSTANCE_ID = crypto.randomUUID();
const SESSION_PATTERN = /^TEST-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HOLD_MS = 10_000;

function workbook(session: string): string {
  if (!SESSION_PATTERN.test(session)) throw Error("PREVIEW_KV_RACE_INVALID_SESSION");
  if (!config.previewFixture) throw Error("PREVIEW_KV_RACE_NOT_SYNTHETIC_FIXTURE");
  // The test only reads/writes Deno KV, and is disabled during Google writes.
  if (config.allowWrites) throw Error("PREVIEW_KV_RACE_REQUIRES_GOOGLE_WRITES_DISABLED");
  return "TEST-PREVIEW-REMOTE-KV-RACE:" + session;
}
export async function remoteKvRaceStatus(session: string) {
  const id = workbook(session);
  const kv = await requireWriterKv();
  const row = await kv.get(["rpg-v2", "semantic-writer-lock", id]);
  return { held: row.value !== null, serverInstanceId: INSTANCE_ID };
}
export async function remoteKvRaceHold(session: string) {
  const id = workbook(session);
  const kv = await requireWriterKv();
  const result = await withKvWriterLease({
    kv, workbookId:id, txId:"TEST-REMOTE-KV-HOLDER", releaseOnError: false,
    action: async () => {
      await new Promise<void>(resolve => setTimeout(resolve, HOLD_MS));
      return { acquired: true, serverInstanceId: INSTANCE_ID };
    },
  });
  return { ...result, holdMs: HOLD_MS, testOnly: true };
}
export async function remoteKvRaceContend(session: string) {
  const id = workbook(session);
  const kv = await requireWriterKv();
  try {
    await withKvWriterLease({
      kv, workbookId:id, txId:"TEST-REMOTE-KV-CONTENDER", releaseOnError: false,
      action:async () => "ACQUIRED",
    });
    return { denied: false, serverInstanceId: INSTANCE_ID, testOnly: true };
  } catch (error) {
    if (String(error).includes("WRITER_LEASE_BUSY_RETRY_LATER")) {
      return { denied: true, serverInstanceId: INSTANCE_ID, testOnly: true };
    }
    throw error;
  }
}
export function remoteKvRaceHtml(): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>RPG V2 Preview KV race</title>
<style>body{font:16px system-ui;max-width:680px;margin:2.5rem auto;padding:1.2rem;background:#101827;color:#f1f5f9}button,input{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:8px}input{background:#263449;color:#fff;border:1px solid #738096}button{background:#2563eb;color:#fff;border:none;margin-top:1rem}pre{background:#263449;overflow-wrap:anywhere;white-space:pre-wrap;padding:1rem;border-radius:8px}</style>
</head><body><h1>Удалённый тест Deno KV</h1>
<p>Только синтетический Preview. Google-записей нет: ALLOW_WRITES=false обязателен.
Проверяются 12 параллельных HTTP-запросов и разные экземпляры Deno, если платформа их выделит.</p>
<label>Существующий Bearer-ключ <input id="key" type="password" autocomplete="off"></label>
<button id="run" type="button">Проверить параллельные запросы</button><pre id="status">Не запускался.</pre>
<script>
document.querySelector("#run").addEventListener("click",async()=>{
 const button=document.querySelector("#run"),display=document.querySelector("#status");
 button.disabled=true;
 const secret=document.querySelector("#key").value.trim();
 document.querySelector("#key").value="";
 const sessionId="TEST-"+crypto.randomUUID();
 const post=async(path)=>{
   const response=await fetch(path,{method:"POST",headers:{"authorization":"Bearer "+secret,"content-type":"application/json"},body:JSON.stringify({sessionId})});
   const body=await response.json();
   if(!response.ok)throw Error("HTTP "+response.status+": "+JSON.stringify(body));
   return body;
 };
 const status=async()=>{const response=await fetch("/preview/kv-race/status?session="+encodeURIComponent(sessionId),{headers:{"authorization":"Bearer "+secret}});
   if(!response.ok)throw Error("KV status HTTP "+response.status);
   return await response.json();};
 let ownerPromise=null;
 try{
   display.textContent="Ожидаю захват блокировки первым запросом...";
   ownerPromise=post("/preview/kv-race/hold");
   let held=false;
   for(let i=0;i<45;i++){
     await new Promise(r=>setTimeout(r,120));
     const current=await status();
     if(current.held){held=true;break;}
   }
   if(!held)throw Error("Не удалось обнаружить блокировку: захват или холодный старт занял слишком много времени");
   const rivals=await Promise.all(Array.from({length:12},()=>post("/preview/kv-race/contend")));
   const owner=await ownerPromise;
   const distinct=[...new Set([owner.serverInstanceId,...rivals.map(x=>x.serverInstanceId)])];
   const allDenied=rivals.every(x=>x.denied===true);
   display.textContent=JSON.stringify({
     ok:owner.acquired===true&&allDenied,
     testOnly:true,googleWritesPerformed:0,ownerAcquired:owner.acquired,
     contenders:12,contendersRejected:rivals.filter(x=>x.denied).length,
     distinctServerInstances:distinct.length,
     differentDenoInstancesObserved:distinct.length>1,
     conclusion:distinct.length>1
       ?"Удалённая KV-конкуренция разных экземпляров подтверждена"
       :"Конкуренция HTTP-подключений подтверждена; разные экземпляры пока не наблюдались",
   },null,2);
 }catch(err){display.textContent="Тест не пройден: "+String(err); if(ownerPromise)ownerPromise.catch(()=>{});}
 finally{button.disabled=false;}
});
</script></body></html>`;
}
