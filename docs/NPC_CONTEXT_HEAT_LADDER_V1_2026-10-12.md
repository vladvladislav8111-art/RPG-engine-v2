# NPC Context Heat 0–5 — RPG V2 source-gated design (LOCAL STAGING)

**Status:** standalone validated planner + read-selection code, NOT wired into live commit or Deno. This note is implementation guidance, not active character canon.

## Problem and terminology

RPG V2 can contain hundreds of incidentally present NPCs. Eagerly loading complete memories and personality for every bystander is expensive, but discarding repeated acquaintances makes the world appear forgetful. A separate **NPC context heat** (`0–5`) measures *how much context is worth keeping immediately available*, **not** friendliness, trust, romance, consent, expertise, combat threat or moral importance. The latter remain independent directional/source-backed NPC facts. Character agency exists even at heat 0: a random guard may act, refuse, attack or summon help if the scene logically requires it.

## Ladder

| Heat | What earns it | GM context policy |
| --- | --- | --- |
| **0 — Background** | No current grounded recent relevance | No dossier preload; any active scene still includes physical actors and necessary threats. |
| **1 — Seen recently** | A committed appearance / incidental observed contact | Lightweight scene identity cached for **24 in-world hours**; routine sales/greetings never farm higher levels. |
| **2 — Recurring presence** | Multiple separate substantive exchanges, each grounded in its own actual scene | On demand retrieve verified stable role, capabilities, current goals/limitations, unique actor ID; no invented past. |
| **3 — Social network** | Sustained meaningful development over at least **two distinct in-world days** | Load actual directed NPC↔NPC and NPC↔Shura relations, facts known to each, consent and privacy. No inferred bonds from mere meetings. |
| **4 — Developed character** | Evidence-driven contacts/developments over at least **four distinct meaningful days** | Full source-backed private history/dossier, independent goals, past committed events and remembered impacts; fill unknown biography only via separately reviewed, compatible pregen candidate, never retroactively assign fictitious meetings/friendships/payments. |
| **5 — KEY** | Requires at least **six distinct days of significant social interactions** plus meaningful relevance, complete evidence, stable identity and independent-life review | **Explicit GM promotion proposal + source-checked semantic commit** of `NPC_CURRENT.Importance=KEY` and appropriate activity rule. Not automatic due to score. Existing KEY NPCs remain KEY regardless of cold cache state. |

A simple history ledger yields contextual points: a first appearance is worth **1**, a substantive multi-turn meaningful scene **1**, a grounded meaningful character/relationship development **2**. **Only up to 2 contact points per in-world day**, deduplicated by committed scene and event ID. Thresholds of **3**, **6**, and **10** points open levels 2/3/4 respectively; minimum distinct meaningful days remain mandatory for 3/4/5. These figures are defaults in the standalone pilot and should be tuned on historic synthetic scenes before production. A single day of repeated chat, purchases, greeting or monologue cannot create a complex social history.

### Time and memory are separate

- `earnedTier`/`profileTier`: confirmed depth of available NPC biography **does not decay or erase facts**.
- `activeTier`: equals source-backed depth while there is a recent verified relevant scene/event; returns to **0 after a full 24 in-world hours** with no new involvement. A later committed encounter reactivates prior depth without rebuilding identity.
- `importance=KEY`: **independent of heat**. KEY is loaded when their scheduled Life V4 action is due, when directly relevant, or when in scene. It is not demoted by stale heat. These are separate axes, not automatic reversible NPC promotions.
- A source-incomplete archive cannot be advertised as full history. We can show stage-1 shell and request targeted evidence; no fictitious records.

## Safe evidence and persistence architecture (migration not yet implemented)

For current staging, `src/npc_attention_ladder.ts` only accepts verified committed evidence receipts provided by caller; it emits a **read-only plan** (`committed:false`). Event kinds: `SCENE_PRESENCE`, `ROUTINE_CONTACT`, `SUBSTANTIVE_EXCHANGE`, `MEANINGFUL_RELATIONSHIP_EVENT`, `INDEPENDENT_CHARACTER_EVENT`. Meaningful kinds require concrete source-backed explanation, not merely a descriptive emotion adjective. A receipt stores actor ID, immutable event ID, committed source TX, scene ID and exact in-world moment. Identical retries deduplicate; conflicting reuse of event ID hard-fails.

