# RPG V2 — NPC Life & Personality V4 (one-batch proposal and source-aware code)

Status: **STAGED ENGINE CAPABILITY / READ_ONLY_PROPOSALS**. This is not an NPC life migration, not an authorized personality retcon, not a self-driving economy, and not a Shura turn. One code review and a separate canon approval/semantic migration gate are required before changes to current named people. Canon precedence: committed TEMP_RUNTIME → most-specific approved permanent canon → recorded evidence/logs; GM PREGEN is an index only.

## Purpose

Make non-player people psychologically believable and independently active without heavy city-wide every-minute simulation. A person can have independent desires, projects, fatigue, colleagues, limits and changing opinions. The GM resolves intention and uncertainty, while the engine enforces time, constraints, factual provenance and bounded workloads. No RNG-driven personalities or relationship growth.

## Scope and threshold for promotion

- A known stable NPC becomes **eligible for KEY REVIEW on the SIXTH DISTINCT in-world day** of committed, reciprocal, **meaningful** contact with Shura, not on the sixth visit/transaction, six messages in one day, or six elapsed days since a first meeting.
- Qualifying examples: sustained meaningful two-way conversation, personally consequential project/work, significant assistance or conflict, rescue, true personal disclosure or an independent accepted appointment. Routine shops, greetings and passive proximity do not count. Do not treat a single business invoice as a multi-day relationship.
- The review requires unique source event/turn IDs and exact committed `SESSION_LOG` TX receipts. `crossCheckContactReceipts` is an ON-DEMAND source verification when a nomination arises, not a full SESSION_LOG scan every turn. Claims without actual TX link remain unverified and cannot be used as proof.
- `reviewKeyPromotion` returns `candidate:true`, `autoPromoted:false`, `canCommit:false` only when qualifying evidence is sufficient. The human GM must validate sustained narrative significance, existing NPC identity, social context, active time budget and causal proof. Exceptional early promotion is possible only with a cited genuinely significant previously committed event (e.g. key witness, durable companion); never by guessed hidden importance.
- Existing `KEY` actors remain key; they do not get a second promotion. An active KEY may be physically distant or dormant, without being demoted or re-created. Any demotion or reclassification needs its own evidence and explicit canon rationale.
- The 32 `npc.selarin.draft_2101..2132` S-01 proposals have already been mapped to `npc.selarin.pool_2101..2132`; they are NOT 32 new people. Stable IDs must not fork.

## Personality, motivations and life

Each prominent NPC has a stable source-grounded identity and evolving but **only evidenced** views: values and boundaries; competencies/limitations; 1–3 independently chosen current priorities; limited obligations and personal project(s) when causally active; actual availability and physical custody; directed relationships and fact-specific knowledge; scene communication manner that is not a fixed catchphrase. Tone depends on pressure, fatigue, trust, personal interests and credible last contact, not a random “mood” number.

Long-lived traits and milestones go to existing permanent canon only after a meaningful, verified change. Current goals, availability and state belong to `NPC_CURRENT`, individual activity rules to `NPC_ACTIVITY_RULES`, work/offscreen processes to `WORLD_CLOCKS`, actual knowledge to `NPC_KNOWLEDGE`, directed ties to `NPC_RELATIONSHIPS_CURRENT`, meaningful recurring memory to `SOCIAL_MEMORY_CURRENT`, pending conversations to `OPEN_THREADS_CURRENT`, significant messages to `SYSTEM_CHAT_LOG`, and receipt evidence to `SESSION_LOG`.

A rich social personality does NOT require automatically inventing family members, romance, friendships, jobs, salaries, homes, hidden private thoughts or relationships. S-01/other DESIGN candidate world data is NOT live canonical testimony.

## Active-process bounded review

- `reviewNpcLife` reviews only 1–24 explicitly selected active actors per call, their genuine owned projects, bounded due decisions and proven triggers; ordinary budget default 12. No city-wide idle loop; 60-day maximum coarse window per request; longer intervals need several coarse pages / credible reconstruction.
- Current scene, pending conversation and due independent projects first. `chooseNpcAttention` retains a focused default 8 NPCs and 16 peripheral slots, with the rest deferred without erasing history or actors. KEY is a standing importance tier, **not an obligation to think about every KEY every minute**.
- Physical schedule contradictions, unsourced goals or impossible dual locations are rejected. A social contact must require proven co-presence/credible verified communication, and only an independent GM-resolved decision can affect social ties, plans or disclosure.
- Personal projects become due at a real deadline or trigger. The GM determines which possible actions the NPC independently takes, then uses standard semantic events to update **existing** current rows; code never fabricates an event merely to fill the update.
- Fixed work, sleep, legitimate custody, staff hours, weather, personal limitations and prior commitments override a random choice. Randomness applies only among realistically possible alternatives after deterministic filtering.
- Long periods absent from Shura may be **coarse** progressed when relevant. Ordinary quiet life is valid; never invent artificial drama, accidents or jobs to make a life seem busy.
- A private NPC story is not automatically narrated to Shura. Public outcomes may become visible through real observation or sourced rumor; hidden motives and GM truth remain hidden.

