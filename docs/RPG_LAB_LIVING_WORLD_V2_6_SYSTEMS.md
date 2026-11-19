# RPG Lab Living World V2 — integrated six-system roleplay cycle

Status: **feature branch only**, part of PR #92. **Not deployed to Deno.** No old Shura/other campaign save touched. Deploy **once** after the complete batch is checked and approved.

## Design invariant

**Read world evidence -> assess meaning for each informed NPC -> consider canon, moods, obligations and relationships -> propose decisions/contacts/work/rumors -> adjudicate bounded outcomes -> commit authenticated event -> render natural prose.**

The engine produces **source-bound possibilities**, not automatic NPC consent, omniscience, confirmed experiments or background LLM execution.

## Six coordinated systems

1. **Event significance**: \`significance\` maps observed or relayed source facts to a specific NPC's documented interests, separates measured results and hearsay, and forbids universal extrapolation. Exceptional visible traits become *possible first sightings*, not automatically remembered by a stranger.
2. **NPC decision selection**: \`decisions\` includes canon goal, current mood, directional relationship context, relevant memory/precedent, and candidate intentions including refusal, investigation or confrontation. These are GM-facing options, not preselected affectionate replies.
3. **Offscreen life and institutions**: \`work\` reviews due stateful projects, bounded staff workload, constraints and next steps. Lack of a machine is a **blocker or investigation**, not automatic evidence the material fails. No unverified research successes. \`independentIntents\` uses documented goals during an actual time window and requires confirmation.
4. **Canonical manner**: \`toneCandidates\` derives from the existing canon traits/speechStyle/responsePatterns and active mood. It permits sarcasm, hostility, flirtation, pragmatism, care or refusal only if the character and scene warrant it. The deterministic reviewer does **not** manufacture explicit speech or claim to have understood the entire franchise's lore.
5. **NPC↔NPC relationships**: \`socialDynamics\` persists asymmetric directional trust, affinity and tension as event-linked transitions. \`contacts\` offers meetings only when two NPCs have confirmed positions in the same location; co-location is **not** proof of conversation. People may remain angry after an apology.
6. **Rumors/reputation**: \`rumors\` finds possible relays from one NPC's actual memories to other characters at a confirmed shared location, without retroactively informing everyone. A confirmed rumor needs \`rumorRelays\`, paired \`npcInteractions\` and a recipient's \`observations\` with sourceActor and relayedSourceRef. A private source needs a recorded \`breachConfidence:true\` if disclosed; reported knowledge is not direct empirical verification.

## New source-bound tool

\`rpg_lab_world_cycle\` (READ ONLY, GM PRIVATE):
- \`projectId\`, \`sessionId\`, \`npcIds\` (1–16), \`toMinute\` (absolute RPG Lab in-world clock, max seven days from current source-attested clock), optional \`maxPerActor\` and \`focusEventRef\`.
- Output schema \`RPG_LAB_LIVING_WORLD_CYCLE_V2\`, source session/pack revisions, and the six proposal categories above.
- No Shura legacy saveId and no write. Large scope does **not** infer interactions if actor positions are unknown.
- \`rpg_lab_scene_context\` also includes compact \`livingWorldCycle\` when the RPG Lab clock is parseable, so ordinary NPC scenes get a focused version of the six-system planner.

## Strict large-time-jump guard

For a strict RPG Lab campaign with at least one existing NPC/social state or owned project, advancing the narrative clock **12 hours or more** requires:
\`\`\`json
"worldCycleReview": {
  "fromMinute": 600,
  "toMinute": 2040,
  "actorReviews": [
    {
      "npcId": "npc.smith",
      "status": "acted",
      "reason": "Investigated available fixtures; no safe 25-tonne rig found",
      "sourceRefs": ["evt.sample_submission"]
    }
  ]
}
\`\`\`
Those IDs and times are **illustrative**. Always derive actor coverage from \`rpg_lab_world_cycle.suggestedCycleReviewActors\`, source clock and available memories. \`acted\` requires an actual confirmed \`worldActions\`, \`npcInteractions\`, decision or project change in the same event. \`blocked\` and \`no_change\` require a meaningful reason; none may be reported as automatically successful projects. Source refs must exist in that NPC's memories or owned project. The server rejects a missing/wrong review. Strict NPC actions also require \`narrationPlan\` as before.

**Limitations:** this gate forces explicit consideration, but no validator can prove the GM made the wisest character decision, that no actor would act during a day, or that spontaneous dialogue fully matches canon. If the narrator never calls the runtime and writes unsupported prose, the server cannot intercept that text.

## Regression fixtures

- Rare material: two measured 2 mm strands vs unverified 10 mm sample, with specific relevance to a Hephaestus craftsperson, not immediate awe from every deity.
- Loki/Bete: distinct remembered rage and refusal, no automatic reconciliation or NPC personality flattening.
- Hephaestus: two concurrent workshop orders, the owner must prioritize; week-long time window does not create a free success.
- Independent social life: verified co-location permits encounter proposals, separated characters never acquire shared contact.
- Rumor transfer: requires a sourced conversation; private knowledge cannot leak accidentally, even if the writer invents a relayedSourceRef.
- Strict-day skip: no hidden time freeze; narrator must review the active NPC and may commit grounded no-change status without creating invented events.

## Release gate

All changes remain in PR #92, with CI Deno typechecking, full regression suite and local CAS tests. Only the completed reviewed batch may be merged/deployed **once**, respecting the user limit of 15 Deno deploys/hour. The PR remains draft until explicit release decision.
