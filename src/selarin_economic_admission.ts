/**
 * C-06/EC-06 read-only admission checks for a large, physically persistent city.
 *
 * The authoritative committed runtime owns leases, jobs, money, custody,
 * inventory and clocks. This module MUST receive a single current runtime
 * snapshot, and cannot create a lease, goods, employer or transaction.
 *
 * All DESIGN_C06_* / DESIGN_EC06_* rows in GM PREGEN are NEVER_IN_LIVE_PLAY.
 */
const wholePositive = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const wholeNonnegative = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const validId = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(v);

export type LeaseRecord = {
  leaseId: string;
  canonicalPremiseId: string;
  canonicalUnitId: string;
  tenantId: string;
  landlordId: string;
  startGameMinute: number;
  endGameMinute: number;
  currentCommittedProofId: string;
};

export type HousingSourceAuthority = {
  canonicalPremiseIds: ReadonlySet<string>;
  canonicalUnitIds: ReadonlySet<string>;
  verifiedTenantIds: ReadonlySet<string>;
  verifiedLandlordIds: ReadonlySet<string>;
  committedLeaseProofIds: ReadonlySet<string>;
};

/**
 * A permanent address is NOT evidence of a vacant bed.
 * Every actual rental unit must already be independently identified in the
 * committed source. Overlap is rejected even if the tenants differ.
 *
 * This function NEVER books a room or debits an advance/security pledge.
 */
export function verifyExistingLeaseConflicts(input: {
  leases: readonly LeaseRecord[];
  authority: HousingSourceAuthority;
}): { readonly mode: "AUDIT_ONLY"; readonly inspectedLeases: number } {
  const { leases, authority: a } = input;
  const ids = new Set<string>();
  const perUnit = new Map<string, LeaseRecord[]>();
  for (const l of leases) {
    if (!validId(l.leaseId) || ids.has(l.leaseId) ||
        !a.canonicalPremiseIds.has(l.canonicalPremiseId) ||
        !a.canonicalUnitIds.has(l.canonicalUnitId) ||
        !l.canonicalUnitId.startsWith(l.canonicalPremiseId + ".") ||
        !a.verifiedTenantIds.has(l.tenantId) ||
        !a.verifiedLandlordIds.has(l.landlordId) ||
        l.tenantId === l.landlordId ||
        !a.committedLeaseProofIds.has(l.currentCommittedProofId) ||
        !wholeNonnegative(l.startGameMinute) ||
        !wholePositive(l.endGameMinute) ||
        l.endGameMinute <= l.startGameMinute) {
      throw new Error("Lease needs sourced persons, distinct unit, interval and real current contract");
    }
    ids.add(l.leaseId);
    const existing = perUnit.get(l.canonicalUnitId) ?? [];
    for (const e of existing) {
      if (l.startGameMinute < e.endGameMinute &&
          e.startGameMinute < l.endGameMinute) {
        throw new Error("Same physical rental unit has overlapping tenants");
      }
    }
    existing.push(l);
    perUnit.set(l.canonicalUnitId, existing);
  }
  return {mode:"AUDIT_ONLY",inspectedLeases:leases.length};
}

export type EmployerCurrentFunds = {
  employerId: string;
  availableCopper: number;
  previouslyReservedCopper: number;
  sourceLedgerRevision: string;
  verifiedFundsEvidenceRef: string;
};

export type PendingWorkOffer = {
  offerId: string;
  employerId: string;
  actualCurrentTaskDemandId: string;
  paidCopper: number;
  currentEmployerAuthorized: boolean;
  qualifiedEmployeeSlotAvailable: boolean;
  verifiedOfferSourceEvidenceRef: string;
};

export type LaborAuthority = {
  canonicalEmployerIds: ReadonlySet<string>;
  activeDemandIds: ReadonlySet<string>;
  verifiedEvidenceRefs: ReadonlySet<string>;
  historicalCompletedOpportunityIds: ReadonlySet<string>;
  alreadyCurrentLiveOfferIds: ReadonlySet<string>;
  currentLedgerRevision: string;
};

/**
 * Previous completed Shura jobs are historical proof of a profession, not
 * automatically funded/open future vacancies. Fund all new proposals from
 * the same finite employer budget, never player level or a board template.
 */
