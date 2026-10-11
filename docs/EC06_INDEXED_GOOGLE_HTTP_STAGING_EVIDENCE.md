# EC-06 — indexed per-row Google HTTP staging: code and actual provider test

**DRAFT / TEST ONLY.** This branch is stacked on PR #35 -> PR #34 -> ... -> PR #27. Nothing has been merged/deployed to production. The committed runtime remains authoritative via TEMP_RUNTIME, and no existing Shura/NPC economic asset or time was changed.

## New technical implementation

`src/economic_indexed_google_http_staging.ts` implements the actual Google Sheets and Docs HTTP request format for the `IndexedDeltaTargetAdapter` contract of PR #35. It is NOT imported by current HTTP routes.

The caller must explicitly name two **nonproduction isolated** files and the true numerical sheet IDs. Only pre-registered, unique, finite row slots (account/item/escrow) and receipt slots (TX ID) are allowed. The adapter refuses live `config.files.TEMP_RUNTIME` and `config.files.LIVE_TRANSACTION_ARCHIVE`.

For a Sheets indexed transaction, only touched B cells and the single transaction receipt B cell are included in **one structural `spreadsheets.batchUpdate` request** (separate `updateCells` children) and independently reread. That groups the target mutation and source receipt within one Sheets structural batch. The repository's old `values.update` approach is not used.

For a Docs transaction, the staged archive has exactly one `EC06_INDEX_DOC_GENESIS_V1` line followed by chronological `EC06_INDEX_DOC_DELTA_V1` immutable journal lines. The adapter reconstructs current touched rows from that source history, confirms BEFORE values, then appends the delta and exact receipt using `documents.batchUpdate` with `writeControl.requiredRevisionId`; independent reread proves the record.

All writes require acquiring the exclusive writer CAS lock in **Deno KV keyed by the actual physical Google file**, validating it before/after the external call, checking exact source state and TX receipt, and releasing it ONLY after independent durable receipt readback. An ambiguous outcome deliberately leaves the lock HELD. There is no automatic force-unlock: owner-reviewed incident recovery is still required, as a late in-flight external writer cannot safely be assumed gone.

**Critical limitations:** Sheets does not offer a compare-before-row predicate. This cooperative KV lock does not prevent a manual or outside editor bypassing the bridge. The finite pre-pinned slot plan and full Docs linear replay are *staging-only*, not final city-scale indexed projections. No authenticated production source migrator/proof adapter, outbox scheduler, crash-repair service or terminal projection load benchmark has been implemented. No new ordinary NPC liquidity is inferred from historical prices or wages.

## GitHub CI

`tests/economic_indexed_google_http_staging_test.ts` uses actual ephemeral `Deno.openKv(":memory:")`, with simulated Google API responses, to test:
- One Sheets structural batch of changed rows plus receipt; exact Google Docs conditional append and KV outbox ACK.
- Subsequent verified wage payment after the employer's reservation, rejecting premature overlapping projections.
- Simulated second-target outage after Sheets completed: pending outbox and no second Sheets debit.
- Simulated lost HTTP reply *after* the Sheets data and receipt were stored: no blind second payment, physical writer lock remains HELD.
- Staging-only source IDs, unknown row slots and duplicate physical slot rejection.

CI Deno Check passed **169 tests, 0 failures** on initial PR head; check the latest PR commit status before release.

## Real independent Google provider-side test (separate from code execution!)

Created **two new test-only assets**:

- Spreadsheet: https://docs.google.com/spreadsheets/d/1Pm0UQ9uvL-YklY9woXtk8zAAOO895qI-J7klMl5fBtw/edit — tabs `EC06_IDX_ROWS` (ID 250525209) and `EC06_IDX_RECEIPTS` (ID 250525210).
- Docs archive: https://docs.google.com/document/d/1s0YdsAg1_YXeQ6hQczzqlDZoKKXrQIGRzL7KHUvgvok/edit — synthetic genesis + immutable indexed TX delta lines.

These were populated and changed using the **Google Drive connector's actual Google API provider actions**, **NOT by running the new Deno HTTP adapter**, and without creating an actual indexed primary KV ledger. All account names, quantities, receipts, source proofs and amounts were synthetic:

1. Initialized fixture account `account.fixture.workshop` with 70 copper available, worker with 0, private two-unit paper lot, null escrow; pinned all row keys and two unique TX receipt slots.
2. Used one **real structural Sheets batchUpdate** with three `updateCells` requests to reserve 30 copper: employer available 70→40, held 0→30, escrow null→RESERVED, TX `tx.fixture.reserve_001` receipt.
3. Re-read Sheets and independently re-read Docs. Sheets had committed while Docs remained at genesis, preserving all 70 copper including held. A real Docs `writeControl.requiredRevisionId` test with deliberately stale revision was rejected HTTP 400; no invalid mutation appeared. One revision-conditional append of the matching original immutable RESERVE journal brought the archive current.
4. Used another single real Sheets structural batch, four `updateCells` (employer held 30→0, worker available 0→30, escrow RESERVED→PAID and TX `tx.fixture.pay_002` receipt). The RESERVE receipt was retained. Re-read Docs (still with only first TX), then appended precisely the missing PAY journal/receipt using native revision guard.
5. Reconstructed the archive materialized rows from genesis and exactly two immutable deltas, compared to all corresponding sheet row values, and checked both target-specific receipt hashes and TX IDs. Both matched. Final total 70 copper (no minting), employee available 30, employer available 40 and held 0, untouched private paper lot quantity 2.

Journal hash values were calculated from **synthetic fixtures** only. This exercise demonstrates Google API structural batch semantics, versioned archive append and historical reconstruction; it does NOT establish that either receipt is backed by a real primary Deno KV economic transaction, that the Deno staging HTTP integration can authenticate the newly created connector-owned files, or that external Google sheet writers have been excluded. **Do not report this as production end-to-end integration or distributed ACID.**

## Remaining gates

1. Controlled live source migration: real NPC money/custody/title must be verified independently; unknown balances are not spendable and Shura's current Money cannot exist as two simultaneous writable truths.
2. Prevent ALL other (including manual/external) writers from updating the future economic projection, not merely cooperating bridge processes. Verify Google service account sharing and correct test file access before staging Deno integration.
3. Implement explicit operator-reviewed recovery of HELD physical projection locks after an ambiguous Google HTTP outcome. No automatic TTL/steal.
4. Replace fixed preallocated row/receipt limits and linear Docs scan with a scalable authorized slot registry and paged/archived indexed transaction receipts, plus bounded outbox worker and load tests for high independent NPC↔NPC turnover.
5. Complete integrated combined PR testing and owner-authorized release/deploy. No live game write or turn in this package.

## Post-test safety hardening
The isolated Google HTTP adapter now rejects **every** configured `config.files` production/authoritative document or spreadsheet ID, not merely TEMP_RUNTIME and LIVE_TRANSACTION_ARCHIVE. This includes GM PREGEN, permanent inventory, NPC knowledge, maps and current canon. Added regressions for attempted GM PREGEN and LIVE_PLAYER_INVENTORY staging writes. Only genuinely separate, owner-selected test assets may be supplied; no automatic promotion of those assets to production is possible.
