import { wrapDenoAtomicEconomyKv } from "../src/economic_deno_kv_adapter.ts";
import { ec06Keys, commitEconomicKvStaging } from "../src/economic_kv_atomic.ts";
import { reconcileEconomicProjectionStaging } from "../src/economic_projection_recovery.ts";
import {
  makeVerifiedGoogleProjectionAdapter,
  type GoogleEconomicProjectionImage,
  type AuthoritativeGoogleProjectionTransport,
} from "../src/economic_google_projection_packets.ts";
import type {
  EconomicOperation, EconomicSnapshot, EconomicSettlementAuthority,
} from "../src/economic_atomic_plan.ts";
import type { ImmutableEconomicTxJournal } from "../src/economic_projection_journal.ts";

type Target="TEMP_RUNTIME"|"LIVE_TRANSACTION_ARCHIVE";
const targets:Target[]=["TEMP_RUNTIME","LIVE_TRANSACTION_ARCHIVE"];
const scopeId="scope.fixture.projection_lane";
const seller="account.fixture.wholesaler";
const buyer="account.fixture.printer";
const loc="loc.fixture.actual_loading_yard";
const item="item.fixture.paper_reel";
const startRevision="revision.fixture.source";
const txA="tx.fixture.invoice_01";
const txB="tx.fixture.invoice_02";

const start:EconomicSnapshot={
  revision:startRevision,
  accounts:[
    {accountId:seller,availableCopper:100,heldCopper:0},
    {accountId:buyer,availableCopper:60,heldCopper:0},
  ],
  escrows:[],
  lots:[
    {itemId:item,templateId:"objtpl.fixture.paper",
     quantity:2,custodianAccountId:seller,physicalLocationId:loc,
     sellingRight:"AUTHORIZED_WHOLESALE"},
  ],
  committedTxIds:new Set(),
  committedCausalEventIds:new Set(),
};
const auth:Omit<EconomicSettlementAuthority,"actualCurrentRevision">={
  canonicalAccountIds:new Set([seller,buyer]),
  canonicalLocationIds:new Set([loc]),
  actualActiveDemandIds:new Set(),
  actualRecordedDemandIds:new Set(),
  alreadyReservedOrSettledDemandIds:new Set(),
  observedEvidenceRefs:new Set([
    "proof.fixture.physical_delivery",
    "proof.fixture.authorized_wholesale",
    "proof.fixture.accepted_invoice",
  ]),
};
const purchaseA:EconomicOperation={
  kind:"SELL_GOODS",eventId:"event.fixture.paper_01",
  evidenceRef:"proof.fixture.physical_delivery",
  itemId:item,sellerAccountId:seller,buyerAccountId:buyer,
  sellerLocationId:loc,receivingLocationId:loc,quantity:1,
  priceCopper:10,splitItemId:"item.fixture.received_paper",
  buyerConsentRef:"proof.fixture.accepted_invoice",
  sellerRightRef:"proof.fixture.authorized_wholesale",
};
const purchaseB:EconomicOperation={
  ...purchaseA,eventId:"event.fixture.paper_02",
  quantity:1,splitItemId:undefined,
};
function makeImage(target:Target):GoogleEconomicProjectionImage {
  return {
    schema:"EC06_VERIFIED_PROJECTION_V1",target,scopeId,
    revision:startRevision,lastTxId:"tx.fixture.approved_cutover",
    accounts:Object.fromEntries(start.accounts.map(x=>[x.accountId,{...x}])),
    escrows:{},
    lots:Object.fromEntries(start.lots.map(x=>[x.itemId,{...x}])),
    receipts:{},
  };
}
class FixtureDurableGoogleTransport implements AuthoritativeGoogleProjectionTransport {
  images=new Map<Target,GoogleEconomicProjectionImage>(targets.map(t=>[t,makeImage(t)]));
  writes=new Map<Target,number>(targets.map(t=>[t,0]));
  failOnce:Target|null=null;
  async readVerifiedImage(target:Target,scope:string):Promise<GoogleEconomicProjectionImage>{
    if(scope!==scopeId)throw Error("Unknown Google economic scope");
    const state=this.images.get(target);
    if(!state)throw Error("Missing durable projection target");
    return structuredClone(state);
  }
  async replaceImageAtExactRevision(input:{
    target:Target;scopeId:string;expectedRevision:string;
    image:GoogleEconomicProjectionImage;
  }):Promise<void> {
    const {target,scopeId:scope,expectedRevision,image}=input;
    if(scope!==scopeId)throw Error("Unrecognized target scope");
    if(this.failOnce===target){
      this.failOnce=null;
      throw Error("Synthetic Google Docs outage BEFORE entire target write");
    }
    const now=this.images.get(target);
    if(!now||now.revision!==expectedRevision)
      throw Error("Google projection atomic revision fence conflict");
    this.images.set(target,structuredClone(image));
    this.writes.set(target,(this.writes.get(target)??0)+1);
  }
}
async function seeded(){
  const db=await Deno.openKv(":memory:");
  await db.set(ec06Keys.ledger(scopeId) as Deno.KvKey,{
    schema:"EC06_KV_V1",scopeId,
    snapshot:start,lastTxId:"tx.fixture.approved_cutover",
  });
  return {db,kv:wrapDenoAtomicEconomyKv(db)};
}
async function rejects(fn:()=>Promise<unknown>,label:string){
  let failed=false;try{await fn()}catch{failed=true}
  if(!failed)throw Error("Expected Google projection rejection: "+label);
}
async function applyA(kv:ReturnType<typeof wrapDenoAtomicEconomyKv>){
  return await commitEconomicKvStaging(kv,{
    scopeId,txId:txA,expectedRevision:startRevision,
    events:[purchaseA],proofAuthority:auth,
  });
}

