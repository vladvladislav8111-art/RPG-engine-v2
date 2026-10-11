/**
 * Type-safe Deno KV adapter for the EC-06 staging transaction boundary.
 *
 * This does NOT open production KV, install a ledger, invoke commits, or
 * project Google Sheets/Docs. It is imported only by future approved code.
 * In production an existing, explicitly opened Deno.Kv instance will be
 * passed after schema migration and recovery policy verification.
 */
import type {
  AtomicKvStore, AtomicWrite, KvKey, KvEntry,
} from "./economic_kv_atomic.ts";

export function wrapDenoAtomicEconomyKv(kv:Deno.Kv):AtomicKvStore {
  return {
    async get<T>(key:KvKey):Promise<KvEntry<T>> {
      const row=await kv.get<T>(key as Deno.KvKey);
      return {
        key,
        value:row.value??null,
        versionstamp:row.versionstamp,
      };
    },
    atomic():AtomicWrite {
      let operation=kv.atomic();
      const builder:AtomicWrite={
        check(entry) {
          operation=operation.check({
            key:entry.key as Deno.KvKey,
            versionstamp:entry.versionstamp,
          });
          return builder;
        },
        set(key,value) {
          operation=operation.set(key as Deno.KvKey,value);
          return builder;
        },
        async commit() {
          const result=await operation.commit();
          return {ok:result.ok};
        },
      };
      return builder;
    },
  };
}
