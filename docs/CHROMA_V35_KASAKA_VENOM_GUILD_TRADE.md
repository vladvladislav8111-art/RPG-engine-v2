# Chroma D3 · Gameplay repair v3.5

The player decided to exit Kasaka's cleared instance, drink the
boss potion, compare normal steel dagger with C-rank Kasaka Venom Fang,
evade monsters using Quicksilver until the surface, exchange collected
magic stones at Orario Guild and store the replaced steel dagger.

## Canonical poisoned elixir
Kasaka's Venom / Venom Gland is an A-rank elixir in the original
Solo Leveling. On consumption its permanent Kasaka Armored Scales
buff reduces physical damage by 20%, while permanent Weakened Muscles
debuff reduces Strength by 35 FLAT POINTS, not by 35%.
Sung Jinwoo waited to drink until he gained distinct automatic
Detoxification / Kandiaru's Blessing, which removed the Strength
debuff while keeping the defense. Chroma has NOT unlocked that skill,
and therefore retains BOTH effects.

A real verified use_item action consumes exactly one earned venom and
sets persistent status flags status.kasaka_armor_scales_20 and
status.kasaka_weakened_muscles_35. Base System Strength remains 26,
Falna Loki +12, and effective combat Strength drops from38 to3.
Don't permanently erase any user-allocated stat points. Physical
attacks against Chroma deal 80% of prior incoming damage, applied ONCE.
No automatic poisoning or resetting HP/MP; no auto-cure from levels.

## Weapons
Kasaka Venom Fang C-rank Attack+25 and canonical paralyzing/bleeding
properties. The pre-existing steel dagger was used by Chroma's
source-verified dual-dagger stance and is not a free Store purchase.
A narrow player-approved chroma_swap_kasaka_fang action moves one
already-owned standard steel dagger into Inventory as steel_dagger,
while recording Kasaka Fang in right hand and leaving one old dagger
in the other. The fang remains inventory-owned for equipment checks.
Do not duplicate fang, grant a second steel dagger or claim a gold sale.

## Guild stones
RPG Lab D3 source-backed reconciliation created 47 distinct HELD
Orario Dungeon stones (6 original +41 source-verified).
System-instance wolves/Briga/Razan/Kasaka are NOT Orario Dungeon
stones. A one-event stone_sell_batch sale at Guild requires
expectedHeldCount=47, real held/intact recorded stones, and valid
confirmedGuildExchange. It adds exact sum of EACH stored Guild valuation
to VALIS, marks those 47 IDs SOLD, no replay. Do not duplicate gold,
invent a price or drop additional stones. System gold remains unchanged.
Witnesses see a bag spilling stones, not proof of Player inventory.

## Movement / NPC
Kasaka instance is CLEARED; Hroma moves out through the open passage
to the previously entered 7th-floor gateway, skips enemies and
climbs to surface with Quicksilver Lv2 (+75% speed/+23% reaction),
paying prepaid MP for every new maximum-3-minute activation; no
automatic kills, drops, XP or mana refunds. The skill deactivates
at the surface. Guild Eina stays a diligent, sharp-eyed professional
who may worry about dangerous solo hunts and real-world limits.
No NPC automatically gains the secret System knowledge.

Sources:
- https://archivedlibrary.com/story/solo-leveling-novel-official-english-translation/chapter/15/
- https://www.novelcool.com/chapter/I-Alone-Level-Up-Chapter-25/2292859/
- https://solo-leveling.fandom.com/wiki/Sung_Jinwoo/Items
