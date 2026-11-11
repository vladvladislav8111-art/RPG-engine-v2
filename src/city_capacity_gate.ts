/**
 * C-06 / EC-06 source-backed city carrying-capacity and service preflight.
 *
 * Pure verifier only: no NPCs, families, homes, money, inventory, wages,
 * contracts, world clocks, player-visible offers or game minutes are created.
 * All design rows in GM PREGEN are NEVER_IN_LIVE_PLAY. Use committed canon
 * and runtime observations when validating a proposed real process.
 */

export type CityAuthority = {
  canonicalDistrictIds: ReadonlySet<string>;
  canonicalPersonIds: ReadonlySet<string>;
  canonicalDwellingIds: ReadonlySet<string>;
  canonicalCustodianIds: ReadonlySet<string>;
  canonicalSupplySiteIds: ReadonlySet<string>;
  verifiedEvidenceRefs: ReadonlySet<string>;
};

export type DailyDemand = {
  litersPotableWaterPerPerson: number;
  kcalFoodPerPerson: number;
  sanitationCapacityUnitsPerPerson: number;
  canonicalStandardEvidenceRef: string;
};

export type SupplyUnit = "WATER_LITERS" | "FOOD_KCAL" | "SANITATION_UNITS";

export type DailyFiniteSupply = {
  supplyId: string;
  canonicalSiteId: string;
  unit: SupplyUnit;
  verifiedDailyCapacity: number;
  protectedReserve: number;
  availableDistrictIds: readonly string[];
  capacityEvidenceRef: string;
  accessEvidenceRef: string;
};

export type HouseholdAllocation = {
  supplyId: string;
  consumedDaily: number;
};

export type CandidateHousehold = {
  proposedHouseholdId: string;
  dwellingCanonicalId: string;
  status: "DESIGN_CANDIDATE";
  districtId: string;
  responsibleCustodianId: string;
  residentPersonIds: readonly string[];
  verifiedBedSpaces: number;
  occupancyEvidenceRef: string;
  lawfulResidenceEvidenceRef: string;
  allocations: readonly HouseholdAllocation[];
};

export type CityCensusPreflight = {
  readonly state: "VALIDATED_DESIGN_ONLY";
  readonly householdCount: number;
  readonly distinctResidentCount: number;
  readonly dailyUseBySupply: Readonly<Record<string, number>>;
};

const valid = (s: string): boolean =>
  typeof s === "string" &&
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(s);
const finiteNonNegative = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
const finitePositive = (n: unknown): n is number =>
  finiteNonNegative(n) && n > 0;
const wholePositive = (n: unknown): n is number =>
  finitePositive(n) && Number.isSafeInteger(n);
const tolerance = 1e-6;

function trusted(ref: string, evidence: ReadonlySet<string>): boolean {
  return valid(ref) && evidence.has(ref);
}

/**
 * Explicit evidence of both residence and multi-household *shared* daily
 * water/food/sanitation budgets is required before a city population count.
 *
 * Capacity is given as a verified physical stock/flow, not inferred from
 * named NPC jobs or the target of 250-400 simulated characters.
 * Inputs can model legitimate deliveries between districts, but only when
 * evidence has already established the source's actual coverage.
 */
