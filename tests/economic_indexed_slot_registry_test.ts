import {wrapDenoAtomicEconomyKv} from "../src/economic_deno_kv_adapter.ts";
import {
  registerProvisionedPageStaging,registerProjectionSlotsStaging,
  resolveIndexedSlotsStaging,type StagingSlotPage,
} from "../src/economic_indexed_slot_registry.ts";
const target="TEMP_RUNTIME" as const;
const scopeId="scope.fixture.trade_warehouse";
const spreadsheet="fixture.isolated.google_indexed_file";
const evidence="proof.fixture.physically_inspected_google_row";
const page=(id:string,kind:"EC06_IDX_ROWS"|"EC06_IDX_RECEIPTS",
  firstRow:number,lastRow:number,physical=spreadsheet):StagingSlotPage=>({
  schema:"EC06_SLOT_PAGE_V1",target,scopeId,
  physicalResourceId:physical,
  sheetId:kind==="EC06_IDX_ROWS"?42:43,
  pageId:id,kind,firstRow,lastRow,
  sourceProofRef:"proof.fixture.operator_preallocated_page",
});
async function seeded(){
  const db=await Deno.openKv(":memory:");
  const kv=wrapDenoAtomicEconomyKv(db);
  const pages=[
    page("page.fixture.market_A","EC06_IDX_ROWS",2,257),
    page("page.fixture.market_B","EC06_IDX_ROWS",258,513),
    page("page.fixture.receipts_A","EC06_IDX_RECEIPTS",2,513),
  ];
  for(const p of pages)await registerProvisionedPageStaging({
    kv,page:p,trustedProvisionedPageProofRefs:new Set([p.sourceProofRef]),
  });
  return {db,kv};
}
async function deny(fn:()=>Promise<unknown>,name:string){
  let refused=false;try{await fn()}catch{refused=true}
  if(!refused)throw Error("Unapproved indexed Google allocation accepted "+name);
}
const row=(n:number)=>({
  kind:"account" as const,id:"account.fixture.merchant_"+String(n).padStart(4,"0"),
  row:n+2,pageId:n<256?"page.fixture.market_A":"page.fixture.market_B",
  sourceProofRef:evidence,
});
Deno.test("500 independent bounded indexed merchant pointers have stable O(1) keyed read, without global city scope CAS",async()=>{
  const {db,kv}=await seeded();
  try{
    const entries=Array.from({length:500},(_,i)=>row(i));
    // Distinct physical row pointers can be registered in parallel,
    // without updating one market-wide mutable counter.
    const batches=Array.from({length:125},(_,i)=>entries.slice(i*4,i*4+4));
    const done=await Promise.allSettled(batches.map(records=>
      registerProjectionSlotsStaging({kv,target,scopeId,records,
        independentlyVerifiedRowProofRefs:new Set([evidence])})));
    const failures=done.filter(x=>x.status==="rejected");
    if(failures.length)throw Error("Non-overlapping merchant slots globally contended: "+
      String((failures[0] as PromiseRejectedResult).reason));
    const requested=[row(0),row(255),row(256),row(499)].map(x=>({
      kind:x.kind,id:x.id,
    }));
    const lookup=await resolveIndexedSlotsStaging({
      kv,target,scopeId,physicalResourceId:spreadsheet,requested,
    });
    if(lookup.rows.length!==4||lookup.rows[0].row!==2||
       lookup.rows[1].row!==257||lookup.rows[2].row!==258||
       lookup.rows[3].row!==501)
      throw Error("Indexed archive lookups reconstructed incorrect pinned physical rows");
  }finally{db.close()}
});
Deno.test("one exact Google physical row may never point to two NPC financial accounts",async()=>{
  const {db,kv}=await seeded();
  try{
    await registerProjectionSlotsStaging({kv,target,scopeId,
      records:[row(2)],independentlyVerifiedRowProofRefs:new Set([evidence])});
    const forged={...row(3),row:4};
    await deny(()=>registerProjectionSlotsStaging({kv,target,scopeId,
      records:[forged],independentlyVerifiedRowProofRefs:new Set([evidence])}),
      "second merchant took same physical row");
    await deny(()=>registerProjectionSlotsStaging({kv,target,scopeId,
      records:[{...row(2),row:7}],
      independentlyVerifiedRowProofRefs:new Set([evidence])}),
      "same merchant linked to a second physical row");
  }finally{db.close()}
});
Deno.test("receipt row pages must not overlap account/physical lot page and require verified source",async()=>{
  const {db,kv}=await seeded();
  try{
    await deny(()=>registerProjectionSlotsStaging({kv,target,scopeId,
      records:[{...row(0),sourceProofRef:"proof.fixture.not_attested"}],
      independentlyVerifiedRowProofRefs:new Set([evidence])}),
      "unverified placeholder cell");
    await deny(()=>registerProjectionSlotsStaging({kv,target,scopeId,
      records:[{kind:"receipt",id:"tx.fixture.sale_0001",row:2,
        pageId:"page.fixture.market_A",sourceProofRef:evidence}],
      independentlyVerifiedRowProofRefs:new Set([evidence])}),
      "receipt disguised as balance row");
    await registerProjectionSlotsStaging({kv,target,scopeId,
      records:[{kind:"receipt",id:"tx.fixture.sale_0001",row:2,
        pageId:"page.fixture.receipts_A",sourceProofRef:evidence}],
      independentlyVerifiedRowProofRefs:new Set([evidence])});
    const lookup=await resolveIndexedSlotsStaging({
      kv,target,scopeId,physicalResourceId:spreadsheet,
      requested:[{kind:"receipt",id:"tx.fixture.sale_0001"}],
    });
    if(lookup.receiptSlots[0]?.row!==2||lookup.rows.length!==0)
      throw Error("Receipt index materialized under wrong sheet tab");
  }finally{db.close()}
});
Deno.test("same physical slot across two city scopes cannot be claimed even if page IDs differ",async()=>{
  const {db,kv}=await seeded();
  try{
    const first=row(0);
    await registerProjectionSlotsStaging({kv,target,scopeId,
      records:[first],independentlyVerifiedRowProofRefs:new Set([evidence])});
    const other="scope.fixture.neighbor_town";
    const pg={...page("page.fixture.other_claim","EC06_IDX_ROWS",2,257),
      scopeId:other};
    await registerProvisionedPageStaging({
      kv,page:pg,trustedProvisionedPageProofRefs:new Set([pg.sourceProofRef]),
    });
    await deny(()=>registerProjectionSlotsStaging({
      kv,target,scopeId:other,records:[{...first,pageId:pg.pageId}],
      independentlyVerifiedRowProofRefs:new Set([evidence]),
    }),"two city ledgers on identical source Sheet row");
  }finally{db.close()}
});
Deno.test("registration requires physically preprovisioned page not inferred next free index",async()=>{
  const {db,kv}=await seeded();
  try{
    await deny(()=>registerProjectionSlotsStaging({kv,target,scopeId,
      records:[{...row(0),pageId:"page.fixture.not_created"}],
      independentlyVerifiedRowProofRefs:new Set([evidence])}),
      "invented Google sheet page");
    await deny(()=>registerProjectionSlotsStaging({kv,target,scopeId,
      records:[{...row(0),row:10001}],
      independentlyVerifiedRowProofRefs:new Set([evidence])}),
      "row outside authenticated physical file range");
    await deny(()=>resolveIndexedSlotsStaging({kv,target,scopeId,
      physicalResourceId:spreadsheet,
      requested:[{kind:"account",id:row(0).id}]}),
      "unregistered merchant ledger row");
  }finally{db.close()}
});
