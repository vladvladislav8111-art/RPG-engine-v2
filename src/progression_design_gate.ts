/**
 * P-06 progression-only preflight. Pure, deterministic, and strictly read-only.
 * Draft P03/P04/P05 catalog entries cannot grant abilities/classes. Existing
 * engine semantic commit remains sole owner of XP, CP, resources and choices.
 *
 * P-06's four DESIGN_P06_* tables in GM PREGEN are quality indexes, NEVER
 * live truth. Their rows cannot be used as grant/offer authority.
 */
export type LegacyPattern = "stable" | "detect" | "transfer";

export type LegacyAbilityCandidate = {
  abilityId: string;
  rootId: string;
  specializationId: string;
  pattern: LegacyPattern;
  promotionGate: "BLOCK_CANON_PROMOTION";
};

export type LegacyConsolidation = {
  readonly totalTemplates: number;
  readonly stable: number;
  readonly detect: number;
  readonly transfer: number;
  readonly independentGrantCount: 0;
  readonly disposition: "TECHNIQUE_EVIDENCE_ONLY";
};

/** Audit 644 source IDs once, without creating a second "current ability" ledger. */
export function validateLegacyAbilityCollapse(
  candidates: readonly LegacyAbilityCandidate[],
): LegacyConsolidation {
  const ids = new Set<string>();
  const tally = { stable: 0, detect: 0, transfer: 0 };
  for (const row of candidates) {
    if (!row.abilityId.startsWith("ability.p03.") ||
        !row.rootId.startsWith("competence.") ||
        !row.specializationId.startsWith("spec.") ||
        row.promotionGate !== "BLOCK_CANON_PROMOTION" ||
        ids.has(row.abilityId) ||
        !["stable", "detect", "transfer"].includes(row.pattern)) {
      throw new Error("P-06 legacy candidate cannot become a separate unlocked ability");
    }
    ids.add(row.abilityId);
    tally[row.pattern]++;
  }
  if (ids.size !== 644 || tally.stable !== 255 ||
      tally.detect !== 255 || tally.transfer !== 134) {
    throw new Error("P-06 source audit does not match P-03/P-04; reconcile originals first");
  }
  return {
    totalTemplates: ids.size, ...tally,
    independentGrantCount: 0, disposition: "TECHNIQUE_EVIDENCE_ONLY",
  };
}

export type CanonicalClassRequirements = {
  classId: string;
  primaryCompetenceId: string;
  secondaryCompetenceId?: string;
  specializationId: string;
  requiredEvidenceRefs: string[];
};

export type PlayerClassChoiceEvidence = {
  generalLevel: number;
  classPoints: number;
  existingOwnedClassIds: string[];
  declaredClassId: string;
  explicitDecisionRef: string;
  demonstratedEvidenceRefs: ReadonlySet<string>;
  demonstratedSpecializationIds: ReadonlySet<string>;
  knownCompetenceIds: ReadonlySet<string>;
  actualVisibleOfferIds: ReadonlySet<string>;
  committedPlayerDecisionRefs: ReadonlySet<string>;
};

/**
 * This is not a class offer generator or a class commit. A class may only be
 * considered after a separately canonized class specification, an actual
 * available offer, player-directed choice, real trained roots and evidence.
 * One validated Class Point is the canonical first/secondary class option.
 */
export function previewCanonicalClassChoice(input: {
  requirement: CanonicalClassRequirements;
  player: PlayerClassChoiceEvidence;
  publishedCanonicalClassIds: ReadonlySet<string>;
}): { readonly classId: string; readonly classPointCost: 1;
     readonly kind: "FIRST_CLASS" | "SECONDARY_CLASS"; readonly mode: "PREVIEW_ONLY" } {
  const { requirement: req, player: p } = input;
  if (req.classId.includes(".draft.") || !req.classId.startsWith("class.") ||
      !input.publishedCanonicalClassIds.has(req.classId) ||
      p.declaredClassId !== req.classId ||
      !p.actualVisibleOfferIds.has(req.classId) ||
      !p.committedPlayerDecisionRefs.has(p.explicitDecisionRef) ||
      p.explicitDecisionRef.trim().length < 10) {
    throw new Error("Class requires permanent canon, actual current offer and explicit player selection");
  }
  if (!Number.isSafeInteger(p.generalLevel) || !Number.isSafeInteger(p.classPoints) ||
      p.classPoints < 1 || p.generalLevel < 5) {
    throw new Error("First class ordinarily requires General Level 5 and an unspent Class Point");
  }
  if (new Set(p.existingOwnedClassIds).size !== p.existingOwnedClassIds.length ||
      p.existingOwnedClassIds.includes(req.classId) ||
      p.existingOwnedClassIds.length > 1 ||
      (p.existingOwnedClassIds.length === 1 && p.generalLevel < 10)) {
    throw new Error("Secondary class requires General Level 10+, compatibility and distinct ownership");
  }
  if (!p.knownCompetenceIds.has(req.primaryCompetenceId) ||
      (req.secondaryCompetenceId && !p.knownCompetenceIds.has(req.secondaryCompetenceId)) ||
      !p.demonstratedSpecializationIds.has(req.specializationId) ||
      !req.requiredEvidenceRefs.length ||
      new Set(req.requiredEvidenceRefs).size !== req.requiredEvidenceRefs.length ||
      req.requiredEvidenceRefs.some(ref => !p.demonstratedEvidenceRefs.has(ref))) {
    throw new Error("Class prerequisite, specialization or training evidence not actually demonstrated");
  }
  return {
    classId: req.classId,
    classPointCost: 1,
    kind: p.existingOwnedClassIds.length ? "SECONDARY_CLASS" : "FIRST_CLASS",
    mode: "PREVIEW_ONLY",
  };
}

