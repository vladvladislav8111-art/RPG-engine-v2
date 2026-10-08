export type PregenRecord = Record<string, unknown>;

type LocalContextInput = {
  locationId: string;
  tags: Set<string>;
  worldDay: unknown;
  worldTime: unknown;
  rows: Record<string, PregenRecord[]>;
  live?: {
    worldClocks?: PregenRecord[];
    weather?: PregenRecord[];
    npcCurrent?: PregenRecord[];
    opportunities?: PregenRecord[];
  };
};

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function upper(value: unknown): string {
  return str(value).toUpperCase();
}

function splitList(value: unknown): string[] {
  return upper(value).split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
}

function hasAny(tags: Set<string>, wanted: string[]): boolean {
  return wanted.some((x) => tags.has(x));
}

function rowTagsMatch(row: PregenRecord, fields: string[], tags: Set<string>): boolean {
  if (!tags.size) return false;
  const tokens = new Set(fields.flatMap((field) => splitList(row[field])));
  for (const tag of tags) if (tokens.has(tag)) return true;
  return false;
}

function isSelarinLocation(value: unknown): boolean {
  return str(value).startsWith("loc.ilyrian.selarin");
}

function relevantDistrict(packs: PregenRecord[], locationId: string): PregenRecord | null {
  const candidates = packs
    .filter((row) => isSelarinLocation(row["District/location"]))
    .filter((row) => {
      const district = str(row["District/location"]);
      return locationId === district || locationId.startsWith(district + ".");
    })
    .sort((a, b) => str(b["District/location"]).length - str(a["District/location"]).length);
  return candidates[0] ?? null;
}

function localRows(
  rows: PregenRecord[],
  locationFields: string[],
  locationId: string,
  districtId: string | null,
): PregenRecord[] {
  const targets = new Set([locationId, districtId].filter(Boolean) as string[]);
  return rows.filter((row) =>
    locationFields.some((field) => {
      const value = str(row[field]);
      return targets.has(value);
    })
  );
}

