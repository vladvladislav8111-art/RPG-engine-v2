# RPG Engine V2 — release readiness and live-save isolation audit
Date: 2026-10-13. Scope: current Draft stack up to `a2d774591619c68c13bfaaa273e8962474163ee0`.

## Decision — NOT READY TO PROMOTE EXPERIMENTAL NPC HEAT OR ORPHAN RECOVERY

This audit is not permission to merge, deploy, clear TEST locks, promote NPCs or
enable EC-06. The working game remains on production engine
`2.12.1-specialization-domain-2026-10-11` with Shura committed
`V2-S0795`, Day 67 17:21:00 (verified via read-only runtime_health).
`main` stays `837092f2b4d95c920a9abecfbf08eb01bde487ac`.
These snapshots are evidence at the time read; not permanent assertions.

### Changes under review and merge topology

Exactly this ordered Draft stack is known:
1. PR #57 — journal candidate audit; base `main`.
2. PR #59 — isolated V2 receipts; base PR #57 branch.
3. PR #60 — KV lock/recovery; base PR #59 branch.
4. PR #61 — Preview KV probes; base PR #60 branch.
5. PR #62 — actual Google E2E/ACK-drop forensics and signed-history
   experimental audits; base PR #61 branch.

All remain Draft and unmerged. PR #62 is **29 commits ahead of main**,
zero behind at this snapshot, and includes non-production routes and
experimental safety flags. Re-evaluate ancestry/conflicts and CI after every
future rebase or squash. Do not independently merge stacked PRs out of order.

### Verification evidence and limits

| Area | Evidence | Outcome and limit |
|---|---|---|
| TypeScript & regression | CI 38309696970: `deno check main.ts` and **395 passed, 0 failed**, plus separate local Deno OS-process KV CAS probe | PASS on Draft head; not production runtime validation |
| Production isolation | `runtime_health` still Shura `V2-S0795`, 17:21; main unchanged | PASS read-only at audit; no Shura semantic commit |
| Source bridge contract | `src/mcp.ts` still registers the seven required named tools `runtime_health`, `get_turn_context`, `prepare_turn`, `commit_turn`, `rng_int`, `render_current_hud`, `simulate_world_v3` (alongside other preexisting tools) | PASS source registration; independent live Bridge compatibility after a new Deno deploy is NOT tested |
| World V3 | unit/integration covers clock, causality, NPC autonomy, knowledge, craft, travel, combat, inventory, source-funded demand, progression, SUP choice | PASS synthetic calculations; V3 stays READ_ONLY_PROPOSALS, no write authority |
| NPC Life V4 | existing promotion, separate meaningful days, autonomous goals, knowledge, boundaries, motives, relationship tests | PASS synthetic rules; source completeness is still required |
| General XP/SUP | no draft rewards, origin de-duplication, explicit Shura SUP purchases, source-backed system objective gating | PASS targeted unit tests, not a live economy/progression load test |
| Inventory/economy | custodianship/mass, escrow and funded offers; no spontaneous NPC budget | PASS targeted unit tests; **EC-06 full NPC economy not enabled** |
| Google commit & idempotency | independently read TEST-S3 after genuine Sheets/Docs write; replay once without duplicate; TEST-S4 fault after genuine Sheets success and before Docs | PASS within TEST scope; real Google network ACK loss NOT simulated |
| KV mutual exclusion | distinct immutable Preview revisions independently observed lock, rejected rival and saw release; post-ACK-drop TEST-S4 orphan remained held under read-only KV forensics | PASS for those conditions; same-revision replica contention and stale resumed writer fencing NOT proven |
| TEST-S4 recovery | durable partial Sheets TEST-S4 / 12 copper / one journal TX / zero new Doc marker; `RECOVERY_REQUIRED`; lock owner & stability verified by user read-only report | QUARANTINED. **Do not** unlock, repair Docs, rotate TX or retry. `oldWorkerStoppedVerified=false` |
| Future signed NPC history | opt-in HMAC V3 provenance and pure signed TEST-segment predecessor checker; tests reject omission, reordering, duplication, tampering and unsigned evidence | PASS code-only candidate chain. No externally trusted genesis, authoritative full TX index, key rotation proof or canonical memory corroboration |
| Heat and KEY promotion | current audit/precheck never commit heat 2-4, KEY, XP or SUP; six candidate social days alone insufficient | BLOCKED until trusted continuous original evidence + separate GM/semantic commit |
| Performance / 1-2 minute turn budget | bounded local scans and hotpath budget tests; no verified multi-day production load profile | NOT VERIFIED under realistic sustained traffic |
| Reversible rollout | no tested full release rollback/restore of a copy of the real save; TEST-S4 lock remains deliberately orphaned | RELEASE GATE OPEN |
| Operational config | user showed Preview diagnostics: `ALLOW_WRITES=false`, test writer off, raw commits off, isolated workbook IDs true, no mutating calls | PASS for that Preview revision at check; cannot attest all retired historical Preview URLs |

### Guardrails before any future merge/deploy
- Keep the five Draft PRs unmerged until separately approved; no automatic
  Production promotion or backend/site/plugin replacement.
- Keep TEST writer default OFF. Leave `TEST-S4` permanently locked pending
  explicit operator-approved, stale-worker-safe recovery design.
- Never use unauthenticated old V1 or unkeyed V2 history as a signed origin;
  an arbitrary `GENESIS` in a candidate segment is not a real trust root.
- Keep all NPC Heat 2–4 and KEY promotion in read-only review state. Existing
  committed KEY NPC dossiers (including Vesha) remain authoritative.
- A full post-deploy Bridge smoke test, backward-compatible save migration
  plan, source-backed NPC epoch genesis/key rotation and a safe stale-writer
  recovery protocol are release gates, not grounds for another unbounded
  cycle of manual ENV changes.
- At final user-approved release: freeze reviewed heads and CI results,
  resolve stacked PR ancestry, rehearse rollback on an isolated copy,
  explicitly authorize merge and Production Deploy, verify runtime_health,
  get_turn_context and render_current_hud read-only before permitting any
  ordinary semantic gameplay commit.

## Work to do next without new ENV or Preview writes

1. Design independently anchored prospective V3 epoch genesis and key
   rotation without retroactively signing historical V1/V2. Test with
   isolated synthetic sources only.
2. Design stale-writer fencing / explicit operator reconciliation so a
   paused instance cannot resume after lock retirement.
3. Do compatibility, throughput and upgrade-readiness review on a
   non-production copy. Retest complete CI and all inherited Draft commits.
4. Get explicit user permission **separately** for merges and Production.

This document is an audit snapshot, not a release certificate.
