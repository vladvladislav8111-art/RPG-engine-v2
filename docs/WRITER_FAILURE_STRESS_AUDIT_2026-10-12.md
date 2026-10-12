# Failure-injection and high-contention safety audit — 2026-10-12

These tests are **isolated CI regression tests**, not evidence of two independently scheduled remote Deno instances or remote fault injection. The GitHub workflow deliberately has no `--allow-net`; all Google transport requests are intercepted for a synthetic workbook.

`tests/semantic_lost_sheets_response_test.ts` simulates a complete Google Sheets values.batchUpdate persistence followed by HTTP 503. The next attempt has lost the old worker memory cache. It must observe the authoritative SESSION_LOG TX receipt and append only the missing Google Doc marker, without a second Sheets batch, XP or copper.

`tests/writer_kv_contention_stress_test.ts` exercises actual local `Deno.openKv(":memory:")` CAS locking with 48 independently invoked async contenders. Only the live owner may execute the critical section; an unknown-outcome failure must keep the lock occupied until reviewed. These are local KV connections and cannot independently prove Deno Deploy's remote instance scheduling.

**Release gate remains open** for a remote two-instance race and fail-closed crash recovery drill with a stopped/drained old worker. Never overwrite or manually release a production lock without reconciling authoritatively committed Google Sheets/Docs receipts.

No runtime env variables, Site/Bridge identity, Production storage or player save altered.
