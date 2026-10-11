# EC-06 — verifiable funding, independent NPC cash and bounded wholesale due queue

**DESIGN + EXECUTABLE STAGING CODE ONLY. This branch stacks on draft PR #32 (itself #31 -> #30 -> #29 -> #28 -> #27). No migration, no monetary grants, no live economic transaction.**

## Verified current-state evidence

Runtime Bridge V2-S0721, Day63 18:21, Selarin Copy Market. PLAYER_RESOURCES has exactly one Money line: player.shura = 677 copper. INVENTORY_CURRENT has 92 unique tracked physical item IDs, 79 with exact Shura custody display label, 13 with other custodians. NPC_CURRENT lists independently acting people and their work, while OPPORTUNITIES_CURRENT records historically completed and paid jobs; these **do not** prove today's funds for those employers. Existing SERVICES_CURRENT source prices and merchant stock at historical observation dates are NOT cash balances, trade liquidity, or infinite current shop stock.

No current production table proves an aggregate NPC wallet/escrow ledger. Thus unknown NPC cash is UNKNOWN rather than 0, 677 copper from Shura, an invented starting grant, or the sum of historical offers. To start a real NPC economy, obtain source-backed historical funding/market income and truthful current balances with one approved accounting owner.

## What changed in code

src/economic_proven_funding.ts is a pure current-snapshot evidence audit:
- A genuinely CURRENT balance must reference one real owner, one unambiguous bank account identity, a verified SOURCE row and the exact pinned save. Distinct actors cannot share one wallet. A false, negative or duplicate record blocks all liquidity claims.
- Absent NPC balance stays UNKNOWN; such a worker/vendor cannot be given a spendable positive bank balance merely because they previously worked or sold something.
- Historical "PAID" opportunities, asking prices, biographies, candidate GM PREGEN balances and uncommitted jobs count only as background evidence, never as new cash.
- **Do not reapply historical flows on top of a current balance.** A current Money row already incorporates previously committed transactions; replaying receipts would double credit the economy. New flows require an explicit new source version and transactional KV events rather than reconstructing ad hoc sums from old job logs.
- This module emits EVIDENCE_ONLY_NO_MIGRATION, does not allocate any money and does not mutate runtime, Sheets or Deno KV.

src/economic_npc_clearing_queue.ts is a pure due-time queue:
- Works from actual accepted independent NPC buyer/seller orders and real delivery/consent/source rights. A historical template is insufficient.
- Sorts due orders deterministically and divides up to 20,000 source orders into **at most six events per eventual KV CAS window**. The window is a proposal: actual worker must reload current ledger/cash/stock/escrow and try the current-revision CAS, never assume a queued offer succeeded.
- Already committed orders and receipts are recognized and skipped; duplicate physical delivery receipts, wrong prices, forged permissions or missing inventory home scope block the queue.
- A buyer and seller account and the physical lot must share ONE authoritative home scope for current direct settlement. Cross-scope transactions are **DEFERRED**, not double counted or put into two unrelated ledgers. Real interscope freight and a joint clearing protocol are a separate future reviewed development.
- Queue labels are not new NPCs, prices, stock or deals. They do not advance the inworld clock and do not choose or negotiate on behalf of Shura.
- The prototype whole-ledger per scope remains a potential throughput hotspot even with six-event windows; before large deployment, a bounded indexed account/item CAS model and end-to-end load testing are necessary. A global 1000-deal ledger write would be unsafe/unscalable.

## Real Google staging already completed in earlier PR #32

Two ISOLATED synthetic Google files used on real Google APIs (via connector, not deployed Deno economy):
- Test Sheet: https://docs.google.com/spreadsheets/d/140f4FBzM6BWUiuEoJskzcWwfJ0s1U_bHyiwyBORvxR8/edit
- Test Doc: https://docs.google.com/document/d/1mE6FPqNew45yEw67suDbNzEc6FNB8fkSDT-zLIYalEQ/edit

A fake 20-copper/one-item exchange was recorded in one target, real Google Docs stale revision rejection verified, and the second target was recovered later. Synthetic current totals 280 copper and 3 item units. NOT game money, production settlement or proof that Sheets CAS exists.

## Still required before deployment

1. Establish NPC initial funds and actor legal account/title evidence from verified sources or justified canonical cash creation WITH explicit material/economic cause. Never derive current money from old payments alone.
2. Resolve holder-vs-owner mismatch from existing inventory (e.g. Shura-owned object held by an artisan), and actor-to-account mappings, including actors with goods but unknown liquidity.
3. Authorize and verify one economic primary owner, old Sheets writer freeze, safe one-time migration; authenticated proofs must be produced server-side.
4. Complete an exclusive Google staging source writer protocol and typed projection of bounded immutable deltas; real Google Sheets has no intrinsic CAS. Test ambiguous API results under concurrent edits.
5. Plan a secure joint protocol for cross-scope shipments and assets, and performance-test independent high-turnover NPC orders with active world clocks rather than full-city per-second scans.
6. Integrate stacked draft PRs with main and other city development, run combined CI, require manual owner review and Deno deployment.

**No game save change and no production deploy in this PR.**
