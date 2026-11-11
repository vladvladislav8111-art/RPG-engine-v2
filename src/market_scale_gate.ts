/**
 * C-06: large urban market preflight. Pure, no save changes or map retcons.
 *
 * Known Selarin market district IDs are canonical, but the exact perimeters
 * and the DESIGN_C06_MARKET_SECTORS rows are NOT canonical locations.
 *
 * Never interpret a short nearfield MAP_EDGES link as the whole district's
 * physical diameter or teleport a traveler to a hypothetical business.
 */

export type MarketDistrictDesign = {
  proposedMacroId: string;
  canonicalDistrictId: string;
  status: "DESIGN_CANDIDATE";
  planningScale: "MULTI_STREET_KILOMETRE_MARKET";
  knownNearfieldAnchorIds: readonly string[];
  measuredFootprintSpanKm?: number;
  completeBoundaryEvidenceRef?: string;
};

export type MarketAuthority = {
  canonicalMarketDistrictIds: ReadonlySet<string>;
  canonicalMapLocationIds: ReadonlySet<string>;
  verifiedSurveyEvidenceRefs: ReadonlySet<string>;
};

export type MarketFootprintFinding = {
  readonly districtId: string;
  readonly planningScale: "MULTI_STREET_KILOMETRE_MARKET";
  readonly measuredFootprintSpanKm: number | null;
  readonly footprintCanBeCanonized: boolean;
  readonly state: "DESIGN_ONLY";
};

/** A market's nearby map nodes prove only local connections, not diameter. */
export function inspectMarketScale(
  proposed: readonly MarketDistrictDesign[],
  authority: MarketAuthority,
): readonly MarketFootprintFinding[] {
  const districts = new Set<string>();
  const macroIds = new Set<string>();
  if (!proposed.length) throw new Error("No market proposals");
  return proposed.map((p) => {
    if (p.status !== "DESIGN_CANDIDATE" ||
        p.planningScale !== "MULTI_STREET_KILOMETRE_MARKET" ||
        !p.proposedMacroId.startsWith("marketmacro.") ||
        macroIds.has(p.proposedMacroId) ||
        !authority.canonicalMarketDistrictIds.has(p.canonicalDistrictId) ||
        districts.has(p.canonicalDistrictId) ||
        !p.knownNearfieldAnchorIds.length ||
        new Set(p.knownNearfieldAnchorIds).size !== p.knownNearfieldAnchorIds.length ||
        p.knownNearfieldAnchorIds.some(id =>
          !authority.canonicalMapLocationIds.has(id))) {
      throw new Error("Market must link to a real known district and distinct local map anchors");
    }
    macroIds.add(p.proposedMacroId);
    districts.add(p.canonicalDistrictId);
    const measured = p.measuredFootprintSpanKm;
    if (measured !== undefined &&
        (!Number.isFinite(measured) || measured <= 0)) {
      throw new Error("Invalid surveyed market extent");
    }
    const hasIndependentSurvey = measured !== undefined &&
      typeof p.completeBoundaryEvidenceRef === "string" &&
      authority.verifiedSurveyEvidenceRefs.has(p.completeBoundaryEvidenceRef);
    return {
      districtId: p.canonicalDistrictId,
      planningScale: p.planningScale,
      measuredFootprintSpanKm: hasIndependentSurvey ? measured! : null,
      footprintCanBeCanonized: Boolean(hasIndependentSurvey),
      state: "DESIGN_ONLY" as const,
    };
  });
}

export type MarketMapLink = {
  fromId: string;
  toId: string;
  distanceKm: number;
  source: "CANON_MAP_EDGE";
  safePedestrianAccess: boolean;
  cargoPermit: boolean;
};

export type ProposedMarketMovement = {
  routeId: string;
  originId: string;
  destinationId: string;
  knownTraversedNodeIds: readonly string[];
  mode: "WALK" | "CART";
  purpose: string;
};

export type MarketRouteReview = {
  readonly routeId: string;
  readonly routePath: readonly string[];
  readonly mode: "WALK" | "CART";
  readonly state: "SOURCED_ROUTE_DESIGN_ONLY";
  readonly travelTime: "COMPUTE_BY_RUNTIME_ENGINE";
};

/**
 * Route must follow every individually measured canonical edge.
 * Does not compute time or imply Shura is willing to use the route.
 * If some intermediate link is absent, refuse route entirely.
 */
