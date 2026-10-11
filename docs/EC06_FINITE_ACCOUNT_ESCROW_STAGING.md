# EC-06 — Finite employer payroll, escrow and goods settlement

STATUS: DESIGN/PREPARATION ONLY. Do not merge or deploy this PR without explicit user-approved schema/recovery release.

## Actual source findings (save V2-S0721, Day63 18:21)

PLAYER_RESOURCES owns Shura's Money; this is not a generalized merchant bank. TEMP INVENTORY_CURRENT owns physical Item ID, Qty, Custodian and Location. NPC_CURRENT, WORLD_CLOCKS and OPPORTUNITIES_CURRENT prove people, obligations and past jobs, not the actual available copper of every employer. SERVICES_CURRENT menus do not establish unlimited retail stock.

The current TEMP schema has no authoritative NPC/account/escrow money ledger. We do not silently invent any employer account balance or shop stock.

Existing src/commit.ts writes Sheets data, then Doc appends, then verifies CONTROL. These are separate stores and **not a single atomic distributed transaction**. Idempotent replay and KV cache statuses are helpful but do not prove serializable isolation across concurrent Sheets writers.

The separate draft PR #26 prevents duplicate job board postings; it is not deployed and must not be assumed present in production.

## New code

src/economic_atomic_plan.ts is a PURE snapshot-sensitive settlement planner. It accepts a trusted versioned account/escrow/item snapshot and independent causal evidence, runs all event operations on throwaway cloned maps, and returns STAGING_PLAN_ONLY. It NEVER writes any current state.

RESERVE_WAGE moves finite spendable employer copper into employer-held escrow, one proven source demand per escrow. PAY_WAGE debits escrow and pays a worker only with real completion evidence. RELEASE_WAGE refunds employer escrow only on proven cancellation. Previously recorded escrow remains payable after the original demand is completed; only NEW reservation requires currently active demand.

SELL_GOODS needs actual custody and selling right, actual location, independent buyer consent, existing money, and finite item quantity. Full sale changes custodian/location for same Item ID; partial sale decreases original and mints exactly one distinct item ID for delivered portion. Private objects, borrowed diagrams and unapproved consignment are not retail stock.

Authoritative snapshot requires unique IDs, integer nonnegative monetary amounts, held balances exactly equal to their live escrow obligations, and real canonical source evidence. TX and individual event replay, stale revisions, duplicated items, overpayment and overselling fail without output. No imaginary seller, account or new store.

src/semantic.ts now invokes assertUniqueInventoryEventIds before applying any inventory event, rejecting repeated modification of the same physical Item ID within one semantic turn. Consolidate legitimate operations per source item and create genuinely distinct products.

## Important limitation and next release gates

This PR DOES NOT COMMIT economic money/custody transactions. The in-memory plan is all-or-nothing; Google Sheets and Docs are NOT magically atomic. A live distributed transaction must require a single authoritative durable financial ledger, an existing-item custody bridge, CAS with event-id uniqueness, a recoverable outbox/projection into Sheets, crash/retry and concurrent-last-item/last-copper tests. Do not add a second unrelated CURRENT account table or blindly convert staging design into cash.

The planner's authority and evidence sets must be loaded from verified permanent canon and the currently committed runtime, not constructed from DESIGN_CANDIDATE rows. The synthetic unit tests do not define new prices, balances, NPCs, dwellings, copper grants or shops in Selarin.

A later release must explicitly review schema, migration, account ownership, compensation and idempotent restoration before enabling semantic economic operation commits. Only the user merges and manually deploys Deno. No main, credentials, deployment triggers, live table data, save, NPC, Shura resource or world time change in this PR.
