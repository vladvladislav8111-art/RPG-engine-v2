import {
  previewFiniteLaborOffers,
  previewFiniteMarketStock,
  verifyExistingLeaseConflicts,
  type EmployerCurrentFunds,
  type HousingSourceAuthority,
  type LaborAuthority,
  type LeaseRecord,
  type PendingWorkOffer,
  type CurrentPhysicalLot,
  type ProposedCounterOffer,
  type ShopCurrentAuthority,
} from "../src/selarin_economic_admission.ts";
function denied(f: () => unknown, label: string) {
  let rejected = false;
  try { f(); } catch { rejected = true; }
  if (!rejected) throw new Error("Unsafe city proposal accepted: " + label);
}

// All example.* names/quantities are test-only, not permanent RPG canon.
const premises="loc.example.upper_gallery";
const room="loc.example.upper_gallery.room_a";
const landlord="npc.example.landlord";
const lessee="npc.example.renter";
const lease:LeaseRecord={
  leaseId:"lease.example.first",
  canonicalPremiseId:premises,
  canonicalUnitId:room,
  tenantId:lessee,
  landlordId:landlord,
  startGameMinute:100,
  endGameMinute:300,
  currentCommittedProofId:"receipt.example.signed_lease",
};
const homeAuthority:HousingSourceAuthority={
  canonicalPremiseIds:new Set([premises]),
  canonicalUnitIds:new Set([room]),
  verifiedTenantIds:new Set([lessee,"npc.example.other_renter"]),
  verifiedLandlordIds:new Set([landlord]),
  committedLeaseProofIds:new Set([
    lease.currentCommittedProofId, "receipt.example.second_lease",
  ]),
};
const verifyLeases=(leases:LeaseRecord[]=[lease],a:HousingSourceAuthority=homeAuthority)=>
  verifyExistingLeaseConflicts({leases,authority:a});

Deno.test("existing paid lease stays one physical unit, nothing is booked or charged",()=>{
  const receipt=verifyLeases();
  if(receipt.mode!=="AUDIT_ONLY"||receipt.inspectedLeases!==1) {
    throw new Error("Incorrect actual leased unit audit");
  }
  const nonOverlapping:LeaseRecord={...lease,leaseId:"lease.example.second",
    tenantId:"npc.example.other_renter",startGameMinute:300,
    endGameMinute:500,currentCommittedProofId:"receipt.example.second_lease"};
  if(verifyLeases([lease,nonOverlapping]).inspectedLeases!==2) {
    throw new Error("Nonoverlapping future independently paid lease blocked");
  }
  denied(()=>verifyLeases([lease,{...nonOverlapping,startGameMinute:299}]),
    "same room double-rented");
  denied(()=>verifyLeases([lease,{...lease}]),"duplicate lease identity");
  denied(()=>verifyLeases([{...lease,currentCommittedProofId:"receipt.fake"}]),
    "asserted lease without current proof");
  denied(()=>verifyLeases([{...lease,canonicalUnitId:premises}]),
    "one full building is not automatically one certified room");
  denied(()=>verifyLeases([{...lease,tenantId:"npc.example.unknown"}]),
    "unknown resident");
  denied(()=>verifyLeases([{...lease,endGameMinute:100}]),
    "no duration");
});

const employer="npc.example.merchant";
const payroll:EmployerCurrentFunds={
  employerId:employer,
  availableCopper:100,
  previouslyReservedCopper:20,
  sourceLedgerRevision:"revision.example.current_11",
  verifiedFundsEvidenceRef:"ledger.example.funded",
};
const first:PendingWorkOffer={
  offerId:"offer.example.new_verification",
  employerId:employer,
  actualCurrentTaskDemandId:"demand.example.work_01",
  paidCopper:50,
  currentEmployerAuthorized:true,
  qualifiedEmployeeSlotAvailable:true,
  verifiedOfferSourceEvidenceRef:"case.example.work_01",
};
const second:PendingWorkOffer={
  ...first,offerId:"offer.example.new_unpack",
  actualCurrentTaskDemandId:"demand.example.work_02",
  paidCopper:20,
  verifiedOfferSourceEvidenceRef:"case.example.work_02",
};
const laborAuth:LaborAuthority={
  canonicalEmployerIds:new Set([employer]),
  activeDemandIds:new Set([first.actualCurrentTaskDemandId,second.actualCurrentTaskDemandId]),
  verifiedEvidenceRefs:new Set(["ledger.example.funded",first.verifiedOfferSourceEvidenceRef,
    second.verifiedOfferSourceEvidenceRef]),
  historicalCompletedOpportunityIds:new Set(["opportunity.example.old_paid"]),
  alreadyCurrentLiveOfferIds:new Set(["offer.example.already_active"]),
  currentLedgerRevision:payroll.sourceLedgerRevision,
};
const previewLabor=(offers:PendingWorkOffer[]=[first,second],
  funds:EmployerCurrentFunds[]=[payroll],authority:LaborAuthority=laborAuth)=>
  previewFiniteLaborOffers({employerFunds:funds,proposedOffers:offers,authority});

