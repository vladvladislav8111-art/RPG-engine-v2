/** OS-process-only synthetic KV contender. Never touches Google or a live save. */
import { withKvWriterLease, type LeaseKv } from "../src/writer_kv_lease.ts";
const [databasePath, role, signalBase] = Deno.args;
if (!databasePath || !["hold", "contend", "ambiguous"].includes(role) ||
    !signalBase) throw Error("TEST_PROCESS_ARGS_INVALID");
const workbookId = "TEST-LOCAL-OS-PROCESS-KV-EXCLUSION";
const kv = await Deno.openKv(databasePath);
const waitForRelease = async () => {
  await Deno.writeTextFile(signalBase + ".held", "held");
  for (let i = 0; i < 300; i++) {
    try {
      await Deno.stat(signalBase + ".release");
      return;
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error("TEST_HOLDER_RELEASE_TIMEOUT");
};
try {
  const result = await withKvWriterLease({
    kv: kv as unknown as LeaseKv, workbookId, txId: role === "hold" ? "TEST-OWNER" : role === "contend" ?
      "TEST-RIVAL" : "TEST-UNKNOWN",
    releaseOnError: false,
    action: async () => {
      if (role === "hold") {
        await waitForRelease();
        return "OWNER_SUCCESS";
      }
      if (role === "ambiguous") throw Error("TEST_LOST_GOOGLE_ACK");
      await Deno.writeTextFile(signalBase + ".unexpected-entry", "unsafe");
      return "CONTENDER_UNSAFE";
    },
  });
  if (role === "hold" && result === "OWNER_SUCCESS") {
    console.log("OWNER_RELEASED");
  } else {
    throw Error("TEST_UNEXPECTED_LOCK_ACQUISITION");
  }
} catch (e) {
  const error = String(e);
  if (role === "contend" && error.includes("WRITER_LEASE_BUSY_RETRY_LATER")) {
    console.log("CONTENDER_DENIED");
  } else if (role === "ambiguous" && error.includes("TEST_LOST_GOOGLE_ACK")) {
    console.log("AMBIGUOUS_LOCK_HELD");
  } else {
    console.error(error);
    Deno.exitCode = 1;
  }
} finally {
  kv.close();
}
