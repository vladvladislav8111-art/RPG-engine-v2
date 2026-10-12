# Isolated writer E2E and KV race gate (2026-10-12)

## Safe external Google Sheets smoke
A **new test-only** Google spreadsheet was created with synthetic CONTROL / SESSION_LOG / NPC_CURRENT / NPC_ATTENTION_CURRENT. No live Shura rows are present. The Google Drive account's Sheets API successfully wrote three disjoint target ranges in one spreadsheet batchUpdate (TEST-S0 → TEST-S1, one synthetic SESSION_LOG attention receipt, one derived index row) and independently read back matching contents.

Test workbook: https://docs.google.com/spreadsheets/d/1nUFbBxJy5dbkGmhaNqyOwPMIrso5_PBqJ_BmQ_-Y2T8/edit
Provider smoke TX: TEST-HEAT-E2E-001, actor: npc.test.only.

**Limit:** This is a direct Google Drive plugin call, not the engine's bearer-authenticated Sheets values.batchUpdate path or the Deno service account. It is NOT end-to-end proof that the existing Deno writer has write access to the test workbook.

## Isolated KV CAS race tests
`tests/writer_kv_lease_test.ts` uses **real local Deno KV** `Deno.openKv(":memory:")`, not an in-memory JS Map. Tests run via the existing GitHub CI `deno task test` without remote network credentials. The optional lease acquisition uses KV atomic check-and-set with ten-minute TTL, waits for the entire prepare→Sheets→Docs path, and releases via versionstamp check. Two writers for the same workbook cannot both acquire a live lease. The existing semantic durable TX replay remains authoritative, not the lease cache.

`RPG_KV_WRITER_LEASE_ENABLED` is **false** by default; when enabled without Deno KV it fails closed. This is not a distributed fencing token for Google Sheets; a worker surviving KV lease expiration may still write after a new holder starts. **Do not enable on production** until real service-account test workbook E2E, multi-instance concurrency, max-duration/fencing validation, and crash recovery behavior are proven.

## Remaining production blockers
- Deno service account access to test workbook and genuine engine /context → prepare/commit → read replay through an isolated **non-production** runtime configuration.
- Genuine shared remote KV under two independently scheduled Deno instances (CI local KV is not equivalent).
- Google Sheets values.batchUpdate is not an atomic compare-and-swap; robust fencing or proven single-writer coordinator is still required.
- Live TEMP schema migration and feature-flag activation have not been authorized. Strict progression, ACK, EC06 remain gated.

No new Site/Plugin/backend was created, and no PR was merged or deployed to main.

## 2026-10-12 verification follow-up — *isolated* provider and read-only baseline

- Isolated workbook ACL is currently **private to its owner**; the Deno service-account identity has **not** been confirmed as a recipient. An authenticated Deno engine-to-Google E2E is therefore **blocked**, not passed.
- Created `CONCURRENCY_TEST` tab in the test-only workbook. Two **parallel** Google Sheets API requests wrote distinct values to the same isolated cell: both returned success, final observed value was `TEST_WRITER_B`. This demonstrates lost updates without any write arbitration. The test did **not** call the Deno writer or touch gameplay data.
- Read-only current production baseline (before PR #51): MICRO/HUD `get_turn_context` 2168 ms wall / 1699 ms engine; targeted Vesha NPC + social context 2303 ms wall / 1568 ms engine, repeated 2115 ms wall / 1560 ms engine. No comparative PR #51 runtime deployment or authoritative after-metric exists. MICRO still loaded four scene NPCs in current production; it is not evidence of heat speedup.
- Regression safeguard: a stale `NPC_ATTENTION_CURRENT.Source Save ID` now blocks both active-depth authority and fresh NPC motive stimulus, even if the historical index entry is less than an hour old. Existing KEY status itself is never demoted by cache freshness.

**Status:** This audit cannot authorize production promotion. Full isolated Deno service-account + Google Docs/Sheets + *shared remote* Deno KV E2E and a proven fencing/recovery strategy remain open. Keep both index and optional writer lock flags **off** until then.
