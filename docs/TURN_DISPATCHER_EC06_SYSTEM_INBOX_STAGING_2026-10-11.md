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

## Phase B — implemented in PR #49 after original staged draft

### Unified System Notification Center

`get_turn_context` with tags `NOTIFICATIONS` / `INBOX` / `SYSTEM_INBOX` / `ALERTS` returns `packet.systemNotificationCenter`. It is a source-derived read-only view combining the current PENDING_CHOICES, PROGRESSION_EVENTS, earned ACTOR_ACHIEVEMENTS, existing active SYSTEM_CONTACTS_CURRENT, actually DELIVERED incoming SYSTEM_CHAT_LOG, and only Shura-identified due order clocks. Stable notice IDs cite an original primary source and do not create their own version of the event. An off-screen System message can appear when the contact is active and the incoming journal message was truly delivered; never infer a reply from stale NPC activity. Historically earned achievements do not appear as newly unread.

Every get_turn_context (including ordinary startup) continues to return the small GM mechanical reminder/pending choice packet. The existing HUD now displays the count of truly pending choices as a small status chip, not as a fabricated award.

Real level-ups emit source-backed `systemNotifications` in the semantic transaction and persistent SESSION_LOG; the existing Site renderer `render_system_event` may present them **after** a confirmed successful commit, using committed save/turn references. A read-only draft is never an achievement/XP notification. If a renderer failed, the level can be reconstructed from PROGRESSION_EVENTS without awarding XP again.

### Optional durable read/dismiss receipts: migration gate

The proposed **one** authoritative receipt-only tab under the same existing TEMP RUNTIME (not a second ledger) is:

```
SYSTEM_NOTIFICATION_ACK_CURRENT!A1:G1000
Notification ID | Actor ID | Source Ref | Status | Marked at | TX ID | Version
```

- This is **not yet a production table**. Do **not** add or edit a live TEMP tab outside a separately approved safe schema migration/writer procedure. The feature defaults to `RPG_SYSTEM_NOTIFICATION_ACK_ENABLED=false`, emits `ackDurabilityReady=false`, and does not lie about persistence until a real tab with exact headers exists.
- After verified schema migration, a specific user decision to mark one identified notification read can use `semantic.notificationAckEvents: [{notificationId,sourceRef,status:"SEEN"}]` through the standard 0-game-time semantic prepare/commit pipeline. Source proof is checked against original live records; every notification ID has one receipt, and malicious source collisions/forged NPC messages fail.
- `DISMISSED` is explicitly forbidden for any unresolved choice or player-owned pending order review. `SEEN` does not resolve it. No UI click without explicit player interaction is an ACK.
- The source remains authoritative; ACK is only a private presentation preference. A notification can reappear if an invalid/missing ACK or a new source occurs.

### Canonical milestone option gate

`semantic.choiceOptionMaterializations` publishes 2–4 options only when each is independently grounded in active permanent canon with exact type, name, trigger, effect, limits and `sourceRef`. Never infer options from DESIGN_CANDIDATE. The writer places verified options into an existing PENDING_CHOICES row and changes status from `PENDING_GENERATION` to `AWAITING_CHOICE`; publication never chooses on behalf of Shura. `semantic.choiceResolutions` may only select a published option in a **later** user-chosen turn. The selected permanent MILESTONES row is committed and the exact deferred competence XP is then released by the current engine. It is forbidden to clear a pending choice simply by submitting a string that was never an option.

The existing Day58 crafting choice still has zero generated options in live save V2-S0795; this PR does NOT manufacture canon choices or release its 199 deferred XP without a source/decision.

### Finite economics and quest work proposals

Pure `preflightFinancialCustody` checks caller-supplied same-revision, source-referenced account balances, unique receipt/escrow identifiers, conservation of copper, finite physical lots, custody and replay/double-sale constraints. It **cannot establish account truth** from a `verified=true` flag supplied by a model: its result always says `CALLER_SNAPSHOT_REQUIRES_EC06_ATTESTATION` and `committed:false`.

Pure `proposeSourceFundedJobs` passes source-backed individual demands through existing V3 `generateOffer` only after evidence for the live employer, nonduplicated physical workload, funded escrow and bounded deadline/slots has been supplied. It returns `READ_ONLY_SOURCE_ATTESTATION_PENDING`, no contract, no wage and no player acceptance. EC-06 primary accounts and writer isolation must independently attest the sources before any semantic new job creation or payment. A fully automatic paid quest generator is **not activated** until that live source gateway exists.

## Release checklist for staged PR #49

1. Confirm all branch CI tests and Deno check on latest head; inspect diff for semantics and HUD compatibility.
2. Staging or isolated Deno tests: read default context, `NOTIFICATIONS` context, actor messages, pending choice and HUD; no live game writes.
3. Independently verify canonical option definitions before publishing the existing crafting choice; player selection remains voluntary.
4. When enabling ACK receipts, migrate the existing TEMP schema under an exclusive writer freeze and test semantic read receipts with synthetic save first; flip feature flag only after verified headers. Never hand-edit the ACK state in Sheets.
5. EC-06 rollout is SEPARATE and additionally blocked by production KV timeline proof, sourced NPC balances/items, exclusive Google writer/quiescence, credentialed E2E, full cash/custody/receipts and owner-approved cutover. PRs #27–#43 and #44 are not implicitly merged with #49.
6. Preserve exact existing RPG Runtime Bridge Site/Plugin URL, bearer server secret and tools. Confirm original committed save unchanged on infrastructure-only release.

