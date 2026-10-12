import assert from "node:assert/strict";
import { PREVIEW_TEST_TEMP_RUNTIME_ID } from "../src/preview_test_storage.ts";
import { withKvWriterLease, type LeaseKv } from "../src/writer_kv_lease.ts";
import { planHeatLockRecovery } from "../src/npc_heat_lock_recovery.ts";
import { commitTurn } from "../src/commit.ts";
import { config } from "../src/config.ts";
import type { CommitRequest } from "../src/types.ts";

const workbook = "TEST-LOCK-STRESS-ONLY";
const lockKey = ["rpg-v2", "semantic-writer-lock", workbook] as const;

Deno.test("actual local Deno KV: 32 contenders cannot enter while one holder is active", async () => {
  const raw = await Deno.openKv(":memory:");
  const kv = raw as unknown as LeaseKv;
  let release: () => void = () => {};
  let began: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { began = resolve; });
  let visits = 0;
  try {
    const first = withKvWriterLease({
      kv, workbookId: workbook, txId: "TEST-OWNER",
      releaseOnError: false,
      action: async () => { visits++; began(); await held; return "owner"; },
    });
    await entered;
    const blocked = await Promise.allSettled(Array.from({length:32}, (_,i) =>
      withKvWriterLease({
        kv, workbookId: workbook, txId: "TEST-RIVAL-" + i,
        releaseOnError: false,
        action: async () => { visits++; return "unexpected"; },
      })));
    assert.equal(visits, 1);
    assert.equal(blocked.length, 32);
    assert.ok(blocked.every(x => x.status === "rejected" &&
      String(x.reason).includes("WRITER_LEASE_BUSY_RETRY_LATER")));
    assert.equal((await raw.get(lockKey)).value !== null, true);
    release();
    assert.equal(await first, "owner");
    assert.equal((await raw.get(lockKey)).value, null);
  } finally { release(); raw.close(); }
});

Deno.test("ambiguous Google outcome keeps a permanent local KV lock and blocks replay", async () => {
  const raw = await Deno.openKv(":memory:");
  const kv = raw as unknown as LeaseKv;
  try {
    await assert.rejects(() => withKvWriterLease({
      kv, workbookId: workbook, txId: "TEST-UNKNOWN",
      releaseOnError: false,
      action: async () => { throw Error("GOOGLE_503_AFTER_PERSIST"); },
    }), /GOOGLE_503_AFTER_PERSIST/);
    const stored = await raw.get<{txId:string}>(lockKey);
    assert.equal(stored.value?.txId, "TEST-UNKNOWN");
    await assert.rejects(() => withKvWriterLease({
      kv, workbookId: workbook, txId: "TEST-AFTER",
      releaseOnError: false, action: async () => "must-not-run",
    }), /WRITER_LEASE_BUSY_RETRY_LATER/);
    assert.equal((await raw.get(lockKey)).value !== null, true);
  } finally { raw.close(); }
});

Deno.test("expired TTL release is rejected and isolated workbook locks do not collide", async () => {
  const raw = await Deno.openKv(":memory:");
  const kv = raw as unknown as LeaseKv;
  try {
    await assert.rejects(() => withKvWriterLease({
      kv, workbookId: workbook, txId: "TEST-TTL",
      leaseMs: 600_000, action: async () => true,
    }), /WRITER_LEASE_TTL_UNSAFE_WITHOUT_GOOGLE_FENCING/);
    const r = await Promise.all(["TEST-WORKBOOK-A","TEST-WORKBOOK-B"].map(
      (id,i) => withKvWriterLease({
        kv, workbookId:id, txId:"TEST-SHARED-TX",
        releaseOnError:false,action:async() => i,
      })));
    assert.deepEqual(r,[0,1]);
  } finally { raw.close(); }
});

Deno.test("owner replacement after action is never treated as a successful release", async () => {
  const raw = await Deno.openKv(":memory:");
  const kv = raw as unknown as LeaseKv;
  try {
    await assert.rejects(() => withKvWriterLease({
      kv, workbookId: workbook, txId: "TEST-OWNER-LOST",
      releaseOnError:false,
      action:async()=>{
        await raw.set(lockKey,{ownerToken:"new-unsafe-owner",txId:"TEST-OTHER"});
        return "not-verified";
      },
    }), /WRITER_LEASE_LOST_AFTER_ACTION/);
    assert.equal((await raw.get<{txId:string}>(lockKey)).value?.txId,"TEST-OTHER");
  } finally { raw.close(); }
});

