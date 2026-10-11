/**
 * A-02/A-03 dungeon/site topology preflight.
 *
 * Checks geometry, accessibility, non-collision and reciprocal routes.
 * It does not materialize a site, create NPCs/treasure, award discoveries,
 * update the player map, or modify pre-existing dungeon rooms.
 */
export type DraftSiteNode = {
  draftNodeId: string;
  intendedCanonNodeId: string;
  isEntrance: boolean;
  lengthM: number;
  widthM: number;
  ceilingHeightM: number;
  geometryEvidenceRef: string;
  edges: Array<{ toDraftNodeId: string; distanceM: number }>;
};

export type DraftSite = {
  draftSiteId: string;
  intendedCanonSiteId: string;
  status: "DESIGN_CANDIDATE";
  entranceAnchorLocationId: string;
  originEvidenceRef: string;
  accessRouteEvidenceRef: string;
  legalAccessEvidenceRef: string;
  nodes: DraftSiteNode[];
};

export type SiteAuthorityIndex = {
  canonicalLocationIds: ReadonlySet<string>;
  canonicalSiteIds: ReadonlySet<string>;
  canonicalNodeIds: ReadonlySet<string>;
  verifiedEvidenceRefs: ReadonlySet<string>;
};

export type SiteTopologyPreflight = {
  readonly state: "VALIDATED_DESIGN_ONLY";
  readonly intendedCanonSiteId: string;
  readonly intendedNodeIds: ReadonlyArray<string>;
  readonly undirectedEdgeCount: number;
  readonly entranceDraftNodeId: string;
};

const stableSiteId = (id: string): boolean =>
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(id);
const real = (id: string): boolean => stableSiteId(id) && !id.includes(".draft.");
const positive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * A node-to-node corridor is a physical edge, not merely a textual "exit".
 * Both directions must specify the same surveyed length. All nodes must
 * be reachable from exactly one physical entrance anchored to a confirmed
 * world location. Existing maps remain untouched.
 */
export function validateSiteTopologyPreflight(
  site: DraftSite,
  authority: SiteAuthorityIndex,
): SiteTopologyPreflight {
  if (site.status !== "DESIGN_CANDIDATE" ||
      !stableSiteId(site.draftSiteId) || !site.draftSiteId.includes(".draft.") ||
      !real(site.intendedCanonSiteId) ||
      authority.canonicalSiteIds.has(site.intendedCanonSiteId)) {
    throw new Error("Site must be a new, uniquely identified inactive design candidate");
  }
  if (!authority.canonicalLocationIds.has(site.entranceAnchorLocationId) ||
      ![
        site.originEvidenceRef,
        site.accessRouteEvidenceRef,
        site.legalAccessEvidenceRef,
      ].every((r) => authority.verifiedEvidenceRefs.has(r) && stableSiteId(r))) {
    throw new Error("Site entrance, origin, surveyed route and legal access are unverified");
  }
  if (site.nodes.length < 2) {
    throw new Error("Persistent dungeon requires surveyed rooms and connections");
  }
  const nodes = new Map<string, DraftSiteNode>();
  const canonicalNodes = new Set<string>();
  for (const node of site.nodes) {
    if (!stableSiteId(node.draftNodeId) || !node.draftNodeId.includes(".draft.") ||
        nodes.has(node.draftNodeId) || !real(node.intendedCanonNodeId) ||
        canonicalNodes.has(node.intendedCanonNodeId) ||
        authority.canonicalNodeIds.has(node.intendedCanonNodeId) ||
        !positive(node.lengthM) || !positive(node.widthM) ||
        !positive(node.ceilingHeightM) ||
        !authority.verifiedEvidenceRefs.has(node.geometryEvidenceRef)) {
      throw new Error("Dungeon room ID or finite surveyed dimensions are inconsistent");
    }
    canonicalNodes.add(node.intendedCanonNodeId);
    nodes.set(node.draftNodeId, node);
  }
  const entrances = site.nodes.filter((node) => node.isEntrance);
  if (entrances.length !== 1) {
    throw new Error("One canonical entrance must attach to one known real-world route");
  }
  let edgeCount = 0;
  for (const node of site.nodes) {
    const seen = new Set<string>();
    for (const edge of node.edges) {
      const neighbor = nodes.get(edge.toDraftNodeId);
      if (!positive(edge.distanceM) || !neighbor ||
          neighbor.draftNodeId === node.draftNodeId ||
          seen.has(neighbor.draftNodeId)) {
        throw new Error("Dungeon edge points to unknown, duplicate or self-connected node");
      }
      seen.add(neighbor.draftNodeId);
      const backlinks = neighbor.edges.filter((other) =>
        other.toDraftNodeId === node.draftNodeId);
      if (backlinks.length !== 1 ||
          !positive(backlinks[0].distanceM) ||
          Math.abs(backlinks[0].distanceM - edge.distanceM) > 0.01) {
        throw new Error("Dungeon routes must be symmetric with consistent measured lengths");
      }
      edgeCount++;
    }
  }
  const visited = new Set<string>();
  const queue = [entrances[0].draftNodeId];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of nodes.get(id)!.edges) {
      if (!visited.has(edge.toDraftNodeId)) queue.push(edge.toDraftNodeId);
    }
  }
  if (visited.size !== site.nodes.length) {
    throw new Error("All site rooms must be reachable from the surveyed entrance");
  }
  return {
    state: "VALIDATED_DESIGN_ONLY",
    intendedCanonSiteId: site.intendedCanonSiteId,
    intendedNodeIds: [...canonicalNodes],
    undirectedEdgeCount: edgeCount / 2,
    entranceDraftNodeId: entrances[0].draftNodeId,
  };
}

/**
 * The design graph is NOT the live map. Admission is only permitted when
 * permanent site/node canon, a map-graph insertion and an authorized
 * materialization event are already committed by independent owners.
 * This is a read-only assertion, not a commit.
 */
export function assertSiteLiveAdmission(input: {
  preflight: SiteTopologyPreflight;
  publishedCanonicalSiteIds: ReadonlySet<string>;
  publishedCanonicalNodeIds: ReadonlySet<string>;
  linkedCurrentMapSiteIds: ReadonlySet<string>;
  committedMaterializationEvents: ReadonlySet<string>;
  materializationEventRef: string;
}): void {
  const r = input.preflight;
  if (r.state !== "VALIDATED_DESIGN_ONLY" ||
      !input.publishedCanonicalSiteIds.has(r.intendedCanonSiteId) ||
      !input.linkedCurrentMapSiteIds.has(r.intendedCanonSiteId) ||
      r.intendedNodeIds.some((id) => !input.publishedCanonicalNodeIds.has(id)) ||
      !stableSiteId(input.materializationEventRef) ||
      !input.committedMaterializationEvents.has(input.materializationEventRef)) {
    throw new Error("Design dungeon has not been independently canonized and materialized");
  }
}
