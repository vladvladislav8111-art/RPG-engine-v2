/**
 * EC-06 indexed wage escrow against the SAME account rows as indexed wholesale.
 *
 * Staging only: never an independent treasury. The authorized source adapter
 * must attest actual active demand, employer/worker identity, consent and
 * completion/cancellation. This module neither offers jobs nor accepts work
 * for Shura; never opens KV or touches CURRENT Sheets.
 */
import type {EconomicAccount} from "./economic_atomic_plan.ts";
import type {AtomicKvStore,KvKey} from "./economic_kv_atomic.ts";
import {indexedEc06Keys,type IndexedSeal,type IndexedHome} from "./economic_indexed_wholesale_kv.ts";
export type IndexedWageContract={
  demandId:string;employerAccountId:string;workerAccountId:string;
  agreedCopper:number;sourceContractRef:string;dueGameMinute:number;
};
export type IndexedWageEscrow={
  schema:"EC06_INDEX_ESCROW_V1";
  escrowId:string;demandId:string;scopeId:string;
  employerAccountId:string;workerAccountId:string;
  amountCopper:number;reservedCopper:number;
  state:"RESERVED"|"PAID"|"RELEASED";
  originalContractRef:string;
};
export type IndexedWageEvent=
  |{kind:"RESERVE";txId:string;escrowId:string;
    contract:IndexedWageContract;sourceEvidenceRef:string}
  |{kind:"PAY"|"RELEASE";txId:string;escrowId:string;
    demandId:string;amountCopper:number;sourceEvidenceRef:string};
export type IndexedWageAuthority={
  nowGameMinute:number;
  migrationProofRefs:ReadonlySet<string>;
  sourceEvidenceRefs:ReadonlySet<string>;
  actualAcceptedContracts:ReadonlyMap<string,IndexedWageContract>;
  verifiedCompletedDemandIds:ReadonlySet<string>;
  verifiedCancelledDemandIds:ReadonlySet<string>;
};
export type IndexedWageJournal={
  schema:"EC06_INDEX_WAGE_JOURNAL_V1";
  scopeId:string;txId:string;kind:IndexedWageEvent["kind"];
  demandId:string;sourceEvidenceRef:string;
  accounts:readonly {id:string;before:EconomicAccount;after:EconomicAccount}[];
  escrow:{id:string;before:IndexedWageEscrow|null;after:IndexedWageEscrow};
  copper:number;
};
export type IndexedWageReceipt={
  schema:"EC06_INDEX_WAGE_TX_V1";
  txId:string;scopeId:string;kind:IndexedWageEvent["kind"];
  escrowId:string;demandId:string;
  intentFingerprint:string;
};
export type IndexedWageOutbox={
  schema:"EC06_INDEX_OUTBOX_V1";
  txId:string;scopeId:string;state:"PENDING_INDEXED_PROJECTION";
  journalKey:KvKey;
};
export const indexedWageKeys={
  escrow:(id:string):KvKey=>["rpg-v2","ec06","indexed","escrow",id],
  demand:(id:string):KvKey=>["rpg-v2","ec06","indexed","reserved-demand",id],
};
const valid=(x:unknown):x is string=>typeof x==="string" &&
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(x)&&x.length<=180;
const amt=(x:unknown):x is number=>typeof x==="number"&&
  Number.isSafeInteger(x)&&x>0;
const cash=(x:unknown):x is number=>typeof x==="number"&&
  Number.isSafeInteger(x)&&x>=0;
