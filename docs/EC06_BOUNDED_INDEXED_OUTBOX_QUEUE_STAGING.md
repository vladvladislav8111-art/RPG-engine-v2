# EC-06 — bounded indexed projection outbox queue (draft PR #38)

## Status and dependency
STAGING only. Built directly on PR #37, stacked on #36 → #27. No Deno production endpoint, scheduler, NPC account creation, Google projection write, CURRENT migration, automatic game-clock change or deployment. Do not merge this branch alone.

## What changes

- `src/economic_indexed_outbox_queue.ts` adds **64 deterministic transaction-ID shards**, immutable queue pointers and strict bounded per-shard Deno KV cursor reads (maximum 32 at a time). These are *discovery* references, not another ledger, snapshot or global sequential counter.
- Both `commitIndexedNpcWholesaleStaging` and `commitIndexedWageStaging` (actual wage function is existing) insert the corresponding queue pointer **in their same Deno KV atomic CAS** as primary account/lot/escrow modifications, immutable TX receipt, journal and projection outbox. Crash after primary commit can no longer leave the committed projection undiscoverable merely because a separate enqueuer failed.
- A worker must verify committed `TX / journal / outbox` on each retrieved candidate. Out-of-order projection of same account/lot/escrow remains barred by `reconcileIndexedDeltaStaging` (BEFORE match) and the actual exclusive Google writer fence. Queue order is **not** a chronological global market ordering.
- `pruneVerifiedIndexedQueuePointer` removes *only* a stale discovery pointer after the original primary outbox is CAS-marked `PROJECTED_INDEXED` with a proof reference whose SHA-256 equals the immutable source journal. Its single Deno KV CAS checks source TX, journal, outbox and queue versionstamps. Original TX, journal, outbox and physical event receipts remain immutable.
- No automatic retry, TTL or release of a HELD Google lock: that remains the separately privileged and **currently unimplemented** quiescence procedure from PR #37. Pruning a discovery pointer does not make external Google requests safe.

## Failure handling

1. **KV commit rejected:** no financial delta or queue pointer is created.
2. **KV commit succeeded, worker/process crashed:** queue entry and pending outbox are discoverable after restart; do not replay source trade/wage.
3. **Google before-state, no receipt:** a properly exclusive writer can project the original immutable journal after confirming per-row causal order.
4. **Google success with lost response:** original HELD file fence remains until independent operator drain/exclusivity proof. No second payment or automatic lock expiry.
5. **Partial external write/receipt inconsistency:** quarantine; retry cannot be inferred from queue presence.
6. **Concurrent cleanup:** at most one CAS deletes the queue pointer, never primary history.
7. **Backpressure:** the queue scan is bounded to requested scope+shard+page; there is no perpetual citywide scan or global mutable financial version. Operational scheduler, capacity alarms, fair shard scheduling, worker fencing and resumption checkpoints remain separate future work.

## Limitations and next production gates

- No actual independent old-Google-request quiescence controller, forced exclusion of external editors, Google row provisioning or archive segment compactor exists.
- `LIVE_TRANSACTION_ARCHIVE` currently needs a segmented immutable/checkpointed format; repeatedly replaying an entire Google Doc will not scale.
- Adversarial fault-injection needs real isolated Google API traffic and actual authenticated runtime integration before cutover.
- Missing current NPC cash/liquidity/ownership is not filled from design lore, wages or PREGEN; the single-source indexed finance migration must be explicitly authorized and verified.
- Existing production economic money, Shura choices, simulation time and scene remain unchanged.

## Verification
Synthetic regression cases in `tests/economic_indexed_outbox_queue_test.ts` cover 200 independently queued TX pointers over 64 shards, cursor bounds, crash-before-projection discovery, forged proof rejection, orphan quarantine and competing cleanup. Real tests and counts must be reported from GitHub Actions after the PR push; test assertions are not proof of production semantics.
