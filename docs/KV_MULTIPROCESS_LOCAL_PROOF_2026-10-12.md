# Cross-process local Deno KV proof — staged TEST-only release check

This CI gate runs in **separate OS-level Deno processes** with one persisted local SQLite Deno KV file, not one JS-process `Deno.openKv(":memory:")`.
- Holder acquires nonexpiring workbook CAS, waits on file-based local test signal.
- Rival launched from separate `Deno.Command` process is denied while holder active.
- Holder releases conditionally on success. Then a new process throws a simulated uncertain Google outcome, leaving lock persisted.
- A subsequent separate process cannot enter the critical section until the operator reconciles the lock. No simulated automatic unlock; fixture directory is destroyed by the CI runner.
- Permission set: `--unstable-kv --allow-read --allow-write --allow-run` in CI only, with **no `--allow-net`** and no production Google ID or Bearer key.

**Do not claim remote Deno Deploy two-instance fencing:** managed shared KV, node migration, service-account Google writes and paused instance safety still need actual remote Preview proof. The test may expose local SQLite restrictions; treat any CI failure as release blocker, not as a reason to weaken lock semantics.

This augments PR #60 on the same branch. It changes CI only and adds synthetic code; existing Site, Plugin, API, Production, main, EC-06 and Shura remain unchanged.
