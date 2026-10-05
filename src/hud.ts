import { config } from "./config.ts";
import { sheetsBatchGet } from "./google.ts";
import { deriveStaminaBaseMax } from "./physiology.ts";
import { generalXpThreshold } from "./rules.ts";

export const HUD_RESOURCE_URI = "ui://rpg-v2/hud-v2.2.html";
export const HUD_UI_VERSION = "hud-v2.2-bridge-compat";

type Scalar = string | number | boolean | null;

function valueMap(rows: unknown[][], keyColumn: number, valueColumn: number): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const row of rows.slice(1)) {
    const key = String(row[keyColumn] ?? "").trim();
    if (key) out[key] = (row[valueColumn] ?? null) as Scalar;
  }
  return out;
}

function n(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function conditionMap(rows: unknown[][]) {
  const out: Record<string, { value: string; unit: string; notes: string }> = {};
  for (const row of rows.slice(1)) {
    const id = String(row[0] ?? "");
    if (!id) continue;
    out[id] = {
      value: String(row[2] ?? ""),
      unit: String(row[3] ?? ""),
      notes: String(row[4] ?? ""),
    };
  }
  return out;
}

export function deriveBaselineMaxima(level: number, endurance: number, intelligence: number) {
  return {
    hp: 26 + 4 * endurance + 2 * Math.max(0, level - 1),
    stamina: deriveStaminaBaseMax(level, endurance),
    mana: 10 * intelligence,
  };
}

function severityFor(value: string): "good" | "warn" | "danger" | "neutral" {
  const v = value.toLocaleLowerCase();
  if (/severe|critical|starv|collapse|bleed|wound|injur/.test(v)) return "danger";
  if (/pronounced|strong|moderate|fatigue|hungry|debt/.test(v)) return "warn";
  if (/fed|none current|no open|^0$/.test(v)) return "good";
  return "neutral";
}

function ruStatus(value: string): string {
  const map: Array<[RegExp, string]> = [
    [/moderate mental fatigue \/ head clearer/i, "Умеренная умственная усталость"],
    [/pronounced mental fatigue \/ physically okay/i, "Выраженная умственная усталость"],
    [/severe hunger \/ prolonged fast/i, "Сильный продолжительный голод"],
    [/fed \/ prolonged hunger relieved/i, "Сыт, продолжительный голод снят"],
    [/hungry \/ breakfast skipped/i, "Голоден"],
    [/none current/i, "Нет текущего воздействия"],
  ];
  return map.find(([re]) => re.test(value))?.[1] ?? value;
}

export async function getHudSnapshot() {
  const ranges = [
    "CONTROL!A1:D12",
    "PLAYER_RESOURCES!A1:E30",
    "PLAYER_CONDITIONS!A1:F40",
    "CHARACTERISTICS!A1:H30",
  ];
  const data = await sheetsBatchGet(config.files.TEMP_RUNTIME, ranges);
  const control = valueMap(data["CONTROL!A1:D12"] ?? [], 0, 1);
  const resourceRows = data["PLAYER_RESOURCES!A1:E30"] ?? [];
  const resources = valueMap(resourceRows, 2, 3);
  const resourceCaps = valueMap(resourceRows, 2, 4);
  const characteristics = valueMap(data["CHARACTERISTICS!A1:H30"] ?? [], 0, 1);
  const conditions = conditionMap(data["PLAYER_CONDITIONS!A1:F40"] ?? []);

  const level = n(resources["General Level"]);
  const endurance = n(characteristics["Endurance"]);
  const intelligence = n(characteristics["Intelligence"]);
  const maxima = deriveBaselineMaxima(level, endurance, intelligence);

  const wounds = conditions["cond.shura.wounds"];
  const water = conditions["cond.shura.water_carried"];

  const statuses = [
    wounds && !/^(0|none)/i.test(wounds.value)
      ? { label: ruStatus(wounds.value), severity: severityFor(wounds.value) }
      : null,
  ].filter(Boolean);

  return {
    uiVersion: HUD_UI_VERSION,
    saveId: String(control["save_id"] ?? ""),
    name: "Шура",
    level,
    day: n(control["world_day"]),
    time: String(control["world_time"] ?? ""),
    location: String(control["current_location_display"] ?? ""),
    resources: {
      hp: { current: n(resources["HP"]), max: n(resourceCaps["HP"]) || maxima.hp },
      stamina: {
        current: n(resources["Stamina"]),
        max: n(resources["Stamina Ceiling"]) || n(resourceCaps["Stamina"]) || maxima.stamina,
        baseMax: n(resourceCaps["Stamina"]) || maxima.stamina,
      },
      mana: { current: n(resources["Mana"]), max: n(resourceCaps["Mana"]) || maxima.mana },
      satiety: { current: n(resources["Satiety"]), max: n(resourceCaps["Satiety"]) || 100 },
      hydration: { current: n(resources["Hydration"]), max: n(resourceCaps["Hydration"]) || 100 },
      money: n(resources["Money"]),
      generalXp: { current: n(resources["General XP"]), max: n(resourceCaps["General XP"]) || generalXpThreshold(level) },
      sup: n(resources["SUP"]),
    },
    statuses,
    water: water
      ? {
          value: water.value,
          unit: water.unit,
          notes: water.notes,
          display: (() => {
            const stored = water.notes.match(/([0-9]+(?:\.[0-9]+)?)L untreated .*?System Storage/i)?.[1];
            const carried = `${water.value} L при себе`;
            return stored ? `${carried} · ${stored} L в Storage (не обработана)` : carried;
          })(),
        }
      : null,
  };
}

export const HUD_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root {
    color-scheme: dark light;
    --panel: #1f1f1f;
    --panel-2: #2a2a2a;
    --text: #f4f4f4;
    --muted: #b9b9b9;
    --line: rgba(255,255,255,.10);
    --good: #4caf67;
    --good-bg: rgba(76,175,103,.15);
    --warn: #e78343;
    --warn-bg: rgba(231,131,67,.15);
    --danger: #ef6666;
    --danger-bg: rgba(239,102,102,.15);
    --neutral: #a7a7a7;
    --neutral-bg: rgba(167,167,167,.12);
  }
  @media (prefers-color-scheme: light) {
    :root {
      --panel: #ffffff;
      --panel-2: #f1f1f1;
      --text: #171717;
      --muted: #666;
      --line: rgba(0,0,0,.09);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 8px;
    background: transparent;
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 22px;
    padding: 20px;
    width: 100%;
    max-width: 680px;
    margin: 0 auto;
    box-shadow: 0 10px 32px rgba(0,0,0,.08);
  }
  .top { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:18px; }
  .title { font-size:24px; font-weight:760; letter-spacing:-.02em; min-width:0; }
  .day { border-radius:999px; padding:7px 12px; background:var(--good-bg); color:var(--good); font-weight:700; white-space:nowrap; }
  .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
  .survival-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-top:18px; }
  .stat { min-width:0; }
  .label { color:var(--muted); font-size:14px; margin-bottom:8px; }
  .value { font-size:30px; font-weight:760; line-height:1.08; letter-spacing:-.03em; }
  .value.warn { color:var(--warn); }
  .value.danger { color:var(--danger); }
  .bar { height:5px; margin-top:10px; border-radius:999px; background:var(--panel-2); overflow:hidden; }
  .submax { color:var(--warn); font-size:11px; margin-top:6px; min-height:14px; }
  .fill { height:100%; border-radius:inherit; background:currentColor; opacity:.9; }
  .divider { height:1px; background:var(--line); margin:20px 0 16px; }
  .row { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:baseline; font-size:16px; line-height:1.45; }
  .row + .row { margin-top:9px; }
  .strong { font-weight:720; }
  .muted { color:var(--muted); }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:15px; }
  .chip { border-radius:999px; padding:7px 11px; font-size:13px; font-weight:650; border:1px solid transparent; }
  .chip.good { color:var(--good); background:var(--good-bg); }
  .chip.warn { color:var(--warn); background:var(--warn-bg); }
  .chip.danger { color:var(--danger); background:var(--danger-bg); }
  .chip.neutral { color:var(--neutral); background:var(--neutral-bg); }
  .location { margin-top:14px; color:var(--muted); font-size:14px; display:flex; gap:7px; align-items:center; }
  .save { margin-top:10px; color:var(--muted); font-size:11px; opacity:.58; }
  @media (max-width:520px) {
    body { padding:4px; }
    .card { border-radius:18px; padding:16px; }
    .title { font-size:21px; }
    .stats { gap:10px; }
    .value { font-size:25px; }
    .label { font-size:13px; }
  }
