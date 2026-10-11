# EC-06 — source-verified cutover, immutable journal, and Google projection recovery

**DRAFT / STAGING, NOT LIVE.** PR #29 stacks on PR #28 and #27. No migration, real NPC accounts, production Deno writes or player action.

## Authoritative sources

Committed runtime V2-S0721: Day 63, 18:21, Selarin Copy Market. Production engine remains on earlier code. Existing PLAYER_RESOURCES.Money owns Shura money, INVENTORY_CURRENT tracks current Item ID, Template ID, Qty, Custodian, Location and Version; it does not prove every trader's account cash. Old paid opportunities are not open NPC jobs. GM PREGEN economic design tables are not CURRENT ledgers.

Existing production commit.ts performs Sheets batch writes and separate Docs appends. Those are NOT one ACID transaction.

## Read-only source audit

src/economic_cutover_audit.ts rejects unknown/duplicate money, undocumented NPC owner funds, invented accounts, unavailable items, wrong custodians, stale save, untrusted source proof and an unverified freeze of independent Sheets writers.

AUDIT_READY_NOT_MIGRATED means the **supplied asserted authoritative source facts pass a dry audit**. It does not certify external proof authenticity, seed KV, choose Shura's actions or move one copper. A trusted adapter must verify real inputs and enforce a single writer before production cutover.

## Historical transaction journal and atomic KV staging

src/economic_projection_journal.ts derives immutable before/after deltas for just the accounts, wage escrow and physical lots actually changed in one economic transaction. It also carries exact TX ID, input/output revisions and causal event IDs. This is history, not a second writable current money ledger.

The economic KV primary atomic operation now checks/inserts this journal in the SAME CAS group as the new ledger snapshot, TX receipt, event IDs and PENDING_PROJECTION outbox. A later transaction does not alter the recorded delta for the earlier one. If KV CAS fails none of these records are written.

## Projection recovery contract

src/economic_projection_recovery.ts uses a future INTERNAL verified Google adapter. On each target, TEMP_RUNTIME and LIVE_TRANSACTION_ARCHIVE:
1. Read existing exact committed TX/revision receipt. If independently verified, do not apply it again.
2. If missing, verify external target revision watermark equals journal.beforeRevision.
3. Apply only the original TX's immutable changes, then READ BACK an authentic permanent exact-TX target receipt.
4. Once both distinct targets are independently verified, CAS-acknowledge primary outbox PROJECTED.

If Sheets applied TX A and Docs failed, retry should project only Docs, NEVER repeat the sale. If KV committed A then B, B is not projected to a target before A. Forged/mismatched receipts fail and leave outbox pending.

**Critical production blocker:** the trusted Google adapter does NOT yet exist. Its independent evidence check and per-target revision/receipt idempotence cannot be guaranteed by a plain interface or a caller-provided string. A crash after writing a target but before recording its durable receipt must be detected and reconciled without blindly replaying the delta. A production adapter must implement a durable conditional writer/receipt protocol or refuse and require repair. This PR has only pure coordinator and simulated target adapter tests.

## Large independent NPC commerce

Shura is not the central economic actor. Big-city NPC wholesalers and shops can exchange large material volumes independently, but each finite batch requires actual source demand, signed goods receipt, legitimate owner and inworld elapsed time. No global per-second trading of every NPC. The 400-order synthetic tests in PR #27 are throughput examples, not actual Selarin population, wages, stock or turnover. Separate scoped CAS ledgers cannot duplicate the same money account or item. Cross-scope freight needs a future explicitly reviewed protocol.

## Remaining before production

- Evidence-confirmed NPC money and one canonical account/lot source, without double-counting Shura Money or any private/bailment object.
- Approved migration and exclusive old-Sheets-writer freeze; fail closed on source save drift.
- Authenticated source proof/actor consent and one transactional economic primary owner.
- Real read-after-write/idempotent Google Sheets + Docs projector, durable target watermarks, receipts, outbox worker, recovery and concurrency tests.
- Actual deployed Deno KV durability/load test, including failures between target mutation and receipt creation.
- Compatible release integration of stacked PRs #27–29 and related draft PR #26, then explicit user-approved manual Deno deploy.

GitHub CI green indicates staging tests passed; it does not prove distributed ACID or authorize live deployment. Current gameplay save, inventory, NPCs and game time unchanged.
