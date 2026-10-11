import {wrapDenoAtomicEconomyKv} from "../src/economic_deno_kv_adapter.ts";
import {
  commitIndexedNpcWholesaleStaging,indexedEc06Keys,
  type IndexedSaleAuthority,type IndexedSaleLot,type IndexedSeal,type IndexedHome,
  type IndexedSaleJournal,type IndexedOutbox,
} from "../src/economic_indexed_wholesale_kv.ts";
import type {EconomicAccount} from "../src/economic_atomic_plan.ts";
import type {NpcWholesaleOrder} from "../src/npc_wholesale_clearing.ts";

const scope="scope.fixture.merchant_market";
const otherScope="scope.fixture.neighbor_market";
const seller="account.fixture.paper_wholesaler";
const buyer="account.fixture.binder";
const buyer2="account.fixture.printer";
const item="item.fixture.paper_lot";
const location="loc.fixture.real_staging_handoff";
const proof="proof.fixture.real_goods_delivered";
const right="proof.fixture.wholesale_right";
const consent="proof.fixture.contract_signed";
const demand="process.fixture.trade_order";
const orderId="order.fixture.wholesale_01";
const order:NpcWholesaleOrder={
  orderId,sellerAccountId:seller,buyerAccountId:buyer,
  itemId:item,sourceProcessId:demand,handoffLocationId:location,
  quantity:1,totalPriceCopper:20,
  dueGameMinute:100,splitItemId:"item.fixture.binder_paper",
  buyerAcceptanceRef:consent,sellerRightRef:right,
  deliveredReceiptRef:proof,
};
const trust=new Set([consent,right,proof]);
const sourceSeal:IndexedSeal={
  schema:"EC06_INDEX_MIGRATION_V1",scopeId:scope,state:"STAGING_INDEXED_ONLY",
  originalSaveId:"V2-FIXTURE-APPROVED",
  independentlyVerifiedMigrationRef:"proof.fixture.migration_approval",
  originalSourceFingerprint:"hash.fixture.origin_01",
};
const account=(id:string,availableCopper:number):EconomicAccount=>({
  accountId:id,availableCopper,heldCopper:0,
});
const sourceLot=(quantity=3):IndexedSaleLot=>({
  itemId:item,templateId:"objtpl.fixture.paper",quantity,
  custodianAccountId:seller,legalOwnerAccountId:seller,
  physicalLocationId:location,sellingRight:"AUTHORIZED_WHOLESALE",
});
const home=(kind:"account"|"item",id:string,scopeId=scope):IndexedHome=>({
  schema:"EC06_INDEX_HOME_V1",kind,entityId:id,scopeId,
  sourceProofRef:"proof.fixture.verified_home",
});
const authority=(orders:NpcWholesaleOrder[]=[order]):IndexedSaleAuthority=>({
  nowGameMinute:110,
  verifiedMigrationProofRefs:new Set([sourceSeal.independentlyVerifiedMigrationRef]),
  confirmedOrdersById:new Map(orders.map(x=>[x.orderId,x])),
  verifiedSourceProcessIds:new Set([demand]),
  independentlyVerifiedEvidenceRefs:new Set(
    orders.flatMap(x=>[x.buyerAcceptanceRef,x.sellerRightRef,x.deliveredReceiptRef])),
  verifiedLocationIds:new Set([location]),
});
async function initialized(qty=3,availableBuyer=100){
  const db=await Deno.openKv(":memory:");
  await Promise.all([
    db.set(indexedEc06Keys.seal(scope),sourceSeal),
    db.set(indexedEc06Keys.account(scope,seller),account(seller,200)),
    db.set(indexedEc06Keys.account(scope,buyer),account(buyer,availableBuyer)),
    db.set(indexedEc06Keys.account(scope,buyer2),account(buyer2,110)),
    db.set(indexedEc06Keys.lot(scope,item),sourceLot(qty)),
    ...[seller,buyer,buyer2].map(x=>
      db.set(indexedEc06Keys.home("account",x),home("account",x))),
    db.set(indexedEc06Keys.home("item",item),home("item",item)),
  ]);
  return {db,kv:wrapDenoAtomicEconomyKv(db)};
}
async function rejects(fn:()=>Promise<unknown>,tag:string){
  let fail=false;try{await fn()}catch{fail=true}
  if(!fail)throw Error("Unsafe indexed wholesale sale succeeded: "+tag);
}
const buy=(kv:ReturnType<typeof wrapDenoAtomicEconomyKv>,
  o:NpcWholesaleOrder=order,a:IndexedSaleAuthority=authority([o]),s=scope)=>
    commitIndexedNpcWholesaleStaging(kv,{scopeId:s,order:o,authority:a});

