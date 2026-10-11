import {wrapDenoAtomicEconomyKv} from "../src/economic_deno_kv_adapter.ts";
import {indexedEc06Keys,type IndexedOutbox} from "../src/economic_indexed_wholesale_kv.ts";
import {
  makeIsolatedIndexedGoogleHttpAdapter,
  type IndexedDocGenesis,type IndexedGoogleSlotPlan,
} from "../src/economic_indexed_google_http_staging.ts";
import {reconcileIndexedDeltaStaging,type IndexedTargetReceipt} from "../src/economic_indexed_delta_projection.ts";
import type {IndexedWageJournal} from "../src/economic_indexed_wage_kv.ts";
import type {EconomicAccount} from "../src/economic_atomic_plan.ts";
import {config} from "../src/config.ts";

const scope="scope.fixture.indexed_google_http";
const sheetId="fixture.isolated.projected_spreadsheet";
const docId="fixture.isolated.projected_document";
const owner="account.fixture.employer";
const worker="account.fixture.worker";
const escrow="escrow.fixture.job";
const tx="tx.fixture.reserve_salary";
const newerTx="tx.fixture.pay_salary";
const rowPlan:IndexedGoogleSlotPlan={
  rows:[{kind:"account",id:owner,row:2},{kind:"account",id:worker,row:3},
    {kind:"escrow",id:escrow,row:4}],
  receiptSlots:[{txId:tx,row:2},{txId:newerTx,row:3}],
};
const payerBefore:EconomicAccount={accountId:owner,availableCopper:70,heldCopper:0};
const payerReserved:EconomicAccount={...payerBefore,availableCopper:40,heldCopper:30};
const payerPaid:EconomicAccount={...payerReserved,heldCopper:0};
const workerBefore:EconomicAccount={accountId:worker,availableCopper:0,heldCopper:0};
const workerAfter:EconomicAccount={...workerBefore,availableCopper:30};
const escrowBefore=null;
const escrowReserved={
  schema:"EC06_INDEX_ESCROW_V1",escrowId:escrow,
  scopeId:scope,demandId:"demand.fixture.job",
  employerAccountId:owner,workerAccountId:worker,
  amountCopper:30,reservedCopper:30,
  state:"RESERVED",originalContractRef:"proof.fixture.accepted_contract",
} as const;
const escrowPaid={...escrowReserved,reservedCopper:0,state:"PAID"} as const;
const journal:IndexedWageJournal={
  schema:"EC06_INDEX_WAGE_JOURNAL_V1",
  scopeId:scope,txId:tx,kind:"RESERVE",
  demandId:escrowReserved.demandId,
  sourceEvidenceRef:"proof.fixture.source_real_wage",
  copper:30,accounts:[{id:owner,before:payerBefore,after:payerReserved}],
  escrow:{id:escrow,before:null,after:escrowReserved},
};
const paidJournal:IndexedWageJournal={
  schema:"EC06_INDEX_WAGE_JOURNAL_V1",
  scopeId:scope,txId:newerTx,kind:"PAY",
  demandId:escrowReserved.demandId,
  sourceEvidenceRef:"proof.fixture.actual_completion",
  copper:30,accounts:[
    {id:owner,before:payerReserved,after:payerPaid},
    {id:worker,before:workerBefore,after:workerAfter},
  ],
  escrow:{id:escrow,before:escrowReserved,after:escrowPaid},
};
const genesis:IndexedDocGenesis={
  schema:"EC06_INDEX_DOC_GENESIS_V1",scopeId:scope,
  rows:{
    ["account/"+owner]:payerBefore,
    ["account/"+worker]:workerBefore,
    ["escrow/"+escrow]:escrowBefore,
  },
};
class MockGoogleApi{
  rows=new Map<number,[string,string]>([
    [2,["account/"+owner,JSON.stringify(payerBefore)]],
    [3,["account/"+worker,JSON.stringify(workerBefore)]],
    [4,["escrow/"+escrow,"null"]],
  ]);
  receipts=new Map<number,[string,string]>([
    [2,[tx,"null"]],[3,[newerTx,"null"]],
  ]);
  docText="EC06_INDEX_DOC_GENESIS_V1 "+JSON.stringify(genesis)+"\n";
  docRevision=1;
  sheetBatchCalls=0;
  docsBatchCalls=0;
  lastSheetRequestCount=0;
  failBeforeDocs=false;
  failAfterSheetWrite=false;
  async request(url:string,init?:RequestInit):Promise<unknown>{
    const method=init?.method??"GET";
    if(url.includes("/spreadsheets/")){
      if(!url.includes(encodeURIComponent(sheetId)))
        throw Error("Touched another Google spreadsheet");
      if(method==="GET"&&url.includes("/values/")){
        const label=decodeURIComponent(url.split("/values/")[1].split("?")[0]);
        const match=label.match(/^(EC06_IDX_ROWS|EC06_IDX_RECEIPTS)!A(\d+):B\d+$/);
        if(!match)throw Error("Unexpected indexed slot: "+label);
        const map=match[1]==="EC06_IDX_ROWS"?this.rows:this.receipts;
        const row=map.get(Number(match[2]));
        return {values:row?[row]:[]};
      }
      if(method==="POST"&&url.endsWith(":batchUpdate")){
        const body=JSON.parse(String(init?.body)) as {requests:Array<{
          updateCells:{start:{sheetId:number;rowIndex:number;columnIndex:number};
            rows:Array<{values:Array<{userEnteredValue:{stringValue:string}}>}>;
            fields:string};
        }>};
        const mutations=body.requests.map(x=>x.updateCells);
        if(mutations.length<2||
           mutations.some(m=>m.fields!=="userEnteredValue"||
             m.start.columnIndex!==1||m.rows.length!==1||
             m.rows[0].values.length!==1))
          throw Error("Rows and transaction proof not in ONE atomic Google batch");
        this.lastSheetRequestCount=mutations.length;
        this.sheetBatchCalls++;
        for(const m of mutations){
          const data=m.start.sheetId===73?this.rows:
            m.start.sheetId===74?this.receipts:null;
          if(!data)throw Error("Incorrect immutable Google staging sheet ID");
          const old=data.get(m.start.rowIndex+1);
          if(!old)throw Error("Updating an unprovisioned source/receipt row");
          data.set(m.start.rowIndex+1,[old[0],
            m.rows[0].values[0].userEnteredValue.stringValue]);
        }
        if(this.failAfterSheetWrite){
          this.failAfterSheetWrite=false;
          throw Error("Injected network loss AFTER Google's atomic source write");
        }
        return {replies:mutations.map(()=>({}))};
      }
    }
    if(url.includes("/documents/")){
      if(!url.includes(encodeURIComponent(docId)))
        throw Error("Touched another Docs archive");
      if(method==="GET")return {
        revisionId:"revision.fixture."+this.docRevision,
        body:{content:[{paragraph:{elements:[{textRun:{content:this.docText}}]}}]},
      };
      if(method==="POST"&&url.endsWith(":batchUpdate")){
        if(this.failBeforeDocs){
          this.failBeforeDocs=false;
          throw Error("Injected Google Docs outage");
        }
        const body=JSON.parse(String(init?.body)) as {
          writeControl:{requiredRevisionId:string};
          requests:Array<{insertText:{text:string}}>;
        };
        if(body.writeControl.requiredRevisionId!==
          "revision.fixture."+this.docRevision)
          throw Error("Native Docs writeControl failed stale revision");
        if(body.requests.length!==1||
           !body.requests[0].insertText.text.includes("EC06_INDEX_DOC_DELTA_V1 "))
          throw Error("Doc archive was not a single immutable TX");
        this.docText+=body.requests[0].insertText.text;
        this.docsBatchCalls++;
        this.docRevision++;
        return {replies:[{}]};
      }
    }
    throw Error("Unsupported Google HTTP operation "+method+" "+url);
  }
}
async function setup(){
  const db=await Deno.openKv(":memory:");
  for(const j of [journal,paidJournal]){
    await Promise.all([
      db.set(indexedEc06Keys.tx(j.txId),{
        schema:"EC06_INDEX_WAGE_TX_V1",txId:j.txId,scopeId:scope,
      }),
      db.set(indexedEc06Keys.journal(j.txId),j),
      db.set(indexedEc06Keys.outbox(j.txId),{
        schema:"EC06_INDEX_OUTBOX_V1",txId:j.txId,scopeId:scope,
        state:"PENDING_INDEXED_PROJECTION",
        journalKey:indexedEc06Keys.journal(j.txId),
      } satisfies IndexedOutbox),
    ]);
  }
  const api=new MockGoogleApi();
  const kv=wrapDenoAtomicEconomyKv(db);
  const adapter=makeIsolatedIndexedGoogleHttpAdapter({
    stagingSpreadsheetId:sheetId,stagingDocumentId:docId,
    rowsSheetId:73,receiptsSheetId:74,scopeId:scope,
    slots:rowPlan,kv,httpJson:api.request.bind(api),
  });
  return {db,kv,api,adapter};
}
async function rejects(fn:()=>Promise<unknown>,name:string){
  let failed=false;try{await fn()}catch{failed=true}
  if(!failed)throw Error("Unsafe Google staged write accepted: "+name);
}
Deno.test("indexed Google API structural batch writes changed rows plus receipt, Docs guarded log and KV ACK",async()=>{
  const {db,kv,api,adapter}=await setup();
  try{
    const result=await reconcileIndexedDeltaStaging({
      kv,adapter,scopeId:scope,txId:tx,
    });
    if(result.state!=="PROJECTED_INDEXED"||
       result.intent.mutations.length!==2||
       api.sheetBatchCalls!==1||api.lastSheetRequestCount!==3||
       api.docsBatchCalls!==1||
       JSON.parse(api.rows.get(2)![1]).availableCopper!==40||
       JSON.parse(api.rows.get(4)![1]).state!=="RESERVED")
      throw Error("Real Google HTTP shape didn't apply exact wage rows and receipt");
    const receipt=JSON.parse(api.receipts.get(2)![1]) as IndexedTargetReceipt;
    if(receipt.txId!==tx||receipt.journalHash!==result.intent.journalHash||
       (await adapter.readReceipt("LIVE_TRANSACTION_ARCHIVE",scope,tx))?.txId!==tx)
      throw Error("Google target proof not bound to exact primary journal");
    const a=await reconcileIndexedDeltaStaging({kv,adapter,scopeId:scope,txId:tx});
    if(a.state!=="ALREADY_PROJECTED_INDEXED"||api.sheetBatchCalls!==1)
      throw Error("Repeat primary outbox ACK re-transferred money");
  }finally{db.close()}
});
Deno.test("two sequential overlapping Google indexed wage events preserve exact chronological account balances",async()=>{
  const {db,kv,api,adapter}=await setup();
  try{
    await rejects(()=>reconcileIndexedDeltaStaging({kv,adapter,scopeId:scope,
      txId:newerTx}),"worker payout before wage reserve materialized");
    // The earlier rejection happened before applying any Google target lock.
    await reconcileIndexedDeltaStaging({kv,adapter,scopeId:scope,txId:tx});
    await reconcileIndexedDeltaStaging({kv,adapter,scopeId:scope,txId:newerTx});
    if(JSON.parse(api.rows.get(2)![1]).availableCopper!==40||
       JSON.parse(api.rows.get(2)![1]).heldCopper!==0||
       JSON.parse(api.rows.get(3)![1]).availableCopper!==30||
       JSON.parse(api.rows.get(4)![1]).state!=="PAID"||
       api.sheetBatchCalls!==2||api.docsBatchCalls!==2)
      throw Error("Indexed projection violated source escrow temporal order");
  }finally{db.close()}
});
Deno.test("Docs outage after fully committed Sheets leaves durable receipt and blocks automatic lock theft",async()=>{
  const {db,kv,api,adapter}=await setup();
  try{
    api.failBeforeDocs=true;
    await rejects(()=>reconcileIndexedDeltaStaging({
      kv,adapter,scopeId:scope,txId:tx,
    }),"Docs unavailable after Sheets posted");
    if(api.sheetBatchCalls!==1||api.docsBatchCalls!==0||
       (await adapter.readReceipt("TEMP_RUNTIME",scope,tx))?.txId!==tx)
      throw Error("Sheets committed state lost during partial external outage");
    await rejects(()=>reconcileIndexedDeltaStaging({
      kv,adapter,scopeId:scope,txId:tx,
    }),"uncertain Docs write requires verified administrative lock reconciliation");
    const o=await kv.get<{state:string}>(indexedEc06Keys.outbox(tx));
    if(o.value?.state!=="PENDING_INDEXED_PROJECTION"||
       api.sheetBatchCalls!==1)
      throw Error("Unverified Docs archival receipt nevertheless ACKed primary ledger");
  }finally{db.close()}
});
Deno.test("post-Sheets-commit lost HTTP response keeps durable receipt and exclusive lock HELD",async()=>{
  const {db,kv,api,adapter}=await setup();
  try{
    api.failAfterSheetWrite=true;
    await rejects(()=>reconcileIndexedDeltaStaging({
      kv,adapter,scopeId:scope,txId:tx,
    }),"ambiguous HTTP response after real source mutation");
    if(api.sheetBatchCalls!==1||
       (await adapter.readReceipt("TEMP_RUNTIME",scope,tx))?.txId!==tx)
      throw Error("Ambiguous successful Sheet mutation vanished");
    await rejects(()=>reconcileIndexedDeltaStaging({
      kv,adapter,scopeId:scope,txId:newerTx,
    }),"later overlapping payroll projection cannot precede missing older Docs");
  }finally{db.close()}
});
Deno.test("source staging adapter refuses live Sheets/Docs, unplanned item and conflicting row slots",async()=>{
  const {db,kv}=await setup();
  try{
    const build=(sheet:string,doc:string,slots:IndexedGoogleSlotPlan)=>
      makeIsolatedIndexedGoogleHttpAdapter({
        stagingSpreadsheetId:sheet,stagingDocumentId:doc,
        rowsSheetId:73,receiptsSheetId:74,scopeId:scope,
        kv,slots,httpJson:async()=>({}),
      });
    let invalid=false;
    try{build(config.files.TEMP_RUNTIME,docId,rowPlan)}catch{invalid=true}
    if(!invalid)throw Error("Staging writes to real player runtime");
    invalid=false;
    try{build(sheetId,config.files.LIVE_TRANSACTION_ARCHIVE,rowPlan)}catch{invalid=true}
    if(!invalid)throw Error("Staging writes to real transaction archive");
    invalid=false;
    try{build(sheetId,docId,{...rowPlan,
      rows:[...rowPlan.rows,{kind:"lot",id:"item.fixture.unregistered",row:2}]})}
    catch{invalid=true}
    if(!invalid)throw Error("Two distinct physical economic rows shared one Google slot");
  }finally{db.close()}
});
