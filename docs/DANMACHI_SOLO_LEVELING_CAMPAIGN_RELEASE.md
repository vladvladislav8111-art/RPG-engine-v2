# DanMachi × Solo Leveling: Player System campaign release

**Status:** source release candidate, isolated RPG Lab feature.  
**Do not copy an existing character or restore an earlier Linos/Maxim/Sura campaign.**  
**Current design record:** [Google Docs campaign bible v2](https://docs.google.com/document/d/1gSSkvoYP2OTbO7QvFnQS7zVwPe4ivvfo9tkOOWSOzAw/edit).

## Canon versus house rules

- **DanMachi:** Orario, Dungeon floors and types of monsters, Falna and level-up as a qualitative jump, canonical character voices, bounded NPC memories and the early Bell timeline.
- **Solo Leveling:** Player awakening in a sickroom, five stats, System rewards/store, named skills, key-based instant dungeons, job change, first Knight Igris, Demon Castle, final Monarch succession.
- **House rules:** independent additive Falna bonuses, exact System XP/gold, monster HP/damage, intact DanMachi magic stones as shadow substrates, **one permanently final extraction attempt** before full Monarch, 10% experimental chance for first instant key in daily reward boxes, exact weapon costs, wounds/healing rates, shadow ranks and skill MP prices.
- **Never silently auto-import** original Korean biography, named shadow army, existing DanMachi game characters or their private knowledge.
- **Full Monarch:** no random extraction roll for a valid *new* target. Already forfeited attempts remain forfeited.

## Main source files

- `src/rpg_lab_v1/shadow_monarch_rules.ts`: System, story flags, Falna, shop, progression, special Knight.
- `src/rpg_lab_v1/shadow_monarch_stones.ts`: intact stones, one attempt, spend-or-sell economy.
- `src/rpg_lab_v1/system_dungeon_keys.ts`, `orario_system_encounters.ts`: key issue/consumption, instance entry, scenario enemies, actual boss clear.
- `src/rpg_lab_v1/danmachi_player_balance.ts`, `danmachi_player_equipment.ts`: threats, XP, checked gear and attacks.
- `src/rpg_lab_v1/orario_player_combat.ts`: battle rounds, deterministic results, damage, escape, victory recording and ammunition.
- `src/rpg_lab_v1/orario_player_survival.ts`: injuries, healing, rest, daily targets, reward boxes.
- `src/rpg_lab_v1/orario_player_skills.ts`: time-bounded paid effects.
- `src/rpg_lab_v1/orario_player_loot.ts`: ordinary and System-dungeon optional loot, source-keyed one-time drops.
- `src/rpg_lab_v1/danmachi_shadow_balance.ts`: shadow promotion and mana-backed recovery.
- `src/rpg_lab_v1/danmachi_suspicion.ts`: independent NPC suspicions based on personally known observations.
- `src/rpg_lab_v1/orario_player_event.ts`, `orario_player_validation.ts`: authoritative, source-tagged command dispatcher, state validation, player-safe HUD.
- `src/rpg_lab_v1/session.ts`, `events.ts`, `http.ts`, `roleplay_adapter.ts`: integration with existing RPG Lab session, event journal, authenticated HTTP API and GM context.

## Isolated creation, after appearance and identity selection

1. Choose a **new unique** `projectId` and `sessionId`; never reuse an existing project/save. A new Orario project can be installed using the authenticated `POST /rpg-lab/v1/danmachi/starter` with `{"projectId":"<new>","confirm":"INSTALL_NEW_DANMACHI_WORLD"}`.
2. Create a fresh session via the RPG Lab create-campaign action, `characterProfile:"none"`, `locationId:"orario.medical_ward"`, `gameClock:"D0 09:00"`. Do not create a Linos profile.
3. Confirm character name, appearance, medical circumstances, what the protagonist sees, and no established Familia. Before first interface opening, record the `character_setup` event with `playerSystem:{kind:"init",args:{},playerApproved:true}`, a unique `sourceRef`, `knownBy:[]`, `gmConfirmed:true`, and the session clock.
4. Only after player explicitly witnesses and accepts the System panel, confirm the `activate` action with `args:{confirmedAwakening:true}`. This changes awaitingActivation from true to false and enables XP, quests and shop.
5. Each turn submits one event with the **expected session revision**. Use confirmed observations for each NPC's beliefs; no actor reads the invisible HUD. Read the public Player HUD from the authenticated `GET /rpg-lab/v1/projects/{projectId}/sessions/{sessionId}/player-hud`. Do not reveal GM-only dungeon keys or private NPC metrics to the player.
6. Keep original campaigns on their separate keys; use roleplay-ledger `sourceRef` provenance and CAS revision checks. Save/checkpoint approximately every three turns and after major transitions.

## Essential live gates

- A battle needs a confirmed enemy present at the appropriate Dungeon floor or a verified irregular event.
- System-instance enemies cannot spawn without their own entered key. The live `dungeon_clear` command checks a source-attested boss victory. Shadow class requires cleared Igris job trial; true Monarch requires cleared Architect trial. Merely setting a story flag is insufficient.
- Magic requires a **named known offensive skill/spell**, real MP and an explicit attack. Equipping a sword does not improve magic damage. Projectiles use consumable ammunition and support continued firing from a partly loaded bundle.
- One target → one recorded XP reward. Shadow kills must be attributed to a genuinely deployed, owned soldier; stored/nonexistent soldiers do not earn Player XP.
- Confirmed intact stone can be spent on a shadow (post class) or sold for valis, never both. A failed attempt remains permanently failed even after gaining levels. No automatic loot without a source.
- Full unconsciousness prevents self-medication. Rescue at the Orario ward needs a named personally present healer and an actual elapsed time; severe fractures persist after short care.
- Daily quest failure is possible only after a previously offered task's deadline, not because a narrator skipped player time. Box choices belong to the player.

## Release gates and smoke tests

CI runs `deno check main.ts`, `deno task test`, and the cross-process KV CAS probe. Tests include initial Player activation, closed inventory, optional loot, risk calibration, System dungeon key and boss proof, NPC suspiciousness, partial healing, replay under a single journal and protection for unrelated campaigns.

**Important:** A passing test suite proves the source branch, not a Deno Deploy rollout. After merging, separately verify the production deployment's code revision via an authenticated RPG Lab endpoint. The existing legacy `runtime_health` Bridge reports the old campaign's runtime and **does not prove** this new branch is deployed.

Creating a new campaign or writing any Player event is a separate operation from releasing source code. Do not claim a live save exists before the server confirms it.

## Still user-owned at play start

The user's name, appearance, history, initial equipment, starting circumstances and decision to request divine Falna. These cannot be invented during installation. Balance numbers can be adjusted after observed gameplay, but never retroactively rewrite prior events or NPC knowledge.
