import {
  inspectMarketScale, inspectMarketRoute, selectMarketDesignScope,
  type MarketAuthority, type MarketDistrictDesign, type MarketMapLink,
  type MarketSectorCandidate,
} from "../src/market_scale_gate.ts";

function refuses(fn: () => unknown, reason: string) {
  let failed = false;
  try { fn(); } catch { failed = true; }
  if (!failed) throw new Error("Unsafe urban market assumption accepted: " + reason);
}
const copy = "loc.ilyrian.selarin.copy_market";
const central = "loc.ilyrian.selarin.central_market";
const south = "loc.ilyrian.selarin.south_market";
const forum = "loc.ilyrian.selarin.concord_forum";
const merchant = "loc.ilyrian.selarin.merchant_court";
const bookstall = "loc.ilyrian.selarin.copy_market.vesha_bookstall";
const paper = "loc.ilyrian.selarin.copy_market.paper_arcade";
const granary = "loc.ilyrian.selarin.central_market.grain_scale_row";
const authority: MarketAuthority = {
  canonicalMarketDistrictIds: new Set([copy, central, south]),
  canonicalMapLocationIds: new Set([
    copy, central, south, forum, merchant, bookstall, paper, granary,
  ]),
  verifiedSurveyEvidenceRefs: new Set(["survey.example.market_boundary"]),
};
const proposal: MarketDistrictDesign = {
  proposedMacroId: "marketmacro.selarin.copy",
  canonicalDistrictId: copy,
  status: "DESIGN_CANDIDATE",
  planningScale: "MULTI_STREET_KILOMETRE_MARKET",
  knownNearfieldAnchorIds: [bookstall, paper],
};

Deno.test("a short local shop link cannot be reinterpreted as district footprint", () => {
  const r = inspectMarketScale([proposal], authority);
  if (r.length !== 1 || r[0].measuredFootprintSpanKm !== null ||
      r[0].footprintCanBeCanonized !== false || r[0].state !== "DESIGN_ONLY") {
    throw new Error("A nearby bookstall was used to invent city market geometry");
  }
  const withUntrustedMeasurement = inspectMarketScale([{
    ...proposal, measuredFootprintSpanKm: 3.4,
    completeBoundaryEvidenceRef: "survey.example.untrusted",
  }], authority);
  if (withUntrustedMeasurement[0].measuredFootprintSpanKm !== null) {
    throw new Error("Non-canonical market width leaked into map");
  }
  const verified = inspectMarketScale([{
    ...proposal, measuredFootprintSpanKm: 3.4,
    completeBoundaryEvidenceRef: "survey.example.market_boundary",
  }], authority);
  if (!verified[0].footprintCanBeCanonized ||
      verified[0].measuredFootprintSpanKm !== 3.4 ||
      verified[0].state !== "DESIGN_ONLY") {
    throw new Error("Verified measurement should remain design only until separate canon commit");
  }
  refuses(() => inspectMarketScale([{
    ...proposal, measuredFootprintSpanKm: Infinity,
  }], authority), "infinite market");
  refuses(() => inspectMarketScale([{
    ...proposal, canonicalDistrictId: "loc.ilyrian.selarin.imaginary_bazaar",
  }], authority), "fake trading district");
  refuses(() => inspectMarketScale([proposal, {...proposal}], authority),
    "same market counted twice");
});