function dedupe(rows: PregenRecord[], idFields: string[]): PregenRecord[] {
  const seen = new Set<string>();
  const out: PregenRecord[] = [];
  for (const row of rows) {
    const id = idFields.map((f) => str(row[f])).find(Boolean) ?? JSON.stringify(row);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function weightedOrder<T extends PregenRecord>(
  rows: T[],
  seed: string,
  idField = "Template ID",
  weightField = "Weight",
): T[] {
  return [...rows].sort((a, b) => {
    const aId = str(a[idField]);
    const bId = str(b[idField]);
    const aw = Math.max(0.01, Number(a[weightField] ?? 1));
    const bw = Math.max(0.01, Number(b[weightField] ?? 1));
    const au = (hash32(seed + "|" + aId) + 1) / 4294967297;
    const bu = (hash32(seed + "|" + bId) + 1) / 4294967297;
    const ak = -Math.log(au) / aw;
    const bk = -Math.log(bu) / bw;
    return ak - bk || aId.localeCompare(bId);
  });
}

function timeMinutes(value: unknown): number {
  const m = str(value).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function timePhase(worldTime: unknown): string {
  const minute = timeMinutes(worldTime);
  if (minute >= 5 * 60 && minute < 8 * 60) return "DAWN";
  if (minute >= 8 * 60 && minute < 11 * 60) return "MORNING";
  if (minute >= 11 * 60 && minute < 14 * 60) return "MIDDAY";
  if (minute >= 14 * 60 && minute < 18 * 60) return "AFTERNOON";
  if (minute >= 18 * 60 && minute < 22 * 60) return "EVENING";
  return "NIGHT";
}

function inTimeWindow(now: number, start: unknown, end: unknown): boolean {
  const s = timeMinutes(start);
  const e = timeMinutes(end);
  if (s === e) return true;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

function untilStart(now: number, start: unknown): number {
  const s = timeMinutes(start);
  return s >= now ? s - now : 1440 - now + s;
}

function refreshWindow(cadence: string, worldTime: unknown): string {
  const hour = Number(str(worldTime).slice(0, 2));
  if (cadence.includes("DAWN+MIDDAY")) return hour >= 12 ? "MIDDAY" : "DAWN";
  if (cadence.includes("DAWN+EVENING")) return hour >= 17 ? "EVENING" : "DAWN";
  return "DAWN";
}

function boardCandidates(
  boards: PregenRecord[],
  templates: PregenRecord[],
  worldDay: unknown,
  worldTime: unknown,
): Array<Record<string, unknown>> {
  return boards.map((board) => {
    const boardId = str(board["Board ID"]);
    const cadence = upper(board["Refresh cadence"]);
    const window = refreshWindow(cadence, worldTime);
    const seed = `${str(worldDay)}|${window}|${boardId}`;
    const slots = Math.max(0, Math.floor(Number(board["Slots"] ?? 0)));
    const eligible = templates.filter((tpl) =>
      str(tpl["Board IDs"]).split(";").map((x) => x.trim()).includes(boardId)
    );
    const selected = weightedOrder(eligible, seed).slice(0, slots).map((tpl) => ({
      templateId: tpl["Template ID"],
      type: tpl["Type"],
      payMinC: tpl["Pay min c"],
      payMaxC: tpl["Pay max c"],
      payUnit: tpl["Pay unit"],
      durationMinMinutes: tpl["Duration min min"],
      durationMaxMinutes: tpl["Duration max min"],
      requirements: tpl["Requirements"],
      trustGate: tpl["Trust gate"],
      hazard: tpl["Hazard"],
      demandPredicate: tpl["Demand predicate"],
      expiry: tpl["Expiry"],
      tags: tpl["Tags"],
      notes: tpl["Notes"],
    }));
    return {
      boardId,
      name: board["Name"],
      location: board["Location"],
      refreshWindow: window,
      seed,
      slots,
      candidateSeeds: selected,
      rule:
        "Deterministic candidate seeds only. Before surfacing, resolve real demand/capacity and player-access gates; once surfaced, materialize as live opportunities so rechecks do not reroll reality.",
    };
  });
}

function selectEconomy(rows: PregenRecord[], tags: Set<string>): PregenRecord[] {
  const selarin = rows.filter((r) => upper(r["Region"]) === "SELARIN");
  if (tags.has("ECONOMY") || tags.has("AREA_PREP")) return selarin;
  const needles: string[] = [];
  if (hasAny(tags, ["WORK", "JOB", "BOARD"])) needles.push("labor", "work", "copy", "verification", "reconciliation", "clerk");
  if (hasAny(tags, ["FOOD", "MEAL", "EAT"])) needles.push("meal", "snack");
  if (hasAny(tags, ["LODGING", "REST", "SLEEP"])) needles.push("bunk", "room");
  if (hasAny(tags, ["COURIER", "MESSAGE"])) needles.push("courier");
  if (hasAny(tags, ["BATH", "HYGIENE"])) needles.push("bath", "wash");
  return selarin.filter((r) => {
    const anchor = str(r["Anchor"]).toLowerCase();
    return needles.some((n) => anchor.includes(n));
  });
}

function selectFactions(rows: PregenRecord[], tags: Set<string>): PregenRecord[] {
  const selarin = rows.filter((r) => str(r["Faction ID"]).startsWith("faction.ilyrian.selarin"));
  if (hasAny(tags, ["FACTION", "POLITICS", "AREA_PREP"])) return selarin;
  if (hasAny(tags, ["RELIGION", "TEMPLE", "DIVINE"])) {
    return selarin.filter((r) => /temple|veira|mortuary|resurrection/i.test(str(r["Faction ID"]) + " " + str(r["Name"])));
  }
  if (hasAny(tags, ["GUILD", "CRAFT"])) {
    return selarin.filter((r) => /hall|artisan|copyist/i.test(str(r["Faction ID"]) + " " + str(r["Name"])));
  }
  if (hasAny(tags, ["LAW", "SEAL", "MEASURE"])) {
    return selarin.filter((r) => /civic|court|measure|registry/i.test(str(r["Faction ID"]) + " " + str(r["Name"])));
  }
  if (hasAny(tags, ["WORK", "ECONOMY"])) {
    return selarin.filter((r) => /merchant|court|artisan|copyist/i.test(str(r["Faction ID"]) + " " + str(r["Name"])));
  }
  return [];
}

const METRIC_BASE_HEADERS: Record<string, string> = {
  crowd: "Base crowd",
  trade: "Base trade",
  clericalDemand: "Base clerical demand",
  craftDemand: "Base craft demand",
  lodgingPressure: "Base lodging pressure",
  medicalLoad: "Base medical load",
  foodDemand: "Base food demand",
  noise: "Base noise",
  watchPresence: "Base watch presence",
  cleanliness: "Base cleanliness",
};

const METRIC_PHASE_HEADERS: Record<string, string> = {
  crowd: "Crowd Δ",
  trade: "Trade Δ",
  clericalDemand: "Clerical Δ",
  craftDemand: "Craft Δ",
  lodgingPressure: "Lodging Δ",
  medicalLoad: "Medical Δ",
  foodDemand: "Food Δ",
  noise: "Noise Δ",
  watchPresence: "Watch Δ",
  cleanliness: "Cleanliness Δ",
};

function clampMetric(value: number): number {
  return Math.max(0, Math.min(4, Math.round(value)));
}

function metricLabel(value: number): string {
  return ["MINIMAL", "LOW", "MODERATE", "HIGH", "VERY_HIGH"][clampMetric(value)];
}

function processLocal(row: PregenRecord, districtId: string | null, locationId: string): boolean {
  const loc = str(row["Location"]).toLowerCase();
  if (!loc) return false;
  return loc.includes("loc.ilyrian.selarin") ||
    loc.includes("selarin") ||
    (!!districtId && loc.includes(districtId.toLowerCase())) ||
    loc.includes(locationId.toLowerCase());
}

function scopeMatches(scope: string, districtId: string | null, locationId: string, process: PregenRecord): boolean {
  const s = upper(scope);
  if (s === "SELARIN") return processLocal(process, districtId, locationId);
  if (s === "WEST_FREIGHT") return Boolean(districtId?.includes("west_freight")) && processLocal(process, districtId, locationId);
  if (s === "PILGRIM") return Boolean(districtId?.includes("pilgrim_ward")) && processLocal(process, districtId, locationId);
  if (s === "MATCH_PROCESS_LOCATION") {
    const loc = str(process["Location"]).toLowerCase();
    return (!!districtId && loc.includes(districtId.toLowerCase())) || loc.includes(locationId.toLowerCase());
  }
  return false;
}

function buildDistrictPulse(
  rows: Record<string, PregenRecord[]>,
  live: LocalContextInput["live"],
  districtId: string | null,
  locationId: string,
  phase: string,
): Record<string, unknown> | null {
  const profiles = rows.selarinDistrictPulse ?? [];
  const profile = profiles.find((r) => str(r["District ID"]) === districtId) ??
    profiles.find((r) => str(r["District ID"]) === locationId);
  if (!profile) return null;

  const rhythmClass = upper(profile["Rhythm class"]);
  const phaseRule = (rows.selarinPulsePhases ?? []).find((r) =>
    upper(r["Rhythm class"]) === rhythmClass && upper(r["Phase"]) === phase
  );

  const metrics: Record<string, number> = {
    transactionFriction: 0,
    workDemand: 0,
    serviceLoad: 0,
    routeFriction: 0,
  };
  for (const [key, header] of Object.entries(METRIC_BASE_HEADERS)) {
    metrics[key] = clampMetric(Number(profile[header] ?? 0) + Number(phaseRule?.[METRIC_PHASE_HEADERS[key]] ?? 0));
  }

  const appliedOverlays: Array<Record<string, unknown>> = [];
  const activeProcesses = (live?.worldClocks ?? []).filter((p) =>
    upper(p["State"]).includes("ACTIVE") && processLocal(p, districtId, locationId)
  );
  for (const overlay of rows.selarinPulseOverlays ?? []) {
    const prefix = str(overlay["Process ID prefix"]);
    const process = activeProcesses.find((p) => str(p["Process ID"]).startsWith(prefix));
    if (!process || !scopeMatches(str(overlay["Scope"]), districtId, locationId, process)) continue;
    const changes: Record<string, number> = {};
    for (const n of [1, 2, 3]) {
      const metric = str(overlay[`Metric ${n}`]);
      if (!metric) continue;
      const delta = Number(overlay[`Delta ${n}`] ?? 0);
      metrics[metric] = clampMetric(Number(metrics[metric] ?? 0) + delta);
      changes[metric] = delta;
    }
    appliedOverlays.push({
      overlayId: overlay["Overlay ID"],
      processId: process["Process ID"],
      changes,
      notes: overlay["Notes"],
    });
  }

  return {
    districtId: profile["District ID"],
    rhythmClass,
    phase,
    metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, { value: v, band: metricLabel(v) }])),
    sensory: {
      sound: profile["Sound baseline"],
      smell: profile["Smell baseline"],
      visual: profile["Visual baseline"],
      weather: (live?.weather ?? []).slice(0, 2),
    },
    appliedOverlays,
    rule: "Derived read-only pulse. It changes plausibility/pressure, not facts by itself.",
  };
}

function ambientConditionPass(row: PregenRecord, pulse: Record<string, unknown> | null, live: LocalContextInput["live"]): boolean {
  const condition = str(row["Condition"]).toLowerCase();
  if (!condition) return true;
  if (condition.includes("requires rain")) {
    const weatherText = JSON.stringify(live?.weather ?? []).toLowerCase();
    return weatherText.includes("rain") || weatherText.includes("дожд");
  }
  if (condition.includes("crowd>=moderate")) {
    const metrics = (pulse?.metrics ?? {}) as Record<string, { value?: number }>;
    return Number(metrics.crowd?.value ?? 0) >= 2;
  }
  return true;
}

function ambientCandidates(
  rows: PregenRecord[],
  rhythmClass: string,
  phase: string,
  worldDay: unknown,
  worldTime: unknown,
  districtId: string,
  pulse: Record<string, unknown> | null,
  live: LocalContextInput["live"],
  limit: number,
): Record<string, unknown> {
  const eligible = rows.filter((row) => {
    const classes = splitList(row["Rhythm classes"]);
    const phases = splitList(row["Phases"]);
    return classes.includes(rhythmClass) &&
      (phases.includes(phase) || phases.includes("ANY")) &&
      ambientConditionPass(row, pulse, live);
  });
  const bucket = Math.floor(timeMinutes(worldTime) / 20);
  const seed = `${str(worldDay)}|${bucket}|${districtId}|ambient`;
  const selected = weightedOrder(eligible, seed, "Template ID", "Weight").slice(0, limit).map((row) => ({
    templateId: row["Template ID"],
    class: row["Class"],
    prompt: row["GM prompt"],
    persistence: row["Persistence"],
    onEngagement: row["On engagement"],
    condition: row["Condition"],
    guard: row["Guard"],
  }));
  return {
    seed,
    timeBucketMinutes: 20,
    candidates: selected,
    rule: "Candidates are stable inside the bucket and are not committed events. Persistent consequences require normal causal resolution and commit.",
  };
}

function riskCandidates(
  rows: PregenRecord[],
  rhythmClass: string,
  pulse: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  const metrics = (pulse?.metrics ?? {}) as Record<string, { value?: number }>;
  const crowd = Number(metrics.crowd?.value ?? 0);
  const watch = Number(metrics.watchPresence?.value ?? 0);
  const craft = Number(metrics.craftDemand?.value ?? 0);
  const trade = Number(metrics.trade?.value ?? 0);
  const clerical = Number(metrics.clericalDemand?.value ?? 0);
  const medical = Number(metrics.medicalLoad?.value ?? 0);

  return rows
    .filter((row) => splitList(row["Rhythm classes"]).includes(rhythmClass))
    .map((row) => {
      const type = upper(row["Type"]);
      let pressure = Number(row["Base pressure 0-4"] ?? 0);
      if (type === "THEFT" && crowd >= 3) pressure += 1;
      if ((type === "THEFT" || type === "VIOLENCE") && watch >= 3) pressure -= 1;
      if (type === "WORKPLACE" && Math.max(craft, trade) >= 3) pressure += 1;
      if (type === "PROFESSIONAL" && clerical >= 3) pressure += 1;
      if (type === "CAPACITY" && medical >= 3) pressure += 1;
      pressure = clampMetric(pressure);
      return {
        riskId: row["Risk ID"],
        type: row["Type"],
        pressure: { value: pressure, band: metricLabel(pressure) },
        activationConditions: row["Activation conditions"],
        amplifiers: row["Amplifiers"],
        mitigators: row["Mitigators"],
        consequences: row["Consequences"],
        causalGuard: row["Causal guard"],
      };
    })
    .filter((row) => Number((row.pressure as { value: number }).value) > 0)
    .sort((a, b) => Number((b.pressure as { value: number }).value) - Number((a.pressure as { value: number }).value))
    .slice(0, 6);
}

function shortDistrictKey(districtId: string | null): string {
  return str(districtId).split(".").pop() ?? "";
}

function districtKeyMatches(value: unknown, districtId: string | null): boolean {
  const key = shortDistrictKey(districtId).toUpperCase();
  if (!key) return false;
  return splitList(value).includes(key);
}

function calendarContext(rows: PregenRecord[], districtId: string | null, worldTime: unknown): Record<string, unknown> {
  const now = timeMinutes(worldTime);
  const local = rows.filter((row) =>
    upper(row["Status"]) === "ACTIVE" &&
    upper(row["Recurrence"]) === "DAILY" &&
    districtKeyMatches(row["District keys"], districtId)
  );
  const current = local.filter((row) => inTimeWindow(now, row["Start"], row["End"])).map((row) => ({
    id: row["Calendar ID"],
    name: row["Name"],
    start: row["Start"],
    end: row["End"],
    effect: row["Effect"],
    guard: row["Guard"],
  }));
  const upcoming = local
    .map((row) => ({ row, inMinutes: untilStart(now, row["Start"]) }))
    .filter((x) => x.inMinutes > 0 && x.inMinutes <= 240)
    .sort((a, b) => a.inMinutes - b.inMinutes)
    .slice(0, 4)
    .map(({ row, inMinutes }) => ({
      id: row["Calendar ID"],
      name: row["Name"],
      startsInMinutes: inMinutes,
      start: row["Start"],
      end: row["End"],
      effect: row["Effect"],
      guard: row["Guard"],
    }));
  return { current, upcoming };
}

function matchHoursRule(service: PregenRecord, rows: PregenRecord[]): PregenRecord | null {
  const serviceTags = new Set(splitList(service["Tags"]));
  let best: { row: PregenRecord; score: number } | null = null;
  for (const row of rows) {
    const tags = splitList(row["Service tags"]);
    const score = tags.filter((tag) => serviceTags.has(tag)).length;
    if (score > 0 && (!best || score > best.score)) best = { row, score };
  }
  return best?.row ?? null;
}

function peakNow(now: number, value: unknown): boolean {
  const windows = str(value).split(";").map((x) => x.trim()).filter(Boolean);
  return windows.some((window) => {
    const [start, end] = window.split("-").map((x) => x.trim());
    return start && end ? inTimeWindow(now, start, end) : false;
  });
}

function serviceAvailability(
  services: PregenRecord[],
  hourRows: PregenRecord[],
  worldTime: unknown,
): Array<Record<string, unknown>> {
  const now = timeMinutes(worldTime);
  return services.map((service) => {
    const rule = matchHoursRule(service, hourRows);
    if (!rule) {
      return {
        serviceId: service["Service ID"],
        baselineState: "UNKNOWN_BASELINE",
        guard: "Provider/live capacity decides actual availability.",
      };
    }
    const open = inTimeWindow(now, rule["Open"], rule["Close"]);
    const peak = open && peakNow(now, rule["Peak windows"]);
    return {
      serviceId: service["Service ID"],
      class: rule["Class"],
      open: rule["Open"],
      close: rule["Close"],
      baselineState: open ? (peak ? "OPEN_PEAK" : "OPEN") : str(rule["Afterhours"]),
      guard: rule["Guard"],
    };
  });
}

function npcAvailability(
  npcSeeds: PregenRecord[],
  routineRows: PregenRecord[],
  liveNpc: PregenRecord[],
  phase: string,
): Array<Record<string, unknown>> {
  return npcSeeds.map((npc) => {
    const npcId = str(npc["NPC ID"]);
    const live = liveNpc.find((row) => str(row["NPC ID"]) === npcId);
    if (live) {
      return {
        npcId,
        name: npc["Name"],
        role: npc["Role"],
        source: "LIVE",
        availability: "LIVE_STATE_OVERRIDES_ROUTINE",
        currentLocation: live["Current/last-known location"],
        currentGoal: live["Current goal/activity"],
      };
    }
    const routine = routineRows.find((row) =>
      str(row["NPC ID"]) === npcId && upper(row["Phase"]) === phase
    );
    return {
      npcId,
      name: npc["Name"],
      role: npc["Role"],
      source: "PREGEN_ROUTINE",
      routineState: routine?.["Routine state"] ?? null,
      availability: routine?.["Availability"] ?? "UNKNOWN",
      guard: routine?.["Guard"] ?? "Live materialized state overrides routine.",
    };
  });
}

function currentNetworkKeys(districtId: string | null): string[] {
  const id = str(districtId);
  if (id.includes("west_freight")) return ["WEST_FREIGHT_CLERKS", "WEST_FREIGHT_WORKERS"];
  if (id.includes("merchant_court")) return ["MERCHANT_COURT"];
  if (id.includes("pilgrim_ward")) return ["PILGRIM_WARD"];
  if (id.includes("copy_market")) return ["COPY_MARKET"];
  if (id.includes("artisan_terraces")) return ["ARTISAN_HALLS"];
  if (id.includes("temple_medical")) return ["TEMPLE_MEDICAL"];
  if (id.includes("mortuary_gardens")) return ["MORTUARY"];
  if (id.includes("concord_forum")) return ["CONCORD_FORUM"];
  if (id.includes("licensed_arts")) return ["LICENSED_ARTS"];
  if (id.includes("central_market") || id.includes("south_market")) return ["CENTRAL_MARKET"];
  if (id.includes("east_residential")) return ["RESIDENTIAL"];
  if (id.includes("gate")) return ["GATES"];
  return [];
}

function informationContext(
  channelRows: PregenRecord[],
  networkRows: PregenRecord[],
  live: LocalContextInput["live"],
  districtId: string | null,
  enabled: boolean,
): Record<string, unknown> | null {
  if (!enabled) return null;
  const channels = channelRows.filter((row) => districtKeyMatches(row["District keys"], districtId)).slice(0, 8);
  const keys = new Set(currentNetworkKeys(districtId));
  const routes = networkRows.filter((row) =>
    keys.has(upper(row["From network"])) || keys.has(upper(row["To network"]))
  ).slice(0, 10);
  const sources = (live?.worldClocks ?? [])
    .filter((row) => upper(row["State"]).includes("ACTIVE") && processLocal(row, districtId, str(districtId)))
    .slice(0, 5)
    .map((row) => ({
      processId: row["Process ID"],
      name: row["Name"],
      location: row["Location"],
      lastAdvanced: row["Last advanced"],
      visibility: row["Visibility"],
      gmCurrentActivity: row["Current activity"],
    }));
  return {
    channels,
    propagationRoutes: routes,
    causalSourceCandidates: sources,
    rule: "Information does not auto-propagate. Use elapsed time, carrier network and source legitimacy; NPC_KNOWLEDGE remains actor-level truth.",
  };
}

function publicProcessSignals(
  live: LocalContextInput["live"],
  districtId: string | null,
  locationId: string,
): Array<Record<string, unknown>> {
  return (live?.worldClocks ?? [])
    .filter((row) => upper(row["State"]).includes("ACTIVE") && processLocal(row, districtId, locationId))
    .slice(0, 5)
    .map((row) => ({
      processId: row["Process ID"],
      name: row["Name"],
      location: row["Location"],
      lastAdvanced: row["Last advanced"],
      visibility: row["Visibility"],
    }));
}

export function buildSelarinLocalContext(input: LocalContextInput): Record<string, unknown> | null {
  if (!isSelarinLocation(input.locationId)) return null;
  const { rows, tags, locationId } = input;
  const district = relevantDistrict(rows.districtPacks ?? [], locationId);
  const districtId = district ? str(district["District/location"]) : (
    (rows.selarinDistrictPulse ?? []).some((r) => str(r["District ID"]) === locationId) ? locationId : null
  );
  const phase = timePhase(input.worldTime);

  const localServiceRows = localRows(
    rows.serviceDirectory ?? [],
    ["Location"],
    locationId,
    districtId,
  );
  const taggedServiceRows = (rows.serviceDirectory ?? []).filter((row) =>
    isSelarinLocation(row["Location"]) && rowTagsMatch(row, ["Tags"], tags)
  );
  const services = dedupe([...localServiceRows, ...taggedServiceRows], ["Service ID"]).slice(0, 24);

  const edges = (rows.mapEdges ?? []).filter((row) => {
    const from = str(row["From"]);
    const to = str(row["To"]);
    return from === locationId || to === locationId ||
      (!!districtId && (from === districtId || to === districtId));
  }).slice(0, 16);

  const lawRows = rows.selarinLaws ?? [];
  const laws = (tags.has("LAW") || tags.has("AREA_PREP"))
    ? lawRows
    : lawRows.filter((row) => rowTagsMatch(row, ["Lookup tags"], tags));

  const boardDirectory = hasAny(tags, ["WORK", "JOB", "BOARD", "AREA_PREP"])
    ? (rows.selarinJobBoards ?? [])
    : [];
  const localBoards = localRows(
    rows.selarinJobBoards ?? [],
    ["Location"],
    locationId,
    districtId,
  );
  const generatedBoards = hasAny(tags, ["WORK", "JOB", "BOARD"])
    ? boardCandidates(localBoards, rows.selarinJobTemplates ?? [], input.worldDay, input.worldTime)
    : [];

  const npcSeeds = hasAny(tags, ["NPC", "SOCIAL", "SERVICES", "WORK", "RELIGION", "TEMPLE", "CRAFT", "MAGIC", "AREA_PREP"])
    ? localRows(rows.selarinNpcPool ?? [], ["Base location"], locationId, districtId).slice(0, 8)
    : [];

  const culture = hasAny(tags, ["SOCIAL", "CULTURE", "AREA_PREP"])
    ? (rows.selarinCulture ?? [])
    : (rows.selarinCulture ?? []).filter((row) => rowTagsMatch(row, ["Tags"], tags));

  const food = hasAny(tags, ["FOOD", "MEAL", "EAT", "SHOP", "AREA_PREP"])
    ? (rows.selarinFood ?? [])
    : [];

  const infrastructure = tags.has("AREA_PREP")
    ? (rows.selarinInfrastructure ?? [])
    : (rows.selarinInfrastructure ?? []).filter((row) => rowTagsMatch(row, ["Tags"], tags));

  const divineRequested = hasAny(tags, [
    "RELIGION", "DIVINE", "GOD", "PRAYER", "TEMPLE",
    "EIRAN", "VEIRA", "SEREN", "SELVARA", "NERETH", "LORVEN", "KHARAD", "ULMAR",
  ]);
  const divineAttentionProfiles = divineRequested
    ? (rows.selarinDeityAttention ?? []).filter((row) =>
        hasAny(tags, ["RELIGION", "DIVINE", "GOD", "PRAYER", "TEMPLE"]) ||
        rowTagsMatch(row, ["Tags"], tags)
      )
    : [];

  const fastIndex = (rows.selarinFastIndex ?? []).filter((row) => {
    const loadPolicy = upper(row["Load Policy"]);
    const tag = upper(row["Tag"]);
    return tags.has(tag) || [...tags].some((t) => loadPolicy.includes(t));
  }).slice(0, 20);

  const districtPulse = buildDistrictPulse(rows, input.live, districtId, locationId, phase);
  const rhythmClass = upper((districtPulse?.rhythmClass ?? ""));
  const ambient = districtId && rhythmClass
    ? ambientCandidates(
        rows.selarinAmbientEvents ?? [],
        rhythmClass,
        phase,
        input.worldDay,
        input.worldTime,
        districtId,
        districtPulse,
        input.live,
        tags.has("AREA_PREP") ? 4 : 2,
      )
    : { seed: null, timeBucketMinutes: 20, candidates: [], rule: "No district pulse profile." };
  const risks = rhythmClass
    ? riskCandidates(rows.selarinRiskEcology ?? [], rhythmClass, districtPulse)
    : [];
  const calendar = calendarContext(rows.selarinCalendar ?? [], districtId, input.worldTime);
  const availability = serviceAvailability(services, rows.selarinServiceHours ?? [], input.worldTime);
  const npcAvailabilityHints = npcAvailability(
    npcSeeds,
    rows.selarinNpcRoutines ?? [],
    input.live?.npcCurrent ?? [],
    phase,
  );
  const information = informationContext(
    rows.selarinRumorChannels ?? [],
    rows.selarinSocialNetwork ?? [],
    input.live,
    districtId,
    hasAny(tags, ["SOCIAL", "RUMOR", "REPUTATION", "AREA_PREP"]),
  );

  const pulseMetrics = (districtPulse?.metrics ?? {}) as Record<string, { value?: number; band?: string }>;
  const competitionValue = clampMetric(
    Math.round((Number(pulseMetrics.crowd?.value ?? 0) + Number(pulseMetrics.trade?.value ?? 0)) / 2),
  );

  return {
    cityId: "loc.ilyrian.selarin",
    locationId,
    district: district ?? null,
    timePhase: phase,
    districtPulse,
    ambient,
    risks,
    calendar,
    serviceAvailability: availability,
    npcAvailabilityHints,
    information,
    publicProcessSignals: publicProcessSignals(input.live, districtId, locationId),
    competition: hasAny(tags, ["WORK", "JOB", "BOARD"]) ? {
      pressure: { value: competitionValue, band: metricLabel(competitionValue) },
      rule: "Pressure is a derived background indicator, not an applicant count. Real offers remain finite live state.",
    } : null,
    neighborEdges: edges,
    services,
    laws: laws.slice(0, 24),
    economy: selectEconomy(rows.economyAnchors ?? [], tags).slice(0, 20),
    factions: selectFactions(rows.factions ?? [], tags).slice(0, 16),
    boardDirectory: boardDirectory.slice(0, 10),
    localBoardCandidates: generatedBoards,
    npcSeeds,
    culture: culture.slice(0, 16),
    food: food.slice(0, 16),
    infrastructure: infrastructure.slice(0, 16),
    divineAttentionProfiles: divineAttentionProfiles.slice(0, 12),
    routingHints: fastIndex,
    hiddenStateNotice:
      "Pulse/ambient/risk/calendar/availability are derived GM context. Ambient candidates and risks are not committed events. Current offers, queues, stock, NPC state and divine attention remain live-state concerns.",
  };
}