Deno.test("indexed KV sale debits only real buyer money and splits exact physical lot",async()=>{
  const {db,kv}=await initialized();
  try{
    const result=await buy(kv);
    if(result.kind!=="INDEXED_COMMITTED_STAGING"||
       result.outbox.state!=="PENDING_INDEXED_PROJECTION"||
       result.receipt.units!==1)throw Error("No atomic staging sale receipt");
    const [a,b,src,dst,journal,used,homeNew]=await Promise.all([
      kv.get<EconomicAccount>(indexedEc06Keys.account(scope,seller)),
      kv.get<EconomicAccount>(indexedEc06Keys.account(scope,buyer)),
      kv.get<IndexedSaleLot>(indexedEc06Keys.lot(scope,item)),
      kv.get<IndexedSaleLot>(indexedEc06Keys.lot(scope,order.splitItemId!)),
      kv.get<IndexedSaleJournal>(indexedEc06Keys.journal(orderId)),
      kv.get(indexedEc06Keys.delivery(proof)),
      kv.get(indexedEc06Keys.home("item",order.splitItemId!)),
    ]);
    if(a.value?.availableCopper!==220||b.value?.availableCopper!==80||
      src.value?.quantity!==2||dst.value?.quantity!==1||
      dst.value?.legalOwnerAccountId!==buyer||
      dst.value?.custodianAccountId!==buyer||dst.value?.sellingRight!=="PRIVATE"||
      journal.value?.accountDeltas.length!==2||
      journal.value.lotDeltas.length!==2||!used.value||!homeNew.value)
      throw Error("Account cash, lawful title, exact item split or journal missing");
    const repeat=await buy(kv);
    if(repeat.kind!=="IDEMPOTENT_REPLAY")throw Error("Idempotent invoice replay debited twice");
    if((await kv.get<EconomicAccount>(indexedEc06Keys.account(scope,buyer))).value?.availableCopper!==80)
      throw Error("Repeat charged the same NPC buyer");
  }finally{db.close()}
});

Deno.test("two simultaneous NPCs seeking last item: exactly one succeeds",async()=>{
  const {db,kv}=await initialized(1);
  try{
    const first={...order,quantity:1,splitItemId:undefined};
    const second={...first,orderId:"order.fixture.wholesale_rival",
      buyerAccountId:buyer2,deliveredReceiptRef:"proof.fixture.second_delivery",
      buyerAcceptanceRef:"proof.fixture.rival_signed"};
    const a=authority([first,second]);
    const results=await Promise.allSettled([buy(kv,first,a),buy(kv,second,a)]);
    if(results.filter(x=>x.status==="fulfilled").length!==1)
      throw Error("Two buyers bought one real lot");
    const l=(await kv.get<IndexedSaleLot>(indexedEc06Keys.lot(scope,item))).value!;
    if(![buyer,buyer2].includes(l.legalOwnerAccountId)||l.quantity!==1||
       l.custodianAccountId!==l.legalOwnerAccountId)
      throw Error("Physical goods had two owners or were lost");
  }finally{db.close()}
});

Deno.test("independent unrelated vendors can settle concurrently without one district-wide version conflict",async()=>{
  const {db,kv}=await initialized();
  try{
    const many=Array.from({length:60},(_,i)=>{
      const id=String(i).padStart(3,"0");
      return {...order,orderId:"order.fixture.concurrent_"+id,
        itemId:"item.fixture.unrelated_"+id,splitItemId:undefined,
        sellerAccountId:"account.fixture.seller_"+id,
        buyerAccountId:"account.fixture.buyer_"+id,
        deliveredReceiptRef:"proof.fixture.delivered_"+id,
        buyerAcceptanceRef:"proof.fixture.agreed_"+id,
        sellerRightRef:"proof.fixture.right_"+id,
      } as NpcWholesaleOrder;
    });
    for(const o of many) {
      await Promise.all([
        db.set(indexedEc06Keys.account(scope,o.sellerAccountId),account(o.sellerAccountId,5)),
        db.set(indexedEc06Keys.account(scope,o.buyerAccountId),account(o.buyerAccountId,30)),
        db.set(indexedEc06Keys.lot(scope,o.itemId),{
          ...sourceLot(1),itemId:o.itemId,
          custodianAccountId:o.sellerAccountId,legalOwnerAccountId:o.sellerAccountId,
        } satisfies IndexedSaleLot),
        db.set(indexedEc06Keys.home("account",o.sellerAccountId),home("account",o.sellerAccountId)),
        db.set(indexedEc06Keys.home("account",o.buyerAccountId),home("account",o.buyerAccountId)),
        db.set(indexedEc06Keys.home("item",o.itemId),home("item",o.itemId)),
      ]);
    }
    const a=authority(many);
    const outcomes=await Promise.allSettled(many.map(o=>buy(kv,o,a)));
    const errors=outcomes.filter(x=>x.status==="rejected");
    if(errors.length)throw Error("Unrelated merchants contended globally: "+String(
      (errors[0] as PromiseRejectedResult).reason));
    const one=(await kv.get<EconomicAccount>(
      indexedEc06Keys.account(scope,many[42].buyerAccountId))).value;
    if(one?.availableCopper!==10)throw Error("Isolated NPC trade did not transfer exact cash");
  }finally{db.close()}
});

