# Turn Dispatcher / EC-06 / System Inbox — staged deployment contract (2026-10-11)

## Scope and invariants

This batch modifies the EXISTING RPG-engine-v2 code. It does not create a new Site, Plugin, backend, Google writer, account or game save. Existing RPG Runtime Bridge interfaces, Deno origin, authorization and HUD remain unchanged. All tests use synthetic fixture data; **never test game writes on the production save**.

Live bridge checkpoint on review: V2-S0795, Day67 17:21, Shura in Selarin. No in-game time passes for infrastructure review. V3 is READ_ONLY_PROPOSALS; the authoritative gameplay writer remains semantic prepare/commit.

## Landed in this draft branch

1. `get_turn_context` includes `gmTurnBrief`: required XP review (including justified zero), causal NPC/world checks, exact payment/inventory checks and no automatic player decisions. This is a **read-only plan**, not automatically executed V3; a future audited orchestration phase can feed it actual verified V3 jobs after a bounded source adapter is ready.
2. `SYSTEM_CONTACTS_CURRENT` is always read as a small live source. Contact-oriented tags (`CHAT`, `CONTACTS`, `USER_LINK`, `MESSAGE`) automatically route ACTIVE/consented Shura peers through the preexisting bounded actor chat and NPC gate. No absence of chat is inferred from an unloaded scene. A cache timestamp is explicitly distinguished from the actual latest loaded message.
3. `PENDING_CHOICES` is always included. Unfinished choices are presented as reminders; `PENDING_GENERATION` is flagged, **not silently resolved**. Canonical options still require their own separate source and semantic update, and final choice belongs to Shura.
4. After source-backed semantic XP processing, `systemNotifications` is derived from real level and specialization crossings, saved to `SESSION_LOG.World advances JSON` and returned in the successful commit result for existing `render_system_event`. No notification for mere draft/catalog candidates; no free XP/SUP.
5. During a real semantic chat commit, an already-ACTIVE matching contact's `Last message at` is updated in the same writer manifest, never invented from off-screen speculation. Historical stale timestamps can remain until a legitimate repair is carried out; the read-only inbox uses actual chat source independently.
6. `computeCompetenceAward` and specialization progress reject nonfinite/negative time and suppress awards for zero verified practice or zero multiplicative learning evidence. Other legitimate positive learning bands remain unchanged.

## Observed System contact data

`contact.shura.max` / `npc.max.earth` (Макс), `contact.shura.irina` / `npc.irina.earth` (Ира), and `contact.shura.kirill` / `npc.kirill.earth` (Кирилл) are ACTIVE in the authoritative System contact list; they are independent KEY NPCs in Arderan. An old contact-cache 'last message' points to Day34 while actual private messages survive in `SYSTEM_CHAT_LOG` later than Day34. No auto-reply or missing-message recreation. User Link Lv1 supports one-to-one messages only, not a group chat.

## Quest/job generation must be two-stage

1. Independent real need: a staffed world process, real employer with knowledge/access, finite physical workload, place and expiry. A prior closed opportunity, generic template, or Shura's wish does NOT establish paid demand.
2. Discovery preview (V3 read-only): source document/item/lot, actual available slots, job verification, physical access, competing NPC commitments and expiration.
3. Financial gate: an independently verified finite funding envelope or EC-06 reserved escrow, unique job/offer fingerprint across existing and proposed offers, issuer spending cap and exactly-once receipt. With unknown funds show `UNFUNDED/UNVERIFIED`, never a promise to pay.
4. Only then semantic `workDemandEvents` materialization, separate explicit Shura acceptance, actual work time and employer verification; wage transfer once after earned. Never create jobs while answering out-of-game questions.

This branch does **not** activate steps 3–4 automatically. The current semantic work-demand path has a provenance/funding gap compared with V3's stricter candidate model; merging a generator without closing this would create unsupported money.

## EC-06 activation gates — all required before production

- Audit all real source-backed starting NPC balances, legal goods ownership and physical custody, existing Shura funds and prepaid jobs; no guessed NPC wealth, ghost goods or retroactive arbitrary backfill.
- Select exactly ONE primary transaction ledger. Authenticate production Deno KV timeline and verify cross-revision persistence; a Connected badge or in-memory test is not sufficient.
- Review the staged dependency chain PRs #27–#43 in order, plus independent diagnostics PR #44. No mass merge/auto-deploy; do not confuse successful synthetic CI with production readiness.
- Verify exclusive Google projection writer/cutover, index-backed transaction outbox, bounded Sheets/Docs projections and reconciliation, crash and lost-ACK behavior. HELD locks must not auto-expire or be released without independent quiescence evidence.
- Demonstrate same-origin money conservation and exactly-once physical transfers and wages in independent isolated E2E tests, plus tests for counterfeit receipts, parallel merchants, insufficient escrow, delayed QC and revocations.
- Add source-backed safe semantic adapter only after results of the above; no direct gameplay mutation through V3 proposals. Owner-controlled Deno release, preserve existing Site identity, URL and server Bearer.
- On release: `deno check main.ts`, full `deno task test`, CI all green, committed save unchanged, canonical source untouched except explicitly approved writer migration.

## Future backlog (not promised by this PR)

- A **read-only** central orchestrator that automatically selects and runs bounded V3 jobs, returns proposed semantic events with source refs, and blocks incomplete checks before commit; GM still resolves world/NPC causality.
- Source-funded, geographically general (not hardcoded Selarin) quest production from real live demand and EC-06 escrow.
- Source-backed option generator for `choice.competence.crafting.practical_creation.lv3` (Day58 pending, currently empty), with no auto-selection.
- Delivery/review reminder scheduler for existing prepaid Herna control cords and three cook-shop kitchen tools, based on maker-observed QC and staffed hours, not arbitrary fixed deadlines.
- Stronger post-commit System-event presentation/receipt acknowledgements, but do not register false alerts or guarantee responses from Shura's contacts.

## Sanity and no-write checks

```
deno check main.ts
deno task test
```

After authorized deployment use `runtime_health` then `get_turn_context` with default tags, then with `tags:["CHAT"]`. Inspect stable active contacts, proper bounded histories, `gmTurnBrief`, still-pending milestone, no generated NPC message and no committed save change due to context reads. A level-up integration test must use a separate synthetic store; live save is not a test harness.
