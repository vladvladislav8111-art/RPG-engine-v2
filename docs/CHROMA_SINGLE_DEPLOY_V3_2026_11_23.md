# Chroma RPG Lab v3: single-commit release

Deployment target: one fast-forward update of main. Deno Deploy may launch
one deployment attempt per pushed head. Do not make follow-up fix commits,
do not schedule retries, and never duplicate gameplay writes.

Version: danmachi-solo-chroma-rpg-lab-v3-2026-11-23.

## Release changes
- +5% System XP per threat level above the Player, capped at +25%.
  No penalty when the Player becomes stronger. Falna remains separate.
- Sprint Lv5 is a speed-skill evolution gate, not a lifelong maximum.
  Quicksilver adds reaction to speed. Its mastery continues beyond Lv1.
- Dagger, weakpoint and evasion practice counts per proven encounter.
- One Chroma-only migration reconciles the narrative gap up to RPG Lab
  revision 510. It never runs just because a new version deploys.
- Six previously registered stones and prior XP are not reissued.
  Exactly 41 additional stones come from documented hunts.
  The original first instant key is consumed; the first instance is entered.

## Pre-migration safeguards
Campaign: chroma_orario_main_20261120
Session: chroma_day0_20261120
Hero: hero.chroma
Current old-server System Lv2 XP150, Falna Loki and six held stones.
All 21 required event references listed in the reconcile module must
already exist, up to the finishing blow on wolf 02 at revision 510.

Migration event after the release is live:
sourceRef: chroma.repair.d3_to_instant_wolf02.511
time: D3 17:12
playerSystem.kind: reconcile_chroma_d3_full
playerSystem.playerApproved: true
playerSystem.args.confirmLedgerThrough510: true
gmConfirmed: true
knownBy: []

The migration is source-unique, guarded, and committed through RPG Lab
expectedRevision / expectedPackRevision CAS. Do not run the deprecated
partial d3_xp repair after this one.

## Expected verified player state
System Lv7 XP1075/1853
Base stats STR20 END20 AGI22 PER16 INT16; 25 free points.
HP2396/2396, MP87/238, fatigue32.3%.
47 held DanMachi magic stones, of which six were present on v1.
First instant instance state: entered, no spare key.
Quicksilver Lv1 active, historical Sprint Lv5, mastery XP46/60.
Dagger Mastery unlocked after source-attested long training.
No invented System gold, no sales or potion consumption.
Loki's Falna remains divine level 1.

## Verification
Check runtime_health for v3 before the migration write.
Read chroma.audit.current.001 and its revision.
Commit one authorized correction event with matching CAS revision.
Read back and confirm actual Player state, stone count and dungeon key.
If Deno Deploy hits its quota, report not live; retry the very same
commit from the dashboard when available, without adding commits.
