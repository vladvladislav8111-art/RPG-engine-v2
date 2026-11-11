import {
  assertUniqueInventoryEventIds,
  planFiniteEconomicSettlement,
  type EconomicSnapshot,
  type EconomicSettlementAuthority,
  type EconomicOperation,
} from "../src/economic_atomic_plan.ts";
function refuses(fn:()=>unknown,name:string){
  let rejected=false;try{fn()}catch{rejected=true}
  if(!rejected)throw Error("EC-06 invalid settlement accepted: "+name);
}
const employer="account.fixture.employer";
const worker="account.fixture.worker";
const buyer="account.fixture.buyer";
const store="loc.fixture.shop";
const customer="loc.fixture.customer_house";
const item="item.fixture.paper_stack";
const demand="demand.fixture.real_delivery";
const escrow="escrow.fixture.delivery_shift";
const revision="revision.fixture.live_17";
const proofs=new Set([
  "evidence.fixture.shift_signed",
  "evidence.fixture.shift_finished",
  "evidence.fixture.shift_cancelled",
  "evidence.fixture.customer_consent",
  "evidence.fixture.vendor_authorized",
  "evidence.fixture.real_sold_lot",
]);
const snapshot: EconomicSnapshot={
  revision,
  accounts:[
    {accountId:employer,availableCopper:100,heldCopper:0},
    {accountId:worker,availableCopper:0,heldCopper:0},
    {accountId:buyer,availableCopper:80,heldCopper:0},
  ],
  escrows:[],
  lots:[{
    itemId:item,templateId:"object.fixture.paper",quantity:4,
    custodianAccountId:employer,physicalLocationId:store,
    sellingRight:"AUTHORIZED_RETAIL",
  }],
  committedTxIds:new Set(["tx.fixture.paid_before"]),
  committedCausalEventIds:new Set(["event.fixture.done_before"]),
};
const authority:EconomicSettlementAuthority={
  actualCurrentRevision:revision,
  canonicalAccountIds:new Set([employer,worker,buyer]),
  canonicalLocationIds:new Set([store,customer]),
  actualActiveDemandIds:new Set([demand]),
  actualRecordedDemandIds:new Set([demand]),
  alreadyReservedOrSettledDemandIds:new Set(),
  observedEvidenceRefs:proofs,
};
const wage: EconomicOperation={
  kind:"RESERVE_WAGE",eventId:"event.fixture.wage_hold",
  evidenceRef:"evidence.fixture.shift_signed",
  escrowId:escrow,payerAccountId:employer,workerAccountId:worker,
  sourceDemandId:demand,amountCopper:60,
};
const settlement: EconomicOperation={
  kind:"PAY_WAGE",eventId:"event.fixture.wage_finished",
  evidenceRef:"evidence.fixture.shift_finished",
  escrowId:escrow,amountCopper:50,
  verifiedWorkCompletionRef:"evidence.fixture.shift_finished",
};
const released: EconomicOperation={
  kind:"RELEASE_WAGE",eventId:"event.fixture.wage_released",
  evidenceRef:"evidence.fixture.shift_cancelled",
  escrowId:escrow,amountCopper:10,
  verifiedCancellationRef:"evidence.fixture.shift_cancelled",
};
const sale: EconomicOperation={
  kind:"SELL_GOODS",eventId:"event.fixture.paper_sold",
  evidenceRef:"evidence.fixture.real_sold_lot",
  itemId:item,sellerAccountId:employer,buyerAccountId:buyer,
  sellerLocationId:store,receivingLocationId:customer,
  quantity:2,priceCopper:30,
  splitItemId:"item.fixture.paper_to_customer",
  buyerConsentRef:"evidence.fixture.customer_consent",
  sellerRightRef:"evidence.fixture.vendor_authorized",
};
const plan=(events:readonly EconomicOperation[],s: EconomicSnapshot=snapshot,
  a:EconomicSettlementAuthority=authority,txId="tx.fixture.batch_18")=>
    planFiniteEconomicSettlement({txId,expectedRevision:revision,snapshot:s,events,authority:a});
