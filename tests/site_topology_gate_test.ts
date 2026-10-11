import {
  assertSiteLiveAdmission,
  type DraftSite,
  type SiteAuthorityIndex,
  validateSiteTopologyPreflight,
} from "../src/site_topology_gate.ts";

const refs = new Set([
  "survey.ilyria.site_origin", "survey.ilyria.access_path", "canon.ilyria.land_rights",
  "survey.ilyria.room_a", "survey.ilyria.room_b", "survey.ilyria.room_c",
]);
const authority: SiteAuthorityIndex = {
  canonicalLocationIds: new Set(["loc.ilyria.verified_road"]),
  canonicalSiteIds: new Set(["site.ilyria.existing"]),
  canonicalNodeIds: new Set(["node.site.ilyria.existing.1"]),
  verifiedEvidenceRefs: refs,
};
const site: DraftSite = {
  draftSiteId: "site.draft.ilyria.test_vault",
  intendedCanonSiteId: "site.ilyria.test_vault",
  status: "DESIGN_CANDIDATE",
  entranceAnchorLocationId: "loc.ilyria.verified_road",
  originEvidenceRef: "survey.ilyria.site_origin",
  accessRouteEvidenceRef: "survey.ilyria.access_path",
  legalAccessEvidenceRef: "canon.ilyria.land_rights",
  nodes: [
    {
      draftNodeId: "node.site.draft.ilyria.vault.0",
      intendedCanonNodeId: "node.site.ilyria.vault.0",
      isEntrance: true, lengthM: 4, widthM: 3, ceilingHeightM: 2,
      geometryEvidenceRef: "survey.ilyria.room_a",
      edges: [{toDraftNodeId: "node.site.draft.ilyria.vault.1", distanceM: 4}],
    },
    {
      draftNodeId: "node.site.draft.ilyria.vault.1",
      intendedCanonNodeId: "node.site.ilyria.vault.1",
      isEntrance: false, lengthM: 5, widthM: 2, ceilingHeightM: 2.2,
      geometryEvidenceRef: "survey.ilyria.room_b",
      edges: [
        {toDraftNodeId: "node.site.draft.ilyria.vault.0", distanceM: 4},
        {toDraftNodeId: "node.site.draft.ilyria.vault.2", distanceM: 6},
      ],
    },
    {
      draftNodeId: "node.site.draft.ilyria.vault.2",
      intendedCanonNodeId: "node.site.ilyria.vault.2",
      isEntrance: false, lengthM: 3, widthM: 2, ceilingHeightM: 2,
      geometryEvidenceRef: "survey.ilyria.room_c",
      edges: [{toDraftNodeId: "node.site.draft.ilyria.vault.1", distanceM: 6}],
    },
  ],
};
const node = (idx: number) => site.nodes[idx];
function rejects(fn: () => unknown, name: string) {
  let failed = false;
  try { fn(); } catch { failed = true; }
  if (!failed) throw new Error("Unsafe topology passed: " + name);
}
Deno.test("surveyed symmetric connected site produces only a design preflight", () => {
  const r = validateSiteTopologyPreflight(site, authority);
  if (r.state !== "VALIDATED_DESIGN_ONLY" ||
      r.undirectedEdgeCount !== 2 ||
      r.intendedNodeIds.length !== 3 ||
      r.entranceDraftNodeId !== node(0).draftNodeId) {
    throw new Error("Unexpected validated site topology");
  }
  rejects(() => assertSiteLiveAdmission({
    preflight: r,
    publishedCanonicalSiteIds: new Set(),
    publishedCanonicalNodeIds: new Set(),
    linkedCurrentMapSiteIds: new Set(),
    committedMaterializationEvents: new Set(),
    materializationEventRef: "event.ilyria.site_activation",
  }), "draft must not become a live site without separately committed canon");
});

Deno.test("site topology rejects unknown, asymmetric, disconnected and duplicate rooms", () => {
  rejects(() => validateSiteTopologyPreflight({...site, nodes: [
    {...node(0), edges: [{toDraftNodeId: "node.site.draft.ilyria.nowhere", distanceM: 4}]},
    node(1), node(2),
  ]}, authority), "unknown node");
  rejects(() => validateSiteTopologyPreflight({...site, nodes: [
    node(0),
    {...node(1), edges: [node(1).edges[1]]},
    node(2),
  ]}, authority), "one-sided link");
  rejects(() => validateSiteTopologyPreflight({...site, nodes: [
    node(0), node(1), {...node(2), edges: []},
  ]}, authority), "disconnected third room");
  rejects(() => validateSiteTopologyPreflight({...site, nodes: [
    node(0), {...node(1), intendedCanonNodeId: node(0).intendedCanonNodeId}, node(2),
  ]}, authority), "duplicate canonical room");
  rejects(() => validateSiteTopologyPreflight({...site, nodes: [
    {...node(0), isEntrance: false}, node(1), node(2),
  ]}, authority), "missing entrance");
  rejects(() => validateSiteTopologyPreflight({...site, nodes: [
    node(0), {...node(1), isEntrance: true}, node(2),
  ]}, authority), "two entrances");
  rejects(() => validateSiteTopologyPreflight({...site,
    entranceAnchorLocationId: "loc.ilyria.nonexistent"}, authority), "imaginary approach");
  rejects(() => validateSiteTopologyPreflight({...site,
    intendedCanonSiteId: "site.ilyria.existing"}, authority), "overwritten existing site");
  rejects(() => validateSiteTopologyPreflight({...site,
    legalAccessEvidenceRef: "survey.ilyria.unverified_rights"}, authority), "unverified rights");
  rejects(() => validateSiteTopologyPreflight({...site, nodes: [
    {...node(0), lengthM: 0}, node(1), node(2),
  ]}, authority), "missing measured dimensions");
});

Deno.test("site admission needs an independent real map update, canon and event", () => {
  const report = validateSiteTopologyPreflight(site, authority);
  const valid = {
    preflight: report,
    publishedCanonicalSiteIds: new Set([site.intendedCanonSiteId]),
    publishedCanonicalNodeIds: new Set(site.nodes.map((n) => n.intendedCanonNodeId)),
    linkedCurrentMapSiteIds: new Set([site.intendedCanonSiteId]),
    committedMaterializationEvents: new Set(["event.ilyria.site_activation"]),
    materializationEventRef: "event.ilyria.site_activation",
  };
  assertSiteLiveAdmission(valid);
  rejects(() => assertSiteLiveAdmission({...valid,
    linkedCurrentMapSiteIds: new Set()}), "canon text alone is not the map");
  rejects(() => assertSiteLiveAdmission({...valid,
    publishedCanonicalNodeIds: new Set()}), "missing canonical room graph");
  rejects(() => assertSiteLiveAdmission({...valid,
    committedMaterializationEvents: new Set()}), "missing event");
});
