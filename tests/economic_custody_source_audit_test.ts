import {
  auditPhysicalCustodyAndOwnership,
  type CustodyNameEvidence, type ItemOwnershipEvidence,
} from "../src/economic_custody_source_audit.ts";
import type { SourceItem } from "../src/economic_cutover_audit.ts";

const player="player.shura",artisan="npc.selarin.artisan.bowyer_herna_0437",stall="npc.selarin.pool_2003";
const sources:SourceItem[]=[
  {itemId:"item.fixture.book",templateId:"objtpl.fixture.book",qty:1,
    custodian:"Shura",location:"Shura bag",sourceRowRef:"proof.fixture.book",
    sourceVersion:1},
  {itemId:"item.fixture.drawing",templateId:"objtpl.fixture.drawing",qty:1,
    custodian:"Херна (временный держатель, владелец Шура)",location:"artisan.studio",
    sourceRowRef:"proof.fixture.drawing",sourceVersion:3},
  {itemId:"item.fixture.wholesale_paper",templateId:"objtpl.fixture.paper",qty:12,
    custodian:stall,location:"loc.fixture.stall",sourceRowRef:"proof.fixture.paper",
    sourceVersion:2},
];
const aliasEvidence:CustodyNameEvidence[]=[
  {sourceCustodianLabel:"Shura",canonicalHolderId:player,
    sourceProofRef:"proof.fixture.shura_identity"},
  {sourceCustodianLabel:"Херна (временный держатель, владелец Шура)",
    canonicalHolderId:artisan,sourceProofRef:"proof.fixture.herna_actual_custody"},
  {sourceCustodianLabel:stall,canonicalHolderId:stall,
    sourceProofRef:"proof.fixture.stall_identity"},
];
const ownerEvidence:ItemOwnershipEvidence[]=[
  {itemId:"item.fixture.book",canonicalOwnerId:player,
    saleRight:"PRIVATE",ownershipProofRef:"proof.fixture.book_owner"},
  {itemId:"item.fixture.drawing",canonicalOwnerId:player,
    saleRight:"BAILMENT",ownershipProofRef:"proof.fixture.drawing_owner"},
  {itemId:"item.fixture.wholesale_paper",canonicalOwnerId:stall,
    saleRight:"AUTHORIZED_WHOLESALE",ownershipProofRef:"proof.fixture.paper_rights"},
];
const refs=new Set([...aliasEvidence.map(x=>x.sourceProofRef),
  ...ownerEvidence.map(x=>x.ownershipProofRef)]);
const audit=(overrides:Partial<Parameters<typeof auditPhysicalCustodyAndOwnership>[0]>={})=>
  auditPhysicalCustodyAndOwnership({source:sources,aliasEvidence,ownerEvidence,
    confirmedCanonicalActorIds:new Set([player,artisan,stall]),
    independentlyVerifiedProofRefs:refs,...overrides});
Deno.test("one physical holder may legally differ from economic owner without double-owned goods",()=>{
  const result=audit();
  if(result.state!=="SOURCE_EVIDENCE_READY_NOT_MIGRATED" ||
     result.provenItemCount!==3 || result.legalSaleLotCount!==1 ||
     result.ownerDiffersFromHolderCount!==1 ||
     result.provenItems[1].physicalHolderId!==artisan ||
     result.provenItems[1].economicOwnerId!==player ||
     result.provenItems[1].sellingRight!=="BAILMENT" ||
     !result.noWritesPerformed)throw Error("Bailment/custody truth was lost");
});
Deno.test("human-readable source custodian cannot turn into a verified actor without evidence",()=>{
  const result=audit({aliasEvidence:aliasEvidence.slice(0,2)});
  if(result.state!=="BLOCKED"||!result.blockers.some(x=>x.includes("CUSTODIAN_IDENTITY_NOT_PROVEN")))
    throw Error("Unproven merchant source label was silently matched");
});
Deno.test("mere custody does not authorize sale of Shura's drawings",()=>{
  const bogusOwners=ownerEvidence.map(x=>x.itemId==="item.fixture.drawing"
    ? {...x,canonicalOwnerId:artisan,ownershipProofRef:"proof.fixture.nonexistent"}:x);
  const result=audit({ownerEvidence:bogusOwners});
  if(result.state!=="BLOCKED"||
    result.provenItems.some(x=>x.itemId==="item.fixture.drawing"&&x.sellingRight==="AUTHORIZED_RETAIL"))
    throw Error("Temporary physical custodian acquired unauthorized merchant rights");
});
Deno.test("physical goods need unique item IDs and all ownership proofs",()=>{
  const dup=audit({source:[sources[0],sources[0]]});
  if(dup.state!=="BLOCKED"||!dup.blockers.some(x=>x.startsWith("DUPLICATE_OR_INVALID_SOURCE_ITEM")))
    throw Error("Same item twice entered migration");
  const phantom=audit({ownerEvidence:[...ownerEvidence,{
    ...ownerEvidence[0],itemId:"item.fixture.invented_free_goods",
  }]});
  if(phantom.state!=="BLOCKED"||!phantom.blockers.some(x=>x.startsWith("PHANTOM_OWNERSHIP_ITEM")))
    throw Error("Imagined item included in custody mapping");
});
