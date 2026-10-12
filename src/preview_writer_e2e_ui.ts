/** Mobile Preview-only UI. No secrets embedded. */
export const PREVIEW_WRITER_E2E_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>RPG V2 — один TEST-коммит</title>
<style>body{font:16px system-ui;max-width:670px;margin:30px auto;padding:16px;background:#111827;color:#f1f5f9}
button,input{font:inherit;width:100%;padding:12px;margin-top:12px;box-sizing:border-box;border-radius:8px}
input{background:#273449;color:white;border:1px solid #7a8594}button{background:#2165e5;color:white;border:0}
pre{background:#263449;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere}</style>
</head><body><h2>RPG V2 — фиксированная TEST-транзакция</h2>
<p>Только изолированный Preview. После явного включения тестового writer запишет строго TEST-S2 → TEST-S3,
одну тестовую квитанцию NPC, одну медную монету и один маркер TEST Google Docs.
Повторная отправка использует тот же TX; не пытайтесь менять сохранение вручную.
Если операция зависнет или вернёт ошибку, остановитесь: блокировка может потребовать ручной сверки.</p>
<label>Действующий Bearer (не отправляйте его в чат)
<input type="password" id="key" autocomplete="off" spellcheck="false"></label>
<button type="button" id="start">Запустить один фиксированный TEST-коммит</button>
<pre id="result">Не запускался.</pre>
<script>
document.querySelector("#start").addEventListener("click",async()=>{
 const btn=document.querySelector("#start"),out=document.querySelector("#result");
 const key=document.querySelector("#key").value;
 document.querySelector("#key").value="";
 btn.disabled=true;out.textContent="Ожидание ответа от Preview...";
 try{
  const response=await fetch("/preview/writer-e2e/run",{
   method:"POST",cache:"no-store",referrerPolicy:"no-referrer",
   headers:{"authorization":"Bearer "+key}
  });
  out.textContent="HTTP "+response.status+String.fromCharCode(10)+
   JSON.stringify(await response.json(),null,2);
 }catch(error){out.textContent="Ошибка: "+String(error);}
 finally{btn.disabled=false;}
});
</script></body></html>`;
