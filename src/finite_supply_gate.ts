/**
 * A-02/A-03: read-only preflight of finite material sources and supply plans.
 *
 * All inputs must be independently supported by permanent canon and
 * authoritative CURRENT evidence. This module does not create deposits,
 * inventory, real offers, payments, travel, quests, or any live process.
 */

export type ResourceSourceCandidate = {
  draftSourceId: string;
  intendedCanonSourceId: string;
  status: "DESIGN_CANDIDATE";
  kind: "FINITE_DEPOSIT" | "REGENERATIVE_SOURCE";
  materialCanonId: string;
  regionId: string;
  anchorLocationId: string;
  ownerCustodianId: string;
  surveyedRecoverableKg: number;
  protectedReserveKg: number;
  priorExtractedThisYearKg: number;
  annualQuotaKg: number;
  annualRegenerationKg: number;
  evidence: {
    surveyRef: string;
    materialRef: string;
    ownershipRef: string;
    extractionPermitRef: string;
    capacityRef: string;
    historyRef: string;
  };
};

export type ApprovedSupplyRoute = {
  routeId: string;
  fromLocationId: string;
  toLocationId: string;
  distanceKm: number;
  maximumCargoKg: number;
  routeEvidenceRef: string;
};

export type DraftSupplyBatch = {
  batchId: string;
  materialCanonId: string;
  massKg: number;
  locationId: string;
  custodianId: string;
};

export type DraftSupplyOperation = {
  operationId: string;
  kind: "EXTRACT" | "PROCESS" | "TRANSPORT" | "TRANSFER_CUSTODY";
  operatorCustodianId: string;
  inputBatchIds: string[];
  outputs: DraftSupplyBatch[];
  sourceId?: string;
  withdrawnKg?: number;
  wasteKg: number;
  evidenceRef: string;
  legalEvidenceRef: string;
  conversionEvidenceRef?: string;
  transferEvidenceRef?: string;
  routeId?: string;
};

export type SupplyAuthority = {
  canonicalRegionIds: ReadonlySet<string>;
  canonicalLocationIds: ReadonlySet<string>;
  canonicalMaterialIds: ReadonlySet<string>;
  currentCustodianIds: ReadonlySet<string>;
  canonicalRouteIds: ReadonlySet<string>;
  verifiedEvidenceRefs: ReadonlySet<string>;
  existingSourceIds: ReadonlySet<string>;
  existingBatchIds: ReadonlySet<string>;
};

export type SupplyPreflight = {
  readonly state: "VALIDATED_DESIGN_ONLY";
  readonly sources: ReadonlyArray<{
    intendedCanonSourceId: string;
    proposedExtractionKg: number;
    remainingUnprotectedKg: number;
    remainingAnnualQuotaKg: number;
  }>;
  readonly unconsumedBatches: ReadonlyArray<DraftSupplyBatch>;
  readonly operationCount: number;
};

const nonnegative = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
const positive = (n: unknown): n is number => nonnegative(n) && n > 0;
const stable = (id: string): boolean => /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(id);
const draft = (id: string): boolean => id.includes(".draft.") || id.startsWith("draft.");
const tol = 1e-6;

function validEvidence(ref: string | undefined, trusted: ReadonlySet<string>): boolean {
  return typeof ref === "string" && stable(ref) && trusted.has(ref);
}

function sameMass(actual: number, expected: number): boolean {
  return Number.isFinite(actual) && Number.isFinite(expected) &&
    Math.abs(actual - expected) <= tol;
}

