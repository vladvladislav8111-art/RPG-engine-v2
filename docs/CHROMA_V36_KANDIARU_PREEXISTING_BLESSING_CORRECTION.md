# Chroma RPG Lab v3.6 — Kandiaru blessing correction

**User's correction is canonically right.** In Solo Leveling,
the Great Spellcaster Kandiaru's Blessing is awarded after the
Double Dungeon, at the Player awakening; Jinwoo recognizes the
poison-immunity and detoxification properties later. That later
recognition is NOT a later unlock of the distinct passive skill.

The previous v3.5 incorrectly said that Chroma lacked this protection
at his first Kasaka elixir use on Day3. Chroma's original backstory
already includes the Double Dungeon, severe injuries and awakening.
This means the existing blessing should have been active from the
beginning, not awarded by a new training or quest at D3.

Canon action at rev641: Chroma drank the unique A-rank Kasaka Venom,
consuming one inventory item. The permanent benefit is
"Kasaka's Armored Scales": -20% INCOMING PHYSICAL DAMAGE.
The poison-induced "Weakened Muscles": -35 Strength is immediately
neutralized by Kandiaru's blessing. Therefore Chroma at System Lv8
has System STR26 + Loki Falna STR12 = EFFECTIVE STR38, NOT 3.
The two blessings are separate: Kandiaru's poison immunity does not
derive from Loki's Falna.

A proof-backed one-time repair is narrowly allowed only for the
original active Chroma campaign, with the previously committed venom
consumption source chroma.d3_kasaka_venom_drunk_on_way_guild.641,
the already active Casaka Armored Scales buff, and existing incorrect
Weakened Muscles debuff. It removes the WRONG debuff story flag and
recognizes the pre-existing Kandiaru poison immunity in the mechanical
ledger. No item, XP, gold, free points or resources are changed.
Event: chroma.repair.d3_kandiaru_blessing.647,
at D3 19:21. Replays or external campaigns cannot claim the repair.

New venom uses check the existing blessing BEFORE applying debuff.
The combat stat projection checks the blessing even in the unlikely
case of a stale negative status flag. A poisonous status/injury is
purged without creating a poisoned wound or damage; real physical
bite/impact damage is still separately tracked and can be mitigated
by the Casaka Armored Scales bonus.

Primary/further references:
- https://www.webnovel.com/book/solo-leveling-%28only-i-level-up%29_21292432006103705/chapter-15_57160366911716473
- https://www.novelcool.com/chapter/I-Alone-Level-Up-Chapter-25/2292859/
- https://solo-leveling.fandom.com/wiki/Episode_7
