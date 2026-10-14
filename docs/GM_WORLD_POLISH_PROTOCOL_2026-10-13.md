# RPG V2 — Single-batch GM operations protocol (staged; no live-save migration)

## Why
Day69 T0813/T0814/T0831 already showed Shura's earned fast arithmetic method; Day72 T0843 invented unproven 15-roll personal error and Day73 T0852 manually inserted 58/69 minutes. This release introduces mandatory source-only preflight instructions and source-verified technical tools without changing past saved events or guessing alternative wages.

## READ-ONLY V3: gm_turn_audit
Batch within existing /simulate/world-v3 or MCP simulate_world_v3. Max 12 jobs, existing Bearer, no new site or keys. Payload:
- tags, elapsedSeconds: player intent and actual elapsed window
- counts: TWO independently identifiable original vs comparison sources, explicit units; conflict never proves theft
- methods: observed pages/rows/calculator operation throughput and current true document access, method source; seconds are conditional not certified
- stages: separate Shura active time vs owner independent QC vs idle/walk; rejects overlapping same actor
- cash: exact finite owner-paid receipts with distinct sources, independently accepted originals, budget upper bounds and expenses
- demands: physical arrivals, finite owner budget, actual workload/staff slots
- reputation: only verified firsthand accepted work, physically seen signed references or contact-supported hearsay
- rumorOpportunities: causal bounded suggestion, not automatically delivered knowledge

Treat its output as a *proposal*. sourceAttested remains FALSE because caller evidence strings alone do not certify external facts. Compare sources with live TEMP and GM-known canon, then prepare_turn before commit. A missing market source or receipts is NOT license to produce "three random packages".

## Hard writer gate: newly paid opportunity closure
Where semantic events upsert/update a new completed and paid OPPORTUNITIES_CURRENT entry while crediting Money, writer demands workSettlementProofs and a preexisting genuinely open offer or same-turn workDemandEvent. Existing paid entries cannot be "repaid". No bare new completed offer without active underlying demand. This guard does not attest employer physical till cash; it rejects unsupported shape and double counting, and depends on independently verified issuer/source before commit. All other source classes retain existing semantic preflight behavior.

## World and NPC
World still runs, but rumors require actual speaker knowledge, contact, route and channel latency; V3 reviews do not secretly transmit knowledge. Repeated employer-accepted reports enhance decision relevance for that employer. Market population count is NOT a job multiplier: demand <= physical independently required work - staff coverage, remaining slots, and genuine budget divided by service price. Higher reputation improves candidate priority only and never creates funded jobs.

## Timing/profiling
get_turn_context returns serverTiming with limited phase durations:
- routing_sheets
- bulk_source_fanout
- npc_bounded_context
- context_compose
simulate_world_v3 returns serverTiming for:
- v3_source_batch
- v3_pure_calculations
- v3_source_enrichment
- v3_response
The profiler cannot measure ChatGPT reasoning, connector forwarding or client/UI time. It does not store user text or mutate gameplay.

## Required GM cycle
1. get_turn_context.gmOperationalPolicy
2. batch V3: offer_board + capability_check + task_plan + gm_turn_audit + due NPC/world work
3. compare actual source ledgers and wage receipts, check direct reputation and rumor routes, no auto-awards
4. prepare_turn validates writer and funding; commit once; render_current_hud
If any required evidence absent, ask the player's choice or state the actual unavailable offer rather than fabricate events. Meta audits cost 0 in-world seconds.

## Historical reconciliation
T0843's 16-minute rework claim is unresolved GM-causality defect. T0852's two new opportunity payments were recorded without prefabricated active offers. Historical forensic review MUST run read-only first and propose explicit source-separated semantic corrections; do not retroactively mint earnings, reorder appointments, move Vesha, or patch live save as part of deployment.

## Rollout
Single aggregated branch and CI. Preserve existing identity/URL/secret, work-through-MCP, no EC-06 automatic NPC finance, no new deployed server, no production merge/deploy until user approval.

## October 14 current-main integration
Preserve existing effective attributes V2.1, GM Instruction First Pack V1, Market Opportunity Pulse V1, universal time V2, NPC Memory V4.1 and perception review. Pulse is still a speculative lead, not payment or accepted offer. `gmOperationalPolicy` supplements (does not displace) first GM instruction. `workSettlementProofs` and `workSettlementExpensesC` reconcile paid labor gross/net copper when simultaneous food/travel expenses are recorded; evidence strings still require source corroboration.