This PR must not be merged simply because its mock CI is green; the combined EC-06 cutover is a materially different transaction-storage release.

## Phase C — independent time, Life V4, memory router, precommit audit

The user explicitly declined an additional automatic situation-summary feature; no new player-facing scene recap was created. The engine instead adds narrow GM-only control packets, entirely within existing Bridge tools and data.

**Independent world clock:** `get_turn_context` accepts optional `plannedElapsedSeconds` (0–604800), where prospective time is computed using the same `advanceClock` mechanic as the semantic writer. `worldTickPlan` identifies due active clocks, KEY NPC resolutions, and 24h RECURRING reviews from the already-loaded `CONTINUITY_SPARSE_RANGES`. This is a `READ_ONLY_PROPOSALS` preview, not an elapsed-world-time write. V3 `npc_decision.lifeV4` can be used for bounded decision proposals before the actual GM semantic event. The semantic writer already rejects time passage missing required due world clocks or KEY NPC events, and advances current offer deadlines/weather; no fabricated work or finished crafts. RECURRING triggers are advisory. For elapsed time over 7 days, page source-aware review instead of pretending a single fine-grained update can cover all events.

**Source-anchored NPC independent lives:** each materialized actor packet now has private `independentLifePlan`: recorded goals, active activity-rule gate, known fact count, existing directed peers, social obligations and due threads, linked processes, missing source signals, and Life V4 review mode. This never makes NPCs wait for Shura, guarantee messages, fabricate beliefs or complete jobs. NPC promotion requires the established social milestone review and semantic commit.

**Automatic memory depth signals:** every `get_turn_context` includes `memoryRoute.depth = FAST | TARGETED_DEEP`, with engine notification on which and why. It escalates on named NPC or active System contact, past `LOGS`, canonical rules, payments/EC-06, or consequential risk; includes `missingSources` and `actualSourceReads`. A log query without a topic signals that targeted document/row lookup is still required; it does not blindly sweep archives. The ordinary NPC request no longer automatically triggers the expensive full local district atlas, although the bounded actor life/social/knowledge read remains. TEMP committed data, actual canon, real journals, and GM PREGEN retain that strict hierarchy.

**Fast writer integrity audit:** `auditPreparedTurn` operates in O(n) on existing semantic writer rows before issuing a write manifest; no additional cloud reads. It checks time/session continuity, finite nonnegative core resources, duplicate pending choice keys, milestone options, unique positive inventory custody if touched, and coverage of due KEY actors/world processes. Failure rejects prepare and therefore commit. It does not magically prove historical NPC finances or physical authenticity. `outcomes.integrityAudit` supplies a concise result for debugging and release validation.

**Progression coverage:** `semantic.progressionReview` may provide `AWARD` or `SOURCE_BASED_ZERO`, a concrete source-based reason and source IDs if AWARD. The writer reports `outcomes.progressionCoverage`; positive XP still comes solely from genuine mechanical events. Because the existing Site does not yet populate this optional field, `RPG_TURN_PROGRESSION_REVIEW_STRICT=false` is the backwards-compatible staging default. Only flip to true after updating the existing Bridge's semantic dispatch and validating real actor/NPC action flows; in strict mode a gameplay turn without a source-based assessment fails rather than silently forgetting XP. This does not reward repetitive, unproductive actions.

**Source-only work market:** pure `planWorkCompetition` checks finite available slots, previous unique applicant receipts, employer decisions and source revisions without inventing competing employment or paying anyone. This is a preflight and retains `committed:false`. `proposeSourceFundedJobs` still requires actual funded demand and escrow. All new paid `semantic.workDemandEvents` are **fail-closed in PR #49 even if `RPG_EC06_FUNDED_OFFERS_WRITER_READY=true` is mistakenly set**, because an authenticated per-offer balance/escrow proof and atomic financial writer have not yet been implemented. The flag alone is never an authorization.

### Regression and deployment conditions (Phase C)

- Verify `deno check` entrypoint and complete regression suite on the final PR SHA; test the new memory escalation, prospective world time, NPC personal threads, cash/slot and custody protections and progression coverage.
- Preview context with no tags (FAST), with actual NPC actor (TARGETED_DEEP), with `LOGS` missing a narrow query, and with `plannedElapsedSeconds`; benchmark read plan vs previous full local NPC loads.
- Dry-run on **synthetic** isolated save for queued KEY NPC decisions and real world clocks. Zero-time developer chat must not age the world.
- Observe existing Site and Deno identities, Bearer authentication, and seven tool schemas; do not create a replacement plugin or backend.
- Leave the main branch, existing production runtime and current committed gameplay save untouched until the full cutover is authorized and gate tests succeed.

