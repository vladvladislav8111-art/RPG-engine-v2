/**
 * EC-06 immutable economic mutation journal for crash/replay projection.
 *
 * Historical per-TX delta, NOT another mutable CURRENT balance.
 * A newer KV ledger cannot safely reconstruct an older TX's projection.
 * Derive this small immutable record DURING the exact primary CAS and
 * retain it until both independent downstream projections are verified.
 */
import type {
  EconomicAccount, EconomicSnapshot, MarketLot, SettlementManifest, WageEscrow,
} from "./economic_atomic_plan.ts";

export type EconomicRecordMutation<T> = {
  id: string;
  before: T | null;
  after: T | null;
};

export type ImmutableEconomicTxJournal = {
  schema: "EC06_JOURNAL_V1";
  scopeId: string;
  txId: string;
  beforeRevision: string;
  afterRevision: string;
  causalEventIds: readonly string[];
  accounts: readonly EconomicRecordMutation<EconomicAccount>[];
  escrows: readonly EconomicRecordMutation<WageEscrow>[];
  lots: readonly EconomicRecordMutation<MarketLot>[];
};

function strictMap<T>(rows:readonly T[],key:(t:T)=>string):Map<string,T>{
  const m=new Map<string,T>();
  for(const row of rows){
    const id=key(row);
    if(!id || m.has(id))throw Error("Journal source contains duplicate/blank entry: "+id);
    m.set(id,row);
  }
  return m;
}
function collect<T>(
  before:readonly T[],after:readonly T[],key:(item:T)=>string,
): EconomicRecordMutation<T>[] {
  const a=strictMap(before,key),b=strictMap(after,key);
  const changes:EconomicRecordMutation<T>[]=[];
  for(const id of [...new Set([...a.keys(),...b.keys()])].sort()){
    const old=a.get(id)??null,now=b.get(id)??null;
    if(JSON.stringify(old)!==JSON.stringify(now)){
      changes.push({id,before:old?structuredClone(old):null,
        after:now?structuredClone(now):null});
    }
  }
  return changes;
}
export function buildImmutableEconomicTxJournal(input:{
  scopeId:string;
  txId:string;
  afterRevision:string;
  before:EconomicSnapshot;
  result:SettlementManifest;
}):ImmutableEconomicTxJournal {
  const {scopeId,txId,afterRevision,before,result}=input;
  if(!scopeId || !txId || !afterRevision ||
     result.mode!=="STAGING_PLAN_ONLY" || result.txId!==txId ||
     result.expectedRevision!==before.revision ||
     before.revision===afterRevision || result.processedEventIds.length===0 ||
     new Set(result.processedEventIds).size!==result.processedEventIds.length){
    throw Error("Historical journal must match one complete, fresh CAS intent");
  }
  const accounts=collect(before.accounts,result.accountsAfter,x=>x.accountId);
  const escrows=collect(before.escrows,result.escrowsAfter,x=>x.escrowId);
  const lots=collect(before.lots,result.lotsAfter,x=>x.itemId);
  if(accounts.length===0 && escrows.length===0 && lots.length===0)
    throw Error("Empty economic journal cannot masquerade as settled work");
  return {
    schema:"EC06_JOURNAL_V1",scopeId,txId,
    beforeRevision:before.revision,afterRevision,
    causalEventIds:[...result.processedEventIds],
    accounts,escrows,lots,
  };
}
export type ProjectionCheckpoint = {
  scopeId:string;
  target:"TEMP_RUNTIME" | "LIVE_TRANSACTION_ARCHIVE";
  lastAppliedRevision:string;
  lastAppliedTxId:string;
};
export type ProjectionVerification = {
  target:"TEMP_RUNTIME" | "LIVE_TRANSACTION_ARCHIVE";
  scopeId:string;
  txId:string;
  afterRevision:string;
  journalEvidenceRef:string;
};

/**
 * Do not permit a delayed snapshot for TX A to overwrite the effects of
 * later TX B. The external projector must compare its durable watermark
 * to the *before* revision and only apply this exact immutable delta.
 */
export function assertProjectionOrder(
  journal:ImmutableEconomicTxJournal,
  checkpoint:ProjectionCheckpoint,
):void {
  if(checkpoint.scopeId!==journal.scopeId ||
     checkpoint.lastAppliedRevision!==journal.beforeRevision){
    throw Error("Projection out of order or current source watermark diverged");
  }
}
export function verifyProjectionReceipts(input:{
  journal:ImmutableEconomicTxJournal;
  receipts:readonly ProjectionVerification[];
  trustedEvidenceRefs:ReadonlySet<string>;
}):{validatedBothTargets:true;proofRef:string}{
  const {journal,receipts,trustedEvidenceRefs}=input;
  if(receipts.length!==2)throw Error("Both Google projection targets must be verified");
  const targets=new Set<string>();
  for(const r of receipts){
    if(targets.has(r.target) || r.scopeId!==journal.scopeId ||
       r.txId!==journal.txId || r.afterRevision!==journal.afterRevision ||
       !trustedEvidenceRefs.has(r.journalEvidenceRef)){
      throw Error("Projection receipt does not attest this exact primary transaction");
    }
    targets.add(r.target);
  }
  if(!targets.has("TEMP_RUNTIME")||!targets.has("LIVE_TRANSACTION_ARCHIVE"))
    throw Error("Sheets and Docs projection receipts both required");
  // Stable ACK source reference; refs themselves must be derived by the
  // authorized read-after-write adapter, not supplied by an untrusted caller.
  return {
    validatedBothTargets:true,
    proofRef:"projection."+journal.scopeId+"."+journal.txId,
  };
}
