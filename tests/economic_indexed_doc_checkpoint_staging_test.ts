import {
  MAX_EC06_DOC_TAIL,ZERO_EC06_SEGMENT_HASH,
  parseBoundedIndexedDocWindow,buildEc06DocCheckpointPlan,
  ec06Sha256,
} from "../src/economic_indexed_doc_checkpoint_staging.ts";

const scope="scope.fixture.doc_window",doc="fixture.docs.bounded_single_doc";
const payer="account.fixture.payer",key="account/"+payer;
const g={schema:"EC06_INDEX_DOC_GENESIS_V1",scopeId:scope,
  rows:{[key]:{accountId:payer,availableCopper:100,heldCopper:0}}};
function event(n:number,start:number){
  const txId="tx.fixture.doc_window_"+String(n).padStart(3,"0");
  const hash=n.toString(16).padStart(64,"0");
  const before={accountId:payer,availableCopper:start,heldCopper:0};
  const after={accountId:payer,availableCopper:start-1,heldCopper:0};
  return {schema:"EC06_INDEX_DOC_DELTA_V1",scopeId:scope,txId,
    journalHash:hash,mutations:[{kind:"account",id:payer,before,after}],
    receipt:{schema:"EC06_INDEXED_TARGET_RECEIPT_V1",
      target:"LIVE_TRANSACTION_ARCHIVE",txId,scopeId:scope,
      journalHash:hash,rowIds:[key]},
  };
}
const genesisText="EC06_INDEX_DOC_GENESIS_V1 "+JSON.stringify(g)+"\n";
function window(startNum=1,startBalance=100,base=genesisText,n=16){
  let text=base;
  for(let i=0;i<n;i++)
    text+="EC06_INDEX_DOC_DELTA_V1 "+
      JSON.stringify(event(startNum+i,startBalance-i))+"\n";
  return text;
}
async function rejects(fn:()=>unknown|Promise<unknown>,name:string){
  let denied=false;try{await fn()}catch{denied=true}
  if(!denied)throw Error("Unsafe bounded archive operation permitted: "+name);
}
Deno.test("16 immutable document deltas become one tiny materialized checkpoint with verifiable source hash chain",async()=>{
  const first=parseBoundedIndexedDocWindow(window(),scope);
  if(first.deltas.length!==MAX_EC06_DOC_TAIL||
     (first.rows.get(key) as {availableCopper:number}).availableCopper!==84)
    throw Error("Bounded Doc genesis replay lost copper");
  const built=await buildEc06DocCheckpointPlan({
    scopeId:scope,physicalDocId:doc,window:first});
  if(built.manifest.previousHash!==ZERO_EC06_SEGMENT_HASH||
     built.manifest.segmentNumber!==1||
     built.manifest.source.length!==16||
     built.manifest.compactedTransactions!==16||
     built.checkpoint.rowsHash!==await ec06Sha256(built.checkpoint.rows))
    throw Error("Doc checkpoint dropped source manifest evidence");
  const shorter=parseBoundedIndexedDocWindow(built.compactedText,scope);
  if(shorter.deltas.length||shorter.checkpoint?.segmentHash!==built.manifest.segmentHash||
     (shorter.rows.get(key) as {availableCopper:number}).availableCopper!==84)
    throw Error("Doc checkpoint is not replayable or retains unbounded events");
  const secondText=window(17,84,built.compactedText,16);
  const second=parseBoundedIndexedDocWindow(secondText,scope);
  const next=await buildEc06DocCheckpointPlan({
    scopeId:scope,physicalDocId:doc,window:second});
  if(next.manifest.segmentNumber!==2||
     next.manifest.previousHash!==built.manifest.segmentHash||
     next.manifest.compactedTransactions!==32||
     (next.checkpoint.rows[key] as {availableCopper:number}).availableCopper!==68)
    throw Error("Second 16-TX segment failed to chain to independently stored first");
});
Deno.test("bounded Doc parser refuses 17th event, forged BEFORE and receipt SHA",async()=>{
  await rejects(()=>parseBoundedIndexedDocWindow(window(1,100,genesisText,17),scope),
    "17th whole-doc transaction accepted");
  let wrong=window(1,100,genesisText,1);
  wrong=wrong.replace('"availableCopper":100,"heldCopper":0},"after"',
    '"availableCopper":101,"heldCopper":0},"after"');
  await rejects(()=>parseBoundedIndexedDocWindow(wrong,scope),
    "causal BEFORE changed");
  wrong=window(1,100,genesisText,1).replace(
    '"journalHash":"'+event(1,100).journalHash+'","rowIds"',
    '"journalHash":"'+event(2,100).journalHash+'","rowIds"');
  await rejects(()=>parseBoundedIndexedDocWindow(wrong,scope),
    "Google receipt hash spoofed");
  await rejects(()=>parseBoundedIndexedDocWindow(
    genesisText+"EC06_UNRELATED_GOOGLE_CONTENT forbidden\n",scope),
    "unknown paragraph silently skipped");
});
Deno.test("checkpoint plan cannot compact an incomplete window or materialize an unbounded row universe",async()=>{
  const small=parseBoundedIndexedDocWindow(window(1,100,genesisText,2),scope);
  await rejects(()=>buildEc06DocCheckpointPlan({
    scopeId:scope,physicalDocId:doc,window:small}),"partial window compacted");
  const badRows:Record<string,unknown>={};
  for(let i=0;i<129;i++)badRows["account/account.fixture.many_"+i]={
    accountId:"account.fixture.many_"+i,availableCopper:1,heldCopper:0};
  await rejects(()=>parseBoundedIndexedDocWindow(
    "EC06_INDEX_DOC_GENESIS_V1 "+JSON.stringify({
      schema:"EC06_INDEX_DOC_GENESIS_V1",scopeId:scope,rows:badRows})+"\n",scope),
    "129 per-scope accounts considered bounded");
});