function contractMatches(a:IndexedWageContract,b:IndexedWageContract):boolean {
  return a.demandId===b.demandId&&a.employerAccountId===b.employerAccountId&&
    a.workerAccountId===b.workerAccountId&&a.agreedCopper===b.agreedCopper&&
    a.sourceContractRef===b.sourceContractRef&&a.dueGameMinute===b.dueGameMinute;
}
function requireHome(h:IndexedHome|null,id:string,scopeId:string){
  if(!h||h.schema!=="EC06_INDEX_HOME_V1"||h.kind!=="account"||
    h.scopeId!==scopeId||h.entityId!==id||!valid(h.sourceProofRef))
    throw Error("Wage party is not sourced to one primary economic scope");
}
function checked(a:EconomicAccount|null,id:string){
  if(!a||a.accountId!==id||!cash(a.availableCopper)||!cash(a.heldCopper))
    throw Error("Worker/employer has no valid pre-funded economic account");
  return a;
}
/** Every escrow id and demand remains an immutable global reserved marker. */
export async function commitIndexedWageStaging(kv:AtomicKvStore,input:{
  scopeId:string;event:IndexedWageEvent;authority:IndexedWageAuthority;
}):Promise<{
  kind:"INDEXED_WAGE_COMMITTED_STAGING"|"IDEMPOTENT_REPLAY";
  receipt:IndexedWageReceipt;outbox:IndexedWageOutbox;
}>{
  const {scopeId,event:e,authority:a}=input;
  if(!valid(scopeId)||!valid(e.txId)||!valid(e.escrowId)||
     !valid(e.sourceEvidenceRef)||!a.sourceEvidenceRefs.has(e.sourceEvidenceRef)||
     !Number.isSafeInteger(a.nowGameMinute)||a.nowGameMinute<0)
    throw Error("Wage event requires an independently attested economic intent");
  const demandId=e.kind==="RESERVE"?e.contract.demandId:e.demandId;
  if(!valid(demandId))throw Error("Wage demand ID absent");
  const fingerprint=JSON.stringify([scopeId,e]);
  const txKey=indexedEc06Keys.tx(e.txId),journalKey=indexedEc06Keys.journal(e.txId),
    outboxKey=indexedEc06Keys.outbox(e.txId);
  const prior=await kv.get<IndexedWageReceipt>(txKey);
  if(prior.value){
    if(prior.value.schema!=="EC06_INDEX_WAGE_TX_V1"||
      prior.value.intentFingerprint!==fingerprint||prior.value.scopeId!==scopeId)
      throw Error("Economic TX ID reused for different wage or trade operation");
    const [j,o]=await Promise.all([
      kv.get<IndexedWageJournal>(journalKey),
      kv.get<IndexedWageOutbox>(outboxKey),
    ]);
    if(j.value?.schema!=="EC06_INDEX_WAGE_JOURNAL_V1"||
       j.value.txId!==e.txId||o.value?.txId!==e.txId)
      throw Error("Wage replay missing immutable journal or outbox");
    return {kind:"IDEMPOTENT_REPLAY",receipt:prior.value,outbox:o.value};
  }
  const sealEntry=await kv.get<IndexedSeal>(indexedEc06Keys.seal(scopeId));
  if(!sealEntry.versionstamp||sealEntry.value?.schema!=="EC06_INDEX_MIGRATION_V1"||
    sealEntry.value.scopeId!==scopeId||sealEntry.value.state!=="STAGING_INDEXED_ONLY"||
    !a.migrationProofRefs.has(sealEntry.value.independentlyVerifiedMigrationRef))
    throw Error("No approved source-funded indexed migration");
  const escrowEntry=await kv.get<IndexedWageEscrow>(indexedWageKeys.escrow(e.escrowId));
  const demandEntry=await kv.get<{escrowId:string}>(indexedWageKeys.demand(demandId));
  let terms:IndexedWageContract;
  if(e.kind==="RESERVE"){
    terms=e.contract;
    const accepted=a.actualAcceptedContracts.get(terms.demandId);
    if(!accepted||!contractMatches(terms,accepted)||
       !amt(terms.agreedCopper)||!valid(terms.sourceContractRef)||
       !a.sourceEvidenceRefs.has(terms.sourceContractRef)||
       !valid(terms.employerAccountId)||!valid(terms.workerAccountId)||
       terms.employerAccountId===terms.workerAccountId||
       !Number.isSafeInteger(terms.dueGameMinute)||
       terms.dueGameMinute<a.nowGameMinute||
       escrowEntry.value||demandEntry.value){
      throw Error("Cannot reserve fictional, outdated or repeatedly promised employment");
    }
  }else{
    const esc=escrowEntry.value;
    if(!esc||esc.schema!=="EC06_INDEX_ESCROW_V1"||
      esc.state!=="RESERVED"||esc.scopeId!==scopeId||
      esc.demandId!==demandId||esc.reservedCopper!==esc.amountCopper||
      !amt(esc.amountCopper)||!amt(e.amountCopper)||
      e.amountCopper!==esc.amountCopper||
      demandEntry.value?.escrowId!==esc.escrowId||
      (e.kind==="PAY"?!a.verifiedCompletedDemandIds.has(demandId):
        !a.verifiedCancelledDemandIds.has(demandId))){
      throw Error("Cannot pay or release wage without reserved funds and verified outcome");
    }
    terms={
      demandId:esc.demandId,employerAccountId:esc.employerAccountId,
      workerAccountId:esc.workerAccountId,
      agreedCopper:esc.amountCopper,sourceContractRef:esc.originalContractRef,
      dueGameMinute:0,
    };
  }
  const employerKey=indexedEc06Keys.account(scopeId,terms.employerAccountId);
  const workerKey=indexedEc06Keys.account(scopeId,terms.workerAccountId);
  const [employerRow,workerRow,employerHome,workerHome]=await Promise.all([
    kv.get<EconomicAccount>(employerKey),
    kv.get<EconomicAccount>(workerKey),
    kv.get<IndexedHome>(indexedEc06Keys.home("account",terms.employerAccountId)),
    kv.get<IndexedHome>(indexedEc06Keys.home("account",terms.workerAccountId)),
  ]);
  requireHome(employerHome.value,terms.employerAccountId,scopeId);
  requireHome(workerHome.value,terms.workerAccountId,scopeId);
  const employer=checked(employerRow.value,terms.employerAccountId),
    worker=checked(workerRow.value,terms.workerAccountId);
  if(!employerRow.versionstamp||!workerRow.versionstamp||
     !employerHome.versionstamp||!workerHome.versionstamp)
    throw Error("Cannot CAS unsourced economic wage accounts");
  const employerAfter={...employer},workerAfter={...worker};
  let escrowAfter:IndexedWageEscrow;
  const amount=e.kind==="RESERVE"?terms.agreedCopper:e.amountCopper;
  if(e.kind==="RESERVE"){
    if(employer.availableCopper<amount)
      throw Error("Employer cannot promise more wages than actual spendable copper");
    employerAfter.availableCopper-=amount;
    employerAfter.heldCopper+=amount;
    escrowAfter={
      schema:"EC06_INDEX_ESCROW_V1",escrowId:e.escrowId,demandId,
      scopeId,employerAccountId:terms.employerAccountId,
      workerAccountId:terms.workerAccountId,
      amountCopper:amount,reservedCopper:amount,state:"RESERVED",
      originalContractRef:terms.sourceContractRef,
    };
  }else{
    if(employer.heldCopper<amount)
      throw Error("Employer account heldCopper is short of escrow obligation");
    employerAfter.heldCopper-=amount;
    if(e.kind==="PAY")workerAfter.availableCopper+=amount;
    else employerAfter.availableCopper+=amount;
    escrowAfter={...escrowEntry.value!,state:e.kind==="PAY"?"PAID":"RELEASED",
      reservedCopper:0};
  }
  if(![employerAfter.availableCopper,employerAfter.heldCopper,
    workerAfter.availableCopper,workerAfter.heldCopper].every(cash))
    throw Error("Wage reservation or outcome overflowed finite integer copper");
  const originalTotal=employer.availableCopper+employer.heldCopper+
    worker.availableCopper+worker.heldCopper;
  const finalTotal=employerAfter.availableCopper+employerAfter.heldCopper+
    workerAfter.availableCopper+workerAfter.heldCopper;
  if(!Number.isSafeInteger(originalTotal)||originalTotal!==finalTotal)
    throw Error("Copper disappeared or was issued without economic source");
  const j:IndexedWageJournal={
    schema:"EC06_INDEX_WAGE_JOURNAL_V1",scopeId,txId:e.txId,kind:e.kind,
    demandId,sourceEvidenceRef:e.sourceEvidenceRef,copper:amount,
    accounts:[
      {id:terms.employerAccountId,before:structuredClone(employer),after:employerAfter},
      ...(e.kind==="PAY"?[{
        id:terms.workerAccountId,before:structuredClone(worker),after:workerAfter,
      }]:[]),
    ],
    escrow:{id:e.escrowId,before:escrowEntry.value?structuredClone(escrowEntry.value):null,
      after:escrowAfter},
  };
  const receipt:IndexedWageReceipt={
    schema:"EC06_INDEX_WAGE_TX_V1",txId:e.txId,scopeId,kind:e.kind,
    escrowId:e.escrowId,demandId,intentFingerprint:fingerprint,
  };
  const outbox:IndexedWageOutbox={
    schema:"EC06_INDEX_OUTBOX_V1",txId:e.txId,scopeId,
    state:"PENDING_INDEXED_PROJECTION",journalKey,
  };
  let op=kv.atomic()
    .check({key:sealEntry.key,versionstamp:sealEntry.versionstamp})
    .check({key:employerHome.key,versionstamp:employerHome.versionstamp})
    .check({key:workerHome.key,versionstamp:workerHome.versionstamp})
    .check({key:employerRow.key,versionstamp:employerRow.versionstamp})
    .check({key:workerRow.key,versionstamp:workerRow.versionstamp})
    .check({key:escrowEntry.key,versionstamp:escrowEntry.versionstamp})
    .check({key:demandEntry.key,versionstamp:demandEntry.versionstamp})
    .check({key:txKey,versionstamp:null})
    .check({key:journalKey,versionstamp:null})
    .check({key:outboxKey,versionstamp:null})
    .set(employerKey,employerAfter)
    .set(indexedWageKeys.escrow(e.escrowId),escrowAfter)
    .set(txKey,receipt)
    .set(journalKey,j)
    .set(outboxKey,outbox);
  // Demand receipt is immutable: wages cannot be re-promised under another
  // escrow after payment or cancellation.
  if(e.kind==="RESERVE")
    op=op.set(demandEntry.key,{escrowId:e.escrowId});
  if(e.kind==="PAY")op=op.set(workerKey,workerAfter);
  const result=await op.commit();
  if(!result.ok)throw Error("Concurrent wage/purchase conflict, rerun causal checks");
  return {kind:"INDEXED_WAGE_COMMITTED_STAGING",receipt,outbox};
}
