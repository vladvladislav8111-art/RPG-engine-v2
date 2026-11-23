# Chroma RPG Lab v3.4 · Canon Kasaka boss keepsakes and exit behavior

At source-backed D3 19:00 rev637, Chroma killed first instant-dungeon
boss Kasaka (target chroma.instant.kasaka.01) and received +575 XP
and +297 System gold. The next player action is to search the remains
and look for an exit.

The source canon records TWO distinct boss items, not one: Kasaka's
Venom Fang (C-rank dagger, Attack +25 in original) and Kasaka's Venom
(separate dangerous venom item). Both must come from the same verified
boss reward search.

The prior v3.3 SYSTEM_MONSTER_DROPS contained one guaranteed kasaka_fang
and omitted kasaka_venom. This update gates the double reward on actual
defeatEvidence[monsterRef].monsterId === "system.kasaka" and the
existing defeatedTargetRefs + systemDropRefs proof. A SINGLE explicit
confirmed boss-loot search adds both kasaka_fang and kasaka_venom,
unique to the same boss target ref. No duplicate reward, bonus XP or
automatic item use.

The fang may be equipped only if owned and its confirmed, collected
Kasaka boss drop is on the ledger. The crossover weapon effect is
Attack +25, corresponding to the source weapon's displayed attack.
This is an equipment bonus, not free permanent System stat points.
Any poison / paralysis / bleeding effects require a verified playable
mechanic and are never automatically triggered by inventory collection.

Canonical references:
- https://solo-leveling.fandom.com/wiki/Instant_Dungeon_Arc
- https://solo-leveling.fandom.com/wiki/Blue_Venom-Fanged_Kasaka
- https://solo-leveling.fandom.com/wiki/Kasaka%27s_Venom_Fang
- https://solo-leveling.fandom.com/wiki/Kasaka%27s_Venom

The instant dungeon can be cleared only after verified boss evidence
through a distinct dungeon_clear event, with no automatic XP or loot
from the clear action. The clear event does not move the player.
Narrate a real accessible exit instead of teleportation: the body
dissipates and the familiar station reappears. Choosing to walk through
the opening remains the Player's decision. Do not put Stone Golem
inside Kasaka's dungeon.
