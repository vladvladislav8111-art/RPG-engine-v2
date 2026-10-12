# TEST writer stage checkpoints — not external Google fencing

After a successful isolated Preview HMAC/TEST-writer lease acquisition,
the semantic TEST writer now checks the exact KV owner **and original lock
versionstamp**:

- before the Google Sheets batch;
- immediately after Sheets succeeds, before any Google Docs request;
- before each idempotent Docs append;
- before verification and before caching committed result;
- in the existing CAS-based lease release.

A changed owner, TX identity, or an ABA delete/recreate of the same KV token
blocks subsequent stages. The ambiguous partial outcome remains
`RECOVERY_REQUIRED`, with no automatic unlock. New local KV-only fault
regressions cover an owner change between Sheets/Docs, token-reuse ABA,
lock substitution after action and a clean successful write lifecycle.

**This does NOT fully fence Google Sheets or Docs.** A process can pause
*after passing a KV check and before entering a Google network write*.
The external Google API lacks an atomic comparison to a KV fencing epoch.
Therefore do not delete, expire, or rotate the deliberately orphaned
`TEST-S4` lock; no release gate has been satisfied and
`oldWorkerStoppedVerified=false`. This is defense in depth, not a
justification for a Production enablement, lock recovery, multi-instance
transaction claims beyond those specifically observed, or new ENV.

The extra checkpoints apply only to the TEST writer path wrapped in the
KV lease. The existing ordinary Production semantic writer remains
unchanged. No real Google or KV writes were executed to develop/tests;
the fault tests use in-memory Deno KV and synthetic Sheets/Docs counters.
