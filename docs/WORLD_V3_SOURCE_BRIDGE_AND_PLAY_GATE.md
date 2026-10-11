# RPG V2 — World Simulation V3: source-bound gameplay planning

Release discipline: ONE additive integration commit, no extra Site/Plugin identity, no new Google files, no manual world-time progress. All write events still use the existing semantic `commit_turn` after GM review.

## What is actually integrated

Existing `simulate_world_v3` in the existing MCP/REST server now reads authoritative `TEMP_RUNTIME CONTROL!A1:D15` for a live clock and save ID before doing any calculation. (Previously it only read `CONTROL!B2` for save ID.) It refuses missing/duplicate/malformed CONTROL values, stale saves and `turn` calculations rooted at a model-supplied time different from committed world time.

For `turn` with `payload.now` matching `day*1440+hour*60+minute`, a separate `semanticAssistance` result is offered only if the GM provides an actual source reference to Shura's explicit player action and a concrete action summary. This **draft** contains exactly `elapsedSeconds`, `session.inworldStart`, `session.inworldEnd`, `session.sceneId`, `session.actionSummary`, `session.source`; no money, SUP, inventory, XP, purchased choices, unrelated NPC actions or ledger mutations. It is NOT a signed player intent or a commit authorization; the GM must source-confirm user intent, evaluate offscreen NPC clocks, weather, survival, any item/language state and other actual consequences, then use ordinary `prepare_turn` / semantic `commit_turn`. The result still explicitly says `requiresPlayerApproval:true`, `requiresGmCausalResolution:true`, `committed:false`. Actions by actors other than `actor.shura` cannot create Shura's draft.

For `offer_board` with `payload.boardMode='CURRENT_SOURCE_ONLY'`, the engine reads only `OPPORTUNITIES_CURRENT!A1:W500` and returns a paged inventory of actual AVAILABLE/OPEN posts with positive slots and a currently valid available→expiration interval. Every record remains **GM-only** until Shura actually encounters a posting or credible witness; the engine never decides to seek it. Completed, RESOLVED, EXPIRED, closed or already-paid offers are never synthesized as fresh work. The read is bounded and rejects duplicate source IDs or unrecognized columns. Raw pay labels are NOT a cash receipt, and every listing marks `moneyVerified:false`, `playerAccepted:false`, `gmVisibilityOnly:true`. A live opportunity listing is not proof of source-funded escrow or license to create a new payment. Existing 17 offer templates remain for creation from genuinely materialized issuer budgets only.

Existing 20 V3 operations, 90 draft achievements, 27 draft titles, read-only branch, eight Bridge tools, gameplay save/HUD remain backwards compatible. Catalog titles and achievements are still `DESIGN_CANDIDATE`, not active permanent canon. No SUP change can originate from these planning computations; the approved V2 SUP award rules and evidence requirements remain authoritative. EC-06 is still not live and needs independent Google writer quiescence, source-funded NPC accounts, and verified KV identity; do not bypass those gates.

The extra `sourceBridge` output provides only `clockVerified:true`, clock and `financialAuthority:false`. This does not raise top-level `sourceAttested` or `committed`; both remain false. Caller-supplied world-process lists, enemy stats, materials and facts remain untrusted until checked against relevant runtime/canon before prepare/commit.

## Example single-batch usage

```
{
  "expectedSaveId":"<fresh context saveId>",
  "jobs":[
    {"id":"board.1","operation":"offer_board","payload":{"boardMode":"CURRENT_SOURCE_ONLY","maxOffers":8}},
    {"id":"world.1","operation":"world_review","payload":{ "window":{"start":10,"end":20}, "processes":[],"opportunities":[],"evidenceIds":[]}}
  ]
}
```

For a Shura `turn`, supply `payload.playerActionReference` and `payload.playerActionSummary` derived from actual player text, plus `now` from current day/time. The GM never invents or assumes this authorization. Only the live CONTROL clock is treated as verified.

## Tests and release validation

- Unit tests cover canonical clock, duplicate/malformed controls, stale/fabricated time, absent player intent, semantic draft conservation, already-paid offer filtering, duplicate offers, funding-is-not-verified, and live source augmentation.
- The Deno CI must run `deno check main.ts` and all regression tests before merge.
- After deployment recheck `runtime_health`, V3 simulation with empty effects or source-backed offer read, and `get_turn_context`. The authoritative save ID, money, day/time, NPC current state must not change during tests.
- No new ChatGPT Site tool is required: the existing `simulate_world_v3` tool uses the same input shape; only its result is enriched where applicable.
- Do not activate draft catalog awards, NPC money, EC-06 writer or auto-commits as part of this release.