Deno.test("two invoices draw same buyer money: one CAS must reject overspend",async()=>{
  const {db,kv}=await initialized(25,20);
  try{
    const o1={...order,quantity:1,splitItemId:undefined};
    const o2={...o1,orderId:"order.fixture.second_sale",
      itemId:"item.fixture.second_lot",
      deliveredReceiptRef:"proof.fixture.second_lot_handoff"};
    await Promise.all([
      db.set(indexedEc06Keys.lot(scope,o2.itemId),{
        ...sourceLot(1),itemId:o2.itemId,
      }),
      db.set(indexedEc06Keys.home("item",o2.itemId),home("item",o2.itemId)),
    ]);
    const outcomes=await Promise.allSettled([
      buy(kv,o1,authority([o1,o2])),
      buy(kv,o2,authority([o1,o2])),
    ]);
    if(outcomes.filter(x=>x.status==="fulfilled").length!==1||
      (await kv.get<EconomicAccount>(indexedEc06Keys.account(scope,buyer))).value?.availableCopper!==0)
      throw Error("Same buyer spent its twenty copper twice");
  }finally{db.close()}
});

Deno.test("unfunded or undocumented NPC seller and legal title never become valid stock",async()=>{
  const {db,kv}=await initialized(3,10);
  try{
    await rejects(()=>buy(kv),"cash shortfall");
    await db.set(indexedEc06Keys.account(scope,buyer),account(buyer,100));
    await db.set(indexedEc06Keys.lot(scope,item),{
      ...sourceLot(3),legalOwnerAccountId:buyer,
    });
    await rejects(()=>buy(kv),"seller has custody but buyer owns legal title");
    await db.set(indexedEc06Keys.lot(scope,item),{
      ...sourceLot(3),sellingRight:"BAILMENT",
    });
    await rejects(()=>buy(kv),"personal bailment cannot be sold");
  }finally{db.close()}
});

Deno.test("cannot sell across independent economic owners, or invent a positive wallet",async()=>{
  const {db,kv}=await initialized();
  try{
    await db.set(indexedEc06Keys.home("account",buyer),
      home("account",buyer,otherScope));
    await rejects(()=>buy(kv),"cross-scope transfer without joint protocol");
    await db.delete(indexedEc06Keys.account(scope,buyer));
    await rejects(()=>buy(kv),"unknown NPC wallet silently funded");
  }finally{db.close()}
});

Deno.test("new split item ID and physical receipt are globally single-use",async()=>{
  const {db,kv}=await initialized();
  try{
    await db.set(indexedEc06Keys.home("item",order.splitItemId!),
      home("item",order.splitItemId!,otherScope));
    await rejects(()=>buy(kv),"duplicate physical item home in second scope");
    await db.delete(indexedEc06Keys.home("item",order.splitItemId!));
    await db.set(indexedEc06Keys.delivery(order.deliveredReceiptRef),
      {orderId:"order.fixture.already_settled"});
    await rejects(()=>buy(kv),"one delivery receipt used for a different transaction");
  }finally{db.close()}
});

Deno.test("all indexed transactions reject missing independently verified migration",async()=>{
  const {db,kv}=await initialized();
  try{
    await db.delete(indexedEc06Keys.seal(scope));
    await rejects(()=>buy(kv),"unapproved primary ledger");
    await db.set(indexedEc06Keys.seal(scope),sourceSeal);
    await rejects(()=>buy(kv,order,{...authority(),
      verifiedMigrationProofRefs:new Set()}),"source provenance missing");
    await rejects(()=>buy(kv,order,{...authority(),
      independentlyVerifiedEvidenceRefs:new Set()}),"physical sale consent missing");
  }finally{db.close()}
});