const edges: MarketMapLink[] = [
  {fromId:copy,toId:forum,distanceKm:0.55,source:"CANON_MAP_EDGE",
   safePedestrianAccess:true,cargoPermit:false},
  {fromId:forum,toId:central,distanceKm:0.45,source:"CANON_MAP_EDGE",
   safePedestrianAccess:true,cargoPermit:true},
  {fromId:copy,toId:merchant,distanceKm:0.5,source:"CANON_MAP_EDGE",
   safePedestrianAccess:true,cargoPermit:true},
  {fromId:copy,toId:bookstall,distanceKm:0.06,source:"CANON_MAP_EDGE",
   safePedestrianAccess:true,cargoPermit:false},
];
const walk = {
  routeId: "marketroute.selarin.example",
  originId: copy,
  destinationId: central,
  knownTraversedNodeIds: [copy, forum, central],
  mode: "WALK" as const,
  purpose: "review pedestrian route",
};
Deno.test("a route is a contiguous known path and runtime still owns elapsed time", () => {
  const r = inspectMarketRoute(walk, edges, authority);
  if (r.routePath.length !== 3 ||
      r.state !== "SOURCED_ROUTE_DESIGN_ONLY" ||
      r.travelTime !== "COMPUTE_BY_RUNTIME_ENGINE") {
    throw new Error("Market route modified travel time or distance");
  }
  const short = inspectMarketRoute({...walk, destinationId: bookstall,
    knownTraversedNodeIds: [copy, bookstall]}, edges, authority);
  if (short.routePath.length !== 2) throw new Error("Known nearfield lost");
  refuses(() => inspectMarketRoute({
    ...walk, knownTraversedNodeIds: [copy, central],
  }, edges, authority), "straight-line movement shortcut");
  refuses(() => inspectMarketRoute({
    ...walk, mode:"CART",
  }, edges, authority), "cargo on pedestrian-only core");
  refuses(() => inspectMarketRoute({
    ...walk, knownTraversedNodeIds: [copy, forum, copy, forum, central],
  }, edges, authority), "loops masquerading as direct access");
  refuses(() => inspectMarketRoute({
    ...walk, knownTraversedNodeIds: [copy, "loc.fake.crossing", central],
  }, edges, authority), "unverified alley");
  refuses(() => inspectMarketRoute(walk, [
    {...edges[0],distanceKm:0},...edges.slice(1),
  ], authority), "fabricated zero-length street");
});

const sectors: MarketSectorCandidate[] = [
  {sectorId:"marketsector.selarin.copy.01",parentMarketDistrictId:copy,
   canonicalNearfieldAnchorId:paper,functionalTag:"paper",status:"DESIGN_CANDIDATE"},
  {sectorId:"marketsector.selarin.copy.02",parentMarketDistrictId:copy,
   canonicalNearfieldAnchorId:bookstall,functionalTag:"paper",status:"DESIGN_CANDIDATE"},
  {sectorId:"marketsector.selarin.central.01",parentMarketDistrictId:central,
   canonicalNearfieldAnchorId:granary,functionalTag:"food",status:"DESIGN_CANDIDATE"},
];

Deno.test("GM only loads bounded requested sector IDs, not every merchant or secret", () => {
  const result=selectMarketDesignScope({
    marketDistrictId:copy,queryFunctionalTag:"paper",candidates:sectors,
    authority,maximumCandidateRows:1,
  });
  if(result.selectedCandidateIds.length!==1 ||
     result.selectedCandidateIds[0]!=="marketsector.selarin.copy.01" ||
     result.merchantLocationsConfirmed!==false ||
     result.state!=="AUTHORING_INDEX_ONLY") {
    throw new Error("Indexed market contents exposed invented merchant locations");
  }
  const empty=selectMarketDesignScope({marketDistrictId:central,
    queryFunctionalTag:"paper",candidates:sectors,authority,maximumCandidateRows:2});
  if(empty.selectedCandidateIds.length) throw new Error("Leaked another district's sellers");
  refuses(()=>selectMarketDesignScope({marketDistrictId:copy,queryFunctionalTag:"paper",
    candidates:sectors,authority,maximumCandidateRows:200}),"unbounded full-city scan");
  refuses(()=>selectMarketDesignScope({marketDistrictId:copy,queryFunctionalTag:"paper",
    candidates:[sectors[0],sectors[0]],authority,maximumCandidateRows:2}),
    "duplicate design seller row");
  refuses(()=>selectMarketDesignScope({marketDistrictId:copy,queryFunctionalTag:"paper",
    candidates:[{...sectors[0],canonicalNearfieldAnchorId:"loc.fake.shop"}],
    authority,maximumCandidateRows:2}),"unmapped stall");
});
