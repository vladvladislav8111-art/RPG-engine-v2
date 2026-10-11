/**
 * EC-06 pre-migration: keep actual physical CUSTODIAN distinct from OWNER.
 *
 * Real INVENTORY_CURRENT has mixed human-readable custodians (e.g. "Shura")
 * and canonical NPC IDs. A diagram held by another person may still belong
 * to Shura. No account/financial ownership can be inferred from those labels.
 * Read-only gate; it NEVER writes owner/custody, money, escrow or a live scene.
 */
import type { SourceItem } from "./economic_cutover_audit.ts";

export type CustodyNameEvidence = {
  sourceCustodianLabel: string;
  canonicalHolderId: string;
  sourceProofRef: string;
};
export type ItemOwnershipEvidence = {
  itemId: string;
  canonicalOwnerId: string;
  saleRight:
    "PRIVATE" | "BAILMENT" | "CONSIGNMENT_UNAPPROVED" |
    "AUTHORIZED_RETAIL" | "AUTHORIZED_WHOLESALE";
  ownershipProofRef: string;
};
export type ProvenEconomicPhysicalItem = {
  itemId: string;
  templateId: string;
  quantity: number;
  location: string;
  physicalHolderId: string;
  economicOwnerId: string;
  sellingRight: ItemOwnershipEvidence["saleRight"];
  sourceVersion: number;
};
export type CustodyAudit = {
  state: "BLOCKED" | "SOURCE_EVIDENCE_READY_NOT_MIGRATED";
  blockers: readonly string[];
  sourceItemCount: number;
  provenItemCount: number;
  legalSaleLotCount: number;
  ownerDiffersFromHolderCount: number;
  provenItems: readonly ProvenEconomicPhysicalItem[];
  noWritesPerformed: true;
};
const good=(x:unknown):x is string=>typeof x==="string"&&x.trim().length>0;
const permission=(x:unknown):x is ItemOwnershipEvidence["saleRight"]=>
  ["PRIVATE","BAILMENT","CONSIGNMENT_UNAPPROVED","AUTHORIZED_RETAIL","AUTHORIZED_WHOLESALE"].includes(String(x));
export function auditPhysicalCustodyAndOwnership(input:{
  source: readonly SourceItem[];
  aliasEvidence: readonly CustodyNameEvidence[];
  ownerEvidence: readonly ItemOwnershipEvidence[];
  confirmedCanonicalActorIds: ReadonlySet<string>;
  independentlyVerifiedProofRefs: ReadonlySet<string>;
}):CustodyAudit {
  const blockers:string[]=[];
  const aliases=new Map<string,string>();
  const owners=new Map<string,ItemOwnershipEvidence>();
  for(const a of input.aliasEvidence){
    if(!good(a.sourceCustodianLabel)||aliases.has(a.sourceCustodianLabel)||
      !input.confirmedCanonicalActorIds.has(a.canonicalHolderId)||
      !input.independentlyVerifiedProofRefs.has(a.sourceProofRef)){
      blockers.push("UNVERIFIED_CUSTODIAN_ALIAS:"+a.sourceCustodianLabel);
    }else aliases.set(a.sourceCustodianLabel,a.canonicalHolderId);
  }
  for(const p of input.ownerEvidence){
    if(!good(p.itemId)||owners.has(p.itemId)||
      !input.confirmedCanonicalActorIds.has(p.canonicalOwnerId)||
      !permission(p.saleRight)||
      !input.independentlyVerifiedProofRefs.has(p.ownershipProofRef)){
      blockers.push("UNVERIFIED_ECONOMIC_OWNER:"+p.itemId);
    }else owners.set(p.itemId,p);
  }
  const ids=new Set<string>(),proven:ProvenEconomicPhysicalItem[]=[];
  for(const row of input.source){
    if(!good(row.itemId)||ids.has(row.itemId)||
       !good(row.templateId)||!good(row.custodian)||!good(row.location)||
       !(row.qty>0)||!Number.isFinite(row.qty)||
       !Number.isSafeInteger(row.sourceVersion)||row.sourceVersion<1){
      blockers.push("DUPLICATE_OR_INVALID_SOURCE_ITEM:"+row.itemId);
      continue;
    }
    ids.add(row.itemId);
    const holder=aliases.get(row.custodian);
    const owner=owners.get(row.itemId);
    if(!holder){
      blockers.push("CUSTODIAN_IDENTITY_NOT_PROVEN:"+row.custodian);
      continue;
    }
    if(!owner){
      blockers.push("ITEM_OWNER_AND_SALE_RIGHT_NOT_PROVEN:"+row.itemId);
      continue;
    }
    proven.push({
      itemId:row.itemId,templateId:row.templateId,quantity:row.qty,
      location:row.location,physicalHolderId:holder,
      economicOwnerId:owner.canonicalOwnerId,
      sellingRight:owner.saleRight,sourceVersion:row.sourceVersion,
    });
  }
  for(const ownerId of owners.keys())
    if(!ids.has(ownerId))blockers.push("PHANTOM_OWNERSHIP_ITEM:"+ownerId);
  if(input.source.length===0)blockers.push("NO_TRACKED_PHYSICAL_SOURCE");
  return {
    state:blockers.length?"BLOCKED":"SOURCE_EVIDENCE_READY_NOT_MIGRATED",
    blockers:[...new Set(blockers)],sourceItemCount:input.source.length,
    provenItemCount:proven.length,
    legalSaleLotCount:proven.filter(i=>
      i.sellingRight==="AUTHORIZED_RETAIL"||
      i.sellingRight==="AUTHORIZED_WHOLESALE").length,
    ownerDiffersFromHolderCount:proven.filter(i=>
      i.economicOwnerId!==i.physicalHolderId).length,
    provenItems:proven,noWritesPerformed:true,
  };
}
