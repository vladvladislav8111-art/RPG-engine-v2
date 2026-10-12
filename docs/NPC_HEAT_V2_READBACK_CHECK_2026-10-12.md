# Test V2 receipt read-back checks, staging on PR #60

The opt-in NPC Heat journal audit now recognizes both legacy SESSION_LOG Version=1 envelope hashes and *isolated* `TEST_ONLY_V2` Version=2 unkeyed SHA-256 digests, without changing the live UI, user API or actor contextual gate.

- V2 computes SHA-256 over the **exact** persisted World advances JSON string and save/scene/time/TX envelope. Any mismatch fails closed.
- Accept V2 only when `Save ID` begins `TEST-`, `Source=ENGINE_FASTPATH`, `Version=2` and `engineNpcReceiptEpoch=TEST_ONLY_V2`; do not reinterpret V2 gameplay saves.
- Internally normalize the already-verified V2 wrapper to a transient V1-shaped row to reuse existing actor/time/scene/window/duplicate validation; source rows are not edited.
- A checksum-valid record remains an **untrusted candidate**, never a signed writer attestation. `testV2CryptographicallyAuthenticated=false`, `verifiedForTierPromotion=false`, `historyComplete=false`. Heat 2–4, memory pruning and KEY promotion stay blocked.
- This code only runs if the GM explicitly requests `tags:["NPC_HEAT_AUDIT"]` with an actor. Routine turns perform zero additional reads.

**Release gap:** an unkeyed checksum cannot prevent a writer with full Sheet access from forging both JSON and digest. Secure source signing plus remote two-instance KV and real Google writer readback are needed before promotion. No Production deploy or user game writes.
