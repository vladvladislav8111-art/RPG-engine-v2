/**
 * A-02/A-03 ecology preflight. Pure, read-only checks.
 *
 * DESIGN_CANDIDATE records are proposals, never inhabitants or loot.
 * This module does not write permanent canon, BESTIARY_MASTER, TEMP runtime,
 * or the player's observation journal. The caller must supply verified
 * canonical indices and evidence from their authoritative owners.
 */
export type EcologyFoodBudget = {
  sourceId: string;
  anchorLocationId: string;
  verifiedYieldKgPerYear: number;
  protectedReserveKgPerYear: number;
  surveyEvidenceRef: string;
};

export type EcologyFoodAllocation = {
  sourceId: string;
  kgPerYear: number;
};

export type EcologyEvidence = {
  habitat: string;
  census: string;
  density: string;
  breedingMortality: string;
  naturalMechanism: string;
  geography: string;
  harvestLaw: string;
  duplicationReview: string;
};

export type CandidateTaxonPopulation = {
  draftId: string;
  intendedCanonId: string;
  displayName: string;
  status: "DESIGN_CANDIDATE";
  bioregionId: string;
  habitatAnchorIds: string[];
  surveyedHabitatKm2: number;
  maxSustainableIndividualsPerKm2: number;
  populationLow: number;
  populationEstimate: number;
  populationHigh: number;
  annualBirths: number;
  annualDeaths: number;
  annualImmigration: number;
  annualEmigration: number;
  dietAllocations: EcologyFoodAllocation[];
  annualFoodDemandKg: number;
  evidence: EcologyEvidence;
};

export type EcologyEvidenceIndex = {
  // All three collections are authoritative inputs, not local guesses.
  verifiedEvidenceRefs: ReadonlySet<string>;
  canonicalBioregionIds: ReadonlySet<string>;
  canonicalLocationIds: ReadonlySet<string>;
  alreadyCanonicalTaxonIds: ReadonlySet<string>;
  alreadyCanonicalTaxonNames: ReadonlySet<string>;
};

export type EcologyPreflight = {
  readonly proposals: ReadonlyArray<{
    draftId: string;
    intendedCanonId: string;
    bioregionId: string;
    estimatedIndividuals: number;
    capacityCeiling: number;
    annualNetChange: number;
  }>;
  readonly allocatedFoodKgPerYear: Readonly<Record<string, number>>;
  readonly state: "VALIDATED_DESIGN_ONLY";
};

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const finitePositive = (value: unknown): value is number =>
  finiteNonNegative(value) && value > 0;
const finiteWhole = (value: unknown): value is number =>
  finiteNonNegative(value) && Number.isSafeInteger(value);
const isDraft = (value: string): boolean => value.includes(".draft.");
const stable = (value: string): boolean => /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(value);

function evidenceExists(value: string, verified: ReadonlySet<string>): boolean {
  return stable(value) && verified.has(value);
}

/**
 * A population must have a verified finite habitat, reproduction/death
 * estimates, actual food source budgets, legal/geographical anchors, and
 * collision review. Finite food yields are SHARED across all taxa in the
 * submitted cohort: two species cannot claim the same kilogram twice.
 *
 * This intentionally does NOT assume ecosystem equilibrium: annual net
 * change may be positive or negative and is returned for GM review.
 */
