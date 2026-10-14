# Selarin Central Market Pulse V1 — estimate-only (2026-10-14)

## Why
The **real** \`OPPORTUNITIES_CURRENT\` list is often empty: the existing source-only board exposes committed posts, not jobs that independent traders could be considering. An empty board is not proof an entire trade district has no work. Yet a generator must not invent payer money, named merchants, genuine paper postings, contracts, or completed applications.

## Sources and boundaries
- \`DESIGN_C06_MARKET_SCALE\` (GM PREGEN, DESIGN_CANDIDATE) identifies Selarin's central market as a many-street district. It has **no verified trader census**. A past 160–240 count is only an illustrative estimate, not live fact.
- Active \`SELARIN_JOB_BOARDS\` lists distinct venues for merchant-court accounts, copy-market papers, and western freight. There is no evidenced public notice board at the central-market centroid.
- \`SELARIN_JOB_TEMPLATES\` contains bounded account, copy and tally work categories. Matching template IDs are hints, **not** a verified need or payment guarantee.

## Random market model (initial engineering calibration, NOT canon)
Per supplied bounded trader count: private scribe 24%, self-accounting 56%, possible outside contracting 20%. Daily overflow among self-accounting traders 7%; outside clients needing help 46%. Conditional advertising willingness 55% or 76%; publicly directed 58%, others potentially discoverable by direct inquiry. Posting time: 54% 07:15–10:29, 29% 10:30–13:29, 17% 13:30–17:30. Modeled competitor acceptance may happen in 62% of cases 25–290 minutes after posting, but is **NEVER an actual NPC claim**.

Deterministic daily randomization means checking the same board repeatedly does not reroll jobs. Fixed merchant-slot office style (personal scribe / self-account / outsourcing) persists across days; daily need/post/timing changes by day. No forced nonempty board; genuine zero demand is possible. The resulting \`board\` and \`direct\` counters distinguish potentially open, potentially taken and not-yet-posted. Each venue displays at most six candidate leads. Nothing here says the physical notices already exist.

## How to call
Use existing authenticated \`simulate_world_v3\` and \`offer_board\` operation:
\`\`\`json
{
  "expectedSaveId":"<latest save>",
  "jobs":[{"id":"central.pulse","operation":"offer_board","payload":{"marketPulseV1":{
    "marketId":"loc.ilyrian.selarin.central_market",
    "day":73,"minuteOfDay":720,"merchantCount":200,
    "countBasis":"ESTIMATE","countSourceRef":"design.c06.market.cohort","maxLeads":12
  }}}]
}
\`\`\`
The source bridge checks that the requested day and minute match committed CONTROL. \`merchantCount\` and \`countSourceRef\` are GM input claims, even when the label is COUNTED: \`sourceAttested:false\`, \`scenarioOnly:true\`, no time or save change.

## To become a *real* visible job
1. Discover an existing, credible merchant NPC and source-backed outstanding documents / task / independent willingness; the anonymous merchant ordinal never becomes an NPC by itself.
2. Verify actual local presence and trust/privacy restrictions, active underlying process, finite employer budget and/or escrow.
3. Validate \`SELARIN_JOB_TEMPLATES\` and use the **existing semantic** \`workDemandEvents\` writer to insert a bounded \`OPPORTUNITIES_CURRENT\` entry with stable ID, deadline, slot count and payer. No direct Google writes or auto-funding.
4. Competing applicants require a real NPC, employer decision and claim receipts. A modeled \`taken\` never cancels an actual work posting.

No EC-06 cutover, SUP, XP, wage, free NPC, player acceptance, Site/Plugin/API changes, or modified Shura save. Draft PR and CI before merge.
