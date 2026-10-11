import {
  assertSupplyLiveAdmission,
  type ApprovedSupplyRoute,
  type DraftSupplyOperation,
  type ResourceSourceCandidate,
  type SupplyAuthority,
  validateFiniteSupplyPreflight,
} from "../src/finite_supply_gate.ts";

const source: ResourceSourceCandidate = {
  draftSourceId: "deposit.draft.ilyria.woodlot",
  intendedCanonSourceId: "deposit.ilyria.woodlot",
  status: "DESIGN_CANDIDATE",
  kind: "FINITE_DEPOSIT",
  materialCanonId: "material.ilyria.timber",
  regionId: "region.ilyria.western_routes",
  anchorLocationId: "loc.ilyria.surveyed_woodlot",
  ownerCustodianId: "npc.ilyria.woodlot_keeper",
  surveyedRecoverableKg: 200,
  protectedReserveKg: 40,
  priorExtractedThisYearKg: 20,
  annualQuotaKg: 120,
  annualRegenerationKg: 0,
  evidence: {
    surveyRef: "survey.ilyria.woodlot_mass",
    materialRef: "canon.ilyria.timber_identity",
    ownershipRef: "canon.ilyria.woodlot_title",
    extractionPermitRef: "canon.ilyria.harvest_permit",
    capacityRef: "survey.ilyria.harvest_quota",
    historyRef: "ledger.ilyria.prior_harvest",
  },
};
const route: ApprovedSupplyRoute = {
  routeId: "route.ilyria.woodlot_to_yard",
  fromLocationId: "loc.ilyria.surveyed_woodlot",
  toLocationId: "loc.ilyria.artisan_yard",
  distanceKm: 3.2,
  maximumCargoKg: 100,
  routeEvidenceRef: "canon.ilyria.route_survey",
};
const evidence = new Set([
  ...Object.values(source.evidence),
  route.routeEvidenceRef,
  "event.ilyria.extraction",
  "event.ilyria.sawmill_processing",
  "canon.ilyria.sawmill_rights",
  "canon.ilyria.sawmill_recipe",
  "event.ilyria.road_cargo",
  "canon.ilyria.road_hire_rights",
  "event.ilyria.title_transfer",
  "canon.ilyria.sale_consent",
]);
const keeper = source.ownerCustodianId;
const buyer = "npc.ilyria.carpenter";
const yard = route.toLocationId;
const wood = source.materialCanonId;
const authority: SupplyAuthority = {
  canonicalRegionIds: new Set([source.regionId]),
  canonicalLocationIds: new Set([route.fromLocationId, route.toLocationId]),
  canonicalMaterialIds: new Set([wood, "material.ilyria.wood_plank"]),
  currentCustodianIds: new Set([keeper, buyer]),
  canonicalRouteIds: new Set([route.routeId]),
  verifiedEvidenceRefs: evidence,
  existingSourceIds: new Set(),
  existingBatchIds: new Set(),
};
const extraction: DraftSupplyOperation = {
  operationId: "draft.op.ilyria.extract_1",
  kind: "EXTRACT",
  operatorCustodianId: keeper,
  inputBatchIds: [],
  outputs: [{
    batchId: "draft.batch.ilyria.raw_1",
    materialCanonId: wood,
    massKg: 90,
    locationId: route.fromLocationId,
    custodianId: keeper,
  }],
  sourceId: source.draftSourceId,
  withdrawnKg: 100,
  wasteKg: 10,
  evidenceRef: "event.ilyria.extraction",
  legalEvidenceRef: source.evidence.extractionPermitRef,
};
const sawmill: DraftSupplyOperation = {
  operationId: "draft.op.ilyria.sawmill",
  kind: "PROCESS",
  operatorCustodianId: keeper,
  inputBatchIds: ["draft.batch.ilyria.raw_1"],
  outputs: [{
    batchId: "draft.batch.ilyria.planks",
    materialCanonId: "material.ilyria.wood_plank",
    massKg: 70,
    locationId: route.fromLocationId,
    custodianId: keeper,
  }],
  wasteKg: 20,
  evidenceRef: "event.ilyria.sawmill_processing",
  legalEvidenceRef: "canon.ilyria.sawmill_rights",
  conversionEvidenceRef: "canon.ilyria.sawmill_recipe",
};
const transport: DraftSupplyOperation = {
  operationId: "draft.op.ilyria.road",
  kind: "TRANSPORT",
  operatorCustodianId: keeper,
  inputBatchIds: ["draft.batch.ilyria.planks"],
  outputs: [{
    batchId: "draft.batch.ilyria.yard_held",
    materialCanonId: "material.ilyria.wood_plank",
    massKg: 70,
    locationId: yard,
    custodianId: keeper,
  }],
  wasteKg: 0,
  evidenceRef: "event.ilyria.road_cargo",
  legalEvidenceRef: "canon.ilyria.road_hire_rights",
  routeId: route.routeId,
};
const custody: DraftSupplyOperation = {
  operationId: "draft.op.ilyria.custody",
  kind: "TRANSFER_CUSTODY",
  operatorCustodianId: keeper,
  inputBatchIds: ["draft.batch.ilyria.yard_held"],
  outputs: [{
    batchId: "draft.batch.ilyria.delivered",
    materialCanonId: "material.ilyria.wood_plank",
    massKg: 70,
    locationId: yard,
    custodianId: buyer,
  }],
  wasteKg: 0,
  evidenceRef: "event.ilyria.title_transfer",
  legalEvidenceRef: "canon.ilyria.sale_consent",
  transferEvidenceRef: "canon.ilyria.sale_consent",
};
const operations = [extraction, sawmill, transport, custody];

