/** No secret or request body; guarded Preview-only mobile UI. */
export const PREVIEW_ACK_DROP_PAGE=`<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>RPG V2 — TEST post-Sheets ACK loss</title>
<style>body{font:16px system-ui;max-width:660px;margin:24px auto;padding:16px;
background:#111827;color:#f1f5f9}input,button{font:inherit;width:100%;
box-sizing:border-box;padding:12px;margin-top:12px;border-radius:8px}
input{background:#273449;color:white;border:1px solid #768397}
button{background:#2463eb;color:white;border:0}
pre{padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;background:#263449}
</style></head><body>
<h2>Изолированный TEST: потеря ACK после записи Sheets</h2>
<p>Один необратимый тест TEST-S3 → TEST-S4. Сначала выполняется настоящая запись
в тестовую Google Sheets, затем сервер намеренно отбрасывает подтверждение
и не переходит к Google Docs. KV-блокировка должна остаться занятой.
Это НЕ воспроизведение настоящего сетевого сбоя Google.</p>
<p><b>После нажатия не повторяйте запуск.</b> Сохранённый TEST-S4 и
блокировка требуют отдельной сверки. Рабочее сохранение Шуры не используется.</p>
<label>Bearer-ключ (вводится только локально, не присылайте в чат)
<input id="key" type="password" autocomplete="off" spellcheck="false"></label>
<button id="run" type="button">Запустить фиксированный TEST-сбой один раз</button>
<pre id="result">Не запускался.</pre>
<script>
document.querySelector("#run").addEventListener("click",async()=>{
 const btn=document.querySelector("#run"),pre=document.querySelector("#result");
 const key=document.querySelector("#key").value;
 document.querySelector("#key").value="";
 btn.disabled=true;
 try {
  const res=await fetch("/preview/ack-drop/run",{
   method:"POST",cache:"no-store",referrerPolicy:"no-referrer",
   headers:{"authorization":"Bearer "+key}
  });
  pre.textContent="HTTP "+res.status+String.fromCharCode(10)+
   JSON.stringify(await res.json(),null,2);
 }catch(e){pre.textContent="Ошибка: "+String(e);}
 // Intentionally no re-enable on success or error. Never retry.
});
</script></body></html>`;