export function validateEcologyPreflight(input: {
  taxa: CandidateTaxonPopulation[];
  foodSources: EcologyFoodBudget[];
  index: EcologyEvidenceIndex;
}): EcologyPreflight {
  const { taxa, foodSources, index } = input;
  if (taxa.length === 0) throw new Error("Ecology preflight requires real candidate records");
  const foodById = new Map<string, EcologyFoodBudget>();
  for (const food of foodSources) {
    if (!stable(food.sourceId) || isDraft(food.sourceId) ||
        foodById.has(food.sourceId) ||
        !index.canonicalLocationIds.has(food.anchorLocationId) ||
        !finitePositive(food.verifiedYieldKgPerYear) ||
        !finiteNonNegative(food.protectedReserveKgPerYear) ||
        food.protectedReserveKgPerYear > food.verifiedYieldKgPerYear ||
        !evidenceExists(food.surveyEvidenceRef, index.verifiedEvidenceRefs)) {
      throw new Error("Food source needs unique canonical identity and finite verified budget");
    }
    foodById.set(food.sourceId, food);
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  const allocations = new Map<string, number>();
  const proposals: EcologyPreflight["proposals"][number][] = [];

  for (const t of taxa) {
    const normalizedName = t.displayName.trim().toLocaleLowerCase();
    if (t.status !== "DESIGN_CANDIDATE" ||
        !stable(t.draftId) || !isDraft(t.draftId) ||
        !stable(t.intendedCanonId) || isDraft(t.intendedCanonId) ||
        ids.has(t.intendedCanonId) ||
        index.alreadyCanonicalTaxonIds.has(t.intendedCanonId) ||
        normalizedName.length < 2 || names.has(normalizedName) ||
        index.alreadyCanonicalTaxonNames.has(normalizedName)) {
      throw new Error("Draft species has missing identity, duplicate or accidental live status");
    }
    ids.add(t.intendedCanonId);
    names.add(normalizedName);
    if (!index.canonicalBioregionIds.has(t.bioregionId) ||
        isDraft(t.bioregionId) ||
        !t.habitatAnchorIds.length ||
        t.habitatAnchorIds.some((id) => !index.canonicalLocationIds.has(id))) {
      throw new Error("Draft habitat has no verified canonical region and connected geography");
    }

    if (!finitePositive(t.surveyedHabitatKm2) ||
        !finitePositive(t.maxSustainableIndividualsPerKm2) ||
        !finiteWhole(t.populationLow) || !finiteWhole(t.populationEstimate) ||
        !finiteWhole(t.populationHigh) ||
        t.populationLow > t.populationEstimate ||
        t.populationEstimate > t.populationHigh) {
      throw new Error("Population must use a surveyed finite range and habitat density");
    }
    const capacity = t.surveyedHabitatKm2 * t.maxSustainableIndividualsPerKm2;
    if (!Number.isFinite(capacity) || t.populationHigh > capacity + 1e-9) {
      throw new Error("Proposed population exceeds verified local habitat capacity");
    }

    const annualFlow = [
      t.annualBirths, t.annualDeaths, t.annualImmigration, t.annualEmigration,
    ];
    if (annualFlow.some((n) => !finiteWhole(n))) {
      throw new Error("Reproduction, mortality and migration require finite estimates");
    }
    if (!finitePositive(t.annualFoodDemandKg) || !t.dietAllocations.length) {
      throw new Error("Every species needs a real finite annual food budget");
    }
    const refs = Object.values(t.evidence);
    if (refs.length !== 8 ||
        refs.some((ref) => !evidenceExists(ref, index.verifiedEvidenceRefs))) {
      throw new Error("Missing pre-existing proof for ecosystem, law, reproduction or duplicate check");
    }
    let allocatedToTaxon = 0;
    const usedFood = new Set<string>();
    for (const allocation of t.dietAllocations) {
      const food = foodById.get(allocation.sourceId);
      if (!food || !finitePositive(allocation.kgPerYear) ||
          usedFood.has(allocation.sourceId) ||
          !t.habitatAnchorIds.includes(food.anchorLocationId)) {
        throw new Error("Unverified, duplicate or geographically disconnected dietary source");
      }
      usedFood.add(allocation.sourceId);
      allocatedToTaxon += allocation.kgPerYear;
      allocations.set(food.sourceId,
        (allocations.get(food.sourceId) ?? 0) + allocation.kgPerYear);
    }
    if (!Number.isFinite(allocatedToTaxon) ||
        Math.abs(allocatedToTaxon - t.annualFoodDemandKg) > 1e-6) {
      throw new Error("Annual diet allocations must exactly explain the estimated need");
    }

    proposals.push({
      draftId: t.draftId,
      intendedCanonId: t.intendedCanonId,
      bioregionId: t.bioregionId,
      estimatedIndividuals: t.populationEstimate,
      capacityCeiling: capacity,
      annualNetChange: t.annualBirths + t.annualImmigration -
        t.annualDeaths - t.annualEmigration,
    });
  }
  for (const [sourceId, amount] of allocations) {
    const food = foodById.get(sourceId)!;
    if (amount > food.verifiedYieldKgPerYear - food.protectedReserveKgPerYear + 1e-6) {
      throw new Error("Shared food allocation exceeds finite available yield");
    }
  }
  return {
    proposals,
    allocatedFoodKgPerYear: Object.fromEntries(allocations),
    state: "VALIDATED_DESIGN_ONLY",
  };
}

/**
 * An approved design report cannot activate fauna. A separate canonical
 * publication, bestiary index, population-ledger registration, current region
 * and explicit semantic materialization event must all independently exist.
 * Even a successful call remains READ-ONLY.
 */
export function assertEcologyLiveAdmission(input: {
  preflight: EcologyPreflight;
  intendedCanonId: string;
  publishedCanonTaxonIds: ReadonlySet<string>;
  indexedBestiaryTaxonIds: ReadonlySet<string>;
  activePopulationLedgerTaxonIds: ReadonlySet<string>;
  activeCanonicalBioregionIds: ReadonlySet<string>;
  materializationEventRef: string;
  committedMaterializationEvents: ReadonlySet<string>;
}): void {
  const { preflight, intendedCanonId } = input;
  const proposal = preflight.proposals.find((p) => p.intendedCanonId === intendedCanonId);
  if (preflight.state !== "VALIDATED_DESIGN_ONLY" || !proposal ||
      !input.publishedCanonTaxonIds.has(intendedCanonId) ||
      !input.indexedBestiaryTaxonIds.has(intendedCanonId) ||
      !input.activePopulationLedgerTaxonIds.has(intendedCanonId) ||
      !input.activeCanonicalBioregionIds.has(proposal.bioregionId) ||
      !evidenceExists(input.materializationEventRef, input.committedMaterializationEvents)) {
    throw new Error("Design cannot become live fauna without an independently committed world fact");
  }
}
