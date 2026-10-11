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


## High-turnover NPC↔NPC trade: genuine independent market exchange (2026-10-11)

The player is NOT the source of market activity. Selarin is a large multi-street commercial city: NPC shops, suppliers, workshops, carriers, food buyers, guilds and institutions can all enter independent purchases and deliveries, competing for finite real supply. Large turnover should be modeled as many verified real exchanges settled in bounded processing windows, not a city that waits for Shura or a global per-second replay of every merchant.

New pure src/npc_wholesale_clearing.ts wraps the finite settlement planner for **actual NPC/business buyer and seller accounts only**, sourced exclusively from accepted orders, approved prices, actor consent, exact physical handoff sites, verified freight receipt, real due inworld time and active/recorded originating process. An order's proof must match ALL accepted contract fields. No unobserved transport, instant route across kilometer markets, private bailment sale, future delivery, new merchant, or synthetic stock is permitted. Accounts and physical goods are drawn from the single current authoritative versioned snapshot, not GM_PREGEN design examples.

- A bounded staging clearing window accepts 1–1000 verified orders, deterministic chronological order; any invalid transaction aborts the whole proposed write set before persistence.
- A successful window gives grossTurnoverCopper, totalUnitsTransferred, distinctBusinessCount, netCopperByAccount and a single STAGING_CAS_REQUIRED settlement manifest. **Gross turnover is not money minted or net profit.** The same money can pass through multiple lawful trades; total account cash remains conserved except separately evidenced issuer flows (not supported here).
- Settlement rights are explicit AUTHORIZED_RETAIL or AUTHORIZED_WHOLESALE, never PRIVATE, BAILMENT or unapproved consignment. At transfer time the lot is already at the real handoff location; travel and warehousing require a separate causal elapsed-time process.
- Sequential within-window cash solvency remains required; **credit, delayed invoices, automatic interbank netting, inventory restocking, market price simulation, tax and transport charges are not included** and cannot be invented implicitly.
- Synthetic regression test covers 400 simultaneous independent NPC wholesale deals among 40 fictional fixture businesses, showing gross 8000 copper and net zero total created money with exact physical custody. These counts and amounts ARE NOT Selarin's actual demographics, trade volume or prices.
- No permanent trade facts or runtime WORLD_CLOCKS are added. To actually drive a large offscreen city, a future background actor/demand system must create finite source-backed orders and due-process windows, then call verified settlement at a real gameplay-time boundary. Only due/nearby trade processes should be loaded into normal GM context; no per-NPC every-second updates.

**This source is staging-only and cannot yet be executed as live transactions**: a durable transactional account/custody owner, bounded batches, CAS/idempotent outbox and concurrent-sale recovery are still mandatory before production approval.
