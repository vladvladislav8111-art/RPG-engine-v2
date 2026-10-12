/** Local mobile UI for read-only TEST reconciliation. No key stored. */
export const PREVIEW_GOOGLE_RECOVERY_PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>RPG V2 — TEST Google recovery</title>
<style>body{font:16px system-ui;max-width:660px;margin:25px auto;padding:16px;
background:#111827;color:#eaf0f8}
input,button{font:inherit;width:100%;box-sizing:border-box;
padding:12px;margin-top:12px;border-radius:8px}
input{background:#263449;color:white;border:1px solid #7a8594}
button{background:#2463ea;color:white;border:0}
pre{padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;background:#263449}
</style></head><body><h2>TEST Google — отчёт восстановления</h2>
<p>Только чтение KV и изолированных Google Sheets/Docs.
Никакого снятия блокировки, повторного TX или игрового коммита.
Результат нельзя использовать для автоматического восстановления.</p>
<label>Действующий Bearer-ключ (введите здесь, не присылайте в чат)
<input id="secret" type="password" autocomplete="off" spellcheck="false"></label>
<button type="button" id="go">Сверить TEST-транзакцию</button>
<button type="button" id="lost">Сверить прерванную запись TEST-S4 (только чтение)</button>
<pre id="result">Проверка не запускалась.</pre>
<script>

document.querySelector("#lost").addEventListener("click",async()=>{
 const button=document.querySelector("#lost"),out=document.querySelector("#result");
 const secret=document.querySelector("#secret").value;
 document.querySelector("#secret").value="";
 button.disabled=true;
 try{
  const res=await fetch("/preview/google-recovery/ack-drop",{
   method:"GET",cache:"no-store",referrerPolicy:"no-referrer",
   headers:{"authorization":"Bearer "+secret}
  });
  out.textContent="HTTP "+res.status+String.fromCharCode(10)+
   JSON.stringify(await res.json(),null,2);
 }catch(e){out.textContent="Ошибка: "+String(e);}
 finally{button.disabled=false;}
});
document.querySelector("#go").addEventListener("click",async()=>{
 const btn=document.querySelector("#go"),out=document.querySelector("#result");
 const secret=document.querySelector("#secret").value;
 document.querySelector("#secret").value="";
 btn.disabled=true;
 try{
  const result=await fetch("/preview/google-recovery/report",{
   method:"GET",cache:"no-store",referrerPolicy:"no-referrer",
   headers:{"authorization":"Bearer "+secret}
  });
  out.textContent="HTTP "+result.status+String.fromCharCode(10)+
    JSON.stringify(await result.json(),null,2);
 }catch(e){out.textContent="Ошибка: "+String(e);}
 finally{btn.disabled=false;}
});
</script></body></html>`;
