# EC-06 — atomic primary KV settlement and recoverable projection outbox

**Draft staging infrastructure only. No NPC wallets seeded, no production endpoint, no live writes, no current save mutation.**

This branch depends on draft PR #27 (pure finite cash, wage escrow and physical custody planning). Its PR must target that feature branch, not main, until the parent release is merged/rebased.

## Why this exists

Current production src/commit.ts writes prepared TEMP_RUNTIME Google Sheets values, appends Docs and later verifies. This is not a single ACID transaction across Google services. Existing src/cache.ts uses Deno KV for idempotency caches but has no CAS-authoritative economic ledger. A durable primary transaction receipt is needed to distinguish a committed transfer from a failed request.

## Implemented (NOT enabled)

- src/economic_kv_atomic.ts reads an explicitly pre-migrated authoritative scoped economic ledger. Missing/stale ledger: refuse. Never default wealth, NPC bank balances or goods.
- Pure finite plan is calculated from this exact snapshot, using source-authorized contract/work/custody evidence. The source proof authority is currently a staging adapter argument, not an independently secured proof service. It must NEVER be accepted directly from a player/GM REST payload.
- Single KV atomic operation checks the ledger versionstamp, absent TX receipt and absent causal event receipts, then writes the new ledger, TX receipt, per-event markers and a durable PENDING_PROJECTION outbox. Failed CAS: no write.
- Exact same TX intent replay returns same receipt without charging again; different intent under same TX ID is rejected.
- Max six economic events per atomic group (bounded backpressure). Large multi-merchant windows must split into actual receipt-backed smaller settlements, with independent unique IDs, not create a giant global transaction.
- ackEconomicProjection updates outbox status via CAS only after the authorized external projector has independently verified both Google targets. The function does not inspect Google and cannot authenticate a caller-supplied proof reference.
- src/economic_deno_kv_adapter.ts wraps an explicitly opened Deno.Kv instance but opens nothing by itself and is NOT connected to any current live HTTP route.

## Primary vs projection ownership

KV could become single authoritative economic state ONLY after a reviewed migration from PLAYER_RESOURCES.Money and INVENTORY_CURRENT. Do not leave current Sheets semantic writers also able to independently modify same money/items, or create two truth sources. Existing NPC funds, obligations and initial budgets must be established from evidence; UNKNOWN does not become infinite or zero spendable funds by assumption. Keep source custody and physical locations exact. The old committed game save remains authoritative until a migration actually succeeds.

Google Sheets/Docs then become reliable, idempotent projections with reconciliation watermarks, not independent writable accounts. Other runtime state can continue to use TEMP_RUNTIME unless explicitly migrated.

Scope boundaries must never place one physical lot or account in two independent ledgers. Cross-scope trades are not supported; future freight/interscope ownership needs an approved joint-clearance or recovery protocol. One scoped aggregate ledger serializes conflicting trades but may bottleneck large markets; benchmark locality/sharding before production.

## Failure/retry expectations

Missing ledger or authenticated proof => reject. Two simultaneous buyers of last item => one primary CAS success and one rejection. Wage paid twice => reject. Atomic commit fails => unchanged cash/item/receipt/outbox. KV succeeds but process crashes before Sheets/Docs => durable PENDING_PROJECTION survives, retry only projections. Identical TX replay => idempotent; changed TX payload => refuse. Projecting without committed TX => refuse; repeated same verified projection ACK => idempotent.

## Remaining release prerequisites

1. Test actual deployed Deno KV persistence, CAS and concurrency (fake test store is not a deployment durability certification).
2. Design/approve canonical NPC account identities, verify existing funds, item custody and migration, including Shura Money single-owner cutover.
3. Implement truly authorized proof adapter; do not trust a request's source evidence strings or permission sets.
4. Implement idempotent Sheets and Docs projector, with verified projection receipt and durable reconciliation/outbox worker.
5. Prove failure/retry, 2 concurrent last-item buyers, last-copper wage promises, event replay, capacity/backpressure and independent NPC trade ordering against that store.
6. Combine, integrate and verify multiple draft PRs with migration dry-run. Owner performs any Deno deployment manually.

No production main, commit, config, route, game save, player choice or live economy has been modified.