const record = {
  lockWorkbookId:"TEST-RECOVERY-WORKBOOK",
  expectedIsolatedWorkbookId:"TEST-RECOVERY-WORKBOOK",
  txId:"TEST-PARTIAL-TX",
  lockOwnerTxId:"TEST-PARTIAL-TX",
  expectedSaveTo:"TEST-S2",
  liveControlSaveId:"TEST-S2",
  countCommittedTxRows:1,
  txRowSaveTo:"TEST-S2",
  requiredDocs:["LIVE_SESSION_LOG","LIVE_TRANSACTION_ARCHIVE"],
  docsWithTxMarker:["LIVE_SESSION_LOG","LIVE_TRANSACTION_ARCHIVE"],
  operatorVerifiedAllWorkersStopped:true,
  sourceSnapshotStable:true,
};
Deno.test("even fully matched synthetic recovery evidence is review-only, not KV unlock", () => {
  const r=planHeatLockRecovery(record);
  assert.equal(r.status,"MANUAL_OPERATOR_REVIEW_ONLY");
  assert.equal(r.programmaticUnlockAllowed,false);
  assert.equal(r.previousWriterProvenStopped,false);
  assert.deepEqual(r.reasons,[]);
});
Deno.test("crashed instance, ambiguous Sheets, stale source and incomplete Docs fail closed", () => {
  const candidates=[
    {operatorVerifiedAllWorkersStopped:false},
    {countCommittedTxRows:0,txRowSaveTo:null,liveControlSaveId:"TEST-S1"},
    {countCommittedTxRows:2},
    {sourceSnapshotStable:false},
    {docsWithTxMarker:["LIVE_SESSION_LOG"]},
    {lockOwnerTxId:"TEST-ANOTHER-TX"},
    {lockWorkbookId:"prod"},
    {liveControlSaveId:"TEST-S1"},
  ];
  for(const update of candidates){
    const x=planHeatLockRecovery({...record,...update});
    assert.equal(x.status,"BLOCKED");
    assert.equal(x.programmaticUnlockAllowed,false);
    assert.ok(x.reasons.length>=1);
  }
});
Deno.test("even test-flag writes reject real save and disabled KV before Google network", async () => {
  const oldTimeline=Deno.env.get("DENO_TIMELINE");
  Deno.env.set("DENO_TIMELINE","preview/ci-lock-gate");

  const initial = {flag:config.npcHeatTestWriterEnabled,
    allowWrites:config.allowWrites, enableKv:config.enableKv,
    raw:config.allowRawCommits,workbook:config.npcHeatTestWorkbookId,
    tempfile:config.files.TEMP_RUNTIME};
  const base:CommitRequest={
    turnId:"TEST-TURN",txId:"TEST-TX",
    expectedSaveId:"TEST-S1",saveTo:"TEST-S2",
    semantic:{session:{inworldStart:"Day1 12:00:00",actionSummary:"Synthetic-only"}},
  };
  try {
    config.npcHeatTestWriterEnabled=true;
    config.allowWrites=true;
    config.allowRawCommits=false;
    config.enableKv=false;
    config.files.TEMP_RUNTIME=PREVIEW_TEST_TEMP_RUNTIME_ID;
    config.npcHeatTestWorkbookId=config.files.TEMP_RUNTIME;
    await assert.rejects(()=>commitTurn({...base,
      expectedSaveId:"V2-S0795",saveTo:"V2-S0796"}),/ISOLATION_GATE/);
    await assert.rejects(()=>commitTurn(base),
      /TEST_WRITER_WRITES_AND_KV_GATE_FAILED/);
    await assert.rejects(()=>commitTurn({...base,semantic:undefined}),
      /NPC_HEAT_TEST_SEMANTIC_WRITER_REQUIRED/);
    assert.equal(config.files.TEMP_RUNTIME,PREVIEW_TEST_TEMP_RUNTIME_ID);
  }finally{
    config.npcHeatTestWriterEnabled=initial.flag;
    config.allowWrites=initial.allowWrites;
    config.allowRawCommits=initial.raw;
    config.enableKv=initial.enableKv;
    config.npcHeatTestWorkbookId=initial.workbook;
    config.files.TEMP_RUNTIME=initial.tempfile;
    if(oldTimeline===undefined)Deno.env.delete("DENO_TIMELINE");
    else Deno.env.set("DENO_TIMELINE",oldTimeline);
  }
});