const by=<T extends {accountId:string}>(rows:readonly T[],id:string):T=>{
  const row=rows.find(x=>x.accountId===id);
  if(!row)throw Error("Test missing account: "+id);
  return row;
};
Deno.test("bounded wage escrow, partial sale and conservation share one proposed manifest",()=>{
  const untouched=JSON.stringify({
    accounts:snapshot.accounts,escrows:snapshot.escrows,lots:snapshot.lots,
  });
  const result=plan([wage,sale,settlement,released]);
  if(result.mode!=="STAGING_PLAN_ONLY" || !result.requiresAtomicCompareAndSwap ||
    by(result.accountsAfter,employer).availableCopper!==80 ||
    by(result.accountsAfter,worker).availableCopper!==50 ||
    by(result.accountsAfter,buyer).availableCopper!==50 ||
    result.accountsAfter.some(x=>x.heldCopper!==0) ||
    result.escrowsAfter.length!==0 ||
    result.lotsAfter.length!==2)throw Error("Economic conservation/settlement incorrect");
  const source=result.lotsAfter.find(x=>x.itemId===item);
  const split=result.lotsAfter.find(x=>x.itemId==="item.fixture.paper_to_customer");
  if(source?.quantity!==2||split?.quantity!==2||
    split.custodianAccountId!==buyer||split.physicalLocationId!==customer||
    split.sellingRight!=="PRIVATE")throw Error("Partial sale has not preserved exact physical custody");
  if(JSON.stringify({accounts:snapshot.accounts,escrows:snapshot.escrows,lots:snapshot.lots})!==untouched)
    throw Error("Preparing a settlement mutated the authoritative source");
});
Deno.test("wages cannot be duplicated, self-paid, unfunded or paid without work",()=>{
  refuses(()=>plan([{...wage,amountCopper:101}]),"unfunded wages");
  refuses(()=>plan([{...wage,workerAccountId:employer}]),"self transfer");
  refuses(()=>plan([settlement]),"wage without escrow");
  refuses(()=>plan([wage,settlement,settlement]),"duplicate wage ID");
  refuses(()=>plan([wage,{...settlement,amountCopper:61}]),"overspend wage reserve");
  refuses(()=>plan([wage,{...settlement,verifiedWorkCompletionRef:"evidence.fixture.not_completed"}]),
    "pay without proof of completed work");
  refuses(()=>plan([wage,{...wage,eventId:"event.fixture.second_hold",escrowId:"escrow.fixture.other"}]),
    "two escrow obligations against same source work");
  refuses(()=>plan([wage,settlement,released,{...wage,eventId:"event.fixture.recreated",escrowId:"escrow.fixture.new_escrow"}]),
    "settled original job cannot be reserved again in same batch");
  refuses(()=>plan([wage],snapshot,{...authority,alreadyReservedOrSettledDemandIds:new Set([demand])}),
    "past paid demand cannot be reserved under a fresh TX");
  refuses(()=>plan([wage,{...released,verifiedCancellationRef:"evidence.fixture.missing_cancel"}]),
    "release unproven cancellation");
});
Deno.test("goods transfers require current seller, complete rights and unique item instance",()=>{
  refuses(()=>plan([{...sale,quantity:5}]),"sell five while four exist");
  refuses(()=>plan([{...sale,priceCopper:100}]),"buyer lacks copper");
  refuses(()=>plan([{...sale,buyerConsentRef:"evidence.fixture.missing"}]),"buyer never consented");
  refuses(()=>plan([{...sale,sellerLocationId:customer}]),"goods teleported to storefront");
  refuses(()=>plan([{...sale,sellerAccountId:worker}]),"wrong owner/custodian");
  refuses(()=>plan([{...sale,splitItemId:item}]),"reuse source ID for split");
  refuses(()=>plan([{...sale,splitItemId:undefined}]),"unidentified split");
  refuses(()=>plan([sale,{...sale,eventId:"event.fixture.second",
    splitItemId:"item.fixture.second_split",quantity:3}]),"two customers buy five");
  refuses(()=>plan([{...sale,quantity:4,splitItemId:sale.splitItemId}]),"full transfer secretly mints copy");
  refuses(()=>plan([sale],{...snapshot,lots:[{...snapshot.lots[0],sellingRight:"PRIVATE"}]}),
    "sell personal drawings");
  refuses(()=>plan([sale],{...snapshot,lots:[{...snapshot.lots[0],sellingRight:"BAILMENT"}]}),
    "sell property merely held for someone");
  refuses(()=>plan([sale],{...snapshot,lots:[{...snapshot.lots[0],sellingRight:"CONSIGNMENT_UNAPPROVED"}]}),
    "sell unapproved consignment");
});
Deno.test("single authoritative revision and committed causal IDs protect replay and stale reads",()=>{
  refuses(()=>plan([wage],snapshot,authority,"tx.fixture.paid_before"),"TX already committed");
  refuses(()=>plan([{...wage,eventId:"event.fixture.done_before"}]),"causal event already spent");
  refuses(()=>plan([wage],{...snapshot,revision:"revision.fixture.old"}),"stale sheet snapshot");
  refuses(()=>plan([wage],snapshot,{...authority,actualCurrentRevision:"revision.fixture.changed"}),
    "current ledger revision moved");
  refuses(()=>plan([{...wage,evidenceRef:"evidence.fixture.fake"}]),"fabricated wage source");
  refuses(()=>plan([sale],{...snapshot,lots:[...snapshot.lots,snapshot.lots[0]]}),
    "same physical inventory ID twice");
  refuses(()=>plan([wage],{...snapshot,accounts:[
    {...snapshot.accounts[0],heldCopper:50},snapshot.accounts[1],snapshot.accounts[2]]}),
    "orphaned held wages not represented by escrow");
  refuses(()=>plan([wage],{...snapshot,accounts:[
    {...snapshot.accounts[0],availableCopper:Infinity},snapshot.accounts[1],snapshot.accounts[2]]}),
    "infinite funds");
});
Deno.test("separate signed transaction can settle actual prior escrow with exact reserve",()=>{
  const current: EconomicSnapshot={...snapshot,
    accounts:[{...snapshot.accounts[0],availableCopper:40,heldCopper:60},
       snapshot.accounts[1],snapshot.accounts[2]],
    escrows:[{escrowId:escrow,payerAccountId:employer,
      workerAccountId:worker,reservedCopper:60,sourceDemandId:demand}],
  };
  const r=plan([settlement,released],current);
  if(by(r.accountsAfter,employer).availableCopper!==50||
     by(r.accountsAfter,worker).availableCopper!==50||
     r.escrowsAfter.length!==0)throw Error("Reserved funds were paid/refunded incorrectly");
});
Deno.test("an invalid later operation yields no partial manifest or source mutation",()=>{
  const before=JSON.stringify(snapshot.accounts)+JSON.stringify(snapshot.lots);
  refuses(()=>plan([wage,{...sale,priceCopper:999}]),
    "later impossible purchase after wage reservation");
  if(before!==JSON.stringify(snapshot.accounts)+JSON.stringify(snapshot.lots))
    throw Error("Failed planned batch modified source state");
});
Deno.test("semantic inventory must touch each physical instance at most once",()=>{
  assertUniqueInventoryEventIds([
    {itemId:"item.fixture.paper_stock"},
    {itemId:"item.fixture.paper_sold_piece"},
  ]);
  refuses(()=>assertUniqueInventoryEventIds([
    {itemId:"item.fixture.paper_stock"},
    {itemId:"item.fixture.paper_stock"},
  ]),"second charge same item ID");
  refuses(()=>assertUniqueInventoryEventIds([{itemId:""}]),"blank physical item key");
});