function preflight(ops: DraftSupplyOperation[] = operations,
  candidates: ResourceSourceCandidate[] = [source],
  paths: ApprovedSupplyRoute[] = [route],
  refs: SupplyAuthority = authority) {
  return validateFiniteSupplyPreflight({sources: candidates, routes: paths,
    operations: ops, authority: refs});
}
function rejects(callback: () => unknown, scenario: string) {
  let threw = false;
  try { callback(); } catch { threw = true; }
  if (!threw) throw new Error("Unsafe supply was accepted: " + scenario);
}

Deno.test("four-stage extraction, process, cargo and custody conserves finite material", () => {
  const r = preflight();
  if (r.state !== "VALIDATED_DESIGN_ONLY" ||
      r.operationCount !== 4 ||
      r.sources[0].proposedExtractionKg !== 100 ||
      r.sources[0].remainingUnprotectedKg !== 60 ||
      r.sources[0].remainingAnnualQuotaKg !== 0 ||
      r.unconsumedBatches.length !== 1 ||
      r.unconsumedBatches[0].custodianId !== buyer ||
      r.unconsumedBatches[0].massKg !== 70) {
    throw new Error("Conservation/custody ledger is inconsistent");
  }
});

Deno.test("source needs measured permitted finite stock and original owner", () => {
  rejects(() => preflight(operations, [{...source,
    intendedCanonSourceId: "deposit.draft.illegal"}]), "a draft ID cannot be the canon ID");
  rejects(() => preflight(operations, [{...source,
    protectedReserveKg: 150}]), "legal reserve exceeds extraction");
  rejects(() => preflight(operations, [{...source,
    annualQuotaKg: 110}]), "historical+new extraction exceeds annual quota");
  rejects(() => preflight(operations, [{...source,
    surveyedRecoverableKg: 130}]), "harvest consumes protected finite remainder");
  rejects(() => preflight(operations, [{...source,
    annualRegenerationKg: 10}]), "ore/finite stock has fictional replenishment");
  rejects(() => preflight(operations, [{...source,
    annualQuotaKg: Infinity}]), "not-a-number annual limit");
  rejects(() => preflight(operations, [{...source,
    evidence: {...source.evidence, ownershipRef: "canon.fake.title"}}]),
    "missing independently confirmed title");
  rejects(() => preflight(operations, [source], [route], {
    ...authority, existingSourceIds: new Set([source.intendedCanonSourceId]),
  }), "cannot redeclare canonical deposit");
  rejects(() => preflight(operations, [{...source,
    anchorLocationId: "loc.ilyria.imaginary_mine"}]),
    "cannot create mine next to city from design alone");
  rejects(() => preflight([{...extraction, operatorCustodianId: buyer}]),
    "operator cannot steal source with no ownership permission");
});

Deno.test("renewable source annual harvest cannot exceed demonstrated replenishment", () => {
  const renewable: ResourceSourceCandidate = {
    ...source, kind: "REGENERATIVE_SOURCE",
    annualRegenerationKg: 120,
  };
  const plan = preflight([extraction], [renewable]);
  if (plan.sources[0].remainingAnnualQuotaKg !== 0) {
    throw new Error("Renewable quota not applied to prior harvesting");
  }
  rejects(() => preflight([extraction], [{...renewable, annualRegenerationKg: 80}]),
    "annual quota exceeds verified renewable flow");
  rejects(() => preflight([extraction], [{...renewable, annualRegenerationKg: 0}]),
    "free permanent annual biomass");
});

