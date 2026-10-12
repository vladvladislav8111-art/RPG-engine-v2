# NPC V4 signed chain proof-of-concept — TEST read-only, not activation

Existing V3 test HMAC proves that an individual JSON envelope was signed
by a party holding a key; it does not prove that all sessions since a
trustworthy genesis were included. This implementation adds a deterministic
pure verifier for a **contiguous, supplied TEST-only epoch segment**:
- exact TX index equality and uniqueness (max 256 rows);
- HMAC for each V3 frame, including save, clock, scene, source, TX, and
  `engineNpcReceiptChain` in its exact signed World advances JSON;
- `TEST-EPOCH-...` genesis marker `GENESIS` at sequence 0;
- SHA-256 predecessor digest of prior signed TX/provenance bytes;
- ordered in-world clocks, pinned `TEST-` save scope, complete tail match;
- valid per-TX NPC receipt framing; evidence counters ignore scene presence
  and count distinct candidate meaningful days only.

**Boundary:** the TEST epoch marker comes from the supplied data, not a
trusted independent root. Its completeness beyond the supplied index is
unknown, HMAC key rotation is not supported, and none of its claimed NPC
memories/feelings are checked against canonical Docs. Therefore even six
signed meaningful social days yield ONLY
`SIGNED_SEGMENT_VALID_EXTERNAL_GENESIS_AND_CANON_REQUIRED`; the output
always forbids automatic Heat 2–4, KEY, XP, SUP and writes. Existing V1/V2
rows, and specifically the current TEST-S4 orphan lock, are NEVER backfilled
or converted. `engineNpcReceiptChain` and `engineNpcEpochGenesis`
are scrubbed from caller-controlled writer world advances to prevent spoofing.

This verifier is intentionally **not wired to the production writer or
normal turn hot path**: there is currently no trustworthy signed epoch
genesis and the TEST writer is disabled. It is a source-ready specification
and regression protection for a later, separately approved prospective
epoch design, not a claim that NPC Heat may now be activated.
No new Site/Plugin/backend, no merge, no Production Deploy, no ENV changes.
