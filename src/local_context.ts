export type PregenRecord = Record<string, unknown>;

type LocalContextInput = {
  locationId: string;
  tags: Set<string>;
  worldDay: unknown;
  worldTime: unknown;
  rows: Record<string, PregenRecord[]>;
};

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function upper(value: unknown): string {
  return str(value).toUpperCase();
}

function splitTags(value: unknown): string[] {
  return upper(value).split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
}

function hasAny(tags: Set<string>, wanted: string[]): boolean {
  return wanted.some((x) => tags.has(x));
}

function rowTagsMatch(row: PregenRecord, fields: string[], tags: Set<string>): boolean {
  if (!tags.size) return false;
  const tokens = new Set(fields.flatMap((field) => splitTags(row[field])));
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

function weightedOrder<T extends PregenRecord>(rows: T[], seed: string): T[] {
  return [...rows].sort((a, b) => {
    const aId = str(a["Template ID"]);
    const bId = str(b["Template ID"]);
    const aw = Math.max(0.01, Number(a["Weight"] ?? 1));
    const bw = Math.max(0.01, Number(b["Weight"] ?? 1));
    const au = (hash32(seed + "|" + aId) + 1) / 4294967297;
    const bu = (hash32(seed + "|" + bId) + 1) / 4294967297;
    const ak = -Math.log(au) / aw;
    const bk = -Math.log(bu) / bw;
    return ak - bk || aId.localeCompare(bId);
  });
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

export function buildSelarinLocalContext(input: LocalContextInput): Record<string, unknown> | null {
  if (!isSelarinLocation(input.locationId)) return null;
  const { rows, tags, locationId } = input;
  const district = relevantDistrict(rows.districtPacks ?? [], locationId);
  const districtId = district ? str(district["District/location"]) : null;

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

  const lawRows = (rows.selarinLaws ?? []);
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

  return {
    cityId: "loc.ilyrian.selarin",
    locationId,
    district: district ?? null,
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
      "Deity-attention rows are causal profiles only, not current divine attention. Current offers, queues, stock, NPC state and actual divine attention remain live-state concerns.",
  };
}
