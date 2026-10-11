import {wrapDenoAtomicEconomyKv} from "../src/economic_deno_kv_adapter.ts";
import {indexedEc06Keys,type IndexedSaleJournal} from "../src/economic_indexed_wholesale_kv.ts";
import {acquireGoogleProjectionFence} from "../src/economic_google_kv_exclusive_fence.ts";
import {
  reviewHeldIndexedGoogleLock,releaseReviewedIndexedGoogleLock,
  type ExternalQuiescenceVerifier,
} from "../src/economic_indexed_held_fence_recovery.ts";
import {makeIndexedDeltaIntent,type IndexedDeltaTargetAdapter,
  type IndexedDeltaIntent,type IndexedTargetReceipt,type DeltaTarget,
  type DeltaKind} from "../src/economic_indexed_delta_projection.ts";
import type {EconomicAccount} from "../src/economic_atomic_plan.ts";

const scopeId="scope.fixture.incident_warehouse";
const resourceId="fixture.physical_google_sheet_01";
const txId="order.fixture.actual_eligible";
const target:DeltaTarget="TEMP_RUNTIME";
const seller="account.fixture.wholesaler",buyer="account.fixture.buyer";
const beforeSeller:EconomicAccount={accountId:seller,availableCopper:100,heldCopper:0};
const afterSeller:EconomicAccount={...beforeSeller,availableCopper:110};
const beforeBuyer:EconomicAccount={accountId:buyer,availableCopper:50,heldCopper:0};
const afterBuyer:EconomicAccount={...beforeBuyer,availableCopper:40};
const journal:IndexedSaleJournal={
  schema:"EC06_INDEX_SALE_JOURNAL_V1",txId,scopeId,
  sourceOrderId:txId,deliveredReceiptRef:"proof.fixture.delivery",
  accountDeltas:[
    {id:seller,before:beforeSeller,after:afterSeller},
    {id:buyer,before:beforeBuyer,after:afterBuyer},
  ],lotDeltas:[],grossCopper:10,units:1,
};
class IndependentFakeGoogle implements IndexedDeltaTargetAdapter{
  money=new Map<string,unknown>([
    ["account/"+seller,beforeSeller],["account/"+buyer,beforeBuyer],
  ]);
  receipt:IndexedTargetReceipt|null=null;
  failHash=false;
  async readReceipt(_t:DeltaTarget,_s:string,_tx:string){return this.receipt}
  async readRows(_t:DeltaTarget,_s:string,rows:readonly {
    kind:DeltaKind;id:string;
  }[]){return rows.map(k=>({...k,value:structuredClone(this.money.get(k.kind+"/"+k.id)??null)}))}
  async applyRowsAndReceiptAtomically(){throw Error("Review MUST NOT write Google")}
  async verifyDurableReceipt(_t:DeltaTarget,_intent:IndexedDeltaIntent,
    receipt:IndexedTargetReceipt){return !this.failHash&&
      JSON.stringify(receipt)===JSON.stringify(this.receipt)}
  applyAfter(){
    this.money.set("account/"+seller,structuredClone(afterSeller));
    this.money.set("account/"+buyer,structuredClone(afterBuyer));
  }
}
const cleanGate:ExternalQuiescenceVerifier={
  async assertStoppedAndExclusive(input) {
    return {
      workerTerminatedAndNoInflightWrites:true as const,
      allOtherGoogleWritersExcluded:true as const,
      resourceId:input.resourceId,
      incidentProofRef:"proof.fixture.operator_verified_drain_01",
    };
  },
};
async function setup(options?:{legacy?:boolean}){
  const db=await Deno.openKv(":memory:");
  const kv=wrapDenoAtomicEconomyKv(db);
  const intent=await makeIndexedDeltaIntent(journal);
  await Promise.all([
    db.set(indexedEc06Keys.tx(txId),{
      schema:"EC06_INDEX_SALE_RECEIPT_V1",scopeId,txId,
    }),
    db.set(indexedEc06Keys.journal(txId),journal),
    db.set(indexedEc06Keys.outbox(txId),{
      schema:"EC06_INDEX_OUTBOX_V1",scopeId,txId,
      state:"PENDING_INDEXED_PROJECTION",
      journalKey:indexedEc06Keys.journal(txId),
    }),
  ]);
  const lock=await acquireGoogleProjectionFence({
    kv,scopeId,target,resourceId,
    ...(options?.legacy?{}:{
      indexedIntent:{txId,journalHash:intent.journalHash},
    }),
  });
  const adapter=new IndependentFakeGoogle();
  const args={kv,adapter,target,scopeId,resourceId,
    expectedLockToken:lock.token};
  return {db,kv,intent,lock,adapter,args};
}
async function deny(call:()=>Promise<unknown>,why:string){
  let refused=false;try{await call()}catch{refused=true}
  if(!refused)throw Error("Unsafe indexed recovery accepted: "+why);
}

