import {auditIsolatedGoogleSandbox} from
  "../src/ec06_isolated_google_audit_probe.ts";

const scope="scope.fixture.audit_guarded";
const emp="account.fixture.employer",worker="account.fixture.worker";
const escrow="escrow.fixture.wage",t1="tx.fixture.reserve",t2="tx.fixture.pay";
const plan={spreadsheetId:"test.synthetic.copy.sheet",
  documentId:"test.synthetic.copy.doc",scopeId:scope,
  txIds:[t1,t2] as const};
const p0={accountId:emp,availableCopper:70,heldCopper:0};
const p1={...p0,availableCopper:40,heldCopper:30};
const p2={...p1,heldCopper:0};
const w0={accountId:worker,availableCopper:0,heldCopper:0};
const w2={...w0,availableCopper:30};
const e1={schema:"EC06_INDEX_ESCROW_V1",escrowId:escrow,scopeId:scope,
  demandId:"demand.fixture.shift",employerAccountId:emp,workerAccountId:worker,
  amountCopper:30,reservedCopper:30,state:"RESERVED",
  originalContractRef:"proof.fixture.contract"};
const e2={...e1,reservedCopper:0,state:"PAID"};
const mkMut=(kind:"account"|"escrow",id:string,before:unknown,after:unknown)=>
  ({kind,id,before,after});
const h1="a".repeat(64),h2="b".repeat(64);
function fakeGoogle(input:{forgeHash?:boolean;wrongRow?:boolean;wrongBefore?:boolean}={}){
  const first=[mkMut("account",emp,p0,p1),mkMut("escrow",escrow,null,e1)];
  const second=[mkMut("account",emp,input.wrongBefore?p0:p1,p2),
    mkMut("account",worker,w0,w2),mkMut("escrow",escrow,e1,e2)];
  const r=(tx:string,target:string,h:string,m:typeof first)=>({
    schema:"EC06_INDEXED_TARGET_RECEIPT_V1",target,txId:tx,scopeId:scope,
    journalHash:h,rowIds:m.map(x=>x.kind+"/"+x.id),
  });
  const lines=[
    "EC06_INDEX_DOC_GENESIS_V1 "+JSON.stringify({
      schema:"EC06_INDEX_DOC_GENESIS_V1",scopeId:scope,
      rows:{["account/"+emp]:p0,["account/"+worker]:w0,["escrow/"+escrow]:null},
    }),
    "EC06_INDEX_DOC_DELTA_V1 "+JSON.stringify({
      schema:"EC06_INDEX_DOC_DELTA_V1",scopeId:scope,txId:t1,
      journalHash:h1,mutations:first,
      receipt:r(t1,"LIVE_TRANSACTION_ARCHIVE",h1,first),
    }),
    "EC06_INDEX_DOC_DELTA_V1 "+JSON.stringify({
      schema:"EC06_INDEX_DOC_DELTA_V1",scopeId:scope,txId:t2,
      journalHash:h2,mutations:second,
      receipt:r(t2,"LIVE_TRANSACTION_ARCHIVE",h2,second),
    }),
  ];
  let calls=0;
  const get=async(url:string):Promise<unknown>=>{
    calls++;
    if(url.includes("EC06_IDX_ROWS"))
      return {values:[
        ["account/"+emp,JSON.stringify(input.wrongRow?p1:p2)],
        ["account/"+worker,JSON.stringify(w2)],
        ["escrow/"+escrow,JSON.stringify(e2)],
      ]};
    if(url.includes("EC06_IDX_RECEIPTS"))
      return {values:[
        [t1,JSON.stringify(r(t1,"TEMP_RUNTIME",h1,first))],
        [t2,JSON.stringify(r(t2,"TEMP_RUNTIME",input.forgeHash?h1:h2,second))],
      ]};
    if(url.includes("documents/"))
      return {revisionId:"fixture.document.revision",
        body:{content:[{paragraph:{elements:[{textRun:{
          content:lines.join("\n")+"\n",
        }}]}}]}};
    throw Error("Unexpected external service access");
  };
  return {get,readCount:()=>calls};
}
async function rejects(run:()=>Promise<unknown>){
  let denied=false;try{await run()}catch{denied=true}
  if(!denied)throw Error("Source tampering was accepted by real Google audit");
}
Deno.test("fixed nonproduction Google audit verifies both receipts and 70 copper via 3 bounded GETs",async()=>{
  const g=fakeGoogle();
  const result=await auditIsolatedGoogleSandbox(plan,g.get);
  if(g.readCount()!==3||result.transactionCount!==2||
     result.initialCopper!==70||result.finalCopper!==70||
     !result.archiveConsistent||!result.receiptsConsistent||
     !result.documentRevisionPresent)
    throw Error("Real Google read-only audit returned unverifiable proof");
});
Deno.test("Google audit rejects forged cross-target SHA, divergent materialized row and causal BEFORE",async()=>{
  for(const config of [{forgeHash:true},{wrongRow:true},{wrongBefore:true}]){
    await rejects(()=>auditIsolatedGoogleSandbox(plan,fakeGoogle(config).get));
  }
});
Deno.test("Google audit rejects wrong source scope and repeated TX IDs before any API call",async()=>{
  const g=fakeGoogle();
  await rejects(()=>auditIsolatedGoogleSandbox({...plan,scopeId:"BAD"},g.get));
  await rejects(()=>auditIsolatedGoogleSandbox({...plan,txIds:[t1,t1]},g.get));
  if(g.readCount()!==0)throw Error("Invalid probe made an unnecessary Google request");
});
