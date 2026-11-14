# DanMachi RPG Lab V2.1: consolidated rollout

## Data sources
Google Drive folder: 1cKDROcEolxFpJTn819P2x6XrsqWCpdEN
Project ID: danmachi_core.

Active native Google Sheets: formulas, loot, prices, locations, encounters, bestiary.
JSON Docs: pack.json and npcProfiles.json. Legacy loot.csv/prices.csv and older
data tables retain existing historical prices and drop rates.
Old hero multiplier is archived, not applied twice.

Google Docs and Sheets content is imported via the existing service-account
read-only integration. The folder must be shared with the Deno service account.
An authenticated GET /rpg-lab/v1/google/service-account endpoint exposes
the service-account email to the user for one-time folder sharing.

## Falna
Gameplay model: M = 2 * 1.8^(level-1) * (1+pointsTotal/3000).
pointsTotal means one attribute summed across level history.
BaseNaturalCapacity * M gives approximate physical capability compared with
the very same character before Falna, preserving individual body/race baseline.
This is homebrew balancing, not official DanMachi percentage math.
No mandated DEX-based damage multipliers or numeric combat engine.

## Data calculations
RPG Lab now imports native encounter and bestiary Sheets into structured pack.
50 floors have encounter probabilities including adventurer sightings, conditional
chance that a witnessed group is already fighting, and safe floor exceptions.
Bestseller entries declare C (canonical species), A (estimated placement),
H (explicitly invented monster species). Bosses never appear from ordinary
dungeon_watch selection. RNG is a deterministic proposal, not evidence of
a confirmed spawn or actual combat outcome.

Example lab job:
{"id":"explore.1","kind":"dungeon_watch","args":{"floor":7,"eventId":"day1.path.2",
"seed":"private.preview","minutes":10,"noiseFactor":1,"trafficFactor":1,
"allowHomebrew":false}}

## Confirmed independent campaign saves
PUT /rpg-lab/v1/projects/PROJECT/sessions/SESSION accepts explicit session
snapshot with expectedRevision.
GET /rpg-lab/v1/projects/PROJECT/sessions lists known sessions.

POST /rpg-lab/v1/projects/PROJECT/sessions/SESSION/events accepts
expectedRevision, optional expectedPackRevision, and a confirmed event.
Event carries sourceRef, time, kind, summary, knownBy, observations, effects,
and gmConfirmed:true.
Each NPC observation specifies personal perception and witnessed/reported/
rumored channel, learnedAt, confidence, salience, privacy, and sourceActor
if learned indirectly. Direct perception demands an explicit witness entry.
Revision CAS and duplicate sourceRef checks prevent repeated item grants.
These writes touch only isolated RPG Lab session keys, never legacy Shura.

Example confirmed event:
{"expectedRevision":1,"event":{"sourceRef":"day1.f07.001","time":"D1 09:10",
"kind":"battle","summary":"An encounter concluded",
"knownBy":["npc.loki"],"gmConfirmed":true,
"observations":[{"npcId":"npc.loki","channel":"seen",
"perceivedFact":"I saw the thread binding the creature",
"learnedAt":"D1 09:10","confidence":"certain",
"salience":"important","privacy":"small_group"}]}}

## KV storage capacity
Large multi-file packs exceed the 64-KiB Deno KV item limit.
The project pack and its baseline now use a bounded gzip codec.
Previously saved uncompressed pack values remain readable.
Source excerpts are bounded separately.

## Runtime / installation caveats
Connected ChatGPT Runtime Bridge remains read-only. It can preview a saved
project and its dungeon_watch operation, including large compressed packs
that are evaluated server-side without blowing the Bridge payload cap.
The new HTTP commit endpoint is authenticated but does not on its own
turn the read-only ChatGPT plugin into a writable connector.

The Google Drive folder must be explicitly shared with the service account.
No project is automatically created in the user's Deno KV just by placing
files into Drive. Connect it through /rpg-lab/v1/ui after deployment.

A native Google Sheet named npc_memory is currently a prepared journal template;
the authoritative session event commit writes to Deno KV. Automatic two-way
write-back to that sheet still requires additional integration.

## Release procedure
One consolidated main merge / Deno production deploy for the day.
First validate Deno check, domain tests and regression tests on a single
branch push. After merge, live smoke test requires Google folder access.
Confirm 50 encounter profiles, 78 extended monster kinds, 13 NPC profiles,
new Falna example Lv3, P=1800 gives 10.368, and Shura save unchanged.
