import { config } from "./config.ts";
import {
  previewKvGate, previewKvHold, previewKvStatus, previewKvSession,
  type PreviewKvGate,
} from "./preview_kv_probe.ts";

/**
 * A different immutable revision of the SAME Deno app, already built before
 * the current branch. Never accept a user-defined external target.
 */
export const PINNED_OTHER_PREVIEW_REVISION =
  "https://rpg-engine-v2-rf62vs6xh8s9.vladvladislav8111.deno.net";

export function crossRevisionGate(input:PreviewKvGate){
  return previewKvGate(input) &&
    PINNED_OTHER_PREVIEW_REVISION.startsWith(
      "https://rpg-engine-v2-") &&
    PINNED_OTHER_PREVIEW_REVISION.endsWith(
      ".vladvladislav8111.deno.net");
}
type RemoteStatus = {
  testOnly:boolean;held:boolean;serverInstanceId:string;
};
type RemoteContender = {
  testOnly:boolean;denied:boolean;serverInstanceId:string;
};
type LocalHold = {
  acquired:boolean;serverInstanceId:string;
};
export type ProbeDependencies = {
  hold:(session:string)=>Promise<LocalHold>;
  localStatus:(session:string)=>Promise<{held:boolean}>;
  remoteStatus:(session:string)=>Promise<RemoteStatus>;
  remoteContend:(session:string)=>Promise<RemoteContender>;
  sleep:(millis:number)=>Promise<void>;
};
export async function crossRevisionProbeWith(
  deps:ProbeDependencies,session:string,
) {
  const verifiedSession=previewKvSession(session);
  // Settled result avoids an unhandled background promise if the remote
  // check fails while the holder is sleeping.
  const holder=deps.hold(verifiedSession).then(
    value=>({ok:true as const,value}),
    error=>({ok:false as const,error:String(error)}),
  );
  let sawLocal=false;
  try {
    for(let i=0;i<60;i++){
      if((await deps.localStatus(verifiedSession)).held){
        sawLocal=true;
        break;
      }
      await deps.sleep(50);
    }
    if(!sawLocal)throw Error("CROSS_PREVIEW_LOCAL_LOCK_NOT_OBSERVED");
    const before=await deps.remoteStatus(verifiedSession);
    if(before.testOnly!==true || typeof before.serverInstanceId!=="string" ||
       before.serverInstanceId.length<8 || !before.held)
      throw Error("CROSS_PREVIEW_REMOTE_LOCK_NOT_VISIBLE");
    const rival=await deps.remoteContend(verifiedSession);
    if(rival.testOnly!==true || typeof rival.serverInstanceId!=="string" ||
       rival.serverInstanceId.length<8 || rival.denied!==true)
      throw Error("CROSS_PREVIEW_REMOTE_CONTENDER_NOT_DENIED");
    const held=await holder;
    if(!held.ok)throw Error("CROSS_PREVIEW_HOLDER_FAILED");
    const after=await deps.remoteStatus(verifiedSession);
    const distinct=held.value.serverInstanceId!==before.serverInstanceId &&
      held.value.serverInstanceId!==rival.serverInstanceId;
    if(held.value.acquired!==true || !distinct ||
       after.testOnly!==true || after.held!==false)
      throw Error("CROSS_PREVIEW_DISTINCT_INSTANCE_OR_RELEASE_NOT_PROVEN");
    return {
      ok:true,testOnly:true,crossRevisionSharedKv:true,
      otherRevisionPinned:true,localHolderAcquired:true,
      remoteObservedHeld:true,remoteContenderRejected:true,
      independentJsInstancesObserved:2,afterReleaseVisible:true,
      googleWritesPerformed:0,gameSaveTouched:false,
      caveat:"Two Preview revisions, not concurrent replicas of the identical revision.",
    };
  } finally {
    // Await the holder even when remote verification failed. No orphaned
    // callback is left behind when the HTTP response completes.
    await holder;
  }
}

async function targetJson(
  path:string,session:string,method:"GET"|"POST",
):Promise<unknown>{
  const url=new URL("/preview/kv-race/"+path,PINNED_OTHER_PREVIEW_REVISION);
  if(method==="GET")url.searchParams.set("session",session);
  const response=await fetch(url,{
    method,cache:"no-store",redirect:"error",
    signal:AbortSignal.timeout(6000),
    headers:{
      "authorization":"Bearer "+config.apiKey,
      ...(method==="POST"?{"content-type":"application/json"}:{}),
    },
    ...(method==="POST"?{body:JSON.stringify({sessionId:session})}:{}),
  });
  if(!response.ok)throw Error("CROSS_PREVIEW_REMOTE_HTTP_"+response.status);
  return await response.json();
}
export async function runCrossRevisionProbe(){
  const session=previewKvSession("TEST-"+crypto.randomUUID());
  return await crossRevisionProbeWith({
    hold:previewKvHold,
    localStatus:previewKvStatus,
    remoteStatus:async s=>(await targetJson("status",s,"GET")) as RemoteStatus,
    remoteContend:async s=>(await targetJson("contend",s,"POST")) as RemoteContender,
    sleep:async ms=>await new Promise<void>(resolve=>setTimeout(resolve,ms)),
  },session);
}

export const CROSS_REVISION_PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>RPG V2 — независимые Deno Preview</title>
<style>body{font:16px system-ui;max-width:680px;margin:25px auto;padding:16px;
background:#111827;color:#f1f5f9}
input,button{font:inherit;width:100%;padding:12px;margin-top:12px;box-sizing:border-box;border-radius:8px}
input{background:#273449;color:white;border:1px solid #7a8594}
button{background:#2165e5;color:white;border:0}
pre{background:#263449;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere}</style>
</head><body><h2>RPG V2 — две независимые Preview-ревизии</h2>
<p>Тестовая KV-блокировка, без Google и игрового времени.
Сервер связывается только с заранее закреплённой второй ревизией нашего же приложения.
Если она недоступна — тест завершится ошибкой, без ослабления защиты.</p>
<label>Действующий Bearer-ключ (локально, не отправляйте его в чат)
<input type="password" id="key" autocomplete="off" spellcheck="false"></label>
<button type="button" id="start">Проверить две Deno-ревизии</button>
<pre id="result">Не запускалось.</pre>
<script>
document.querySelector("#start").addEventListener("click",async()=>{
 const button=document.querySelector("#start"),out=document.querySelector("#result");
 const key=document.querySelector("#key").value;
 document.querySelector("#key").value="";
 button.disabled=true;out.textContent="Проверяем общий KV и блокировку...";
 try{
  const response=await fetch("/preview/kv-cross-revision/run",{
   method:"POST",cache:"no-store",referrerPolicy:"no-referrer",
   headers:{"authorization":"Bearer "+key}
  });
  out.textContent="HTTP "+response.status+String.fromCharCode(10)+
   JSON.stringify(await response.json(),null,2);
 }catch(e){out.textContent="Ошибка: "+String(e);}
 finally{button.disabled=false;}
});
</script></body></html>`;