export type CandidateClassFeature = {
  featureId: string;
  classId: string;
  specializationId: string;
  type: "ACTIVE_CONTEXT" | "CONDITIONAL_PASSIVE";
  underlyingActionProfileId: string;
  requiredEvidenceRefs: readonly string[];
  overlapWithP04MechanicId?: string;
  distinctMechanicProofRef?: string;
};

export type ObservedFeatureContext = {
  chosenOwnedClassIds: ReadonlySet<string>;
  unlockedPurchasedFeatureIds: ReadonlySet<string>;
  demonstratedSpecializationIds: ReadonlySet<string>;
  registeredActionProfileIds: ReadonlySet<string>;
  observedEvidenceRefs: ReadonlySet<string>;
  approvedDistinctProofRefs: ReadonlySet<string>;
  elapsedSeconds: number;
  actualCurrentActionProfileId: string;
  actorExplicitActiveFeatureId?: string;
  playerMayObserveTrigger: boolean;
};

/** A candidate feature cannot be used as a free buff or second XP stream. */
export function previewCanonicalClassFeature(input: {
  feature: CandidateClassFeature;
  ctx: ObservedFeatureContext;
  publishedCanonicalFeatureIds: ReadonlySet<string>;
}): { readonly featureId: string; readonly sourceActionProfileId: string;
     readonly resourceAccounting: "SEMANTIC_ENGINE_ONLY"; readonly xpAward: 0;
     readonly mode: "PREVIEW_ONLY" } {
  const f = input.feature;
  const c = input.ctx;
  if (f.featureId.includes(".draft.") || !f.featureId.startsWith("feature.") ||
      !input.publishedCanonicalFeatureIds.has(f.featureId) ||
      !c.chosenOwnedClassIds.has(f.classId) ||
      !c.unlockedPurchasedFeatureIds.has(f.featureId) ||
      !c.demonstratedSpecializationIds.has(f.specializationId)) {
    throw new Error("Draft/unowned/unpurchased class feature cannot trigger");
  }
  if (!Number.isFinite(c.elapsedSeconds) || c.elapsedSeconds <= 0 ||
      !c.playerMayObserveTrigger ||
      !c.registeredActionProfileIds.has(f.underlyingActionProfileId) ||
      c.actualCurrentActionProfileId !== f.underlyingActionProfileId ||
      !f.requiredEvidenceRefs.length ||
      f.requiredEvidenceRefs.some(ref => !c.observedEvidenceRefs.has(ref))) {
    throw new Error("Feature needs positive real action time, observed physical cause and profile");
  }
  if (f.type === "ACTIVE_CONTEXT" && c.actorExplicitActiveFeatureId !== f.featureId) {
    throw new Error("Active feature requires actual user-declared intentional activation");
  }
  if (f.type !== "ACTIVE_CONTEXT" && f.type !== "CONDITIONAL_PASSIVE") {
    throw new Error("Unsupported feature type");
  }
  if (f.overlapWithP04MechanicId &&
      (!f.distinctMechanicProofRef ||
      !c.approvedDistinctProofRefs.has(f.distinctMechanicProofRef))) {
    throw new Error("Class/P04 collision cannot generate a second identical mechanical reward");
  }
  return {
    featureId: f.featureId,
    sourceActionProfileId: f.underlyingActionProfileId,
    resourceAccounting: "SEMANTIC_ENGINE_ONLY",
    xpAward: 0,
    mode: "PREVIEW_ONLY",
  };
}

/**
 * Preflight only. No engine commit call, no class point debit, no XP grant.
 * The semantic resolver must authorize every actual operation separately.
 */
export function assertNoDraftCatalogActivation(input: {
  sourceStatus: string;
  publishedCanonId: string;
  actualCanonicalRegistryIds: ReadonlySet<string>;
}): void {
  if (input.sourceStatus !== "CANON_APPROVED" ||
      !input.actualCanonicalRegistryIds.has(input.publishedCanonId) ||
      input.publishedCanonId.includes(".draft.")) {
    throw new Error("Design catalog row is not a permanent canonical gameplay effect");
  }
}
