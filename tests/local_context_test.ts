import { buildSelarinLocalContext } from "../src/local_context.ts";

const district = {
  "District/location": "loc.ilyrian.selarin.west_freight_ring",
  "Pack ID": "pack.selarin.west_freight_ring",
};
const board = {
  "Board ID": "board.selarin.west_freight",
  "Location": "loc.ilyrian.selarin.west_freight_ring",
  "Name": "West board",
  "Refresh cadence": "DAWN+MIDDAY",
  "Slots": 2,
};
const templates = [
  { "Template ID": "a", "Board IDs": "board.selarin.west_freight", "Type": "A", "Weight": 10 },
  { "Template ID": "b", "Board IDs": "board.selarin.west_freight", "Type": "B", "Weight": 5 },
  { "Template ID": "c", "Board IDs": "board.selarin.west_freight", "Type": "C", "Weight": 1 },
];
const pulse = {
  "District ID": "loc.ilyrian.selarin.west_freight_ring",
  "Rhythm class": "FREIGHT",
  "Base crowd": 3,
  "Base trade": 3,
  "Base clerical demand": 2,
  "Base craft demand": 1,
  "Base lodging pressure": 1,
  "Base medical load": 0,
  "Base food demand": 2,
  "Base noise": 3,
  "Base watch presence": 2,
  "Base cleanliness": 2,
  "Sound baseline": "carts",
  "Smell baseline": "grain",
  "Visual baseline": "warehouses",
};
const phase = {
  "Rhythm class": "FREIGHT",
  "Phase": "AFTERNOON",
  "Crowd Δ": 0,
  "Trade Δ": 0,
  "Clerical Δ": 1,
  "Craft Δ": 0,
  "Lodging Δ": 0,
  "Medical Δ": 0,
  "Food Δ": 0,
  "Noise Δ": 0,
  "Watch Δ": 0,
  "Cleanliness Δ": 0,
};
const ambient = [
  {
    "Template ID": "amb.a",
    "Rhythm classes": "FREIGHT",
    "Phases": "AFTERNOON",
    "Weight": 10,
    "Class": "LIFE",
    "GM prompt": "A",
    "Persistence": "EPHEMERAL",
  },
  {
    "Template ID": "amb.b",
    "Rhythm classes": "FREIGHT",
    "Phases": "AFTERNOON",
    "Weight": 5,
    "Class": "WORK",
    "GM prompt": "B",
    "Persistence": "EPHEMERAL",
  },
  {
    "Template ID": "amb.c",
    "Rhythm classes": "FREIGHT",
    "Phases": "AFTERNOON",
    "Weight": 1,
    "Class": "SOCIAL",
    "GM prompt": "C",
    "Persistence": "EPHEMERAL",
  },
];
const overlay = {
  "Overlay ID": "overlay.test",
  "Process ID prefix": "process.test",
  "Scope": "SELARIN",
  "Metric 1": "clericalDemand",
  "Delta 1": 1,
  "Metric 2": "watchPresence",
  "Delta 2": 1,
};

function make(time: string, extraTags: string[] = []) {
  return buildSelarinLocalContext({
    locationId: "loc.ilyrian.selarin.west_freight_ring",
    tags: new Set(["WORK", ...extraTags]),
    worldDay: 40,
    worldTime: time,
    rows: {
      districtPacks: [district],
      selarinJobBoards: [board],
      selarinJobTemplates: templates,
      selarinDistrictPulse: [pulse],
      selarinPulsePhases: [phase],
      selarinAmbientEvents: ambient,
      selarinPulseOverlays: [overlay],
      selarinRiskEcology: [{
        "Risk ID": "risk.test",
        "Rhythm classes": "FREIGHT",
        "Type": "THEFT",
        "Base pressure 0-4": 2,
        "Activation conditions": "crowd",
        "Causal guard": "not automatic",
      }],
      selarinCalendar: [{
        "Calendar ID": "cal.test",
        "Recurrence": "DAILY",
        "Start": "14:00",
        "End": "15:00",
        "District keys": "west_freight_ring",
        "Name": "Test window",
        "Effect": "busy",
        "Guard": "routine",
        "Status": "ACTIVE",
      }],
    },
    live: {
      worldClocks: [{
        "Process ID": "process.test.1",
        "Name": "Test process",
        "State": "ACTIVE",
        "Location": "loc.ilyrian.selarin",
      }],
    },
  }) as any;
}

