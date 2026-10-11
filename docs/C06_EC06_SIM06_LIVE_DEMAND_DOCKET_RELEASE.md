# C-06 / EC-06 / SIM-06 — live work-demand replay and city-scale docket integrity

**Staged executable change to existing semantic pipeline. No live save mutation. No Deno deployment.**

## Evidence and existing runtime ownership

The committed gameplay source is V2-S0721, day 63 18:21, Selarin Copy Market, via RPG Runtime Bridge. Current OPPORTUNITIES_CURRENT has 37 historical opportunity records, 33 with Selarin source IDs. Previous GM PREGEN audit links these to 18 independent employer/payee source groups but does not establish current vacancies or budgets. Selarin's large markets, existing employers, inventory custody and actor knowledge remain governed by specific canon and current runtime. WORLD_CLOCKS has active civic investigations and an unfinished four-STAFFED-day Herna order; completed commissions never reopen from design rows.

## Executable change, not only preflight

### 1. src/work_demand.ts (existing live semantic admission path)

validateWorkDemand, already called by src/semantic.ts on semantic.workDemandEvents, now refuses a second unfinished unexpired offer for the same employer, source process and actual described physical work demand, even with a new offer ID or cosmetic whitespace/case differences.

- Source provenance: existing semantic-created Source/opportunity marker: template=...; process=...; specific demand=....
- Checks do not conflate different physical packets, employers or independently sourced processes.
- Historical completed, resolved, filled, cancelled or genuinely expired offers do not monopolize the same employer forever.
- This is a NEGATIVE UNIQUENESS GUARD, not proof of funding. No cash, wage, employment choice or contract materializes from the existence of a description. Real employer payroll/custody is a separate upcoming schema/atomic transaction task.

### 2. src/world_scheduler.ts (existing get_turn_context path)

buildWorldActionDocket now puts oldest genuinely due world process first; among scheduled reviews it selects nearest deadline first instead of alphabetic ID order. Whole due process count remains visible when maxItems bounds GM docket. Added read-only counters:
- activeCount: total actual current active processes
- hiddenDueCount: due active process count not shown in bounded GM list

No new clock, automatic completion, cron, event or gameplay time advance. Event-only achievements remain event-only, staffed milestones remain staffed. Existing semantic worldProcessEvents continue to own actual state writes and only GM causes real outcomes.

The changes are wired to existing live module invocation when manually released; no new site, Deno routes, settings, Google Drive schemas, secrets or context data fetches.

## Verification and release rules

- tests/work_demand_replay_test.ts: replayed active work blocked; distinct packets allowed; expired/completed old jobs and legacy opportunities not misread.
- tests/world_scheduler_capacity_test.ts: 32-process docket backlog, oldest due first, nearest scheduled date first and no made-up event-only deadlines.
- Require GitHub Actions Deno check plus all regression tests on latest commit.
- Draft PR only, do not merge or deploy until owner approves. The owner performs all Deno deployments manually.

Future work: real source-funded employer payroll, physically tracked merchant stock/lots and residential occupancy depend on explicit schema-aware atomic semantic transactions, including idempotency and rollback, not duplicating a CURRENT value in GM PREGEN.