Deno.test("trusted manual drain + independently read complete receipt releases exact prior HELD file lock",async()=>{
  const {db,kv,intent,adapter,args,lock}=await setup();
  try{
    adapter.applyAfter();
    adapter.receipt={
      schema:"EC06_INDEXED_TARGET_RECEIPT_V1",target,scopeId,txId,
      journalHash:intent.journalHash,
      rowIds:intent.mutations.map(m=>m.kind+"/"+m.id),
    };
    const reviewed=await reviewHeldIndexedGoogleLock(args);
    if(reviewed.status!=="RECEIPT_AND_ROWS_VERIFIED")
      throw Error("Google fully committed proof not independently reconstructed");
    const audit=await releaseReviewedIndexedGoogleLock({
      ...args,quiescenceVerifier:cleanGate,
    });
    if(audit.financialWrites!==0||
       audit.quiescenceProofRef!=="proof.fixture.operator_verified_drain_01")
      throw Error("Manual recovery did not persist source-attested audit");
    await deny(()=>lock.fence.assertExclusiveWriter(target,scopeId,resourceId),
      "former worker continues after operator release");
    const next=await acquireGoogleProjectionFence({kv,scopeId,target,resourceId});
    if(next.token===lock.token)throw Error("Old lock token was reused");
    await next.fence.assertExclusiveWriter(target,scopeId,resourceId);
  }finally{db.close()}
});
Deno.test("verified BEFORE state and missing receipt may unlock ONLY after operator drain",async()=>{
  const {db,args}=await setup();
  try{
    const review=await reviewHeldIndexedGoogleLock(args);
    if(review.status!=="NO_RECEIPT_BEFORE_ROWS_VERIFIED")
      throw Error("Missing receipt before-state not recognized");
    const audit=await releaseReviewedIndexedGoogleLock({
      ...args,quiescenceVerifier:cleanGate,
    });
    if(audit.observedState!=="NO_RECEIPT_BEFORE_ROWS_VERIFIED")
      throw Error("Unapplied Google target cannot be retried safely");
  }finally{db.close()}
});
Deno.test("partial write without receipt or forged journal digest keeps lock HELD",async()=>{
  const {db,kv,adapter,args,intent}=await setup();
  try{
    adapter.money.set("account/"+buyer,afterBuyer);
    await deny(()=>releaseReviewedIndexedGoogleLock({
      ...args,quiescenceVerifier:cleanGate,
    }),"one account updated without atomic receipt");
    adapter.applyAfter();
    adapter.receipt={
      schema:"EC06_INDEXED_TARGET_RECEIPT_V1",target,scopeId,txId,
      journalHash:"forged.fake.journal",
      rowIds:intent.mutations.map(m=>m.kind+"/"+m.id),
    };
    await deny(()=>releaseReviewedIndexedGoogleLock({
      ...args,quiescenceVerifier:cleanGate,
    }),"forged financial hash");
    await deny(()=>acquireGoogleProjectionFence({kv,scopeId,target,resourceId}),
      "unverified lock stolen from active risk");
  }finally{db.close()}
});
Deno.test("Google receipt alone cannot authorize release without terminated original worker",async()=>{
  const {db,args}=await setup();
  try{
    await deny(()=>releaseReviewedIndexedGoogleLock({
      ...args,
      quiescenceVerifier:{
        async assertStoppedAndExclusive(){
          return {workerTerminatedAndNoInflightWrites:true,
            allOtherGoogleWritersExcluded:false,
            resourceId,incidentProofRef:"proof.fixture.no_editor_freeze"} as
              Awaited<ReturnType<ExternalQuiescenceVerifier["assertStoppedAndExclusive"]>>;
        },
      },
    }),"outside Google editors not frozen");
    await deny(()=>releaseReviewedIndexedGoogleLock({
      ...args,
      quiescenceVerifier:{
        async assertStoppedAndExclusive(){
          throw Error("No authority to prove old HTTP request drained");
        },
      },
    }),"no reliable externally operated quiescence");
  }finally{db.close()}
});
Deno.test("a legacy HELD lock without exact journal hash cannot be force-unlocked",async()=>{
  const {db,args}=await setup({legacy:true});
  try{
    await deny(()=>releaseReviewedIndexedGoogleLock({
      ...args,quiescenceVerifier:cleanGate,
    }),"old unbound physical file lock");
  }finally{db.close()}
});
Deno.test("quiescence must not mutate KV token during readback; CAS release fails",async()=>{
  const {db,kv,args}=await setup();
  try{
    await deny(()=>releaseReviewedIndexedGoogleLock({
      ...args,quiescenceVerifier:{
        async assertStoppedAndExclusive(){
          // Another claimant/operator edited lock between two inspections.
          await db.set(["rpg-v2","ec06","google-unique-writer",target,resourceId],{
            schema:"EC06_GOOGLE_LOCK_V1",scopeId,target,resourceId,
            token:"operator.test.changed",state:"HELD",epoch:2,
            pendingIndexedTxId:txId,pendingIndexedJournalHash:"unknown",
          });
          return {workerTerminatedAndNoInflightWrites:true,
            allOtherGoogleWritersExcluded:true,resourceId,
            incidentProofRef:"proof.fixture.operator_verified_drain_01"};
        },
      },
    }),"lock modified during review");
  }finally{db.close()}
});
