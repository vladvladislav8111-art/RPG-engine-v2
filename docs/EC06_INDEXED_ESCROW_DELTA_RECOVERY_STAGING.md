# EC-06 — indexed wage escrow and per-row Google projection recovery

**DRAFT STAGING ONLY.** Stacked PR #35 depends on #34, #33, #32, #31, #30, #29, #28 and #27. No production economic accounts, work contracts, wage payment, item transfer or game-time updates have been committed. Existing TEMP_RUNTIME is the live financial authority until explicit controlled migration.

## What this adds

### Real finite wage reserve on the same indexed account keys as NPC trade

`src/economic_indexed_wage_kv.ts` implements three source-backed economic operations against the **same** `indexedEc06Keys.account(scope,accountId)` money rows used by indexed NPC-to-NPC wholesale.

- RESERVE: actual independently accepted and currently valid employer/worker wage contract, exact canonical demand ID, agreed amount, employer and worker accounts both existing and linked to one verified scope. CAS moves agreed copper from employer availableCopper into **the same employer heldCopper**, creates an escrow and a permanently reserved demand marker. It never issues money.
- PAY: only for a full already-funded reserve with independently confirmed completion evidence matching that specific demand and operation. CAS moves held money to the actual worker's availableCopper and leaves a terminal PAID escrow tombstone.
- RELEASE: only for a full reserved wage with independently verified cancellation evidence matching the same demand and operation. CAS returns held money to employer availableCopper and leaves a terminal RELEASED escrow tombstone.
- All three atomically store unique global transaction receipt, immutable before/after indexed wage journal, and PENDING_INDEXED_PROJECTION outbox. Exact retry is idempotent. The same demand cannot be re-opened under a second ID after payment or cancellation. This implementation supports full reservation/settlement only; partial wage instalments are not implied.
- Because wholesale and wages share the same actual payer KV account versionstamp, an employer with only 40 copper cannot simultaneously complete a 30-copper material purchase **and** reserve 30 copper in wages: one conflicts. This prevents infinite NPC payrolls and double-spending without making the player the center of city trade.

The input `IndexedWageAuthority` is a staging **trusted internal contract** and is not a proof service or a valid player-supplied API parameter. In production the authenticated backend must assemble it from real committed work demand, employer funds, accepted worker consent and actual source records. Do not create employment, agree contracts, cancel shifts, pay workers or make player choices from templates.

### Bounded indexed Sheets/Docs *delta* projection

`src/economic_indexed_delta_projection.ts` translates an exact immutable primary sale or wage journal into a SHA-256-bound delta containing **only affected account, physical lot and/or escrow rows**. For each of two targets (future TEMP_RUNTIME read-only projection and transaction archive), it:

1. Reads an independently authenticated, durable exact-TX target receipt. If correctly verified, it skips reapplying an already committed target even after an ambiguous network timeout.
2. Otherwise reads precisely the touched row IDs and checks each existing value against the immutable BEFORE value. Overlapping operations must project in their real order; unrelated accounts and lots need no global city snapshot order.
3. Requires a fenced, **indivisible per-target row+receipt write**, verifies persisted receipt against the original journal, and only after both targets are independently verified CAS-acknowledges PROJECTED_INDEXED on the primary KV outbox.
4. An unsupported source, forged target receipt, missing second target, conflicting rows or extra response without a durable receipt never permits arbitrary re-crediting of copper or transfer of goods.

**Critical limitation:** `IndexedDeltaTargetAdapter` is an explicit protocol/contract, **not** an actual production Google Sheets/Docs transport. Google Sheets values.update does not provide a server-side compare-and-swap for arbitrary cells, and Docs and Sheets cannot be made cross-store ACID by ordinary batch calls. The simulated atomic target adapter is not a certified real Google writer. An actual authorized exclusive-writer, durable per-row projection index and crash-tested readback implementation is still necessary. The existing whole-image JSON staging Google transport is not a substitute for high-volume indexed per-record projection. A Google projection must remain a derivative and never a second independently writable financial truth.

## Regression test scope

New tests on isolated real ephemeral Deno KV and a simulated row-target transport cover:

- employer pre-funded reserve, completed payout, verified cancellation and prevention of replay under a new transaction ID;
- no payment from cancelled or already-paid escrow, missing employer/worker source account, insufficient money and forged acceptance/completion/cancellation evidence;
- two competing wage reserves for the same last employer copper, and material purchase against that same money;
- immutable journal-based ordered wage+wholesale projection of only the changed row values, partial Docs outage after Sheets, ambiguous response *after* Sheets mutation, no double application, and forged hash refusal.

All amounts, employers, goods and orders in the tests are **synthetic fixtures**; not Selarin wealth, actual jobs or trade.

## Necessary before production

1. Verify real NPC cash and the legal identity/owner of each existing physical lot, then perform an owner-reviewed **single-writer cutover** from current Google Sheets to the single indexed KV primary. The committed live save remains authoritative until then; Shura Money has only one true owner.
2. Resolve base indexed account heldCopper and actual escrow obligations on migration. Unknown historical employer funds are UNKNOWN, not 0 and not free credit. Never replay old wages as new income.
3. Implement an authenticated actor/contract/completion/cancellation proof source and validate NPC knowledge/time/availability without automatically accepting work for Shura.
4. Build an actual Google row-indexed target + receipt writer with physical-file exclusive fencing, durable target readback, idempotent outbox worker and crash/recovery tests against separate staging Sheets and Docs. Prevent manual/external editors from bypassing the economic writer fence.
5. Benchmark production-like concurrent workers, last item/last copper contention, projection backlog and large independent NPC↔NPC wholesale with only due active world processes, no global per-second city processing.
6. Review all dependent PRs as one intended release, integrate with work-demand dedup PR #26 and other modules, retest the combined commit, then have the user perform any explicit manual Deno deployment.

**No production Deno or live TEMP_RUNTIME writes in this PR. Save V2-S0721, day 63 at 18:21 remains unchanged at creation time.**