export function previewFiniteLaborOffers(input: {
  employerFunds: readonly EmployerCurrentFunds[];
  proposedOffers: readonly PendingWorkOffer[];
  authority: LaborAuthority;
}): {
  readonly mode: "UNMATERIALIZED_DESIGN_ONLY";
  readonly plannedOfferCount: number;
  readonly byEmployerReservedCopper: Readonly<Record<string, number>>;
} {
  const { employerFunds, proposedOffers, authority: a } = input;
  if (!employerFunds.length || !proposedOffers.length) {
    throw new Error("Labor proposals need real current funding and actual work demand");
  }
  const funds = new Map<string, EmployerCurrentFunds>();
  for (const e of employerFunds) {
    if (!a.canonicalEmployerIds.has(e.employerId) ||
        funds.has(e.employerId) ||
        !wholeNonnegative(e.availableCopper) ||
        !wholeNonnegative(e.previouslyReservedCopper) ||
        e.previouslyReservedCopper > e.availableCopper ||
        !validId(e.sourceLedgerRevision) ||
        e.sourceLedgerRevision !== a.currentLedgerRevision ||
        !a.verifiedEvidenceRefs.has(e.verifiedFundsEvidenceRef)) {
      throw new Error("Employer fund cannot be synthetic, stale or over-reserved");
    }
    funds.set(e.employerId,e);
  }

  const offerIds = new Set<string>();
  const spent = new Map<string, number>();
  const demandIds = new Set<string>();
  for (const o of proposedOffers) {
    if (!validId(o.offerId) || offerIds.has(o.offerId) ||
        a.historicalCompletedOpportunityIds.has(o.offerId) ||
        a.alreadyCurrentLiveOfferIds.has(o.offerId) ||
        !funds.has(o.employerId) ||
        !a.activeDemandIds.has(o.actualCurrentTaskDemandId) ||
        demandIds.has(o.actualCurrentTaskDemandId) ||
        !wholePositive(o.paidCopper) ||
        o.currentEmployerAuthorized !== true ||
        o.qualifiedEmployeeSlotAvailable !== true ||
        !a.verifiedEvidenceRefs.has(o.verifiedOfferSourceEvidenceRef)) {
      throw new Error("Cannot create vacancy from stale, paid or fictitious work");
    }
    offerIds.add(o.offerId);
    demandIds.add(o.actualCurrentTaskDemandId);
    const next=(spent.get(o.employerId)??0)+o.paidCopper;
    const budget=funds.get(o.employerId)!;
    if (!Number.isSafeInteger(next) ||
        next>budget.availableCopper-budget.previouslyReservedCopper) {
      throw new Error("Employers cannot promise more wages than their real free budget");
    }
    spent.set(o.employerId,next);
  }
  return {
    mode:"UNMATERIALIZED_DESIGN_ONLY",
    plannedOfferCount:offerIds.size,
    byEmployerReservedCopper:Object.fromEntries(spent),
  };
}

export type CurrentPhysicalLot = {
  itemId: string;
  materialTemplateId: string;
  quantity: number;
  custodianId: string;
  physicalLocationId: string;
  currentLedgerRevision: string;
  saleRights: "RETAIL_AVAILABLE" | "PRIVATE" | "BAILMENT" | "CONSIGNMENT_REVIEW";
  currentStockEvidenceRef: string;
};

export type ProposedCounterOffer = {
  offerId: string;
  itemId: string;
  vendorId: string;
  shopLocationId: string;
  requestedQuantity: number;
  quoteCopperEach: number;
  lawfulCurrentSellerAuthorityRef: string;
};

export type ShopCurrentAuthority = {
  knownItemIds: ReadonlySet<string>;
  canonicalMaterialIds: ReadonlySet<string>;
  canonicalSellerIds: ReadonlySet<string>;
  canonicalShopLocationIds: ReadonlySet<string>;
  currentCommittedEvidenceRefs: ReadonlySet<string>;
  currentLedgerRevision: string;
};

export function previewFiniteMarketStock(input: {
  currentLots: readonly CurrentPhysicalLot[];
  proposedCounterOffers: readonly ProposedCounterOffer[];
  authority: ShopCurrentAuthority;
}): {
  readonly mode: "UNMATERIALIZED_DESIGN_ONLY";
  readonly proposedOfferCount: number;
  readonly allocatedQuantityByItem: Readonly<Record<string,number>>;
} {
  const { currentLots: lots, proposedCounterOffers: offers, authority: a } = input;
  if (!lots.length || !offers.length) throw new Error("A seller needs genuine live physical stock");
  const items = new Map<string,CurrentPhysicalLot>();
  for(const lot of lots){
    if (!a.knownItemIds.has(lot.itemId) || items.has(lot.itemId) ||
        !a.canonicalMaterialIds.has(lot.materialTemplateId) ||
        !wholePositive(lot.quantity) ||
        !a.canonicalSellerIds.has(lot.custodianId) ||
        !a.canonicalShopLocationIds.has(lot.physicalLocationId) ||
        !validId(lot.currentLedgerRevision) ||
        lot.currentLedgerRevision!==a.currentLedgerRevision ||
        !a.currentCommittedEvidenceRefs.has(lot.currentStockEvidenceRef)) {
      throw new Error("Stock needs unique physical item, one current holder and current evidence");
    }
    items.set(lot.itemId,lot);
  }
  const offerIds = new Set<string>();
  const allocated = new Map<string,number>();
  for(const offer of offers){
    const lot=items.get(offer.itemId);
    if (!lot ||
        !validId(offer.offerId) || offerIds.has(offer.offerId) ||
        lot.saleRights!=="RETAIL_AVAILABLE" ||
        offer.vendorId!==lot.custodianId ||
        offer.shopLocationId!==lot.physicalLocationId ||
        !wholePositive(offer.requestedQuantity) ||
        !wholePositive(offer.quoteCopperEach) ||
        !a.currentCommittedEvidenceRefs.has(offer.lawfulCurrentSellerAuthorityRef)){
      throw new Error("Private, consigned, borrowed or unsourced items are not free shop inventory");
    }
    offerIds.add(offer.offerId);
    const next=(allocated.get(offer.itemId)??0)+offer.requestedQuantity;
    if (!Number.isSafeInteger(next) || next>lot.quantity) {
      throw new Error("Cannot sell one physical batch more times than it exists");
    }
    allocated.set(offer.itemId,next);
  }
  return {
    mode:"UNMATERIALIZED_DESIGN_ONLY",
    proposedOfferCount:offerIds.size,
    allocatedQuantityByItem:Object.fromEntries(allocated),
  };
}
