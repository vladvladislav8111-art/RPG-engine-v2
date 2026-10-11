/**
 * EC-06 economic KV settlement — OFFLINE/STAGING only.
 *
 * Future adapter: one Deno KV atomic check+set group covers one scoped,
 * previously migrated authoritative economy snapshot, tx receipt, individual
 * causal event receipts and a durable projection outbox. No live endpoint or
 * existing semantic commit imports this module.
 *
 * This does NOT migrate Shura Money or INVENTORY_CURRENT automatically.
 * The source of account funds, proofs and physical assets must be approved.
 */
import {
  planFiniteEconomicSettlement,
  type EconomicOperation, type EconomicSnapshot,
  type EconomicSettlementAuthority, type SettlementManifest,
} from "./economic_atomic_plan.ts";
import { buildImmutableEconomicTxJournal, type ImmutableEconomicTxJournal } from "./economic_projection_journal.ts";

export type KvKey = readonly (string | number | bigint | boolean | Uint8Array)[];
export type KvEntry<T> = { key: KvKey; value: T | null; versionstamp: string | null };
export type AtomicCommitResult = { ok: boolean };
export interface AtomicWrite {
  check(entry: {key: KvKey; versionstamp: string | null}): AtomicWrite;
  set(key: KvKey, value: unknown): AtomicWrite;
  commit(): Promise<AtomicCommitResult>;
}
export interface AtomicKvStore {
  get<T>(key: KvKey): Promise<KvEntry<T>>;
  atomic(): AtomicWrite;
}
export type PersistedEconomy = {
  schema: "EC06_KV_V1";
  scopeId: string;
  snapshot: EconomicSnapshot;
  lastTxId: string;
};
export type EconomicTxReceipt = {
  txId: string;
  scopeId: string;
  status: "APPLIED_TO_PRIMARY_KV";
  intentFingerprint: string;
  beforeRevision: string;
  afterRevision: string;
  eventIds: string[];
};
export type EconomicProjectionOutbox = {
  txId: string;
  scopeId: string;
  state: "PENDING_PROJECTION" | "PROJECTED";
  primaryRevision: string;
  eventIds: string[];
  /** Do not store current account values in GM PREGEN or canon files. */
  expectedProjectionTargets: readonly ["TEMP_RUNTIME", "LIVE_TRANSACTION_ARCHIVE"];
  projectedProofRef?: string;
  journalTxId: string;
};
export type StoreResult = {
  kind: "COMMITTED" | "IDEMPOTENT_REPLAY";
  receipt: EconomicTxReceipt;
  outbox: EconomicProjectionOutbox;
};

function validId(s: unknown): s is string {
  return typeof s === "string" && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/i.test(s) && s.length <= 180;
}
const prefix=(scopeId:string):KvKey=>["rpg-v2","ec06",scopeId];
export const ec06Keys = {
  ledger:(scopeId:string):KvKey=>[...prefix(scopeId),"ledger"],
  tx:(scopeId:string,txId:string):KvKey=>[...prefix(scopeId),"tx",txId],
  event:(scopeId:string,eventId:string):KvKey=>[...prefix(scopeId),"event",eventId],
  outbox:(scopeId:string,txId:string):KvKey=>[...prefix(scopeId),"outbox",txId],
  journal:(scopeId:string,txId:string):KvKey=>[...prefix(scopeId),"journal",txId],
};

function fingerprint(expectedRevision:string,events:readonly EconomicOperation[]):string {
  // Full bounded exact source intent, not a caller supplied/checkable fake hash.
  // For production, replace with a canonical cryptographic digest if needed.
  return JSON.stringify({expectedRevision,events});
}
function setOnEmpty(kv:AtomicWrite,key:KvKey,value:unknown):AtomicWrite {
  return kv.check({key,versionstamp:null}).set(key,value);
}

export type KvSettlementRequest = {
  scopeId: string;
  txId: string;
  expectedRevision: string;
  events: readonly EconomicOperation[];
  /** Must be assembled from VERIFIED CURRENT and canon, not design candidates. */
  proofAuthority: Omit<EconomicSettlementAuthority,"actualCurrentRevision">;
};

/**
 * Full ledger CAS serializes every money and item change in the same scope.
 * To scale the city, create carefully designed physically bounded scopes;
 * never split one money/item owner across independent scopes. Cross-scope
 * handoffs need a separately reviewed interscope protocol and are rejected
 * unless both counterparties and the item live in this one canonical scope.
 */
