# RPG Engine V2 — frozen release candidate decision

Date: 2026-10-13. This is a finite acceptance report for the CURRENT
engine scope. No new gameplay features or unbounded extra test phases.

## Closed checks

- Current main: `837092f2b4d95c920a9abecfbf08eb01bde487ac`
  (still unmodified during this audit).
- Five sequential Draft PRs: #57 → #59 → #60 → #61 → #62.
  GitHub reports each mergeable against its expected parent. No release
  code merged.
- Production Bridge `runtime_health` read-only: Shura `V2-S0795`,
  world time 17:21, Deno ruleset `2.12.1-specialization-domain-2026-10-11`.
- Production Bridge `get_turn_context` with status-only MICRO request
  read-only: same `V2-S0795`, world time 17:21, completed in ~1.7s.
- Existing tests cover World Simulation V3 (proposals only), NPC Life V4,
  economics/escrow, inventory custody, progression XP/SUP, world time,
  Google TEST semantic one-shot and no-duplicate replay, scoped KV lock,
  deliberately orphaned TEST-S4 and read-only recovery forensics.
- New CI release smoke covers exact MCP seven-tool contract, safe opt-in
  disabled flags, fail-closed Preview write routes and synthetic bounded
  V3 batch performance / no state mutation.
- A successful GitHub CI on the **final candidate SHA** is required;
  previous green SHA alone does not certify later changes.

## Frozen non-release features

- NPC Heat earned tiers 2–4 / automated KEY promotion / prospective epoch
  signatures — NOT ENABLED; no trusted continuous canonical NPC origin yet.
- TEST-specific writer + post-200 ACK-drop scenario — OFF; TEST-S4 remains
  intentionally PARTIAL and permanently KV-locked. Never reset it or retry.
- EC-06 NPC financial writer and any automated semantic writer recovery —
  OFF; independent unsafe stalled-writer fencing still unresolved.
- V3 proposals are READ_ONLY, with semantic transaction authority unchanged.

## Release policy (finite, no automatic release)

A staged deployment can be proposed for the current **unchanged production
feature surface** only if CI and unchanged tool/route guards pass. Freeze
source SHA, ensure actual Production environment uses the existing real
workbook and pre-existing Bearer key with all TEST flags off; do not redirect
Production to TEST. No new ENV additions are necessary for this limited
release. Bridge Site/Plugin/URL must stay exactly as configured.

A code rollback can redeploy the pre-release last-known-good Production
revision, preserving environment and identities. **It is not a Google save
rollback.** Avoid all real save migrations and operator lock repairs as part
of the release. A full external Google workbook snapshot/restore rehearsal
has not occurred, so no claim of verified data restore is made.

After explicit owner signoff, resolve the Draft PR stack in order (or
one separately reviewed squash of the same exact reviewed tree), no surprise
feature toggles, then Production Deploy. First verify health, context and
HUD by read-only tools; require independent owner permission before any
actual gameplay mutation.

Release decision categories:
- `GO_FOR_LIMITED_CODE_RELEASE_WITH_FEATURE_FLAGS_OFF`: static+CI pass,
  only existing production contract.
- `NO_GO_FOR_EXPERIMENTAL_FEATURE_ACTIVATION`: until independent evidence,
  stale-writer fencing, data restore and canonical history gates.
- `NO_GO_FOR_AUTO_RELEASE`: explicit owner merge & Production consent.

Synthetic V3 timing is a local CPU result, not an end-to-end latency
guarantee under Google/Bridge traffic. The observed production status
context lookup is just one request, not a sustained production load test.
