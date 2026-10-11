# EC-06 — source-audited cutover and immutable historic projection recovery

**DRAFT. NOT WIRED TO LIVE ROUTES. NO production KV access, Google writes, or save migration.**

This PR extends draft PR #28 (KV CAS receipts and pending outbox), itself based on draft PR #27 (finite employer escrow and NPC trade). Do not merge into main before an approved combined release.

## Verified source constraints

Current committed runtime remains authoritative. PLAYER_RESOURCES.Money represents Shura cash, not the entire city's accounts. INVENTORY_CURRENT remains the only actual current physical Item ID, location, quantity and custody owner. Unknown NPC cash is UNKNOWN, never free income or automatically zero. Existing Sheets economic writers must be frozen for one-writer migration, otherwise the new KV ledger and Sheets will be conflicting truths.

src/economic_cutover_audit.ts audits externally verified source-money rows and source-item rows, distinct mapping to actual holders, individual legal rights, duplicate sources, source save ID, owner proof and confirmed exclusive writer cutover. A missing actor balance, missing item, wrong custody, stale save, unsupported legal evidence or still-active Sheets writer returns BLOCKED. A clean result is AUDIT_READY_NOT_MIGRATED: no account or goods are written.

## Immutable per-TX journal and projection recovery

Earlier PR #28 included durable TX and pending projection markers, but not the exact historic item/cash effects. If a later transaction B follows A, projecting A from the latest KV ledger would corrupt Google current state.

src/economic_projection_journal.ts calculates immutable per-record before/after changes for the exact committed transaction: account, escrow and item IDs. A journal is a historic receipt, not a second current live ledger. src/economic_kv_atomic.ts persists it in the SAME KV atomic compare-and-swap group as money, items, TX receipt, individual event IDs and pending outbox. Repeat TX checks matching journal existence.

src/economic_projection_recovery.ts provides a fail-closed, staging-only projection coordinator. It loads one immutable TX and checks an external target's last applied revision before running that exact delta through an internal adapter. It reads a durable exact-TX receipt back from TEMP_RUNTIME and LIVE_TRANSACTION_ARCHIVE; only if both are independently verified does it ACK the outbox. If projection succeeded to Sheets but failed on Docs, the next run sees the original Sheets receipt and retries only Docs. A later TX cannot be projected before its predecessor; nor can an older TX overwrite a later projection.

The adapter is a CONTRACT, not an already authorized Google integration. Source verification and writes must be performed by a future internal privileged adapter. Existing lower-level ackEconomicProjection still accepts an argument with a proof ref and must never be exposed to an untrusted client or called outside validated internal recovery. This draft does not make Google Sheets and Docs a single ACID transaction.

## Test and release requirements

Synthetic regressions audit source provenance, unknown NPC funds, save drift, duplicate item/owner and writer freeze. Actual ephemeral Deno KV tests verify journal survives later primary transactions, crash between first and second Google projection, safe retry, out-of-order blocking and false receipt refusal.

Before any live rollout: verify actual NPC funds and item rights, approve migration and single-write-owner cutover, build authorized Google projectors with durable versioned readback, implement scoped backpressure plus reconciliation watermarks, review TX size/cross-market boundaries and all combined PR dependencies. Only user-controlled manual Deno release after end-to-end safety checks. No game time or Shura resources are changed.
