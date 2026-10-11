import {
  assertEcologyLiveAdmission,
  type CandidateTaxonPopulation,
  type EcologyEvidenceIndex,
  type EcologyFoodBudget,
  validateEcologyPreflight,
} from "../src/ecology_gate.ts";

const evidence = {
  habitat: "survey.ilyria.habitat",
  census: "survey.ilyria.census",
  density: "survey.ilyria.density",
  breedingMortality: "survey.ilyria.demography",
  naturalMechanism: "canon.ilyria.mechanism",
  geography: "canon.ilyria.geography",
  harvestLaw: "canon.ilyria.harvest_rules",
  duplicationReview: "audit.ilyria.species_collision",
};
const anchors = new Set(["loc.ilyria.forest_patch"]);
const food: EcologyFoodBudget[] = [{
  sourceId: "resource.ilyria.seeds",
  anchorLocationId: "loc.ilyria.forest_patch",
  verifiedYieldKgPerYear: 1200,
  protectedReserveKgPerYear: 200,
  surveyEvidenceRef: "survey.ilyria.seed_yield",
}];
const index: EcologyEvidenceIndex = {
  verifiedEvidenceRefs: new Set([...Object.values(evidence), "survey.ilyria.seed_yield"]),
  canonicalBioregionIds: new Set(["bioregion.ilyria.verified_wood"]),
  canonicalLocationIds: anchors,
  alreadyCanonicalTaxonIds: new Set(),
  alreadyCanonicalTaxonNames: new Set(),
};
const proposal: CandidateTaxonPopulation = {
  draftId: "creature.draft.ilyria.verified_candidate",
  intendedCanonId: "creature.ilyria.verified_candidate",
  displayName: "Verified example, not real canon",
  status: "DESIGN_CANDIDATE",
  bioregionId: "bioregion.ilyria.verified_wood",
  habitatAnchorIds: ["loc.ilyria.forest_patch"],
  surveyedHabitatKm2: 10,
  maxSustainableIndividualsPerKm2: 20,
  populationLow: 80,
  populationEstimate: 100,
  populationHigh: 120,
  annualBirths: 30,
  annualDeaths: 18,
  annualImmigration: 2,
  annualEmigration: 4,
  dietAllocations: [{sourceId: "resource.ilyria.seeds", kgPerYear: 400}],
  annualFoodDemandKg: 400,
  evidence,
};
function rejects(fn: () => unknown, label: string) {
  let rejected = false;
  try { fn(); } catch { rejected = true; }
  if (!rejected) throw new Error("Unsafe ecological input passed: " + label);
}
function validate(taxa: CandidateTaxonPopulation[] = [proposal],
  budgets: EcologyFoodBudget[] = food,
  authority: EcologyEvidenceIndex = index) {
  return validateEcologyPreflight({taxa, foodSources: budgets, index: authority});
}

Deno.test("verified census and finite shared resource produce only a non-live design report", () => {
  const receipt = validate();
  if (receipt.state !== "VALIDATED_DESIGN_ONLY" || receipt.proposals.length !== 1 ||
      receipt.proposals[0].capacityCeiling !== 200 ||
      receipt.proposals[0].annualNetChange !== 10 ||
      receipt.allocatedFoodKgPerYear["resource.ilyria.seeds"] !== 400) {
    throw new Error("Incorrect ecological preflight accounting");
  }
  rejects(() => assertEcologyLiveAdmission({
    preflight: receipt,
    intendedCanonId: proposal.intendedCanonId,
    publishedCanonTaxonIds: new Set(),
    indexedBestiaryTaxonIds: new Set(),
    activePopulationLedgerTaxonIds: new Set(),
    activeCanonicalBioregionIds: new Set(),
    materializationEventRef: "event.ilyria.activation",
    committedMaterializationEvents: new Set(),
  }), "design has no right to spawn");
});

Deno.test("population, geography, evidence and name collisions reject fabricated species", () => {
  rejects(() => validate([{...proposal, bioregionId: "bioregion.draft.ilyria.forest"}]),
    "draft bioregion");
  rejects(() => validate([{...proposal, populationHigh: 201}]), "above local capacity");
  rejects(() => validate([{...proposal, populationEstimate: 122}]), "invalid range");
  rejects(() => validate([{...proposal, maxSustainableIndividualsPerKm2: Infinity}]),
    "nonfinite density");
  rejects(() => validate([{...proposal, habitatAnchorIds: ["loc.nonexistent"]}]),
    "unmapped habitat");
  rejects(() => validate([{...proposal, evidence: {...evidence, census: "survey.made_up"}}]),
    "uncorroborated survey");
  rejects(() => validate([{...proposal, intendedCanonId: "creature.draft.fake"}]),
    "draft live ID");
  rejects(() => validate([{...proposal, status: "CANON_ACTIVE" as "DESIGN_CANDIDATE"}]),
    "premature activation");
  rejects(() => validate([proposal, {...proposal}]), "duplicate candidate identity");
  rejects(() => validate([proposal], food, {...index,
    alreadyCanonicalTaxonNames: new Set([proposal.displayName.toLowerCase()])}),
    "existing species name");
});

Deno.test("resource supply is allocated once across candidate species", () => {
  const second: CandidateTaxonPopulation = {
    ...proposal,
    draftId: "creature.draft.ilyria.second",
    intendedCanonId: "creature.ilyria.second",
    displayName: "Second example, not canon",
    annualFoodDemandKg: 650,
    dietAllocations: [{sourceId: "resource.ilyria.seeds", kgPerYear: 650}],
  };
  rejects(() => validate([proposal, second]), "two taxa claim more than shared yield after reserves");
  const reduced = {...second, annualFoodDemandKg: 600,
    dietAllocations: [{sourceId: "resource.ilyria.seeds", kgPerYear: 600}]};
  const receipt = validate([proposal, reduced]);
  if (receipt.allocatedFoodKgPerYear["resource.ilyria.seeds"] !== 1000) {
    throw new Error("Shared food budget not reconciled");
  }
  rejects(() => validate([{...proposal,
    annualFoodDemandKg: 500}]), "dietary demands cannot mismatch allocations");
  rejects(() => validate([proposal], [{
    ...food[0], protectedReserveKgPerYear: 1300,
  }]), "source cannot owe more protected food than it produces");
});

Deno.test("only externally committed canon, index, population and event allow admission check", () => {
  const receipt = validate();
  const valid = {
    preflight: receipt,
    intendedCanonId: proposal.intendedCanonId,
    publishedCanonTaxonIds: new Set([proposal.intendedCanonId]),
    indexedBestiaryTaxonIds: new Set([proposal.intendedCanonId]),
    activePopulationLedgerTaxonIds: new Set([proposal.intendedCanonId]),
    activeCanonicalBioregionIds: new Set([proposal.bioregionId]),
    materializationEventRef: "event.ilyria.activation",
    committedMaterializationEvents: new Set(["event.ilyria.activation"]),
  };
  assertEcologyLiveAdmission(valid); // read-only: caller is responsible for all real commits
  rejects(() => assertEcologyLiveAdmission({...valid,
    activePopulationLedgerTaxonIds: new Set()}), "no recorded real animals");
  rejects(() => assertEcologyLiveAdmission({...valid,
    committedMaterializationEvents: new Set()}), "event not committed");
});