Deno.test("real isolated Deno KV plus verified Google-shaped targets recover second-target outage",async()=>{
  const {db,kv}=await seeded();
  try {
    const primary=await applyA(kv);
    const transport=new FixtureDurableGoogleTransport();
    const adapter=makeVerifiedGoogleProjectionAdapter(transport);
    transport.failOnce="LIVE_TRANSACTION_ARCHIVE";
    await rejects(()=>reconcileEconomicProjectionStaging({
      kv,adapter,scopeId,txId:txA,
    }),"Docs unavailable after Sheets succeeded");
    if(transport.writes.get("TEMP_RUNTIME")!==1 ||
       transport.writes.get("LIVE_TRANSACTION_ARCHIVE")!==0)
      throw Error("Expected only first independent Google target to be written");
    const recovered=await reconcileEconomicProjectionStaging({kv,adapter,scopeId,txId:txA});
    if(recovered.state!=="PROJECTED" ||
       recovered.outbox.primaryRevision!==primary.receipt.afterRevision ||
       transport.writes.get("TEMP_RUNTIME")!==1 ||
       transport.writes.get("LIVE_TRANSACTION_ARCHIVE")!==1)
      throw Error("Recovery duplicated earlier projection or omitted later target");
    const materialized=await transport.readVerifiedImage("TEMP_RUNTIME",scopeId);
    if(materialized.accounts[seller].availableCopper!==110 ||
       materialized.accounts[buyer].availableCopper!==50 ||
       materialized.lots[item].quantity!==1 ||
       materialized.lots["item.fixture.received_paper"].custodianAccountId!==buyer)
      throw Error("Exact physical goods/copper projection failed");
    const j=await kv.get<ImmutableEconomicTxJournal>(ec06Keys.journal(scopeId,txA));
    const r=await adapter.readReceipt("TEMP_RUNTIME",scopeId,txA);
    if(!j.value||!r||!(await adapter.isIndependentVerifiedReceipt(r,j.value)))
      throw Error("New secure readback did not verify its immutable KV journal");
    const repeated=await reconcileEconomicProjectionStaging({kv,adapter,scopeId,txId:txA});
    if(repeated.state!=="ALREADY_PROJECTED")
      throw Error("Repeated completed projection not idempotent");
  } finally {db.close()}
});