Deno.test("Selarin board candidates are deterministic inside a refresh window", () => {
  const a = make("14:00:00").localBoardCandidates[0];
  const b = make("14:45:00").localBoardCandidates[0];
  if (a.seed !== b.seed) throw new Error("same refresh window must keep the same seed");
  if (JSON.stringify(a.candidateSeeds) !== JSON.stringify(b.candidateSeeds)) {
    throw new Error("same board window rerolled candidate seeds");
  }
});

Deno.test("Selarin dual-refresh board changes seed across the midday boundary", () => {
  const dawn = make("11:59:00").localBoardCandidates[0];
  const midday = make("12:00:00").localBoardCandidates[0];
  if (dawn.seed === midday.seed) throw new Error("refresh boundary must change board seed");
});

Deno.test("non-Selarin location gets no Selarin local context", () => {
  const value = buildSelarinLocalContext({
    locationId: "loc.arderan.west_market",
    tags: new Set(["WORK"]),
    worldDay: 40,
    worldTime: "12:00:00",
    rows: {},
  });
  if (value !== null) throw new Error("Selarin pack leaked into another city");
});

Deno.test("location routing keeps immediate Selarin edges", () => {
  const value = buildSelarinLocalContext({
    locationId: "loc.ilyrian.selarin.west_freight_ring",
    tags: new Set(["MAP"]),
    worldDay: 40,
    worldTime: "12:00:00",
    rows: {
      districtPacks: [district],
      mapEdges: [
        { From: "loc.ilyrian.selarin.west_freight_ring", To: "loc.ilyrian.selarin.merchant_court" },
        { From: "loc.ilyrian.selarin.central_market", To: "loc.ilyrian.selarin.south_market" },
      ],
    },
  }) as any;
  if (value.neighborEdges.length !== 1) throw new Error("unrelated city edge leaked into immediate route context");
});

Deno.test("World Pulse applies active-process overlays without creating an event", () => {
  const value = make("14:34:00");
  if (value.timePhase !== "AFTERNOON") throw new Error("wrong time phase");
  if (value.districtPulse.metrics.clericalDemand.value !== 4) throw new Error("phase + overlay not applied");
  if (value.districtPulse.metrics.watchPresence.value !== 3) throw new Error("watch overlay not applied");
  if (value.districtPulse.appliedOverlays.length !== 1) throw new Error("overlay provenance missing");
});

Deno.test("ambient candidates are stable within the 20-minute bucket", () => {
  const a = make("14:01:00").ambient;
  const b = make("14:19:00").ambient;
  if (a.seed !== b.seed) throw new Error("ambient seed rerolled inside bucket");
  if (JSON.stringify(a.candidates) !== JSON.stringify(b.candidates)) throw new Error("ambient candidates rerolled inside bucket");
});

Deno.test("ambient bucket changes with committed time", () => {
  const a = make("14:19:00").ambient;
  const b = make("14:20:00").ambient;
  if (a.seed === b.seed) throw new Error("ambient seed did not advance with time bucket");
});

Deno.test("risk remains pressure with a causal guard, not an automatic incident", () => {
  const risk = make("14:34:00").risks[0];
  if (!risk?.causalGuard) throw new Error("risk causal guard missing");
  if (risk.type !== "THEFT") throw new Error("unexpected risk selection");
});

Deno.test("calendar exposes only the current routine window", () => {
  const value = make("14:34:00");
  if (value.calendar.current[0]?.id !== "cal.test") throw new Error("current calendar window missing");
});
