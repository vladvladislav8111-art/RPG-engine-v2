# Two existing Preview revisions: cross-JS-isolate KV proof

The existing Deno Deploy app has immutable Preview URL revisions; official Deno documentation currently says **one shared Preview KV logical database per app, across Preview deployments**, separate from production and per-Git-branch databases:
https://docs.deno.com/deploy/reference/databases/
https://docs.deno.com/deploy/reference/timelines/

This experimental test bridges **two immutable revisions of the SAME app** to prove that different JS instances contend on the same Preview KV key. It does **not** create a second backend or shared Production database. The second revision hostname is pinned in source; there is no URL parameter, DNS from user input, dynamic host, arbitrary redirect or SSRF path.

Both sides use the existing strict Preview KV probe: all Google/semantic writers must be **OFF**. The holder takes a 12-second no-TTL TEST session key; the second pinned revision must independently observe the lock and reject its contender. After the holder finishes, the remote side must see the release. Returned IDs are random per JS module, never secrets.

User actions if CI is green and Preview safe configuration is confirmed: deploy current Draft PR #62 revision to **Preview only** and open `/preview/kv-cross-revision`; enter Bearer locally and press the single button. No Development ENV changes or Google writes. If the pinned older revision is no longer served, the test fails closed and cannot count as evidence. If the two revisions resolve to different logical KV databases, it fails, also without any game writes.

**Interpretation:** success proves independently instantiated Preview revision code sharing Deno KV CAS. It does not prove two concurrent replicas of the *same* code revision, Google Sheets external fencing, uncertain write crash recovery or NPC Heat full-history authenticity. All PRs remain Draft; Production/Shura stays unchanged.