export function validateFiniteSupplyPreflight(input: {
  sources: ResourceSourceCandidate[];
  routes: ApprovedSupplyRoute[];
  operations: DraftSupplyOperation[];
  authority: SupplyAuthority;
}): SupplyPreflight {
  const { sources, routes, operations, authority } = input;
  if (!sources.length || !operations.length) {
    throw new Error("Supply preflight needs finite real-source candidates and operations");
  }
  const sourceIndex = new Map<string, ResourceSourceCandidate>();
  const canonSourceIds = new Set<string>();
  const extracted = new Map<string, number>();
  for (const source of sources) {
    if (source.status !== "DESIGN_CANDIDATE" ||
        !stable(source.draftSourceId) || !draft(source.draftSourceId) ||
        !stable(source.intendedCanonSourceId) || draft(source.intendedCanonSourceId) ||
        sourceIndex.has(source.draftSourceId) ||
        canonSourceIds.has(source.intendedCanonSourceId) ||
        authority.existingSourceIds.has(source.intendedCanonSourceId) ||
        !authority.canonicalRegionIds.has(source.regionId) ||
        !authority.canonicalLocationIds.has(source.anchorLocationId) ||
        !authority.canonicalMaterialIds.has(source.materialCanonId) ||
        !authority.currentCustodianIds.has(source.ownerCustodianId) ||
        !Object.values(source.evidence).every((ref) =>
          validEvidence(ref, authority.verifiedEvidenceRefs))) {
      throw new Error("Unapproved source identity, ownership, geology or survey evidence");
    }
    if (!positive(source.surveyedRecoverableKg) ||
        !nonnegative(source.protectedReserveKg) ||
        !nonnegative(source.priorExtractedThisYearKg) ||
        !positive(source.annualQuotaKg) ||
        !nonnegative(source.annualRegenerationKg) ||
        source.protectedReserveKg > source.surveyedRecoverableKg ||
        source.priorExtractedThisYearKg > source.annualQuotaKg) {
      throw new Error("Source stock/reserve/annual extraction figures are not finite");
    }
    if (source.kind === "FINITE_DEPOSIT") {
      if (source.annualRegenerationKg !== 0) {
        throw new Error("A finite deposit cannot claim replenishment");
      }
    } else if (source.kind === "REGENERATIVE_SOURCE") {
      if (!positive(source.annualRegenerationKg) ||
          source.annualQuotaKg > source.annualRegenerationKg) {
        throw new Error("Regenerative annual harvest exceeds demonstrated replenishment");
      }
    } else {
      throw new Error("Unknown resource generation mechanism");
    }
    sourceIndex.set(source.draftSourceId, source);
    canonSourceIds.add(source.intendedCanonSourceId);
    extracted.set(source.draftSourceId, 0);
  }

  const routeIndex = new Map<string, ApprovedSupplyRoute>();
  for (const route of routes) {
    if (!stable(route.routeId) || draft(route.routeId) ||
        routeIndex.has(route.routeId) ||
        !authority.canonicalRouteIds.has(route.routeId) ||
        !authority.canonicalLocationIds.has(route.fromLocationId) ||
        !authority.canonicalLocationIds.has(route.toLocationId) ||
        route.fromLocationId === route.toLocationId ||
        !positive(route.distanceKm) || !positive(route.maximumCargoKg) ||
        !validEvidence(route.routeEvidenceRef, authority.verifiedEvidenceRefs)) {
      throw new Error("Route requires pre-existing measured geography and cargo capacity");
    }
    routeIndex.set(route.routeId, route);
  }

  const unspentBatches = new Map<string, DraftSupplyBatch>();
  const mintedIds = new Set<string>();
  const operationIds = new Set<string>();
  for (const op of operations) {
    if (!stable(op.operationId) || !draft(op.operationId) ||
        operationIds.has(op.operationId) ||
        !authority.currentCustodianIds.has(op.operatorCustodianId) ||
        !validEvidence(op.evidenceRef, authority.verifiedEvidenceRefs) ||
        !validEvidence(op.legalEvidenceRef, authority.verifiedEvidenceRefs) ||
        !nonnegative(op.wasteKg) || !op.outputs.length) {
      throw new Error("Supply action needs unique ID, real operator, permit and evidence");
    }
    operationIds.add(op.operationId);

    if (new Set(op.inputBatchIds).size !== op.inputBatchIds.length) {
      throw new Error("One operation cannot consume an input batch twice");
    }
    const inputs = op.inputBatchIds.map((id) => {
      const batch = unspentBatches.get(id);
      if (!batch) throw new Error("Supply source batch missing or already consumed: " + id);
      return batch;
    });
    for (const output of op.outputs) {
      if (!stable(output.batchId) || !draft(output.batchId) ||
          mintedIds.has(output.batchId) ||
          authority.existingBatchIds.has(output.batchId) ||
          !authority.canonicalMaterialIds.has(output.materialCanonId) ||
          !authority.canonicalLocationIds.has(output.locationId) ||
          !authority.currentCustodianIds.has(output.custodianId) ||
          !positive(output.massKg)) {
        throw new Error("Output needs new unique batch ID, known material and one real custodian");
      }
      mintedIds.add(output.batchId);
    }

    const inputMass = inputs.reduce((sum, b) => sum + b.massKg, 0);
    const outputMass = op.outputs.reduce((sum, b) => sum + b.massKg, 0);
    if (!Number.isFinite(inputMass) || !Number.isFinite(outputMass)) {
      throw new Error("Overflow in physical mass ledger");
    }

    if (op.kind === "EXTRACT") {
      const source = sourceIndex.get(op.sourceId ?? "");
      if (!source || inputs.length || !positive(op.withdrawnKg) ||
          !sameMass(op.withdrawnKg, outputMass + op.wasteKg) ||
          op.outputs.some((b) => b.locationId !== source.anchorLocationId ||
            b.custodianId !== source.ownerCustodianId ||
            b.materialCanonId !== source.materialCanonId) ||
          op.operatorCustodianId !== source.ownerCustodianId ||
          op.routeId || op.transferEvidenceRef || op.conversionEvidenceRef) {
        throw new Error("Extraction needs measured material, original owner and exact yield/waste");
      }
      const next = (extracted.get(source.draftSourceId) ?? 0) + op.withdrawnKg;
      if (!Number.isFinite(next) ||
          next > source.surveyedRecoverableKg - source.protectedReserveKg + tol ||
          next + source.priorExtractedThisYearKg > source.annualQuotaKg + tol) {
        throw new Error("Extraction exceeds protected finite reserves or remaining annual quota");
      }
      extracted.set(source.draftSourceId, next);
    } else if (op.kind === "PROCESS") {
      if (!inputs.length || op.sourceId || op.withdrawnKg !== undefined ||
          op.routeId || op.transferEvidenceRef ||
          !validEvidence(op.conversionEvidenceRef, authority.verifiedEvidenceRefs) ||
          inputs.some((b) => b.custodianId !== op.operatorCustodianId) ||
          inputs.some((b) => b.locationId !== inputs[0].locationId) ||
          op.outputs.some((b) => b.custodianId !== op.operatorCustodianId ||
            b.locationId !== inputs[0].locationId) ||
          !sameMass(inputMass, outputMass + op.wasteKg)) {
        throw new Error("Processing requires a real same-site input, transformation proof and conservation");
      }
    } else if (op.kind === "TRANSPORT") {
      const route = routeIndex.get(op.routeId ?? "");
      if (inputs.length !== 1 || op.outputs.length !== 1 ||
          op.sourceId || op.withdrawnKg !== undefined ||
          op.transferEvidenceRef || op.conversionEvidenceRef ||
          !route || inputs[0].custodianId !== op.operatorCustodianId ||
          inputs[0].locationId !== route.fromLocationId ||
          op.outputs[0].locationId !== route.toLocationId ||
          op.outputs[0].custodianId !== inputs[0].custodianId ||
          op.outputs[0].materialCanonId !== inputs[0].materialCanonId ||
          op.wasteKg !== 0 || !sameMass(inputMass, outputMass) ||
          inputMass > route.maximumCargoKg + tol) {
        throw new Error("Transport requires real traversable finite-capacity route and unchanged custody/mass");
      }
    } else if (op.kind === "TRANSFER_CUSTODY") {
      if (inputs.length !== 1 || op.outputs.length !== 1 ||
          op.sourceId || op.withdrawnKg !== undefined ||
          op.routeId || op.conversionEvidenceRef ||
          !validEvidence(op.transferEvidenceRef, authority.verifiedEvidenceRefs) ||
          inputs[0].custodianId !== op.operatorCustodianId ||
          op.outputs[0].custodianId === inputs[0].custodianId ||
          op.outputs[0].locationId !== inputs[0].locationId ||
          op.outputs[0].materialCanonId !== inputs[0].materialCanonId ||
          op.wasteKg !== 0 || !sameMass(inputMass, outputMass)) {
        throw new Error("Custody transfer needs a documented new holder and no physical multiplication");
      }
    } else {
      throw new Error("Unsupported supply operation kind");
    }
    // Mutation is local to the candidate-only scratch ledger.
    for (const b of inputs) unspentBatches.delete(b.batchId);
    for (const b of op.outputs) unspentBatches.set(b.batchId, {...b});
  }
  return {
    state: "VALIDATED_DESIGN_ONLY",
    sources: sources.map((s) => {
      const used = extracted.get(s.draftSourceId) ?? 0;
      return {
        intendedCanonSourceId: s.intendedCanonSourceId,
        proposedExtractionKg: used,
        remainingUnprotectedKg: s.surveyedRecoverableKg - s.protectedReserveKg - used,
        remainingAnnualQuotaKg: s.annualQuotaKg - s.priorExtractedThisYearKg - used,
      };
    }),
    unconsumedBatches: [...unspentBatches.values()],
    operationCount: operationIds.size,
  };
}

