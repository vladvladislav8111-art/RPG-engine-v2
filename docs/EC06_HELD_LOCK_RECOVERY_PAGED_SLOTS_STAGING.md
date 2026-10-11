# EC-06 / PR #37 — HELD Google fence recovery and paged slot registry (STAGING)

**Status (2026-10-11):** design and synthetic tests only, stacked on draft PR #36 → #27. This is NOT a runbook for the currently deployed RPG runtime. Do not merge or deploy alone. This document defines a fail-closed future operations contract, not an existing trusted quiescence service.

## Authority and invariants

1. Committed **indexed Deno KV** is the proposed single financial authority after a separately approved, source-funded migration. Sheets and Docs are one-way, independently verifiable projections; old editable CURRENT Sheets, snapshot KV and indexed KV must never be competing authoritative writers.
2. Each financial operation commits its exact transaction receipt, mutation journal and pending outbox atomically in primary KV. Exactly one real physical item custodian, distinct legal owner where appropriate, finite payer liquidity and source evidence are prerequisites. No historical wages or offers generate NPC money.
3. A Google projection is never financial settlement. A lost response must never trigger a second KV debit, pay or inventory move. Google Sheets does not offer compare-before CAS; the claimed physical-file fence works only while **all** writers, including manual editors and old service versions, are genuinely excluded.
4. A HELD lock is **not** a lease. No TTL, age-based release, operator force unlock, caller-provided success flag or routine HTTP endpoint is permitted.

## PR #37 code surfaces

- `src/economic_google_kv_exclusive_fence.ts` records Google physical-file target, scope, unique lock token/epoch and exact pending indexed TX + SHA-256 journal hash.
- `src/economic_indexed_held_fence_recovery.ts` reads immutable committed KV transaction, journal and outbox; constructs exact mutation intent; checks independently read Google receipt and all touched rows. The release path requires an *injected privileged* `ExternalQuiescenceVerifier` and repeats reads before a single KV compare-and-swap release + durable audit.
- `src/economic_indexed_slot_registry.ts` registers **already provisioned** pages, then immutable `(target, scope, kind, ID) → Google file/tab/row` records. Physical row occupancy is CAS protected across scopes; bounded 1–8 registration groups and at most 64 explicitly requested lookups avoid whole-market reads.
- `tests/economic_indexed_held_fence_recovery_test.ts` and `tests/economic_indexed_slot_registry_test.ts` exercise synthetic Deno KV and fake external transport, including 500 independent merchant registrations. They do **not** prove genuine quiescence or production Google atomicity.

## Incident protocol — never infer a dead worker

**Before touching a HELD lock:**

1. Stop scheduling new writes to the exact Google physical file, across all scopes and deployment generations. Put affected projection tasks in quarantine. Do **not** halt/rollback unrelated settled primary KV trades, and do not edit game CURRENT.
2. An independently operated privileged controller must identify the worker generation, all relevant outgoing HTTP calls, retries, asynchronous continuations, and delayed responses. Terminate/drain the old generation and establish that **no earlier Google write can still arrive**, including through proxies, connection retries or an old process. A timeout alone is not proof.
3. Independently lock out all external Sheets/Docs editors and alternate writer credentials/services for the entire incident and until a new single writer takes control. Obtain revocation/access-control evidence. An operator's statement, arbitrary proof string or same-process callback is **not** sufficient.
4. Retain an immutable incident record: target physical file ID, scope, old token/epoch, TX ID, journal digest, worker/deployment identities, Google request IDs where available, drain and credential evidence, affected file revision/readback, start/end of the exclusion interval and independently controlled sign-off. Only this trusted service may supply `ExternalQuiescenceVerifier` output. That service **is not implemented or deployed by PR #37**.
5. Under the verified exclusion, read exact primary KV receipt/journal/outbox, Google receipt and every touched Google row. Compare the SHA-256 journal derived locally and lock metadata. No modification of financial balances is allowed during recovery.

### Allowed classifications

