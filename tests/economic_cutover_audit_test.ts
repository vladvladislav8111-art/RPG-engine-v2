import {
  auditEconomicCutover, type CutoverAuditInput,
} from "../src/economic_cutover_audit.ts";

const refs=new Set([
  "source.fixture.save", "source.fixture.shura_wallet",
  "source.fixture.merchant_wallet", "source.fixture.shura_owner",
  "source.fixture.merchant_owner", "source.fixture.shura_item",
  "source.fixture.merchant_item","source.fixture.private_proof",
  "source.fixture.wholesale_contract",
]);
const input:CutoverAuditInput={
  expectedCommittedSaveId:"V2-FIXTURE-SAVE",
  actualCommittedSaveId:"V2-FIXTURE-SAVE",
  moneySourceRows:[
    {sourceEntityId:"player.shura",sourceResource:"Money",currentCopper:677,
     sourceRowRef:"source.fixture.shura_wallet"},
    {sourceEntityId:"npc.fixture.merchant",sourceResource:"Money",currentCopper:200,
     sourceRowRef:"source.fixture.merchant_wallet"},
  ],
  itemSourceRows:[
    {itemId:"item.fixture.shura_notebook",templateId:"objtpl.fixture.notebook",
      qty:1,custodian:"player.shura",location:"loc.fixture.bag",
      sourceRowRef:"source.fixture.shura_item",sourceVersion:3},
    {itemId:"item.fixture.shop_crate",templateId:"objtpl.fixture.crate",
      qty:7,custodian:"npc.fixture.merchant",location:"loc.fixture.shop",
      sourceRowRef:"source.fixture.merchant_item",sourceVersion:2},
  ],
  accountMappings:[
    {sourceEntityId:"player.shura",accountId:"account.fixture.shura",
      knownOwnerProofRef:"source.fixture.shura_owner"},
    {sourceEntityId:"npc.fixture.merchant",accountId:"account.fixture.merchant",
      knownOwnerProofRef:"source.fixture.merchant_owner"},
  ],
  itemMappings:[
    {itemId:"item.fixture.shura_notebook",accountId:"account.fixture.shura",
      disposition:"PRIVATE",legalProofRef:"source.fixture.private_proof"},
    {itemId:"item.fixture.shop_crate",accountId:"account.fixture.merchant",
      disposition:"AUTHORIZED_WHOLESALE",legalProofRef:"source.fixture.wholesale_contract"},
  ],
  knownEconomicActors:["player.shura","npc.fixture.merchant"],
  verifiedSourceEvidenceRefs:refs,
  sourceEconomicWritersFrozenAndVerified:true,
  intendedNewOwner:"EC06_KV_SINGLE_PRIMARY",
};
const audit=(x:CutoverAuditInput=input)=>auditEconomicCutover(x);
Deno.test("read-only cutover gate proves exact source money and one custodian per source item",()=>{
  const x=audit();
  if(x.state!=="AUDIT_READY_NOT_MIGRATED" ||
     x.blockers.length!==0 ||
     x.sourcedMoneyRows!==2 || x.sourcedItemRows!==2 ||
     x.auditedAccountCount!==2 || !x.noWritesPerformed)
     throw Error("Properly attested dry-run was not audit-ready");
});
Deno.test("unproven NPC cash never silently becomes zero, credit, or synthetic wallet",()=>{
  const x=audit({...input,moneySourceRows:input.moneySourceRows.slice(0,1)});
  if(x.state!=="BLOCKED" || !x.blockers.some(y=>y.includes("ACTOR_FUNDS_OR_ACCOUNT_UNVERIFIED")))
    throw Error("Actor without proved funds was treated as solvent");
  const y=audit({...input,accountMappings:[...input.accountMappings,
    {...input.accountMappings[0],sourceEntityId:"npc.fixture.imagined",
      accountId:"account.fixture.imagined"}]});
  if(y.state!=="BLOCKED"||!y.blockers.some(z=>z.includes("ACCOUNT_WITHOUT_REAL_SOURCE_FUNDS")))
    throw Error("Unknown NPC account was minted");
});
Deno.test("money/physical items cannot be counted twice or mapped to wrong owner",()=>{
  const duplicate=audit({...input,moneySourceRows:[
    ...input.moneySourceRows,input.moneySourceRows[0],
  ]});
  if(!duplicate.blockers.includes("INVALID_OR_DUPLICATE_SOURCE_MONEY"))
    throw Error("Money double counted");
  const theft=audit({...input,itemMappings:[
    {...input.itemMappings[0],accountId:"account.fixture.merchant"},
    input.itemMappings[1],
  ]});
  if(!theft.blockers.some(z=>z.includes("PHYSICAL_HOLDER_HAS_DIFFERENT_OR_UNKNOWN_ACCOUNT")))
    throw Error("Shura's notebook assigned to another merchant");
  const noItem=audit({...input,itemMappings:input.itemMappings.slice(0,1)});
  if(!noItem.blockers.some(z=>z.includes("SOURCE_ITEM_EXCLUDED_FROM_CUTOVER")))
    throw Error("Source item omitted from migration");
  const imaginary=audit({...input,itemMappings:[...input.itemMappings,
    {...input.itemMappings[0],itemId:"item.fixture.invented"}]});
  if(!imaginary.blockers.some(z=>z.includes("PHANTOM_MIGRATED_ITEM")))
    throw Error("Free stock minted during migration");
});
Deno.test("source freeze, source save and signed legal evidence are mandatory",()=>{
  if(audit({...input,sourceEconomicWritersFrozenAndVerified:false}).state!=="BLOCKED")
    throw Error("Split-brain Sheets writers were left active");
  if(audit({...input,actualCommittedSaveId:"V2-SOMETHING-CHANGED"}).state!=="BLOCKED")
    throw Error("Stale save cutover accepted");
  if(audit({...input,verifiedSourceEvidenceRefs:new Set()}).state!=="BLOCKED")
    throw Error("Signed provenance absent");
  if(audit({...input,itemSourceRows:[{...input.itemSourceRows[0],qty:0},
     input.itemSourceRows[1]]}).state!=="BLOCKED")
    throw Error("Empty physical lot materialized");
});