## Compatibility and engine API

The existing `simulate_world_v3` Bridge tool still exposes exactly 20 named operation kinds. **No Site or Plugin change is needed.** The existing `npc_decision` operation accepts an optional nested `payload.lifeV4` request:

```json
{
  "expectedSaveId":"<fresh runtime saveId>",
  "jobs":[{
    "id":"npc.review.1", "operation":"npc_decision",
    "payload":{"lifeV4":{"kind":"life_review","input":{
      "window":{"start":0,"end":0},"actors":[],"evidence":[],"options":[]
    }}}
  }]
}
```

Replace sample minute values with the actual live clock **only** for a real actor review; blank actors in this example do not advance the world. Supported nested kinds: `life_review`, `promotion_review`, `contact_proofs`, `social_change`, `personality_evolution`, `attention_review`. Every result is explicitly **proposal only**: batch top-level `sourceAttested:false`, `committed:false`, `requiresSemanticCommit:true`. Actor/project/contact snapshots in requests are still GM claims and MUST be independently checked against current tables before any game commit.

For a normal selected NPC, `get_turn_context` already loads known facts, directed ties, social memory, threads and activity rule. The new `behavioralContext.npcLifeV4` is a compact **audit reminder** generated from already loaded fields, not a second source of state, not evidence that missing projects occurred and not a user-visible fact. KEY with missing activity rule / decision trigger is surfaced for repair before consequential scene resolution.

## Staged humanizing guides (source grounded)

`src/npc_life_v4/profiles.ts` contains *writing prompts* for Max, Kirill, Irina, Vesha, Herna, Ovar, Olmen and Raden. Their identity anchors are taken from already registered NPC_CURRENT data at the Day63 audit; the extra questions are fictional creative craft prompts, **NOT past events, confirmed private needs, asserted family facts or automatic GM decisions**. Use existing actor knowledge/relationship/world process packet when actually playing each scene. Vesha remains recurring until verified evidence proves KEY eligibility; her current source contains meaningful meetings on Days45,46,63 but these are not six independent qualifying days automatically.

## Atomic activation and semantic commit strategy (future, NOT performed by this PR)

If the GM confirms a candidate promotion, first establish a supported current independent activity/goal/decision trigger from canonical sources and existing obligations, without guessing wage, home or routine. In ONE carefully checked semantic transaction, preserve the same existing NPC ID, adjust `NPC_CURRENT.Importance` to `KEY`, upsert a complete per-actor `NPC_ACTIVITY_RULES` row with physical headings (`NPC ID`, `Display`, `State`, `Primary anchors`, `Weighted schedule`, `Cadence`, `Minimum elapsed`, `Fixed obligations override`, `Travel rule`, `Randomization`, `Last activity tick`, `Notes`), and adjust specific linked `WORLD_CLOCKS` only if real personal projects are active. Do not write data by raw cell offset; use header-validated semantic rowUpserts, dry-run with `prepare_turn`, commit once and verify new `get_turn_context` NPC gate before rendering.

No automatically manufactured schedules, time spent, personal life history or new relationship data. Existing semantic writer retains exclusive ownership. Wrong or missing source → hold without promotion and surface a clear pending evidence reason. Never fabricate player approval, travel, romance or NPC pay.

## Acceptance testing / release gates

1. `tsc --noEmit --strict` on V4 modules and integrated V3 facade; native Node TS tests under Node 22. GitHub Actions `deno check main.ts` and full `deno task test` before release.
2. Verify six real separate meaningful days, 100 repeated records same day, routine purchase farming, forged/duplicate TX, unregistered draft alias, previously KEY case, important early override.
3. Verify no conflicting NPC location, no event from another actor's evidence, no invention after gaps in world time, no overwriting reverse social relation, no passive personality/drama/romance, and bounded 24-actor actor read.
4. Verify backwards-compatible legacy `npc_decision`, no new Site/MCP tool requirement, no change to existing gameplay contract, and result `committed:false` and no money/XP/SUP in proposal.
5. Audit actual three existing KEY (`npc.max.earth`, `npc.kirill.earth`, `npc.irina.earth`), ordinary recurring Vesha/Herna/Ovar/Olmen/Raden; **do not** turn every recurring NPC into KEY automatically.
6. After deployment, call `runtime_health` and `get_turn_context`, run one *read-only* V4 proposal with zero actors, compare save/time/money, and check existing HUD and character context. NO `commit_turn` in infrastructure testing.
7. New persistent NPC behavioral lore requires a separate reviewed permanent canon promotion; anything from `DESIGN_CANDIDATE` must be checked and accepted, not silently lifted.

## Explicitly out of scope

Full autonomous motive selection for every resident, general population census, irreversible personality rewriting, full NPC↔NPC cash exchange, and continuous heartbeat workers. EC-06 economic cutover and Deno KV recovery have their own uncompleted safety gates. This module must never create a second financial writer.