</style>
</head>
<body>
<div class="card">
  <div class="top">
    <div class="title" id="title">Шура · Уровень —</div>
    <div class="day" id="day">День —</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="label">HP</div><div class="value" id="hp">—</div><div class="bar"><div class="fill" id="hpbar"></div></div></div>
    <div class="stat"><div class="label">Выносливость</div><div class="value" id="stamina">—</div><div class="bar"><div class="fill" id="staminabar"></div></div><div class="submax" id="staminaBase"></div></div>
    <div class="stat"><div class="label">Мана</div><div class="value" id="mana">—</div><div class="bar"><div class="fill" id="manabar"></div></div></div>
  </div>
  <div class="survival-stats">
    <div class="stat"><div class="label">Сытость</div><div class="value" id="satiety">—</div><div class="bar"><div class="fill" id="satietybar"></div></div></div>
    <div class="stat"><div class="label">Гидратация</div><div class="value" id="hydration">—</div><div class="bar"><div class="fill" id="hydrationbar"></div></div></div>
  </div>
  <div class="divider"></div>
  <div class="row">
    <span>Деньги: <span class="strong" id="money">—</span></span>
    <span class="muted">·</span>
    <span>Общий XP: <span class="strong" id="xp">—</span></span>
    <span class="muted">·</span>
    <span>SUP: <span class="strong" id="sup">—</span></span>
  </div>
  <div class="row" id="waterRow" hidden><span>Вода: <span class="strong" id="water">—</span></span></div>
  <div class="chips" id="chips"></div>
  <div class="location"><span>⌖</span><span id="location">—</span><span id="time"></span></div>
  <div class="save" id="save"></div>
