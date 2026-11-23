# Chroma: Solo Leveling dagger-skill progression (v3.1)

This is a *single-commit* update to the original Chroma RPG Lab campaign.
It **does not** automatically award a new skill or move the Player.

## Source grounding

- In Solo Leveling, Jinwoo gains the passive Advanced/High-Grade Dagger
  Technique through practice and eventually evolves it to Master of Shortsword.
  The advanced evolved form is commonly summarized as +33% dagger damage.
- Critical Attack (Fatal Strike) evolves into Mutilation; it is a
  **distinct active, MP-costing weak-point technique**.
- Dagger Throw evolves into Dagger Rush. The advanced multi-dagger
  implementation additionally needs separately earned Ruler's Authority.
- Speed/attack-tempo figures below are the CROSSOVER adaptation, not exact
  values claimed for the novel. HP/MP and the five System stats do not gain
  a fictional sixth "combat mastery" stat.

## Passive dagger branch, all real mechanics

The skill ID remains dagger_mastery for existing saves.
One confirmed successful dagger encounter yields at most one practice credit.

| Unique dagger encounters | Level | Dagger damage | Dagger attack speed |
| ---: | --- | ---: | ---: |
| 0-11 | locked | +0% | +0% |
| 12-31 | Lv1 | +8% | +5% |
| 32-63 | Lv2 | +12% | +8% |
| 64-95 | Lv3 | +16% | +11% |
| 96-139 | Lv4 | +20% | +14% |
| 140-179 | Lv5 | +24% | +17% |
| 180+ | Master of Shortsword | +33% | +20% |

The attack-speed effect provides a shorter opening for enemy counters and
a bounded chance of an extra partial cut only when the Player explicitly
orders a multi-hit dagger combo. It is not a free automatic follow-up
attack when the Player only orders one slash. No mana cost. Buff does
not affect bare hands, bows, magic or another weapon.

**Chroma at revision 513** already has 43 source-attested effective dagger
fights: this corresponds to Lv2 (+12% dagger damage, +8% dagger attack speed).
It does not rewrite the previously committed wolf battle outcomes.

## Other unlocks

- **Critical Attack:** 15 different successful, explicitly confirmed
  dagger weak-point hits. Active, 12 MP for one-minute action, +50% dagger
  strike damage only on a verified weak point while active.
- **Mutilation:** evolution after 45 different verified dagger weak-point
  encounters. Active, 24 MP, +85% critical weak-point damage when active,
  replacing rather than stacking with Critical Attack.
- **Dagger Throw:** 8 successful thrown-dagger encounters with genuine
  inventory/ammunition. Active, 8 MP, +20% throwing-dagger damage.
- **Dagger Rush:** 35 such encounters **and** separately earned Ruler's
  Authority; active, 16 MP, +45% projectile attack damage on verified
  hit; multi-knife choreography still requires real available weapons.
- **Tenacity:** 4 independently confirmed survival events when the
  Player survives genuine damage at 30% HP or less. Reduces later damage
  by 20% only while already at critical health, with no full heal.
- **Combat Evasion:** established crossover passive, 12 actual dodges.
  Remains separate and does not substitute for lore-accurate skills.

There is no auto-awarding Stealth or Shadow Monarch powers from generic
killing. Stealth requires a rune/quest. Shadow-class abilities require
story progression. All changes are backward compatible with archived
narrative events and with Chroma's separate Loki Falna.

## Verification

Deno checks runtime entrypoint, 788+ tests including the new positive and
negative skill tests, updates the old release marker regression to v3.1,
and remains CAS-safe. Always check runtime_health for
danmachi-solo-chroma-rpg-lab-v3.1-2026-11-23 after deploying the one commit.

Solo Leveling references:
- Crunchyroll News, episode 10 recap (Advanced Dagger Wielding / Fatal Strike):
  https://www.crunchyroll.com/news/features/2024/3/20/solo-leveling-episode-10-recap
- novel ch.38 (High-Grade Dagger Technique):
  https://archivedlibrary.com/story/solo-leveling-novel-official-english-translation/chapter/38/
- fan-collated late evolutions (Master of Shortsword / Dagger Rush):
  https://wikikai.com/wiki/solo-leveling/concepts/rune-stones/
