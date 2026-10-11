/**
 * EC-06 migration AUDIT ONLY. Never seeds Deno KV or edits TEMP_RUNTIME.
 * A live player balance is only one person's cash, not the entire city's
 * financial resources. Unknown NPC wealth is NOT a zero-value account.
 */
export type SourceMoney = {
  sourceEntityId:string; sourceResource:"Money";
  currentCopper:number; sourceRowRef:string;
};
export type SourceItem = {
  itemId:string; templateId:string; qty:number; custodian:string;
  location:string; sourceRowRef:string; sourceVersion:number;
};
export type ProposedAccountMapping = {
  sourceEntityId:string; accountId:string; knownOwnerProofRef:string;
};
export type ProposedItemMapping = {
  itemId:string; accountId:string;
  disposition:"PRIVATE"|"BAILMENT"|"CONSIGNMENT_UNAPPROVED"|"AUTHORIZED_RETAIL"|"AUTHORIZED_WHOLESALE";
  legalProofRef:string;
};
export type CutoverAuditInput = {
  expectedCommittedSaveId:string;
  actualCommittedSaveId:string;
  moneySourceRows:readonly SourceMoney[];
  itemSourceRows:readonly SourceItem[];
  accountMappings:readonly ProposedAccountMapping[];
  itemMappings:readonly ProposedItemMapping[];
  knownEconomicActors:readonly string[];
  verifiedSourceEvidenceRefs:ReadonlySet<string>;
  /** Requires a real exclusive writer cutover, NOT merely an editor's promise. */
  sourceEconomicWritersFrozenAndVerified:boolean;
  intendedNewOwner:"EC06_KV_SINGLE_PRIMARY";
};
export type CutoverAuditResult = {
  readonly state:"BLOCKED"|"AUDIT_READY_NOT_MIGRATED";
  readonly blockers:readonly string[];
  readonly sourcedMoneyRows:number;
  readonly sourcedItemRows:number;
  readonly auditedAccountCount:number;
  readonly auditedItemCount:number;
  readonly noWritesPerformed:true;
};

const moneyValid=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const idValid=(x:string)=>typeof x==="string"&&x.length>0;

export function auditEconomicCutover(input:CutoverAuditInput):CutoverAuditResult{
  const failures:string[]=[];
  const refuse=(kind:string)=>failures.push(kind);
  if(!input.expectedCommittedSaveId || input.actualCommittedSaveId!==input.expectedCommittedSaveId)
    refuse("SOURCE_SAVE_CHANGED");
  if(!input.sourceEconomicWritersFrozenAndVerified)
    refuse("OLD_SHEETS_ECONOMIC_WRITERS_NOT_FROZEN");
  if(input.intendedNewOwner!=="EC06_KV_SINGLE_PRIMARY")
    refuse("UNAPPROVED_ECONOMIC_PRIMARY_OWNER");
  const sourceMoney=new Map<string,SourceMoney>();
  for(const r of input.moneySourceRows){
    if(!idValid(r.sourceEntityId)||r.sourceResource!=="Money"||
       !moneyValid(r.currentCopper)||!input.verifiedSourceEvidenceRefs.has(r.sourceRowRef)||
       sourceMoney.has(r.sourceEntityId)){
      refuse("INVALID_OR_DUPLICATE_SOURCE_MONEY");
    }else sourceMoney.set(r.sourceEntityId,r);
  }
  const maps=new Map<string,ProposedAccountMapping>();
  const accountIds=new Set<string>();
  for(const r of input.accountMappings){
    if(!idValid(r.sourceEntityId)||!idValid(r.accountId)||
       accountIds.has(r.accountId)||maps.has(r.sourceEntityId)||
       !input.verifiedSourceEvidenceRefs.has(r.knownOwnerProofRef)){
      refuse("DUPLICATED_OR_UNPROVEN_ACCOUNT_MAPPING");
    }else{
      maps.set(r.sourceEntityId,r);
      accountIds.add(r.accountId);
    }
  }
  const actorSet=new Set(input.knownEconomicActors);
  for(const actor of actorSet){
    if(!sourceMoney.has(actor)||!maps.has(actor))
      refuse("ACTOR_FUNDS_OR_ACCOUNT_UNVERIFIED:"+actor);
  }
  for(const entity of sourceMoney.keys()){
    if(!maps.has(entity))refuse("UNMAPPED_REAL_MONEY:"+entity);
  }
  for(const entity of maps.keys()){
    if(!sourceMoney.has(entity))refuse("ACCOUNT_WITHOUT_REAL_SOURCE_FUNDS:"+entity);
  }
  const sourceItems=new Map<string,SourceItem>();
  for(const s of input.itemSourceRows){
    if(!idValid(s.itemId)||!idValid(s.templateId)||!idValid(s.custodian)||
       !idValid(s.location)||!Number.isSafeInteger(s.qty)||s.qty<=0||
       !Number.isSafeInteger(s.sourceVersion)||s.sourceVersion<0||
       !input.verifiedSourceEvidenceRefs.has(s.sourceRowRef)||
       sourceItems.has(s.itemId)){
      refuse("INVALID_OR_DUPLICATE_PHYSICAL_SOURCE_ITEM");
    }else sourceItems.set(s.itemId,s);
  }
  const itemMappings=new Map<string,ProposedItemMapping>();
  for(const p of input.itemMappings){
    if(!idValid(p.itemId)||itemMappings.has(p.itemId)||
       !accountIds.has(p.accountId)||
       !input.verifiedSourceEvidenceRefs.has(p.legalProofRef)||
       !["PRIVATE","BAILMENT","CONSIGNMENT_UNAPPROVED",
         "AUTHORIZED_RETAIL","AUTHORIZED_WHOLESALE"].includes(p.disposition)){
      refuse("UNPROVEN_OR_DUPLICATE_ITEM_RIGHTS");
    }else itemMappings.set(p.itemId,p);
  }
  for(const [itemId,item] of sourceItems){
    const p=itemMappings.get(itemId);
    if(!p)refuse("SOURCE_ITEM_EXCLUDED_FROM_CUTOVER:"+itemId);
    else{
      const rightful=maps.get(item.custodian)?.accountId;
      if(!rightful||rightful!==p.accountId)
        refuse("PHYSICAL_HOLDER_HAS_DIFFERENT_OR_UNKNOWN_ACCOUNT:"+itemId);
    }
  }
  for(const itemId of itemMappings.keys())
    if(!sourceItems.has(itemId))refuse("PHANTOM_MIGRATED_ITEM:"+itemId);
  if(!sourceMoney.size)refuse("EMPTY_MONEY_SOURCE_CANNOT_ESTABLISH_CITY_CASH");
  if(!sourceItems.size)refuse("EMPTY_ASSET_SOURCE_NEEDS_EXPLICIT_BOUNDARY");
  return {
    state:failures.length?"BLOCKED":"AUDIT_READY_NOT_MIGRATED",
    blockers:[...new Set(failures)],
    sourcedMoneyRows:sourceMoney.size,
    sourcedItemRows:sourceItems.size,
    auditedAccountCount:maps.size,
    auditedItemCount:itemMappings.size,
    noWritesPerformed:true,
  };
}