export function validateCandidateCityCensus(input: {
  householdCandidates: readonly CandidateHousehold[];
  dailySupplies: readonly DailyFiniteSupply[];
  needs: DailyDemand;
  authority: CityAuthority;
}): CityCensusPreflight {
  const { householdCandidates: homes, dailySupplies: supplies, needs, authority: a } = input;
  if (!homes.length || !supplies.length ||
      !finitePositive(needs.litersPotableWaterPerPerson) ||
      !finitePositive(needs.kcalFoodPerPerson) ||
      !finitePositive(needs.sanitationCapacityUnitsPerPerson) ||
      !trusted(needs.canonicalStandardEvidenceRef, a.verifiedEvidenceRefs)) {
    throw new Error("No city census from empty housing or invented physiological standards");
  }

  const supplyById = new Map<string, DailyFiniteSupply>();
  for (const supply of supplies) {
    if (!valid(supply.supplyId) || supply.supplyId.includes(".draft.") ||
        supplyById.has(supply.supplyId) ||
        !a.canonicalSupplySiteIds.has(supply.canonicalSiteId) ||
        !["WATER_LITERS", "FOOD_KCAL", "SANITATION_UNITS"].includes(supply.unit) ||
        !finitePositive(supply.verifiedDailyCapacity) ||
        !finiteNonNegative(supply.protectedReserve) ||
        supply.protectedReserve > supply.verifiedDailyCapacity ||
        !supply.availableDistrictIds.length ||
        supply.availableDistrictIds.some(id => !a.canonicalDistrictIds.has(id)) ||
        !trusted(supply.capacityEvidenceRef, a.verifiedEvidenceRefs) ||
        !trusted(supply.accessEvidenceRef, a.verifiedEvidenceRefs)) {
      throw new Error("Supplies must be finite, accessible, measured and already canonical");
    }
    supplyById.set(supply.supplyId, supply);
  }

  const used = new Map<string, number>();
  const householdIds = new Set<string>();
  const dwellingIds = new Set<string>();
  const residentIds = new Set<string>();

  for (const home of homes) {
    if (home.status !== "DESIGN_CANDIDATE" ||
        !valid(home.proposedHouseholdId) ||
        !home.proposedHouseholdId.includes(".draft.") ||
        householdIds.has(home.proposedHouseholdId) ||
        !a.canonicalDwellingIds.has(home.dwellingCanonicalId) ||
        dwellingIds.has(home.dwellingCanonicalId) ||
        !a.canonicalDistrictIds.has(home.districtId) ||
        !a.canonicalCustodianIds.has(home.responsibleCustodianId) ||
        !trusted(home.occupancyEvidenceRef, a.verifiedEvidenceRefs) ||
        !trusted(home.lawfulResidenceEvidenceRef, a.verifiedEvidenceRefs) ||
        !wholePositive(home.verifiedBedSpaces) ||
        !home.residentPersonIds.length ||
        home.residentPersonIds.length > home.verifiedBedSpaces ||
        !home.allocations.length) {
      throw new Error("Households need unique canonical dwellings, legal tenancy and finite bed spaces");
    }
    householdIds.add(home.proposedHouseholdId);
    dwellingIds.add(home.dwellingCanonicalId);

    for (const person of home.residentPersonIds) {
      if (!a.canonicalPersonIds.has(person) || residentIds.has(person)) {
        throw new Error("A person cannot occupy unknown or multiple households");
      }
      residentIds.add(person);
    }

    const needed = new Map<SupplyUnit, number>([
      ["WATER_LITERS", home.residentPersonIds.length * needs.litersPotableWaterPerPerson],
      ["FOOD_KCAL", home.residentPersonIds.length * needs.kcalFoodPerPerson],
      ["SANITATION_UNITS", home.residentPersonIds.length * needs.sanitationCapacityUnitsPerPerson],
    ]);
    for (const allocation of home.allocations) {
      const resource = supplyById.get(allocation.supplyId);
      if (!resource || !resource.availableDistrictIds.includes(home.districtId) ||
          !finitePositive(allocation.consumedDaily)) {
        throw new Error("Household draws nonexistent, geographically unreachable or zero supplies");
      }
      needed.set(resource.unit, (needed.get(resource.unit) ?? 0) - allocation.consumedDaily);
      used.set(resource.supplyId, (used.get(resource.supplyId) ?? 0) + allocation.consumedDaily);
    }
    for (const balance of needed.values()) {
      if (!Number.isFinite(balance) || balance > tolerance) {
        throw new Error("Residents cannot exist on unfunded daily food, water or sanitation");
      }
    }
  }

  for (const [id, amount] of used) {
    const stock = supplyById.get(id)!;
    if (!Number.isFinite(amount) ||
        amount > stock.verifiedDailyCapacity - stock.protectedReserve + tolerance) {
      throw new Error("Two homes cannot spend the same finite daily supply twice");
    }
  }
  return {
    state: "VALIDATED_DESIGN_ONLY",
    householdCount: householdIds.size,
    distinctResidentCount: residentIds.size,
    dailyUseBySupply: Object.fromEntries(used),
  };
}

export type ExistingServiceProcess = {
  processId: string;
  status: "ACTIVE";
  canonicalOperatorId: string;
  currentDistrictId: string;
  actualNextReviewGameMinute: number;
  observedInputs: readonly string[];
  confirmedSourceEvidenceRefs: readonly string[];
  caseReference: string;
  permittedActionId: string;
};

export type ServiceReviewAuthority = {
  knownOperatorIds: ReadonlySet<string>;
  knownDistrictIds: ReadonlySet<string>;
  availableEvidenceRefs: ReadonlySet<string>;
  verifiedPhysicalOrDocumentInputs: ReadonlySet<string>;
  existingAuthorizedActionIds: ReadonlySet<string>;
  activeProcessIds: ReadonlySet<string>;
};

export function previewDueCityProcess(input: {
  process: ExistingServiceProcess;
  authority: ServiceReviewAuthority;
  lastCommittedGameMinute: number;
  currentGameMinute: number;
  elapsedGameMinutes: number;
  genuineGameplayAction: boolean;
}): { readonly mode: "PREVIEW_ONLY"; readonly processId: string;
     readonly actionProfileId: string; readonly noAutomaticReward: true } {
  const { process: p, authority: a, lastCommittedGameMinute: prior,
          currentGameMinute: now, elapsedGameMinutes: elapsed } = input;
  if (!input.genuineGameplayAction || !finitePositive(elapsed) ||
      !finiteNonNegative(prior) || !finiteNonNegative(now) ||
      !finiteNonNegative(p.actualNextReviewGameMinute) ||
      Math.abs(now - prior - elapsed) > tolerance ||
      now + tolerance < p.actualNextReviewGameMinute) {
    throw new Error("Out-of-game design and not-yet-due world clocks cannot advance");
  }
  if (p.status !== "ACTIVE" || !valid(p.processId) ||
      !a.activeProcessIds.has(p.processId) ||
      !a.knownOperatorIds.has(p.canonicalOperatorId) ||
      !a.knownDistrictIds.has(p.currentDistrictId) ||
      !a.existingAuthorizedActionIds.has(p.permittedActionId) ||
      !trusted(p.caseReference, a.availableEvidenceRefs) ||
      !p.observedInputs.length ||
      p.observedInputs.some(id => !a.verifiedPhysicalOrDocumentInputs.has(id)) ||
      !p.confirmedSourceEvidenceRefs.length ||
      p.confirmedSourceEvidenceRefs.some(ref => !trusted(ref, a.availableEvidenceRefs))) {
    throw new Error("A city process requires a real current actor, case, inputs and authority");
  }
  return {
    mode: "PREVIEW_ONLY",
    processId: p.processId,
    actionProfileId: p.permittedActionId,
    noAutomaticReward: true,
  };
}
