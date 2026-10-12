# Fail-closed Deno KV writer lock — no TTL (2026-10-12)

The original optional writer lock used a Deno KV atomic CAS key with a ten-minute expiration. Google Sheets `values.batchUpdate` offers no condition on the lock token, so an old Deno instance could resume after expiry and overwrite a newer writer. The original TTL was unsafe.

The lock now has **no automatic expiration**: the KV CAS record remains occupied until the same holder completes or fails and conditionally deletes it. Passing any `leaseMs` value throws `WRITER_LEASE_TTL_UNSAFE_WITHOUT_GOOGLE_FENCING`. A crashed worker leaves an orphan record, and subsequent writers **fail closed**. This prioritizes durable save safety over automatic availability.

The change does NOT implement fencing, automatic crash recovery, or a proof of multi-instance remote KV serialization. Manual recovery is allowed only after *all instances have been stopped or drained* and the authoritative Sheets SESSION_LOG, Docs TX markers, and KV owner/transaction state have been reconciled. Never manually delete an orphan lock while a previous worker may still run.

Production flag `RPG_KV_WRITER_LEASE_ENABLED` remains **false** and no existing gameplay save is touched. Real shared remote KV test and recovery drill on the synthetic Preview environment remain required before enabling the lock.
