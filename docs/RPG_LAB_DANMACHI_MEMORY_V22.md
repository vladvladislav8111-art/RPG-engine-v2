# DanMachi RPG Lab v2.2: memory continuity & safe campaign saves

**Release discipline:** one combined PR / one production deployment after CI passes.
Keep all legacy Shura state and its writer unchanged. Work only on keys under
\`rpg-lab-v1/sessions/<projectId>/<sessionId>\`.

## Why this patch

- Event commits were already version-checked and scoped to separate game
  sessions, but the read-only NPC evaluator did not automatically receive
  saved episode references when a session was loaded.
- The ChatGPT bridge could evaluate an NPC personality, yet could not read
  the NPC's actual memories from a saved campaign. This caused the model to
  depend on conversation length.
- As more NPCs remembered events, the session JSON could exceed the Deno KV
  per-value limit.
- Hearsay carried a source actor string, but could not explicitly link that
  actor's witnessed knowledge to the rumor.

## Read actual NPC memories from the ChatGPT Runtime Bridge

Read-only world simulation request:
\`\`\`json
{
  "expectedSaveId": "<current Shura save ID from runtime_health>",
  "jobs": [{
    "id": "linos.memory.check",
    "operation": "world_review",
    "payload": {
      "rpgLabSessionV1": {
        "projectId": "danmachi_core",
        "sessionId": "linos_campaign",
        "npcIds": ["npc.loki", "npc.finn"],
        "maxPerNpc": 8,
        "includePrivate": false,
        "query": "нить"
      }
    }
  }]
}
\`\`\`
The server loads \`danmachi_core/linos_campaign\` from KV, validates it
against its currently synced Google Drive pack, and returns a bounded
per-NPC memory summary. By default only **public** records are returned.
The GM can opt into private records with \`includePrivate:true\`, but the
GM must not automatically reveal those private entries to the player.

The read result includes personal perception, confidence, hearsay source,
any witnessed source reference, and the source event, but does not pretend
that an NPC belief is objectively true. It never modifies a save.

## Browser panel

The session section now has **7. Проверка памяти NPC** and allows the
GM to read selected character memories by ID. The same data is available
from the authenticated HTTP endpoint:

\`GET /rpg-lab/v1/projects/danmachi_core/sessions/linos_campaign/memory?npcIds=npc.loki,npc.finn&maxPerNpc=8\`

The panel also starts **new campaigns with an empty discovery list**.
The GM chooses starting locations based on the actual story instead of
the first two arbitrary city or dungeon nodes.

## Multi-hop rumors with traceable sources

In an authorized, confirmed turn, a hearsay observation may include:
\`\`\`json
{
  "npcId": "npc.finn",
  "channel": "report",
  "sourceActor": "npc.loki",
  "relayedSourceRef": "linos.day01.001",
  "perceivedFact": "Локи рассказала Финну про нить Линоса",
  "learnedAt": "D1 10:05",
  "confidence": "likely",
  "salience": "ordinary",
  "privacy": "small_group"
}
\`\`\`

When \`relayedSourceRef\` is supplied, the server checks that the named
NPC already has the referenced memory or witnessed that same event.
The next person cannot magically know a private event simply because
a report names it. Additional rumors can carry subjective inaccuracies.
An unlinked report remains possible as **unverified**, because the world
also contains external stories whose truth is unknown.

The save writer rejects explicitly comparable clock regressions such as
\`D1 10:00\` followed by \`D1 08:00\`. Clocks that cannot be normalized
continue to be handled as narrative strings; no hidden real-world
timeline is fabricated.

## Persistence

Snapshots smaller than 45 kB remain in the legacy uncompressed
\`{revision,session,updatedAt}\` layout.
Larger isolated sessions use \`gzip-session-v1\` with explicit project,
session, game-clock metadata, bounded decompression and backward-
compatible reads. The Shura save does **not** use this codec.

Confirmed memory writes still need an authenticated HTTP caller or an
explicit write-enabled connector. The existing ChatGPT Runtime Bridge
can **read and evaluate** but does **not** silently commit events.
This patch does not create sessions, overwrite play history, grant loot,
or retcon campaign events by itself.

## Verification

CI tests cover:
- NPC direct witnesses and non-witnesses
- verified NPC-to-NPC chain of gossip
- false relay rejected when the source never heard the fact
- private records excluded from public read
- bounded GM access to selected private memory
- clock rollback prevented
- real saved memory refs passed back into NPC evaluation
- compressed session roundtrip and legacy session read
- read-only Runtime Bridge memory request, session isolation
- all earlier engine tests and Shura regression checks

## Activation

After deploy, use the RPG Lab panel to create a **new isolated test
session** with a unique sessionId. Do not use a preexisting Linos
campaign to test fabricated interactions. A full live write/read/restart
test requires an authorized caller with the runtime key and is not
performed by the read-only ChatGPT bridge.