Deno.test("independent employer work draws from one documented finite wage budget",()=>{
  const r=previewLabor();
  if(r.plannedOfferCount!==2||r.byEmployerReservedCopper[employer]!==70||
     r.mode!=="UNMATERIALIZED_DESIGN_ONLY"){
    throw new Error("Incorrect shared payroll reservation plan");
  }
  denied(()=>previewLabor([{...first,paidCopper:90}]),"unfunded wages");
  denied(()=>previewLabor([first,{...second,paidCopper:40}]),"two jobs overspend the same free budget");
  denied(()=>previewLabor([first,{...second,actualCurrentTaskDemandId:first.actualCurrentTaskDemandId}]),
    "duplicate employer task demand");
  denied(()=>previewLabor([first,first]),"duplicate offer identity");
  denied(()=>previewLabor([{...first,offerId:"opportunity.example.old_paid"}]),
    "reopen an already paid Shura job");
  denied(()=>previewLabor([{...first,offerId:"offer.example.already_active"}]),
    "same currently materialized offer twice");
  denied(()=>previewLabor([{...first,qualifiedEmployeeSlotAvailable:false}]),
    "job board creates workers from air");
  denied(()=>previewLabor([{...first,currentEmployerAuthorized:false}]),
    "invented employer permission");
  denied(()=>previewLabor([{...first,actualCurrentTaskDemandId:"demand.example.imaginary"}]),
    "work without actual business demand");
  denied(()=>previewLabor([first],[{...payroll,sourceLedgerRevision:"revision.example.old"}]),
    "read stale budget as today's available money");
  denied(()=>previewLabor([first],[{...payroll,availableCopper:Infinity}]),
    "infinite payroll");
});

const vendor="npc.example.bookseller";
const venue="loc.example.books_counter";
const item="item.example.single_book";
const stock:CurrentPhysicalLot={
  itemId:item,
  materialTemplateId:"object.example.book",
  quantity:2,
  custodianId:vendor,
  physicalLocationId:venue,
  currentLedgerRevision:"revision.example.current_11",
  saleRights:"RETAIL_AVAILABLE",
  currentStockEvidenceRef:"receipt.example.current_stock",
};
const privateStock:CurrentPhysicalLot={
  ...stock,itemId:"item.example.personal_sketch",
  quantity:1,saleRights:"PRIVATE",
};
const borrowed:CurrentPhysicalLot={
  ...stock,itemId:"item.example.borrowed_diagram",
  quantity:1,saleRights:"BAILMENT",
};
const consigned:CurrentPhysicalLot={
  ...stock,itemId:"item.example.unverified_consign",
  quantity:1,saleRights:"CONSIGNMENT_REVIEW",
};
const firstBuy:ProposedCounterOffer={
  offerId:"counter.example.book_01",
  itemId:item,vendorId:vendor,
  shopLocationId:venue,requestedQuantity:1,
  quoteCopperEach:25,
  lawfulCurrentSellerAuthorityRef:"permit.example.sale",
};
const secondBuy:ProposedCounterOffer={...firstBuy,offerId:"counter.example.book_02"};
const shopAuth:ShopCurrentAuthority={
  knownItemIds:new Set([item,privateStock.itemId,borrowed.itemId,consigned.itemId]),
  canonicalMaterialIds:new Set(["object.example.book"]),
  canonicalSellerIds:new Set([vendor]),
  canonicalShopLocationIds:new Set([venue]),
  currentCommittedEvidenceRefs:new Set([stock.currentStockEvidenceRef,
    firstBuy.lawfulCurrentSellerAuthorityRef]),
  currentLedgerRevision:stock.currentLedgerRevision,
};
const market=(offers:ProposedCounterOffer[]=[firstBuy,secondBuy],
  lots:CurrentPhysicalLot[]=[stock,privateStock,borrowed,consigned],
  auth:ShopCurrentAuthority=shopAuth)=>
  previewFiniteMarketStock({currentLots:lots,proposedCounterOffers:offers,authority:auth});

Deno.test("multiple market offers cannot consume more item custody than exists",()=>{
  const r=market();
  if(r.proposedOfferCount!==2 || r.allocatedQuantityByItem[item]!==2 ||
     r.mode!=="UNMATERIALIZED_DESIGN_ONLY") {
    throw new Error("Market should not create or sell stock on preflight");
  }
  denied(()=>market([firstBuy,secondBuy,{...secondBuy,offerId:"counter.example.third"}]),
    "same two books sold to three buyers");
  denied(()=>market([firstBuy,firstBuy]),"one counter offer twice");
  denied(()=>market([{...firstBuy,itemId:privateStock.itemId}]),
    "Vesha's personal sketch is private, not shop stock");
  denied(()=>market([{...firstBuy,itemId:borrowed.itemId}]),
    "borrowed drawing is not for sale");
  denied(()=>market([{...firstBuy,itemId:consigned.itemId}]),
    "consignment under review");
  denied(()=>market([{...firstBuy,vendorId:"npc.example.other"}]),
    "wrong custodian sells other's goods");
  denied(()=>market([{...firstBuy,shopLocationId:"loc.example.different"}]),
    "teleport goods to another counter");
  denied(()=>market([firstBuy],[{...stock,currentLedgerRevision:"revision.example.stale"}]),
    "stale shelf inventory");
  denied(()=>market([firstBuy],[stock,stock]),"same physical item recorded twice");
  denied(()=>market([{...firstBuy,quoteCopperEach:0}]),"unfunded zero-price sale");
  denied(()=>market([{...firstBuy,lawfulCurrentSellerAuthorityRef:"permit.example.absent"}]),
    "shop authorization missing");
  denied(()=>market([firstBuy],[{...stock,quantity:Infinity}]),"infinite books");
});