For eventual deployment, write receipts **as part of the existing semantic commit / SESSION_LOG idempotency path**, not a parallel writer. Add a small `NPC_ATTENTION_CURRENT` materialized **derived index** (actor ID, last relevant world moment, current context priority, earned profile tier, distinct meaningful-day counter, last event TX/receipt, verified source-save revision). The event journal remains authority; this index can be recomputed and invalidates when `saveId` changes. Require schema migration + synthetic-replay tests BEFORE enabling. Do not create new permanent canon for each passerby and do not copy every NPC relation into a new sheet.

**Critical implementation distinction:** `committed:true` supplied in a JSON request is not evidence by itself; before issuing receipts or promoting depth, the writer must verify source transaction presence/ownership, in-world time, actor identity and that a supplied relationship actually exists. A pure planner can't authenticate its input on its own.

No mandatory new Site or Plugin tool is required. New `get_turn_context` fields can be additive after the Deno read-only handshake is verified in production. `src/npc_attention_load_router.ts` describes load budgets, but it cannot safely replace existing bounded source loads until the index is actually populated and validated. No Deno or Google writes performed.

## Priorities, independence and scene causality

- Hot character attention changes *read depth*, not what they are physically able to do. Explicitly addressed NPCs, engaged workers, serious threats, witnesses, NPCs with a due KEY process and other causally relevant agents must always receive enough authoritative context for the actual event, independent of heat/budget.
- One NPC can gain heat from real NPC↔NPC interactions when logged with independent, real knowledge and feasible travel/time. The player's presence is not necessary. Private relationship states are GM-only until the player learns them, never revealed because a heat number rose.
- A character at tier 3 does not automatically have friends, enemies, affections or contracts; it merely allows **loading validated existing directed relation records**. At tier 4 a biography may be assembled from relevant permanent identity and source receipts; missing childhood/family details remain unknown unless future GM pregen gets vetted as new canon.
- KEY escalation must pass the existing six-**distinct-day** meaningful-contact criterion (or a separately approved truly exceptional canon-backed significance) and requires GM source validation. Ordinary retail purchases, repeated greetings and mechanical grind do not count as meaningful days.
- No change to other characters' relationships or emotions without actual cause; no romance, kiss, touching, money, work, contacts or secret knowledge materializes from a heat score.

## Load speed and failure gates

The staged `planAttentionReadBudget` outputs one of `SKIP`, `SHELL`, `BASIC`, `SOCIAL`, `HISTORY`, or `FULL` based on save-verified attention projection and actual scene participation. Only noncritical bystander preload is budget-capped (default **8** NPCs). If a 9th actor becomes relevant, the normal NPC context gate immediately upgrades their read; they are never omitted from physical simulation because their counter is 0. Key NPC activity, explicit actor requests and active real hazards bypass caps.

**Before release:** source projection migration; conservation of event IDs across replay; closed-loop source → read projection → actor context → semantic commit; tests for Day 66→67 24h boundary and source-collision; measure actual `elapsedMs` and payload size. For production, keep EC-06 and XP strict off until independent writer gates pass; keep no new Site, Plugin, bearer secret or live save write in infrastructure tests.

## Concrete example from current authority

- Vesha (`npc.selarin.pool_2003`) is already **KEY** in CURRENT runtime (the GM PREGEN dormant `RECURRING` template is not current authority). Her own bookshop duty and independent feelings/values are separate from a heat score. Her source-backed history and boundaries persist even after days without Shura. No demotion.
- A nameless passerby mentioned one time remains tier 1 for 24 hours; not automatically full-record materialized. If Shura later has actual substantive conversations, their evidence progressively builds a bounded profile. Four real days of significant story engagement can warrant full source-backed history, and six meaningful distinct days can trigger **review** for KEY, not automatic upgrade.
- An urgent guard with tier 0 can still intervene; a rival who met Shura just once can still speak first if physically present and motivated. The heat system is a *context optimization*, not a script for NPC reactions.

**KEY-specific distinction:** independently documented NPC achievements may develop a tier-4 character dossier, but **do not** substitute for six distinct days of significant *social interactions* under the ordinary KEY promotion rule. An early exception needs independent GM verification and its own commit.
