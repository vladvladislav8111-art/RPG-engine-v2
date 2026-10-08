import { buildSelarinLocalContext } from "../src/local_context.ts";

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

function make(time: string) {
  return buildSelarinLocalContext({
    locationId: "loc.ilyrian.selarin.west_freight_ring",
    tags: new Set(["WORK"]),
    worldDay: 40,
    worldTime: time,
    rows: {
      districtPacks: [{
        "District/location": "loc.ilyrian.selarin.west_freight_ring",
        "Pack ID": "pack.selarin.west_freight_ring",
      }],
      selarinJobBoards: [board],
      selarinJobTemplates: templates,
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
      districtPacks: [{ "District/location": "loc.ilyrian.selarin.west_freight_ring" }],
      mapEdges: [
        { From: "loc.ilyrian.selarin.west_freight_ring", To: "loc.ilyrian.selarin.merchant_court" },
        { From: "loc.ilyrian.selarin.central_market", To: "loc.ilyrian.selarin.south_market" },
      ],
    },
  }) as any;
  if (value.neighborEdges.length !== 1) throw new Error("unrelated city edge leaked into immediate route context");
});