Deno.test("no duplicate sources, input spending, free outputs or negative waste", () => {
  rejects(() => preflight([extraction, extraction]), "duplicate operation");
  rejects(() => preflight([extraction, {...extraction,
    operationId: "draft.op.ilyria.extract_2",
    outputs: [{...extraction.outputs[0],batchId: "draft.batch.ilyria.raw_2"}]}]),
    "two extractions exceed annual quota");
  rejects(() => preflight([extraction, sawmill, {...sawmill,
    operationId: "draft.op.ilyria.sawmill_2",
    outputs: [{...sawmill.outputs[0],batchId: "draft.batch.ilyria.planks_2"}]}]),
    "processing consumes already removed input");
  rejects(() => preflight([{...extraction,
    outputs: [{...extraction.outputs[0],massKg: 101}]}]),
    "more mass than extracted");
  rejects(() => preflight([{...extraction,wasteKg: -5}]), "negative extracted waste");
  rejects(() => preflight([extraction, {...sawmill,
    outputs: [{...sawmill.outputs[0],massKg: 90}],wasteKg: 0}]),
    "unaccounted mass is not allowed");
  rejects(() => preflight([extraction, {...sawmill,
    outputs: [{...sawmill.outputs[0],massKg: 100}],wasteKg: 0}]),
    "processing cannot create timber without real inputs");
  rejects(() => preflight([extraction, {...sawmill,
    inputBatchIds: [extraction.outputs[0].batchId, extraction.outputs[0].batchId]}]),
    "duplicate use within single process");
  rejects(() => preflight([extraction, {...sawmill,
    outputs: [{...sawmill.outputs[0],batchId: extraction.outputs[0].batchId}]}]),
    "cannot reuse spent instance identity");
  rejects(() => preflight([extraction, sawmill], [source], [route], {
    ...authority, existingBatchIds: new Set([sawmill.outputs[0].batchId]),
  }), "collision with already committed inventory");
});

Deno.test("route and custody must be sourced and cannot teleport or duplicate goods", () => {
  rejects(() => preflight([extraction,sawmill,{...transport,routeId: "route.ilyria.imaginary"}]),
    "transport with invented road");
  rejects(() => preflight([extraction,sawmill,transport], [source], [{
    ...route, maximumCargoKg: 60,
  }]), "transport has insufficient vehicle/route capacity");
  rejects(() => preflight([extraction,sawmill,{...transport,
    outputs: [{...transport.outputs[0],massKg: 71}]}]), "cargo gained mass");
  rejects(() => preflight([extraction,sawmill,{...transport,
    outputs: [{...transport.outputs[0],locationId: route.fromLocationId}]}]),
    "road does not lead to recorded destination");
  rejects(() => preflight([extraction,sawmill,{...transport,
    outputs: [{...transport.outputs[0],custodianId: buyer}]}]),
    "transport cannot silently change owner");
  rejects(() => preflight([extraction,sawmill,transport,{...custody,
    transferEvidenceRef: "canon.ilyria.nonexistent_receipt"}]),
    "sale without an independently verified transfer");
  rejects(() => preflight([extraction,sawmill,transport,{...custody,
    outputs: [{...custody.outputs[0],locationId: route.fromLocationId}]}]),
    "custody transfer cannot teleport cargo");
  rejects(() => preflight([extraction,sawmill,transport,{...custody,
    outputs: [{...custody.outputs[0],custodianId: keeper}]}]),
    "custody transfer needs a new holder");
});

Deno.test("design supply report never itself registers stock or money", () => {
  const report = preflight();
  const authorized = {
    report,
    intendedCanonSourceId: source.intendedCanonSourceId,
    canonicalPublishedSourceIds: new Set([source.intendedCanonSourceId]),
    persistedFiniteStockSourceIds: new Set([source.intendedCanonSourceId]),
    persistedBatchCustodyIds: new Set([custody.outputs[0].batchId]),
    committedMaterializationEventRefs: new Set(["event.ilyria.shipment_canonized"]),
    materializationEventRef: "event.ilyria.shipment_canonized",
  };
  assertSupplyLiveAdmission(authorized);
  rejects(() => assertSupplyLiveAdmission({...authorized,
    canonicalPublishedSourceIds: new Set()}), "design report is not permanent material canon");
  rejects(() => assertSupplyLiveAdmission({...authorized,
    persistedFiniteStockSourceIds: new Set()}), "unrecorded depletion of deposits");
  rejects(() => assertSupplyLiveAdmission({...authorized,
    persistedBatchCustodyIds: new Set()}), "goods cannot exist without a real owner");
  rejects(() => assertSupplyLiveAdmission({...authorized,
    committedMaterializationEventRefs: new Set()}), "no actual committed world cause");
});
