import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { withKvWriterLease, type LeaseKv } from "../src/writer_kv_lease.ts";

/** Independent function calls use distinct key wrappers backed by one actual KV. */
Deno.test("many independent callers contend for the same real local KV CAS lock", async () => {
  const raw = await Deno.openKv(":memory:");
  const kv = raw as unknown as LeaseKv;
  const key = ["rpg-v2", "semantic-writer-lock", "TEST-STRESS-RACE"] as const;
  let release: () => void = () => {};
  let signal: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  const acquired = new Promise<void>(resolve => { signal = resolve; });
  let accepted = 0;
  try {
    const owner = withKvWriterLease({
      kv, workbookId: "TEST-STRESS-RACE", txId: "TEST-OWNER",
      releaseOnError: false,
      action: async () => { accepted++; signal(); await hold; return "OWNER_OK"; },
    });
    await acquired;
    // 48 independently invoked async callers, each with its own TX/handler.
    const losers = await Promise.allSettled(Array.from({ length: 48 }, (_, i) =>
      withKvWriterLease({ kv, workbookId: "TEST-STRESS-RACE",
        txId: "TEST-LOSER-" + i, releaseOnError: false,
        action: async () => { accepted++; return "BAD"; } })));
    assertEquals(losers.length, 48);
    for (const result of losers) {
      assertEquals(result.status, "rejected");
      if (result.status === "rejected") {
        assert(String(result.reason).includes("WRITER_LEASE_BUSY_RETRY_LATER"));
      }
    }
    assertEquals(accepted, 1);
    const beforeRelease = await raw.get<{ txId: string }>(key);
    assertEquals(beforeRelease.value?.txId, "TEST-OWNER");
    release();
    assertEquals(await owner, "OWNER_OK");
    const afterRelease = await raw.get(key);
    assertEquals(afterRelease.value, null);
    assertEquals(await withKvWriterLease({ kv, workbookId: "TEST-STRESS-RACE",
      txId: "TEST-AFTER", releaseOnError: false,
      action: async () => "AFTER_OK" }), "AFTER_OK");
  } finally { release(); raw.close(); }
});

Deno.test("orphan lock from an uncertain crashed worker cannot be cleared by a rival", async () => {
  const raw = await Deno.openKv(":memory:");
  const kv = raw as unknown as LeaseKv;
  const workbookId = "TEST-CRASHED-WORKER";
  try {
    await assertRejects(() => withKvWriterLease({
      kv, workbookId, txId: "TEST-CRASHED-TX", releaseOnError: false,
      action: async () => { throw Error("GOOGLE_MAY_HAVE_PERSISTED"); },
    }), Error, "GOOGLE_MAY_HAVE_PERSISTED");
    const record = await raw.get<{txId:string}>(["rpg-v2", "semantic-writer-lock", workbookId]);
    assertEquals(record.value?.txId, "TEST-CRASHED-TX");
    await assertRejects(() => withKvWriterLease({
      kv, workbookId, txId: "TEST-OTHER-TX", releaseOnError: false,
      action: async () => "MUST_NOT_WRITE",
    }), Error, "WRITER_LEASE_BUSY_RETRY_LATER");
  } finally { raw.close(); }
});
