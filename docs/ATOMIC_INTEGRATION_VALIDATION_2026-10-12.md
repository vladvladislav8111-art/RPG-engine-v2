# Atomic integration candidate — 2026-10-12

This branch combines main `8e715185da0ea975e14247ad1f706d6504d7f1b2`
(including PR #50), the remaining PR #49 head
`c69f6b394a6f34a1b9a6095494577b91a8c69ab0`, and the supplied
`rpg_v2_atomic_next_bundle.zip` (SHA-256
`6de4162bcfd9514e6f59afa1f4c536c1c680230e6b443677aece3368b6915c30`).
The package's assembler and guarded patches were used in an isolated worktree.
Its README/manifest describe the input package and do not replace the repository
README. All nine implementation modules and all TS regressions were integrated;
Node package tests were adapted to Deno.test so the existing Deno CI runs them.
The four Python assembler/patch guards also passed on the input package.

## Integration fixes

- Preserve PR #50 handshake identity, legacy `sequence`, both NPC choice gate
  spellings, memory source diagnostic field names, prospective clock and autonomous
  NPC plans. Advertise the actual staged phase and newly available read-only inbox.
- Resolve strict TypeScript narrowing in the inventory auditor. Keep already
  resolved milestone rows absent; only newly touched malformed choices block a turn.
- Look up durable SESSION_LOG transaction receipts before strict XP review,
  notification feature gates, optional tables and template reads. Colliding turn/save
  identifiers still fail. Existing successful receipts cannot issue new sheet writes.
- Verify NPC/relationship direction and activity-rule ownership before offering
  initiative. NPC-to-NPC history remains valid character history, but does not count
  as the six meaningful days with Shura required for normal KEY promotion review.
- Keep the original tests, updating only phase-one assertions whose advertised
  capabilities intentionally changed. Include all package attention/motive/cadence/
  triage tests in normal CI, and pin resolved dependencies in deno.lock.

## Validation

- `deno check main.ts`: passed (Deno 2.9.6, TypeScript 6.0.3).
- `deno task test`: 318 passed, 0 failed, with the same dummy environment as
  `.github/workflows/deno-check.yml` and no network permission for tests.
- Standalone TypeScript check of all nine package modules: passed.
- Four Python structural/assembler guard programs: passed.
- `git diff --check`: passed.

The new synthetic transport integration test calls the real prepare/commit code.
It verifies dry-run isolation, one XP award and money delta, Sheets success followed
by a document failure, cold-cache durable replay with stricter validation, exactly
one document recovery append, TX collision rejection, and replay after an optional
writer gate is disabled. Every unexpected URL throws; all state uses TEST IDs in
memory. No real workbook, live save, credential, or production endpoint was used.

## Release boundary

Draft only. No merge or production deployment authorized. Site, Plugin, backend,
Bearer auth, and existing tool names remain unchanged. New schema fields are optional.

NPC Context Heat is a tested pure projection/router; it has no durable projection
writer or live loading hook in this candidate. Do not claim automatic heat growth.
Motive stimuli are source-bound proposals, not inferred emotions or committed acts.

Strict progression review, durable notification ACK and EC-06 writer flags remain
false by default. EC-06 paid offers remain blocked even if their flag is set.
The synthetic test is not a substitute for the separate isolated real Google/KV
writer E2E release gate. Concurrent/distributed writer safety is not established by
sequential replay tests. Complete those gates before any production promotion.
