# NPC Context Heat — get_turn_context read-only shadow integration

**Draft stacked on PR #53.** This is *not* a Production activation of NPC memory pruning.

## Live-path integration

`getTurnContext` calls `projectNpcHeatContextShadow` after the existing bounded actor read completes. It uses only the already loaded `NPC_CURRENT`, `NPC_ACTIVITY_RULES`, the saved clock from `CONTROL` and scene IDs validated against `ACTIVE_CONTEXT`. Per-actor `actors[actorId].contextHeat` and `packet.actorContext.heatIntegration` report the advisory. No API request arguments change.

- Committed `NPC_CURRENT.Importance=KEY` yields earned/active tier 5; no snapshot may demote an existing KEY.
- A CONTROL-matched scene participant has a separate `scenePresenceFloor=1`, **not** an earned heat event. This actor's full original context continues to load.
- Other non-KEY actors get `earnedTier=0` until source-verified SESSION_LOG/semantic TX receipts are provided by a separately audited adapter. This **does not mean the actor is socially unimportant**, only that this integration has not proven their past contact history.
- Dormant/missing `NPC_CURRENT` receives no tier (null); complete archival/context gating is untouched.
- Existing actor tables, `memoryRoute`, bounded actor reads, actor context gate, NPC behavior and world clock calculations are unchanged.
- No extra Google reads, no persisted derived cache/index, no semantic writes, no new flags, no service identity change, no private data copies.

`heatIntegration.mode=READ_ONLY_SHADOW_NO_PRUNING`, `readRoutingApplied=false` and `fullNpcContextGatePreserved=true` are explicit rollout gates. An important NPC cannot be dropped, a KEY cannot be demoted, and warmth is never affection/trust.

## Next independent gate

A future PR must securely inspect bounded committed `SESSION_LOG` receipts, validate TX, state hash and actor-specific evidence and full-history flags, then attach complete attention evidence with source-save identity. Before any selective route is activated, verify malicious/unbounded inputs, missing-scene actors, threat/witness priority, autonomy obligations and high-stakes player actions; compare real before/after latency and cell reads. No narrowing on ordinary NPC turns without those checks.

**Release:** Typecheck + all regression tests, Draft PR only; PR #51/#52/#53 unchanged; owner must authorize merge separately and Production rollout separately.