export async function commitEconomicKvStaging(
  kv:AtomicKvStore,request:KvSettlementRequest,
):Promise<StoreResult>{
  const {scopeId,txId,expectedRevision,events,proofAuthority}=request;
  if(!validId(scopeId)||!validId(txId)||!validId(expectedRevision)||
    events.length<1||events.length>6) {
    throw Error("EC-06 staging requires one scoped version and 1..6 causal events");
  }
  const intentFingerprint=fingerprint(expectedRevision,events);
  const txKey=ec06Keys.tx(scopeId,txId);
  const previously=await kv.get<EconomicTxReceipt>(txKey);
  if(previously.value) {
    if(previously.value.intentFingerprint!==intentFingerprint) {
      throw Error("TX ID replay has different economic intent");
    }
    const outbox=await kv.get<EconomicProjectionOutbox>(ec06Keys.outbox(scopeId,txId));
    if(!outbox.value||outbox.value.journalTxId!==txId)
      throw Error("Committed TX missing matching outbox journal reference");
    const journal=await kv.get<ImmutableEconomicTxJournal>(ec06Keys.journal(scopeId,txId));
    if(!journal.value||journal.value.afterRevision!==previously.value.afterRevision)
      throw Error("Committed TX missing immutable historical journal");
    return {kind:"IDEMPOTENT_REPLAY",receipt:previously.value,outbox:outbox.value};
  }
  const ledgerKey=ec06Keys.ledger(scopeId);
  const source=await kv.get<PersistedEconomy>(ledgerKey);
  if(!source.value||source.value.schema!=="EC06_KV_V1"||
    source.value.scopeId!==scopeId || !source.versionstamp) {
    throw Error("EC-06 live account/item ledger NOT MIGRATED. Refuse free initial cash or goods.");
  }
  const live=source.value.snapshot;
  if(live.revision!==expectedRevision)throw Error("Stale economic ledger revision");
  const eventEntries=await Promise.all(events.map(async e=>{
    if(!validId(e.eventId))throw Error("Invalid economic event ID");
    return await kv.get<{txId:string}>(ec06Keys.event(scopeId,e.eventId));
  }));
  if(eventEntries.some(x=>x.value!==null))throw Error("Causal economic event was already applied");
  const preview:SettlementManifest=planFiniteEconomicSettlement({
    txId,expectedRevision,snapshot:live,events,
    authority:{...proofAuthority,actualCurrentRevision:live.revision},
  });
  if(preview.mode!=="STAGING_PLAN_ONLY"||!preview.requiresAtomicCompareAndSwap){
    throw Error("Refuse non-staged economic plan");
  }
  const nextRevision="revision.ec06."+txId;
  if(nextRevision===live.revision)throw Error("Economic transaction revision reuse");
  const after:PersistedEconomy={
    schema:"EC06_KV_V1",scopeId,lastTxId:txId,
    snapshot:{
      revision:nextRevision,
      accounts:preview.accountsAfter,
      escrows:preview.escrowsAfter,
      lots:preview.lotsAfter,
      committedTxIds:new Set([...live.committedTxIds,txId]),
      committedCausalEventIds:new Set([...live.committedCausalEventIds,...preview.processedEventIds]),
    },
  };
  const receipt:EconomicTxReceipt={
    txId,scopeId,status:"APPLIED_TO_PRIMARY_KV",intentFingerprint,
    beforeRevision:live.revision,afterRevision:nextRevision,
    eventIds:[...preview.processedEventIds],
  };
  const immutableJournal:ImmutableEconomicTxJournal=buildImmutableEconomicTxJournal({
    scopeId,txId,before:live,result:preview,afterRevision:nextRevision,
  });
  const outbox:EconomicProjectionOutbox={
    journalTxId:txId,
    txId,scopeId,state:"PENDING_PROJECTION",primaryRevision:nextRevision,
    eventIds:[...preview.processedEventIds],
    expectedProjectionTargets:["TEMP_RUNTIME","LIVE_TRANSACTION_ARCHIVE"],
  };
  // Atomic KV commit: no crash window between ledger debit, custody handoff,
  // event-id uniqueness, transaction receipt and durable projection intent.
  // Failed check() means no partial mutation, never retry by reusing a stale
  // snapshot: reload and obtain a new authoritative causal decision.
  let op=kv.atomic()
    .check({key:ledgerKey,versionstamp:source.versionstamp})
    .check({key:txKey,versionstamp:null})
    .check({key:ec06Keys.journal(scopeId,txId),versionstamp:null})
    .set(ledgerKey,after)
    .set(txKey,receipt)
    .set(ec06Keys.outbox(scopeId,txId),outbox)
    .set(ec06Keys.journal(scopeId,txId),immutableJournal);
  for(const e of events) {
    op=op.check({key:ec06Keys.event(scopeId,e.eventId),versionstamp:null})
      .set(ec06Keys.event(scopeId,e.eventId),{txId});
  }
  const committed=await op.commit();
  if(!committed.ok)throw Error("EC-06 KV CONFLICT: another transaction changed the authoritative ledger");
  return {kind:"COMMITTED",receipt,outbox};
}

/**
 * A projection can only be ACKED after an external adapter has actually
 * verified Google data under this exact primary tx identity. This function
 * cannot update Sheets or claim completion on behalf of an external system.
 * Projection receipt itself uses CAS to avoid racing independent workers.
 */
export async function ackEconomicProjection(
  kv:AtomicKvStore,
  input:{scopeId:string;txId:string;actualVerifiedProofRef:string},
):Promise<EconomicProjectionOutbox>{
  const {scopeId,txId,actualVerifiedProofRef}=input;
  if(!validId(scopeId)||!validId(txId)||!validId(actualVerifiedProofRef))
    throw Error("Cannot acknowledge non-evidenced projection");
  const receipt=await kv.get<EconomicTxReceipt>(ec06Keys.tx(scopeId,txId));
  if(!receipt.value)throw Error("No primary committed transaction receipt");
  const key=ec06Keys.outbox(scopeId,txId);
  const row=await kv.get<EconomicProjectionOutbox>(key);
  if(!row.value||!row.versionstamp||row.value.journalTxId!==txId||
      row.value.primaryRevision!==receipt.value.afterRevision)
    throw Error("Missing/inconsistent durable outbox");
  if(row.value.state==="PROJECTED") {
    if(row.value.projectedProofRef!==actualVerifiedProofRef)
      throw Error("Conflicting projection receipts");
    return row.value;
  }
  const after:EconomicProjectionOutbox={
    ...row.value,state:"PROJECTED",projectedProofRef:actualVerifiedProofRef,
  };
  const done=await kv.atomic().check({key,versionstamp:row.versionstamp})
    .set(key,after).commit();
  if(!done.ok)throw Error("Concurrent outbox projection worker conflict");
  return after;
}
