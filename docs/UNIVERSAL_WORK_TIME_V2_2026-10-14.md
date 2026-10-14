# Universal Work Time V2 — bounded calendar calculation (2026-10-14)

## Purpose
Extend existing staged Work V1 in place with an **opt-in** \`timeModelV2\` field on \`task_plan.plan\` or existing \`workshop_capacity.taskPlanV1\`, without adding MCP tools, REST endpoints or a new writer. Production V1 paths are unchanged when the optional calendar is absent.

## Mechanics
Each stage retains existing baseline \`fixedMinutes+variableMinutes\`, \`physicalMinimumMinutes\`, optional justified method substitution (never double-multiplied), competence efficiency sourced from **live Shura** only, and topologically ordered dependencies. V2 then schedules stage labor over minute-granular **actor availability** and **busy reservations**. Optional \`resourceIds\` reserve tools/benches; separate workers may run in parallel, but the same actor/resource cannot be used simultaneously. Natural passive stages consume **continuous** elapsed time without actor labor or skill acceleration. A nonstaffed rack may be reserved for the whole passive interval. Work that crosses breaks is split into active intervals. Actor overlap is never possible, and a stage cannot start before its dependencies or optional \`notBeforeMinute\`.

Bounded relative time horizon 1–10,080 minutes (max 7 days), max 32 stages, max 40 calendars of each kind, max 64 sorted nonoverlapping windows/calendar, max 8 resource IDs/stage. Insufficient availability, unreachable deadlines, duplicate/missing sources, invalid windows or malformed stages are explicit errors, never fabricated finish times.

Required in V2: every stage has \`workloadSourceRef\` (claimed evidence), every active/verification actor has an \`actorCalendars\` entry \`{id,sourceRef,available:[{startMinute,endMinute}],busy?:[...]}\`, and every shared resource used has a \`resourceCalendars\` entry of the same shape. Minutes are relative to the **current scene clock**, but input calendars do NOT prove the actor is willing, at that location, already free, employed, paid, or permitted to use a shared tool. These conditions must be independently checked by the GM; in particular NPC schedules must come from their own current obligations, never Shura's ratings.

Result: \`timeModelV2.mode="CONDITIONAL_CALENDAR_V2"\` with \`scheduledEndMinute\`, \`unconstrainedLowerBoundMinutes\`, labor per actor, Shura's engagement span and stage \`activeIntervals\`, \`calendarIdleMinutes\`, \`preStartDelayMinutes\`. The parent \`projectedLowerBoundMinutes\` is the conditional calendar completion horizon when V2 is supplied. Do not render it as an externally confirmed ETA or infer any world action occurred. All input-attestation/commit flags are false. The base V1 calculation remains unchanged without \`timeModelV2\`.

This covers any actual **bounded, observable, staged task** with evidenced norms (document verification, research, clerical work, household tasks, workshop processes). It does not replace canonical travel path calculations, sleep/rest physiology, forging recipes, consent checks or social decisions. Learning XP and competence awards are intentionally unchanged. No new task norms are invented by this release.

## Deployment/compatibility gate
Read-only V3 only; unchanged semantic \`prepare_turn\`/\`commit_turn\`, Site, Plugin, URL, server-side Bearer, and live save. Execute \`deno check main.ts\`, full tests and KV CAS; stage as one commit in a Draft PR pending explicit release permission.
