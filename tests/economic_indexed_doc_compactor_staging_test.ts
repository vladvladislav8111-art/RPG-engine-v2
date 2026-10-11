import {
  compactOneIndexedDocWindowStaging,
} from "../src/economic_indexed_doc_compactor_staging.ts";
import {
  parseBoundedIndexedDocWindow,ec06SegmentKey,
  type Ec06DocSegmentManifest,
} from "../src/economic_indexed_doc_checkpoint_staging.ts";
import {indexedEc06Keys} from "../src/economic_indexed_wholesale_kv.ts";
import {makeIndexedDeltaIntent,type IndexedDeltaTargetAdapter,
  type IndexedTargetReceipt,type IndexedDeltaIntent,type DeltaTarget,
} from "../src/economic_indexed_delta_projection.ts";
import type {IndexedWageJournal} from "../src/economic_indexed_wage_kv.ts";

const scope="scope.fixture.compact_manually";
const docId="fixture.isolated.document_compaction";
const employer="account.fixture.employer";
const tx=(n:number)=>"tx.fixture.checkpoint_"+String(n).padStart(3,"0");
const esc=(n:number)=>"escrow.fixture.compact_"+String(n).padStart(3,"0");
const starting=100;
const id=(r:{kind:string;id:string})=>r.kind+"/"+r.id;
const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
class FakeDocs{
  text="";
  rev=1;
  writes=0;
  ambiguous=false;
  async get(url:string,request?:RequestInit):Promise<unknown>{
    if(!url.includes("/documents/"+encodeURIComponent(docId)))
      throw Error("Other Google file touched");
    if(!request){
      return {revisionId:"rev.fixture."+this.rev,
        tabs:[{tabProperties:{tabId:"t.0"},documentTab:{body:{content:[{
          startIndex:1,endIndex:this.text.length+1,
          paragraph:{elements:[{textRun:{content:this.text}}]},
        }]}}}]};
    }
    if(request.method!=="POST"||!url.endsWith(":batchUpdate"))
      throw Error("Non-revision-guarded Google write attempted");
    const body=JSON.parse(String(request.body)) as {
      writeControl:{requiredRevisionId:string};
      requests:Array<{deleteContentRange?:{range:{startIndex:number;endIndex:number;tabId:string}};
        insertText?:{location:{index:number;tabId:string};text:string}}>;
    };
    if(body.writeControl.requiredRevisionId!=="rev.fixture."+this.rev||
       body.requests.length!==2||
       body.requests[0].deleteContentRange?.range.startIndex!==1||
       body.requests[0].deleteContentRange?.range.endIndex!==this.text.length||
       body.requests[1].insertText?.location.index!==1)
      throw Error("Docs operation was not one atomic native revision-guarded replacement");
    this.text=body.requests[1].insertText.text;
    this.rev++;
    this.writes++;
    if(this.ambiguous)throw Error("Injected lost HTTP response after Google success");
    return {replies:[{},{}]};
  }
}
class FakeSheetReceipts implements IndexedDeltaTargetAdapter{
  readonly receiptMap=new Map<string,IndexedTargetReceipt>();
  missing:string|null=null;
  async readReceipt(target:DeltaTarget,scopeId:string,txId:string){
    if(target!=="TEMP_RUNTIME"||scopeId!==scope)throw Error("Unexpected test target");
    return this.missing===txId?null:this.receiptMap.get(txId)??null;
  }
  async verifyDurableReceipt(target:DeltaTarget,intent:IndexedDeltaIntent,
    proof:IndexedTargetReceipt){
    return target==="TEMP_RUNTIME"&&intent.scopeId===scope&&
      eq(proof,this.receiptMap.get(intent.txId))&&
      this.missing!==intent.txId;
  }
  async readRows():Promise<never>{throw Error("Compactor cannot issue row writes")}
  async applyRowsAndReceiptAtomically():Promise<never>{
    throw Error("Compactor tried to create a new economic projection");
  }
}
async function fixture(){
  const db=await Deno.openKv(":memory:");
  const google=new FakeDocs(),adapter=new FakeSheetReceipts();
  const genesis:Record<string,unknown>={
    ["account/"+employer]:{accountId:employer,availableCopper:starting,heldCopper:0},
  };
  for(let n=1;n<=16;n++)genesis["escrow/"+esc(n)]=null;
  google.text="EC06_INDEX_DOC_GENESIS_V1 "+JSON.stringify({
    schema:"EC06_INDEX_DOC_GENESIS_V1",scopeId:scope,rows:genesis})+"\n";
  for(let n=1;n<=16;n++){
    const before={accountId:employer,availableCopper:starting-n+1,heldCopper:0};
    const after={accountId:employer,availableCopper:starting-n,heldCopper:1};
    // Each reserve is an isolated 1c escrow with held copper accumulated.
    before.heldCopper=n-1;
    after.heldCopper=n;
    const escrowAfter={
      schema:"EC06_INDEX_ESCROW_V1",escrowId:esc(n),scopeId:scope,
      demandId:"demand.fixture.compact_"+n,
      employerAccountId:employer,
      workerAccountId:"account.fixture.worker",amountCopper:1,
      reservedCopper:1,state:"RESERVED",
      originalContractRef:"proof.fixture.accepted_"+n,
    } as const;
    const journal:IndexedWageJournal={
      schema:"EC06_INDEX_WAGE_JOURNAL_V1",
      scopeId:scope,txId:tx(n),kind:"RESERVE",
      demandId:escrowAfter.demandId,
      sourceEvidenceRef:"proof.fixture.real_completion_"+n,
      copper:1,accounts:[{id:employer,before,after}],
      escrow:{id:esc(n),before:null,after:escrowAfter},
    };
    const intent=await makeIndexedDeltaIntent(journal);
    const docReceipt:IndexedTargetReceipt={
      schema:"EC06_INDEXED_TARGET_RECEIPT_V1",
      target:"LIVE_TRANSACTION_ARCHIVE",
      txId:tx(n),scopeId:scope,journalHash:intent.journalHash,
      rowIds:intent.mutations.map(id),
    };
    const sheetReceipt={...docReceipt,target:"TEMP_RUNTIME" as const};
    adapter.receiptMap.set(tx(n),sheetReceipt);
    google.text+="EC06_INDEX_DOC_DELTA_V1 "+JSON.stringify({
      schema:"EC06_INDEX_DOC_DELTA_V1",scopeId:scope,
      txId:tx(n),journalHash:intent.journalHash,
      mutations:intent.mutations,receipt:docReceipt,
    })+"\n";
    await Promise.all([
      db.set(indexedEc06Keys.tx(tx(n)) as Deno.KvKey,{
        schema:"EC06_INDEX_WAGE_TX_V1",scopeId:scope,txId:tx(n),
      }),
      db.set(indexedEc06Keys.journal(tx(n)) as Deno.KvKey,journal),
      db.set(indexedEc06Keys.outbox(tx(n)) as Deno.KvKey,{
        schema:"EC06_INDEX_OUTBOX_V1",scopeId:scope,txId:tx(n),
        state:"PROJECTED_INDEXED",
        journalKey:indexedEc06Keys.journal(tx(n)),
        proofRef:"proof.ec06.indexed."+tx(n)+"."+intent.journalHash,
      }),
    ]);
  }
  return {db,google,adapter};
}
async function rejects(run:()=>Promise<unknown>){
  let failed=false;try{await run()}catch{failed=true}
  if(!failed)throw Error("Unsafe indexed Doc checkpoint was permitted");
}
Deno.test("manual 16-TX checkpoint rewrites same Google Doc, preserves primary history and verifies KV manifest",async()=>{
  const {db,google,adapter}=await fixture();
  try{
    const first=parseBoundedIndexedDocWindow(google.text,scope);
    if(first.deltas.length!==16)throw Error("Fixture did not have 16 source events");
    const result=await compactOneIndexedDocWindowStaging({
      db,adapter,scopeId:scope,physicalDocId:docId,
      httpJson:google.get.bind(google),
    });
    const compact=parseBoundedIndexedDocWindow(google.text,scope);
    const manifest=(await db.get<Ec06DocSegmentManifest>(
      ec06SegmentKey(scope,docId,1) as Deno.KvKey)).value;
    const lock=(await db.get<{state:string}>(
      ["rpg-v2","ec06","google-unique-writer",
        "LIVE_TRANSACTION_ARCHIVE",docId])).value;
    if(google.writes!==1||result.compactedTransactions!==16||
       result.segmentNumber!==1||!result.googleReadbackConfirmed||
       compact.deltas.length!==0||
       compact.checkpoint?.segmentHash!==manifest?.segmentHash||
       manifest?.state!=="APPLIED"||lock?.state!=="RELEASED"||
       !(await db.get(indexedEc06Keys.journal(tx(1)) as Deno.KvKey)).value||
       !(await db.get(indexedEc06Keys.journal(tx(16)) as Deno.KvKey)).value)
      throw Error("Doc compacted before source-proof or destroyed immutable KV journal");
    await rejects(()=>compactOneIndexedDocWindowStaging({
      db,adapter,scopeId:scope,physicalDocId:docId,
      httpJson:google.get.bind(google),
    }));
    if(google.writes!==1)throw Error("Repeated checkpoint modified the same window");
  }finally{db.close()}
});
Deno.test("network response lost after Docs revision-CAS write leaves HELD and PREPARED, never silent replay",async()=>{
  const {db,google,adapter}=await fixture();
  try {
    google.ambiguous=true;
    await rejects(()=>compactOneIndexedDocWindowStaging({
      db,adapter,scopeId:scope,physicalDocId:docId,
      httpJson:google.get.bind(google),
    }));
    const manifest=(await db.get<Ec06DocSegmentManifest>(
      ec06SegmentKey(scope,docId,1) as Deno.KvKey)).value;
    const lock=(await db.get<{state:string}>(
      ["rpg-v2","ec06","google-unique-writer",
        "LIVE_TRANSACTION_ARCHIVE",docId])).value;
    if(google.writes!==1||manifest?.state!=="PREPARED"||
       lock?.state!=="HELD"||
       parseBoundedIndexedDocWindow(google.text,scope).deltas.length!==0)
      throw Error("Ambiguous external write auto-unlocked or ACKed unverified checkpoint");
  }finally{db.close()}
});
Deno.test("missing old Sheets receipt rejects compaction BEFORE claiming a long-lived Google lock",async()=>{
  const {db,google,adapter}=await fixture();
  try {
    adapter.missing=tx(7);
    await rejects(()=>compactOneIndexedDocWindowStaging({
      db,adapter,scopeId:scope,physicalDocId:docId,
      httpJson:google.get.bind(google),
    }));
    const lock=(await db.get(["rpg-v2","ec06","google-unique-writer",
      "LIVE_TRANSACTION_ARCHIVE",docId])).value;
    if(lock!==null||google.writes!==0||
       (await db.get(ec06SegmentKey(scope,docId,1) as Deno.KvKey)).value!==null)
      throw Error("Rejected source proof nevertheless created manifest or Google lock");
  }finally{db.close()}
});