Deno.test("journal hash and actual value readback reject forged/stale target receipts",async()=>{
  const {db,kv}=await seeded();
  try{
    await applyA(kv);
    const transport=new FixtureDurableGoogleTransport();
    const adapter=makeVerifiedGoogleProjectionAdapter(transport);
    await reconcileEconomicProjectionStaging({kv,adapter,scopeId,txId:txA});
    const journal=(await kv.get<ImmutableEconomicTxJournal>(ec06Keys.journal(scopeId,txA))).value!;
    const correct=(await adapter.readReceipt("TEMP_RUNTIME",scopeId,txA))!;
    if(await adapter.isIndependentVerifiedReceipt({
      ...correct,journalEvidenceRef:"proof.ec06.tampered_wrong_hash",
    },journal))throw Error("Unsigned substituted receipt hash accepted");
    const image=transport.images.get("TEMP_RUNTIME")!;
    image.accounts[buyer].availableCopper+=300;
    if(await adapter.isIndependentVerifiedReceipt(correct,journal))
      throw Error("Tampered financial projection accepted despite source delta");
    // Correct receipt cannot project B from a false A state.
    const jCopy=structuredClone(journal);
    jCopy.afterRevision="revision.fixture.counterfeit";
    if(await adapter.isIndependentVerifiedReceipt(correct,jCopy))
      throw Error("Revision-edited immutable journal accepted");
  }finally{db.close()}
});

Deno.test("two historical KV transactions project in order; old hashes survive newer targets",async()=>{
  const {db,kv}=await seeded();
  try{
    const a=await applyA(kv);
    await commitEconomicKvStaging(kv,{
      scopeId,txId:txB,expectedRevision:a.receipt.afterRevision,
      events:[purchaseB],proofAuthority:auth,
    });
    const transport=new FixtureDurableGoogleTransport();
    const adapter=makeVerifiedGoogleProjectionAdapter(transport);
    await rejects(()=>reconcileEconomicProjectionStaging({kv,adapter,scopeId,txId:txB}),
      "newer tx before predecessor");
    await reconcileEconomicProjectionStaging({kv,adapter,scopeId,txId:txA});
    await reconcileEconomicProjectionStaging({kv,adapter,scopeId,txId:txB});
    const journalA=(await kv.get<ImmutableEconomicTxJournal>(ec06Keys.journal(scopeId,txA))).value!;
    const receiptA=(await adapter.readReceipt("TEMP_RUNTIME",scopeId,txA))!;
    if(!(await adapter.isIndependentVerifiedReceipt(receiptA,journalA)))
      throw Error("Old signed journal invalidated by newer ledger");
    const image=await transport.readVerifiedImage("TEMP_RUNTIME",scopeId);
    if(image.accounts[seller].availableCopper!==120 ||
       image.accounts[buyer].availableCopper!==40 ||
       image.lots[item].custodianAccountId!==buyer)
      throw Error("Second correctly ordered goods sale was not projected");
  }finally{db.close()}
});

Deno.test("conditional transport writer rejects concurrent stale projection and divergent source rows",async()=>{
  const {db,kv}=await seeded();
  try{
    await applyA(kv);
    const t=new FixtureDurableGoogleTransport();
    const adapter=makeVerifiedGoogleProjectionAdapter(t);
    const j=(await kv.get<ImmutableEconomicTxJournal>(ec06Keys.journal(scopeId,txA))).value!;
    const stale=await t.readVerifiedImage("TEMP_RUNTIME",scopeId);
    await adapter.applyJournal("TEMP_RUNTIME",j);
    await rejects(()=>t.replaceImageAtExactRevision({
      target:"TEMP_RUNTIME",scopeId,expectedRevision:stale.revision,image:stale,
    }),"lost version lock");
    const another=new FixtureDurableGoogleTransport();
    another.images.get("TEMP_RUNTIME")!.lots[item].quantity=900;
    await rejects(()=>makeVerifiedGoogleProjectionAdapter(another).applyJournal("TEMP_RUNTIME",j),
      "historical before quantity mismatch");
  }finally{db.close()}
});
