/** Browser UI: no credentials persisted, no external scripts, same-origin Lab API. */
export const RPG_LAB_UI_V1=String.raw`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RPG Lab • Projects</title>
<style>
:root{color-scheme:dark;font:15px system-ui,Segoe UI,Arial,sans-serif;background:#101724;color:#e9edf8}
*{box-sizing:border-box}body{max-width:1200px;margin:0 auto;padding:28px 18px 80px}
h1{font-size:29px;margin:0 0 8px}p{color:#acbad0;line-height:1.5}
h2{font-size:18px;margin:0 0 13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
article{background:#1a2536;border:1px solid #304259;border-radius:14px;padding:18px;margin-bottom:14px}
label{display:block;color:#c8d4e4;margin:10px 0 5px}
input,select,textarea{width:100%;background:#0e1623;color:#e9edf8;border:1px solid #3a506a;border-radius:8px;padding:10px;font:inherit}
textarea{font:12px ui-monospace,SFMono-Regular,Consolas,monospace;min-height:170px;resize:vertical}
button{background:#4d78e5;color:white;padding:10px 13px;border:0;border-radius:9px;cursor:pointer;margin:8px 6px 0 0;font:inherit}
button.secondary{background:#364862}button:disabled{opacity:.55}
pre{background:#0c1421;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:9px;max-height:480px;overflow:auto;font-size:12px}
small{color:#98a9c4}.success{color:#85e6bb}.error{color:#ff9e9e}
</style></head><body>
<h1>⚙ RPG Lab</h1>
<p>Изолированные миры, редактируемые формулы, ресурсы, дроп, экономика, карта, NPC. Все вычисления предварительные: реальные игровые события подтверждаются ведущим отдельно.</p>
<div class="grid"><article>
<h2>1. Подключение</h2>
<label>Ключ RPG Runtime (не сохраняется в браузере)</label><input id="token" type="password" autocomplete="off" placeholder="RUNTIME_API_KEY">
<label>Проект (3–64 символа)</label><input id="project" value="demo_world">
<div><button id="load">Открыть проект</button><button class="secondary" id="sample">Демо-шаблон</button></div>
<small>Текущая версия правил: <span id="version">0</span></small>
</article>
<article>
<h2>2. Файлы и таблицы</h2>
<label>Файл JSON или CSV</label><input id="upload" type="file" accept=".json,.csv,application/json,text/csv" multiple>
<label>Секция для CSV</label><select id="table"><option value="formulas">Формулы</option><option value="resources">Ресурсы</option><option value="loot">Дроп</option><option value="prices">Цены</option><option value="locations">Локации</option></select>
<button id="import">Импортировать файл</button>
<p><small>Изменения версионируются. Формулы можно менять без деплоя; для CSV необходим уже созданный проект.</small></p>
</article></div>
<div class="grid"><article><h2>Быстро добавить формулу</h2>
<label>ID формулы</label><input id="formulaId" value="damage">
<label>Выражение</label><input id="expression" value="max(0,attack-defense)">
<button id="addFormula">Добавить в правила</button>
<p><small>Можно ссылаться на другие формулы и переменные. Поддерживаются min, max, clamp, floor, round, sqrt. Код JavaScript не выполняется.</small></p>
</article><article><h2>Карточка NPC (JSON)</h2>
<label>ID NPC</label><input id="npcId" value="npc.guide">
<textarea id="npcData" rows="5">{"name":"Проводник","canonRef":"demo.placeholder","traits":["осторожен"],"goals":["сохранить группу"],"knownFacts":[],"speechStyle":"кратко и по делу","responsePatterns":{}}</textarea>
<button id="addNpc">Добавить персонажа</button>
</article></div>
<article><h2>🔗 Папка Google Drive</h2>
<p>Подключи одну папку с файлами проекта. Сервисный аккаунт Deno должен иметь к ней доступ. Распознаются вложенные папки первого уровня, JSON, CSV, текстовые документы Google Docs и Google Sheets.</p>
<div class="grid"><div>
<label>ID папки Google Drive</label><input id="folderId" placeholder="ID из ссылки на папку">
<label><input id="driveAuto" type="checkbox" checked style="width:auto"> Автообновление при обращении к проекту (кеш 2 минуты)</label>
<div><button id="driveConnect">Подключить папку</button><button id="driveSync" class="secondary">Синхронизировать</button></div>
<div><button id="serviceAccount" class="secondary">Адрес для доступа к папке</button><button id="driveStatus" class="secondary">Проверить связь</button><button id="driveNotes" class="secondary">Список документов</button><button id="driveDisconnect" class="secondary">Отключить папку</button></div>
</div><div><p><small>JSON/CSV становятся источником правил. Google Docs и текстовые файлы с описаниями доступны как справочные материалы: они не меняют автоматически канонические характеристики NPC.</small></p><p><small>После подключения ручное изменение правил через редактор отключено. Меняй файлы в Google Drive, затем синхронизируй.</small></p></div></div>
</article>
<article><h2>3. Редактор правил проекта (JSON)</h2>
<textarea id="pack" rows="15" spellcheck="false" aria-label="Конфигурация проекта"></textarea>
<button id="save">Сохранить версию</button><button class="secondary" id="format">Форматировать JSON</button>
</article>
<article><h2>4. Калькулятор (до 20 заданий одним запросом)</h2>
<p>Вставь массив jobs. Поддерживаются: formula, resources, loot, dungeon_watch, harvest, progression, stat, economy, route, npc. Dungeon_watch лишь предлагает встречу и не начинает бой.</p>
<textarea id="jobs" rows="8" spellcheck="false">[{"id":"calc.1","kind":"formula","args":{"formulaId":"damage","variables":{"attack":24,"defense":7}}}]</textarea>
<button id="run">Рассчитать</button><button id="dungeonSample" class="secondary">Пример исследования этажа</button>
</article>
<article><h2>5. Состояние отдельной кампании</h2>
<div class="grid"><div><label>ID сессии</label><input id="sessionId" value="demo_session">
<label><input id="useSession" type="checkbox" style="width:auto"> Использовать состояние сессии для расчётов</label>
<button id="newSession" class="secondary">Новая</button><button id="loadSession" class="secondary">Открыть</button><button id="saveSession">Сохранить</button>
<small>Версия сессии: <span id="sessionVersion">0</span></small>
</div><div><label>Состояние (JSON)</label><textarea id="session" rows="9"></textarea></div></div>
</article>
<article><h2>6. Подтверждённый игровой ход и память NPC</h2>
<p>Сохранение требует завершённого исхода сцены, ссылки sourceRef и явного списка очевидцев. Проверка версий не допускает повторной записи.</p>
<textarea id="sessionEvent" rows="6" spellcheck="false">{"sourceRef":"day1.scene001","kind":"scene","time":"D1 09:10","summary":"Событие состоялось","knownBy":[],"gmConfirmed":true}</textarea>
<button id="commitEvent">Сохранить подтверждённое событие</button>
</article>
<article><h2>Результат</h2><div id="status"><small>Ничего не загружено</small></div><pre id="out"></pre></article>
<script>
(function(){
"use strict";
var revision=0,sessionRevision=0;
function el(id){return document.getElementById(id)}
function project(){return encodeURIComponent(el("project").value.trim())}
function status(msg,bad){el("status").textContent=msg;el("status").className=bad?"error":"success"}
function show(result){el("out").textContent=JSON.stringify(result,null,2)}
async function api(path,method,data){
 const token=el("token").value.trim();
 if(!token)throw Error("Сначала введи ключ сервера.");
 const init={method:method,headers:{"Authorization":"Bearer "+token}};
 if(data!==undefined){init.headers["Content-Type"]="application/json";init.body=JSON.stringify(data);}
 const response=await fetch(path,init);
 const json=await response.json();
 if(!response.ok)throw Error(json.error||"HTTP "+response.status);
 return json;
}
async function act(fn){
 try{status("Выполняется...",false);await fn();status("Готово",false)}
 catch(err){status(err.message||String(err),true)}
}
const base="/rpg-lab/v1/projects/";
el("load").onclick=()=>act(async()=>{
 const r=await api(base+project(),"GET");revision=r.revision;el("version").textContent=revision;
 el("pack").value=JSON.stringify(r.pack,null,2);show(r);
});
el("save").onclick=()=>act(async()=>{
 const pack=JSON.parse(el("pack").value);
 const r=await api(base+project(),"PUT",{expectedRevision:revision,pack});
 revision=r.revision;el("version").textContent=revision;show(r);
});
el("format").onclick=()=>act(async()=>{el("pack").value=JSON.stringify(JSON.parse(el("pack").value),null,2)});
el("import").onclick=()=>act(async()=>{
 const files=Array.from(el("upload").files);if(!files.length)throw Error("Выбери файлы");
 if(files.length>20)throw Error("Максимум 20 файлов за раз");
 const imported=[];
 for(const f of files){
  if(f.size>90000)throw Error("Файл превышает 90 КБ: "+f.name);
  const format=f.name.toLowerCase().endsWith(".csv")?"csv":"json";
  const prefix=f.name.split(/[._-]/)[0].toLowerCase();
  const guessed={formulas:"formulas",resources:"resources",loot:"loot",prices:"prices",locations:"locations"}[prefix];
  const r=await api(base+project()+"/import","POST",{expectedRevision:revision,
    file:{format,table:format==="csv"?(guessed||el("table").value):undefined,content:await f.text()}});
  revision=r.revision;el("version").textContent=revision;imported.push(f.name);
 }
 const read=await api(base+project(),"GET");el("pack").value=JSON.stringify(read.pack,null,2);
 show({imported,revision});
});
el("run").onclick=()=>act(async()=>{
 const body={expectedRevision:revision,jobs:JSON.parse(el("jobs").value)};
 if(el("useSession").checked){body.sessionId=el("sessionId").value.trim();body.expectedSessionRevision=sessionRevision;}
 const r=await api(base+project()+"/evaluate","POST",body);show(r);
});
el("addFormula").onclick=()=>act(async()=>{
 const p=JSON.parse(el("pack").value);p.formulas=p.formulas||{};
 p.formulas[el("formulaId").value.trim()]=el("expression").value.trim();
 el("pack").value=JSON.stringify(p,null,2);show({added:"formula",unsaved:true});
});
el("addNpc").onclick=()=>act(async()=>{
 const p=JSON.parse(el("pack").value);p.npcProfiles=p.npcProfiles||{};
 p.npcProfiles[el("npcId").value.trim()]=JSON.parse(el("npcData").value);
 el("pack").value=JSON.stringify(p,null,2);show({added:"npc",unsaved:true});
});
function sessionPath(){return base+project()+"/sessions/"+encodeURIComponent(el("sessionId").value.trim());}
el("newSession").onclick=()=>act(async()=>{
 sessionRevision=0;el("sessionVersion").textContent="0";
 const p=JSON.parse(el("pack").value);
 const s={schema:"RPG_LAB_SESSION_V1",projectId:p.projectId,sessionId:el("sessionId").value.trim(),
 gameClock:"Day 1 06:00",player:{resources:Object.fromEntries(Object.entries(p.resources).map(([k,v])=>[k,v.max])),stats:{},inventory:{}},
 discovered:Object.keys(p.locations).slice(0,2),npcs:{},events:[]};
 el("session").value=JSON.stringify(s,null,2);
});
el("loadSession").onclick=()=>act(async()=>{
 const r=await api(sessionPath(),"GET");sessionRevision=r.revision;el("sessionVersion").textContent=sessionRevision;
 el("session").value=JSON.stringify(r.session,null,2);show(r);
});
el("saveSession").onclick=()=>act(async()=>{
 const r=await api(sessionPath(),"PUT",{expectedRevision:sessionRevision,session:JSON.parse(el("session").value)});
 sessionRevision=r.revision;el("sessionVersion").textContent=sessionRevision;show(r);
});
el("commitEvent").onclick=()=>act(async()=>{
 const body={expectedRevision:sessionRevision,expectedPackRevision:revision,event:JSON.parse(el("sessionEvent").value)};
 const result=await api(sessionPath()+"/events","POST",body);
 sessionRevision=result.revision;el("sessionVersion").textContent=sessionRevision;
 const latest=await api(sessionPath(),"GET");el("session").value=JSON.stringify(latest.session,null,2);
 show(result);
});
el("dungeonSample").onclick=()=>act(async()=>{
 el("jobs").value=JSON.stringify([{id:"dungeon.preview",kind:"dungeon_watch",args:{
  floor:7,eventId:"preview.dungeon.001",seed:"preview.seed",minutes:10,
  noiseFactor:1,trafficFactor:1,allowHomebrew:false
 }}],null,2);
 show({example:"DUNGEON_PREVIEW_ONLY",committed:false});
});
function driveUrl(suffix){return base+project()+"/drive"+(suffix||"");}
async function refreshPack(){
 const r=await api(base+project(),"GET");revision=r.revision;el("version").textContent=revision;
 el("pack").value=JSON.stringify(r.pack,null,2);
}
el("driveConnect").onclick=()=>act(async()=>{
 const id=el("folderId").value.trim();if(!id)throw Error("Введи ID папки");
 const result=await api(driveUrl(),"PUT",{folderId:id,autoSync:el("driveAuto").checked,expectedRevision:revision});
 await refreshPack();show(result);
});
el("driveSync").onclick=()=>act(async()=>{
 const result=await api(driveUrl("/sync"),"POST",{expectedRevision:revision});
 await refreshPack();show(result);
});
el("serviceAccount").onclick=()=>act(async()=>show(await api("/rpg-lab/v1/google/service-account","GET")));
el("driveStatus").onclick=()=>act(async()=>{
 const r=await api(driveUrl(),"GET");
 if(r.binding){el("folderId").value=r.binding.folderId;el("driveAuto").checked=r.binding.autoSync;}
 show(r);
});
el("driveNotes").onclick=()=>act(async()=>show(await api(driveUrl("/sources"),"GET")));
el("driveDisconnect").onclick=()=>act(async()=>{
 const r=await api(driveUrl(),"DELETE",{expectedRevision:revision});show(r);
});
el("sample").onclick=()=>act(async()=>{
 const id=el("project").value.trim();
 const p={schema:"RPG_LAB_PACK_V1",projectId:id,worldId:"demo.fantasy",
 formulas:{damage:"max(0,attack-defense)",harvest:"floor((base+skill*0.4)*tool)",training:"floor(trainingMinutes*focus/10)",xpNext:"100+level*40"},
 resources:{hp:{min:0,max:100},stamina:{min:0,max:60},mana:{min:0,max:80}},
 lootTables:{goblin:{rolls:2,entries:[{itemId:"coin",weight:4,chance:0.9,min:1,max:5},{itemId:"fang",weight:1,chance:0.45,min:1,max:2}]}},
 prices:{potion:{base:35,currency:"gold",buyMultiplier:1,sellMultiplier:0.5}},
 economy:{taxRate:0.05},
 locations:{town:{name:"Город",kind:"city",neighbors:{dungeon:5}},dungeon:{name:"Вход",kind:"entrance",neighbors:{town:5,floor_1:3}},floor_1:{name:"Первый этаж",kind:"dungeon_floor",parentId:"dungeon",neighbors:{dungeon:3,floor_2:8}},floor_2:{name:"Второй этаж",kind:"dungeon_floor",parentId:"dungeon",neighbors:{floor_1:8}}},
 npcProfiles:{"npc.guide":{name:"Проводник",canonRef:"demo.placeholder",traits:["осторожен"],goals:["защитить группу"],knownFacts:[],speechStyle:"Краткие реплики",responsePatterns:{betrayal:[{emotion:"шок",motive:"добраться до безопасного места и понять, что произошло"}]}}},
 progression:{xpThresholdFormula:"xpNext"}
 };
 el("pack").value=JSON.stringify(p,null,2);
 el("jobs").value=JSON.stringify([{id:"damage.1",kind:"formula",args:{formulaId:"damage",variables:{attack:24,defense:7}}},
  {id:"loot.1",kind:"loot",args:{tableId:"goblin",eventId:"battle.001",seed:"fixed-test-seed",killConfirmed:true}},
  {id:"path.1",kind:"route",args:{from:"town",to:"floor_1",discovered:["town","dungeon","floor_1"]}}],null,2);
});
})();
</script></body></html>`;
