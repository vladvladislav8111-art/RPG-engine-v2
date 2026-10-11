import {inspectHeldDocCompactionReadOnly} from
  "../src/economic_indexed_compaction_recovery_dossier.ts";
import {parseBoundedIndexedDocWindow,buildEc06DocCheckpointPlan,
  ec06SegmentKey,type Ec06DocSegmentManifest} from
  "../src/economic_indexed_doc_checkpoint_staging.ts";
import {indexedEc06Keys} from "../src/economic_indexed_wholesale_kv.ts";
import {makeIndexedDeltaIntent} from "../src/economic_indexed_delta_projection.ts";
import type {IndexedWageJournal} from "../src/economic_indexed_wage_kv.ts";

const scope="scope.fixture.recovery",docId="fixture.doc.manual_recovery",
  acct="account.fixture.company";
const tx=(n:number)=>"tx.fixture.incident_"+String(n).padStart(3,"0");
const escrow=(n:number)=>"escrow.fixture.incident_"+String(n).padStart(3,"0");
const lockKey=["rpg-v2","ec06","google-unique-writer",
  "LIVE_TRANSACTION_ARCHIVE",docId] as const;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
async function prepared(){
  const db=await Deno.openKv(":memory:");
  const rows:Record<string,unknown>={
    ["account/"+acct]:{accountId:acct,availableCopper:100,heldCopper:0},
  };
  for(let n=1;n<=16;n++)rows["escrow/"+escrow(n)]=null;
  let text="EC06_INDEX_DOC_GENESIS_V1 "+JSON.stringify({
    schema:"EC06_INDEX_DOC_GENESIS_V1",scopeId:scope,rows,
  })+"\n";
  for(let n=1;n<=16;n++){
    const e={
      schema:"EC06_INDEX_ESCROW_V1",scopeId:scope,escrowId:escrow(n),
      employerAccountId:acct,workerAccountId:"account.fixture.worker",
      demandId:"demand.fixture."+n,amountCopper:1,
      reservedCopper:1,state:"RESERVED",
      originalContractRef:"proof.fixture.contract_"+n,
    } as const;
    const before={accountId:acct,availableCopper:101-n,heldCopper:n-1};
    const after={accountId:acct,availableCopper:100-n,heldCopper:n};
    const journal:IndexedWageJournal={
      schema:"EC06_INDEX_WAGE_JOURNAL_V1",
      txId:tx(n),scopeId:scope,kind:"RESERVE",demandId:e.demandId,
      sourceEvidenceRef:"proof.fixture.completed_"+n,copper:1,
      accounts:[{id:acct,before,after}],
      escrow:{id:escrow(n),before:null,after:e},
    };
    const intent=await makeIndexedDeltaIntent(journal);
    text+="EC06_INDEX_DOC_DELTA_V1 "+JSON.stringify({
      schema:"EC06_INDEX_DOC_DELTA_V1",scopeId:scope,txId:tx(n),
      journalHash:intent.journalHash,mutations:intent.mutations,
      receipt:{schema:"EC06_INDEXED_TARGET_RECEIPT_V1",
        target:"LIVE_TRANSACTION_ARCHIVE",
        txId:tx(n),scopeId:scope,journalHash:intent.journalHash,
        rowIds:intent.mutations.map(m=>m.kind+"/"+m.id)},
    })+"\n";
    await db.set(indexedEc06Keys.tx(tx(n)) as Deno.KvKey,{
      schema:"EC06_INDEX_WAGE_TX_V1",scopeId:scope,txId:tx(n),
    });
    await db.set(indexedEc06Keys.journal(tx(n)) as Deno.KvKey,journal);
    await db.set(indexedEc06Keys.outbox(tx(n)) as Deno.KvKey,{
      schema:"EC06_INDEX_OUTBOX_V1",scopeId:scope,txId:tx(n),
      state:"PROJECTED_INDEXED",journalKey:indexedEc06Keys.journal(tx(n)),
      proofRef:"proof.ec06.indexed."+tx(n)+"."+intent.journalHash,
    });
  }
  const plan=await buildEc06DocCheckpointPlan({
    scopeId:scope,physicalDocId:docId,
    window:parseBoundedIndexedDocWindow(text,scope),
  });
  await db.set(ec06SegmentKey(scope,docId,1) as Deno.KvKey,plan.manifest);
  await db.set(lockKey as Deno.KvKey,{
    schema:"EC06_GOOGLE_LOCK_V1",scopeId:scope,
    target:"LIVE_TRANSACTION_ARCHIVE",resourceId:docId,
    token:"fixture.lock.token",state:"HELD",epoch:1,
  });
  let googleText=text;
  const provider={
    async getLiveDocEvidence(requestedId:string){
      if(requestedId!==docId)throw Error("Wrong physical Doc");
      return {revisionId:"fixture.revision.1",bodyText:googleText};
    },
  };
  return {db,provider,plan,getDoc:()=>googleText,
    setDoc:(value:string)=>{googleText=value;}};
}
function frozen(report:{
  quiescenceProven:boolean;externalWritersExcluded:boolean;
  lockReleaseAuthorized:boolean;financialWrites:number;
  checkedSourceTxCount:number;
},expected:number){
  if(report.quiescenceProven||report.externalWritersExcluded||
     report.lockReleaseAuthorized||report.financialWrites!==0||
     report.checkedSourceTxCount!==expected)
    throw Error("Read-only dossier fabricated external quiescence or financial action");
}
Deno.test("unwritten Google compaction has PREPARED KV manifest, HELD lock and no release authority",async()=>{
  const f=await prepared();
  try{
    const x=await inspectHeldDocCompactionReadOnly({
      db:f.db,provider:f.provider,scopeId:scope,
      physicalDocId:docId,segmentNumber:1,
    });
    if(x.classification!=="PREPARED_DOC_STILL_OLD")
      throw Error("Read-only review lost pre-checkpoint phase");
    frozen(x,16);
    if((await f.db.get<{state:string}>(lockKey as Deno.KvKey)).value?.state!=="HELD")
      throw Error("Read-only inspector altered writer lock");
  }finally{f.db.close()}
});
Deno.test("lost Google success response with PREPARED KV is classified, never ACKed/unlocked",async()=>{
  const f=await prepared();
  try{
    f.setDoc(f.plan.compactedText);
    const x=await inspectHeldDocCompactionReadOnly({
      db:f.db,provider:f.provider,scopeId:scope,
      physicalDocId:docId,segmentNumber:1,
    });
    if(x.classification!=="DOC_WRITTEN_KV_ACK_PENDING")
      throw Error("Lost-after-Google-write incident misclassified");
    frozen(x,16);
    const m=(await f.db.get<Ec06DocSegmentManifest>(
      ec06SegmentKey(scope,docId,1) as Deno.KvKey)).value;
    if(m?.state!=="PREPARED"||
       (await f.db.get<{state:string}>(lockKey as Deno.KvKey)).value?.state!=="HELD")
      throw Error("Read-only dossier committed/acknowledged ambiguous Google event");
  }finally{f.db.close()}
});
Deno.test("APPLIED KV with HELD lock is still unsafe to auto-release",async()=>{
  const f=await prepared();
  try{
    f.setDoc(f.plan.compactedText);
    await f.db.set(ec06SegmentKey(scope,docId,1) as Deno.KvKey,{
      ...f.plan.manifest,state:"APPLIED",
    });
    const x=await inspectHeldDocCompactionReadOnly({
      db:f.db,provider:f.provider,scopeId:scope,
      physicalDocId:docId,segmentNumber:1,
    });
    if(x.classification!=="KV_APPLIED_LOCK_HELD")
      throw Error("Confirmed archive ACK is not correctly classified");
    frozen(x,16);
  }finally{f.db.close()}
});
Deno.test("forged source journal SHA, unknown Doc, released lock all quarantine without changes",async()=>{
  const f=await prepared();
  try{
    f.setDoc(f.plan.compactedText);
    await f.db.set(indexedEc06Keys.journal(tx(2)) as Deno.KvKey,
      {schema:"EC06_WAGE_UNTRUSTED_JOURNAL",txId:tx(2)});
    const x=await inspectHeldDocCompactionReadOnly({
      db:f.db,provider:f.provider,scopeId:scope,
      physicalDocId:docId,segmentNumber:1,
    });
    if(x.classification!=="QUARANTINE_UNKNOWN_OR_DIVERGENT")
      throw Error("Forged primary TX journal escaped quarantine");
    frozen(x,0);
    const state=(await f.db.get<{state:string}>(lockKey as Deno.KvKey)).value;
    if(!same(state?.state,"HELD"))throw Error("Dossier modified a HELD lock");
  }finally{f.db.close()}
});