/**
 * Validating candidate supply plans is never the act of creating market stock.
 * Both physical source ledger, custody ledger, provenance and transaction
 * history must be separately committed by the runtime.
 * This assertion itself performs NO writes.
 */
export function assertSupplyLiveAdmission(input: {
  report: SupplyPreflight;
  intendedCanonSourceId: string;
  canonicalPublishedSourceIds: ReadonlySet<string>;
  persistedFiniteStockSourceIds: ReadonlySet<string>;
  persistedBatchCustodyIds: ReadonlySet<string>;
  committedMaterializationEventRefs: ReadonlySet<string>;
  materializationEventRef: string;
}): void {
  const r = input.report;
  const s = r.sources.find((source) =>
    source.intendedCanonSourceId === input.intendedCanonSourceId);
  if (r.state !== "VALIDATED_DESIGN_ONLY" || !s ||
      !input.canonicalPublishedSourceIds.has(input.intendedCanonSourceId) ||
      !input.persistedFiniteStockSourceIds.has(input.intendedCanonSourceId) ||
      r.unconsumedBatches.some((batch) =>
        !input.persistedBatchCustodyIds.has(batch.batchId)) ||
      !validEvidence(input.materializationEventRef,
        input.committedMaterializationEventRefs)) {
    throw new Error("Supply plan cannot become live without canon, exact stock/custody and committed event");
  }
}