export function inspectMarketRoute(
  route: ProposedMarketMovement,
  canonicalEdges: readonly MarketMapLink[],
  authority: MarketAuthority,
): MarketRouteReview {
  const path = route.knownTraversedNodeIds;
  if (!route.routeId.startsWith("marketroute.") ||
      !route.purpose.trim() ||
      path.length < 2 ||
      path[0] !== route.originId ||
      path[path.length - 1] !== route.destinationId ||
      new Set(path).size !== path.length ||
      path.some(id => !authority.canonicalMapLocationIds.has(id))) {
    throw new Error("Do not invent market travel endpoints, shortcuts or loops");
  }
  const edges = new Map<string, MarketMapLink>();
  for (const e of canonicalEdges) {
    if (e.source !== "CANON_MAP_EDGE" ||
        !authority.canonicalMapLocationIds.has(e.fromId) ||
        !authority.canonicalMapLocationIds.has(e.toId) ||
        e.fromId === e.toId ||
        !Number.isFinite(e.distanceKm) || e.distanceKm <= 0) {
      throw new Error("Only existing physical measured map links may be traversed");
    }
    if (edges.has(e.fromId + "|" + e.toId)) {
      throw new Error("Ambiguous route link, reconcile current authoritative map");
    }
    edges.set(e.fromId + "|" + e.toId, e);
  }
  for (let i = 1; i < path.length; i++) {
    const forward = edges.get(path[i - 1] + "|" + path[i]);
    const reverse = edges.get(path[i] + "|" + path[i - 1]);
    const edge = forward ?? reverse;
    if (!edge || !edge.safePedestrianAccess ||
        (route.mode === "CART" && !edge.cargoPermit)) {
      throw new Error("Market movement crosses unsurveyed or unusable street segment");
    }
  }
  return {
    routeId: route.routeId,
    routePath: [...path],
    mode: route.mode,
    state: "SOURCED_ROUTE_DESIGN_ONLY",
    travelTime: "COMPUTE_BY_RUNTIME_ENGINE",
  };
}

export type MarketSectorCandidate = {
  sectorId: string;
  parentMarketDistrictId: string;
  canonicalNearfieldAnchorId: string;
  functionalTag: string;
  status: "DESIGN_CANDIDATE";
  merchantLocationId?: string;
  sourceEvidenceRef?: string;
};

export type ScopedMarketLoad = {
  readonly districtId: string;
  readonly selectedCandidateIds: readonly string[];
  readonly merchantLocationsConfirmed: false;
  readonly state: "AUTHORING_INDEX_ONLY";
};

/**
 * Lazy index selection avoids loading every Selarin seller, market and
 * NPC every turn. This is GM authoring only, not player-visible merchant
 * discovery. Merchant identity and actual location require live sources.
 */
export function selectMarketDesignScope(input: {
  marketDistrictId: string;
  queryFunctionalTag: string;
  candidates: readonly MarketSectorCandidate[];
  authority: MarketAuthority;
  maximumCandidateRows: number;
}): ScopedMarketLoad {
  const { marketDistrictId, queryFunctionalTag, candidates, authority, maximumCandidateRows } = input;
  if (!authority.canonicalMarketDistrictIds.has(marketDistrictId) ||
      !queryFunctionalTag.trim() ||
      !Number.isSafeInteger(maximumCandidateRows) || maximumCandidateRows < 1 ||
      maximumCandidateRows > 8) {
    throw new Error("Scoped index retrieval requires a real location and bounded query");
  }
  const unique = new Set<string>();
  const matched: string[] = [];
  for (const c of candidates) {
    if (c.status !== "DESIGN_CANDIDATE" ||
        !c.sectorId.startsWith("marketsector.") ||
        unique.has(c.sectorId) ||
        !authority.canonicalMarketDistrictIds.has(c.parentMarketDistrictId) ||
        !authority.canonicalMapLocationIds.has(c.canonicalNearfieldAnchorId)) {
      throw new Error("Market index contains duplicate, unauthorized or nonexistent anchors");
    }
    unique.add(c.sectorId);
    if (c.parentMarketDistrictId === marketDistrictId &&
        c.functionalTag === queryFunctionalTag &&
        matched.length < maximumCandidateRows) matched.push(c.sectorId);
  }
  return {
    districtId: marketDistrictId,
    selectedCandidateIds: matched,
    merchantLocationsConfirmed: false,
    state: "AUTHORING_INDEX_ONLY",
  };
}
