# RPG Runtime Bridge V2 — same-identity deployment and integration, 2026-10-12

## Scope and source of truth

Existing GitHub repo: `vladvladislav8111-art/RPG-engine-v2`, PR #49 / `feat/v2-turn-dispatcher-inbox-20261011`.
Existing Deno origin: `https://rpg-engine-v2.vladvladislav8111.deno.net`.
Existing private Site: `https://rpg-runtime-bridge.vlad-vladislav8111.chatgpt.site`.
Existing Sites-backed private plugin: `plugin_asdk_app_sites_79df978b950081919b237bfcb19b2f96`. Its current manifest only has App identity bindings, not editable MCP proxy source code. **Do not replace it or create another Site/plugin.** Preserve the server-side Bearer secret and all current tool names, UI cards and privacy.

Current production at audit: `2.12.1-specialization-domain-2026-10-11`, save `V2-S0795`, Day67 17:21. It has NOT yet been deployed with PR #49.

## Completed backend-side connection

- `runtime_health.bridgeIntegration` and HTTP root `bridgeIntegration` now expose the same `RPG_BRIDGE_TURN_FLOW_V1_2026-10-12` handshake, with accurate stage/gate flags (no second health tool).
- `get_turn_context.packet.bridgeIntegration` returns a bounded GM client-tool sequence; `packet.memoryRoute` says FAST versus TARGETED_DEEP with lookup reasons, and `packet.worldTickPlan` previews independent world/NPC obligations if `plannedElapsedSeconds` was provided. This is the same existing context tool, not a changed App identity.
- Normal gameplay still uses the existing tools in order: health -> context -> bounded source-backed V3 simulation when needed -> source validation -> semantic prepare when complex -> semantic commit -> HUD and committed System events.
- `prepare_turn` and `commit_turn` use a fast source-row audit before mutation; `progressionCoverage` flags incomplete XP review while `RPG_TURN_PROGRESSION_REVIEW_STRICT=false`.
- No autonomous tool invoke inside a read-only context function. It does NOT simulate unmaterialized NPC intentions, authorize payments, choose Shura decisions, or advance the clock.
- The originally recorded 199 deferred crafting XP are untouched.

## Safe rollout

1. Confirm PR #49 Deno entrypoint check and test suite pass on its latest head. Keep a rollback-ready reference to the current deployed Deno revision and check `ALLOW_RAW_COMMITS=false`.
2. In **existing** Deno Deploy app settings at `https://console.deno.com`, verify that this repository is linked, the production/default branch is `main` and `deno.json` dynamic entrypoint is `./main.ts`. A PR preview and GitHub Actions success are NOT production routing; inspect Deno build/revision and routed production status. The normal linked-source main push automatically builds a new revision, but do not assume auto-routing without checking actual app timeline.
3. Before merge, review the staged writer compatibility (especially old semantic turns and source-based milestone/XP fields) on a **synthetic isolated TEMP workbook** with test-only credentials; use dry-run writes and never point tests at live `V2-S0795`.
4. Do **not** merge the giant PR into live `main` simply because read-only tests passed; review also Google Sheets manifest/write semantics and Site request-forwarding. For lower risk, separate the read-only dispatcher from schema-dependent semantic/EC-06 features for an initial release if needed.
5. When the existing Deno app deployment of the authorized code revision is routed to production, call existing Bridge `runtime_health`: confirm its `bridgeIntegration.schema` is `RPG_BRIDGE_TURN_FLOW_V1_2026-10-12`, and confirm save ID/time unchanged.
6. Call `get_turn_context` via the current Bridge using `{turnId:"bridge-smoke-readonly",turnClass:"MICRO",tags:["WORLD"],plannedElapsedSeconds:1800}`. Expect `packet.bridgeIntegration`, `packet.memoryRoute`, `packet.worldTickPlan.mode=="READ_ONLY_PROPOSALS"`; do NOT call any gameplay writer for a smoke test.
7. Call a bounded NPC read through the current Bridge with `{turnId:"bridge-npc-readonly",turnClass:"NORMAL",tags:["NPC"],actorIds:["npc.irina.earth"],plannedElapsedSeconds:0}`. Confirm `packet.actors["npc.irina.earth"].independentLifePlan`, knowledge gate, relationships and source load signals. A substantive NPC reply cannot be emitted unless the actor gate is ready.
8. If the Site proxy strips the new optional request field, **edit the existing Site through Work mode/Sites**, not its App-backed plugin manifest: pass `plannedElapsedSeconds` transparently and preserve the seven legacy tools plus V3, HUD, System cards, site URL, privacy and Bearer secret. The App plugin identity must remain unchanged.
9. Only then activate production gameplay routing by instructing GM to obey `packet.bridgeIntegration.order`; semantic commits are still explicit and atomicity/custody must be source-attested.
10. `RPG_TURN_PROGRESSION_REVIEW_STRICT` stays `false` until the caller has been verified to send `semantic.progressionReview` for gameplay turns. `RPG_SYSTEM_NOTIFICATION_ACK_ENABLED=false` until the isolated schema migration for `SYSTEM_NOTIFICATION_ACK_CURRENT`. EC-06 remains **blocked even if its flag is true**: per-offer verified real money and atomic writer are not yet implemented; do not generate paid offers or claims.
11. Rollback any invalid released revision using existing Deno revision routing, preserving the previous code and live save. Never revert a committed turn by overwriting runtime or snapshot.

## No user secrets needed in chat

The same existing Deno app retains `RUNTIME_API_KEY`, Google service account and existing runtime sheet IDs. The Site keeps its existing backend secret and Authorization Bearer. Do not paste these into chat, GitHub, a new plugin, or GitHub Actions logs.

## What remains outside backend code

A ChatGPT/Sites caller cannot be forced by Deno itself to invoke another MCP tool; the `bridgeIntegration.order` is a versioned control signal, **not autonomous orchestration**. Confirm the Site's existing MCP passthrough preserves the extra fields after production deployment. If fully automatic agent tool chaining is required without GM orchestration, it must be implemented inside the existing Site's server-side proxy (or in a separately vetted backend coordinator) with explicit game authority, not by creating a new Plugin, and requires isolated safety and latency tests first.
