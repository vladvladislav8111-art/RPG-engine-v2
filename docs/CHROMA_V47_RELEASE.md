# Chroma v4.7: integration and controlled migration

Prepared 2026-11-24 against main `5d687956904e8102512c0d7d173703b769300b88`.

## Release checks completed before publication

- Complete Deno regression: 826 passed, 0 failed, using the CI placeholder environment and a fresh isolated DENO_DIR.
- `deno check main.ts`: passed.
- v4.7 Node verification: 155 passed, 0 failed. Candidate Python integration checks: 21 passed, 0 failed (unchanged Python code).
- Separate OS processes sharing local SQLite KV: CAS exclusion, ambiguous-write lock retention and refusal of replay passed. This is local concurrency evidence, not proof of multiple Deploy instances.
- Real production SQLite: integrity check passed; restored table contents, all 6552 KV rows, versions and queue tables match the uploaded original. The original file remains unchanged.
- Real Chroma migration rehearsal: revision 788 to 789. All existing XP, currencies, attributes, inventory, Falna, reward history, previous events, NPC state and clock preserved. HP/MP retain the agreed fraction under the new formulas. Unrelated 3355 KV entries and versionstamps remain identical.
- Real rollback rehearsal: revision 789 to 790, restoring original player, NPCs, clock, post cadence and previous events exactly. These rehearsals had zero remote writes.
- Shura structured Google Sheet: native backup and a separate restoration copy retain all 50 tabs and checkpoint V2-S0909. Original Google sources and legacy campaign remain untouched.

The first complete run after the release-marker bump found the old expected version in its test; that assertion was updated. Reusing a test DENO_DIR then correctly encountered permanent ambiguous-write locks left by the previous run. The clean final run above uses a new DENO_DIR; no production lock or guard was removed.

## Runtime changes

The guarded candidate is integrated into the existing event/CAS path: 156 bestiary cards, 135 combat profiles, physical loot recovery and separate sales, authoritative combat and effects, rune/title actions and immutable achievement proof resolution. Derived event references remain within 80 characters. System and Falna remain independent; the existing XP-to-next-level curve is retained. Canonical NPC cores, their private knowledge and independent timeline remain in the existing engine. Candidate guaranteed rune quests and the standalone hive/timeline proof of concept do not start themselves.

Old formula branches remain solely for unmigrated saves; the migrated schema selects v4 behavior. Legacy Shura routing is retained. No historical event, save or past reward is deleted, repriced or replayed. No second active copy of the candidate runtime is installed.

## Backup attestation and migration

The release contains hashes only, never the SQLite file or private save content:

`fa259d884c3a84feb69bcf44107b6076c922aaf0b3579ed3772ff40640f05ef9`

`verified_chroma_backup.ts` binds that tested backup to the exact full decoded session, pack and revisions. A changed live session or pack fails closed. A gameplay flag or client-supplied checksum cannot create the attestation. The migration creates a protected restore-point head in the same CAS transaction as the new session. Immutable original chunks are retained.

The operator can commit one metadata event through the existing authenticated RPG Lab endpoint:

```json
{
  "projectId": "chroma_orario_main_20261120",
  "sessionId": "chroma_day0_20261120",
  "expectedRevision": 788,
  "expectedPackRevision": 1,
  "event": {
    "sourceRef": "chroma.v47.production.migration.788",
    "kind": "schema_migration",
    "time": "D4 13:44",
    "summary": "Verified schema migration v4.7; no gameplay or rewards",
    "knownBy": [],
    "gmConfirmed": true,
    "playerSystem": {
      "kind": "chroma_v4_migrate",
      "playerApproved": true,
      "args": {"confirmedBackup": true}
    }
  }
}
```

This operation is not performed by startup or ordinary reads. The sourceRef is one-time. A revision conflict or attestation mismatch requires a fresh real backup and rehearsal; never force a stale migration.

## Immediate rollback

Before any subsequent gameplay, send a metadata-only event with `expectedRevision: 789`, the same project/session/pack, `kind: schema_rollback`, the unchanged gameClock and `playerSystem: {kind: chroma_v4_rollback, playerApproved: true, args: {}}`, using a new unique sourceRef. The authenticated server verifies its protected restore point, exact pack hash and CAS before writing revision 790. It restores the original player/NPC state and keeps the original journal plus one rollback audit event. The immutable migration receipt is retained.

Rollback deliberately refuses after later gameplay or a pack change, preventing deletion of newly earned progress. Such a recovery needs a new reviewed snapshot and an operator-controlled restoration; do not overwrite production with the old SQLite file. The uploaded full database and Google backup are private recovery sources, not deployment assets.

## Deployment verification still required after publication

Publishing main starts the first production deployment. Confirm the v4.7 health marker, unchanged legacy Shura checkpoint, successful campaign reads, exact migration revision and resources, and read-only gameplay context. Local regression results above must not be reported as a production smoke test. A second deployment is reserved for an actual reproduced production defect.