</div>
<script>
(function() {
  const $ = (id) => document.getElementById(id);
  const pct = (cur, max) => max > 0 ? Math.max(0, Math.min(100, cur / max * 100)) : 0;
  const severity = (cur, max) => {
    const p = max > 0 ? cur / max : 1;
    if (p <= .25) return "danger";
    if (p <= .5) return "warn";
    return "";
  };
  function setStat(id, data) {
    const el = $(id);
    const bar = $(id + "bar");
    el.textContent = data.current + "/" + data.max;
    el.className = "value " + severity(data.current, data.max);
    bar.style.width = pct(data.current, data.max) + "%";
    bar.style.color = severity(data.current, data.max) === "danger"
      ? "var(--danger)"
      : severity(data.current, data.max) === "warn"
      ? "var(--warn)"
      : "var(--good)";
  }
  function normalizePayload(d) {
    if (!d) return null;
    if (d.resources) return d;
    // Compatibility with the ChatGPT RPG Runtime Bridge normalized HUD schema.
    if (d.kind === "hud" && d.hp && d.stamina && d.mana) {
      return {
        uiVersion: d.uiVersion || "bridge-normalized",
        saveId: d.saveId || "",
        name: d.name || "Шура",
        level: Number(d.generalLevel || 0),
        day: Number(d.worldDay || 0),
        time: d.worldTime || "",
        location: d.locationDisplay || d.locationId || "",
        resources: {
          hp: d.hp,
          stamina: {
            current: Number(d.stamina.current || 0),
            max: Number(d.stamina.max || 0),
            baseMax: Number((d.stamina && (d.stamina.baseMax ?? d.stamina.max)) || 0),
          },
          mana: d.mana,
          satiety: d.satiety || { current: 0, max: 100 },
          hydration: d.hydration || { current: 0, max: 100 },
          money: Number(d.money || 0),
          generalXp: {
            current: Number((d.generalXp && d.generalXp.current) || 0),
            max: Number((d.generalXp && (d.generalXp.max ?? d.generalXp.threshold)) || 0),
          },
          sup: Number(d.sup || 0),
        },
        statuses: (d.conditions || []).map(label => ({ label, severity: "neutral" })),
        water: d.water || null,
      };
    }
    return d;
  }
  function render(raw) {
    const d = normalizePayload(raw);
    if (!d || !d.resources) return;
    $("title").textContent = d.name + " · Уровень " + d.level;
    $("day").textContent = "День " + d.day;
    setStat("hp", d.resources.hp);
    setStat("stamina", d.resources.stamina);
    $("staminaBase").textContent =
      d.resources.stamina.baseMax > d.resources.stamina.max
        ? "База " + d.resources.stamina.baseMax
        : "";
    setStat("mana", d.resources.mana);
    setStat("satiety", d.resources.satiety);
    setStat("hydration", d.resources.hydration);
    $("money").textContent = d.resources.money + " медяков";
    $("xp").textContent = d.resources.generalXp.current + "/" + d.resources.generalXp.max;
    $("sup").textContent = d.resources.sup;
    $("location").textContent = d.location || "Неизвестная локация";
    $("time").textContent = d.time ? "· " + d.time : "";
    $("save").textContent = d.saveId || "";
    const chips = $("chips");
    chips.innerHTML = "";
    (d.statuses || []).forEach(s => {
      const el = document.createElement("span");
      el.className = "chip " + (s.severity || "neutral");
      el.textContent = s.label;
      chips.appendChild(el);
    });
    if (d.water) {
      $("waterRow").hidden = false;
      $("water").textContent = d.water.display || [d.water.value, d.water.unit].filter(Boolean).join(" ");
    } else {
      $("waterRow").hidden = true;
    }
  }

  const openai = window.openai;
  if (openai && openai.toolOutput) render(openai.toolOutput);

  window.addEventListener("openai:set_globals", (event) => {
    const globals = event && event.detail && event.detail.globals;
    if (globals && globals.toolOutput) render(globals.toolOutput);
  });

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.method === "ui/notifications/tool-result") {
      const result = msg.params && msg.params.result;
      const data = result && (result.structuredContent || result.structured_content);
      if (data) render(data);
    }
  });
})();
</script>
</body>
</html>`;