| Google target evidence | Decision |
| --- | --- |
| Exact durable receipt for the same TX/hash/row IDs **and every row equals AFTER** | May classify projected. Still **do not release** absent independent no-in-flight/other-writers-excluded proof. |
| No receipt **and every row equals BEFORE** | May classify unapplied. Still **do not release** absent independent proof. Later ordinary outbox worker may retry exactly this immutable projection. |
| Receipt present but one row differs; partial BEFORE/AFTER; unexpected value; forged/old receipt; wrong hash; missing journal/outbox/TX | QUARANTINE, no release or retry; human source reconciliation required. |
| Google read fails/ambiguous, lock token or epoch changed, evidence expires or worker status unknown | QUARANTINE, no release; repeat after fresh independently established exclusivity. |

6. Run fresh Google readback **after** external quiescence attestation; re-check unchanged KV lock version/token/epoch, exact intent and classification. The release and audit entry must be in **one** Deno KV atomic CAS. If CAS fails, release nothing and start a new inspection.
7. Keep writer exclusion active until a newly fenced, authorized projection worker assumes ownership. Remove quarantine only on verified target receipt/readback. If prior Google receipt exists, reconcile the outbox idempotently; if BEFORE-only, execute its original projection once. **Never replay the original sale, wage payment or stock transfer.**

### Explicit adversarial cases

- Parallel old and new handlers: their requests may race outside the KV lock; refuse unlock without actual old-generation drain and credential exclusion.
- Late/duplicate HTTP response: neither HTTP 200 nor caller timeout proves whether a write was applied; actual Google receipt + all touched rows govern classification under quiescence.
- Missing Google receipt with changed rows: quarantine even if the final balance *looks* plausible; external editor interference cannot be distinguished from a partial write.
- Forged/mismatched SHA-256, wrong physical file or altered immutable journal: refuse.
- Independent operator proof unavailable: leave HELD indefinitely and escalate; no TTL shortcut.
- Reads are not a distributed transaction: external exclusion must remain effective **between** the final read and KV release, and until new ownership is established. An ordinary callback cannot enforce this.

## Physical Google row registry

Admin pre-provisions approved pages with fixed Google physical file ID, sheet ID/tab, bounded row range, source proof and scope; registration does **not** provision Sheets or mint accounts. All identity-to-cell pointers and physical occupancy records are immutable KV CAS inserts. Never allocate “next free row” by reading a stale shared counter. Do not accept a fabricated `trustedProvisionedPageProofRefs` set from a public API caller as independent physical proof. Operational administration must verify the real Google tab, sheet ID, reserved range, credentials and proofs before passing this authority.

Receipt cells are separate from account/lot/escrow cells; every TX needs a unique pre-provisioned receipt pointer. Page inventory and retention policy must be bounded and monitored. Archived/rotated pages remain immutable with an index to their precise old physical file + range. This feature currently does **not** implement page provisioning, compaction, receipt rotation, or a durable capacity allocator.

## Scaling follow-up

Use independently partitioned bounded outbox candidate indexes keyed to real TX identifiers, not a mutable global city offset. Retrieve only a small page of actual pending/possibly pending primary KV references; workers must verify the exact committed source journal and both real Google receipts before marking work complete. A later bounded archive segment/checkpoint strategy is needed for Google Docs: repeatedly re-reading the whole append-only transaction document is unacceptable for large NPC volume. Preserve physical concurrency and ordered application for any rows shared between concurrent deals. The data-plane adapter and a privileged operational controller must be validated against real isolated Google services before any finance cutover.

## Release gate

No production integration until independently verified NPC funding, physical stock ownership/custody, approved CURRENT-to-indexed migration, exclusive old-writer shutdown, trusted quiescence controller, bounded outbox/Docs strategy, missing/partial write recovery tests on *actual isolated resources*, complete stacked PR TypeScript+regressions, and a manual authorized deploy. **Production gameplay save remains untouched by these draft documents.**
