/** Optional lease guard for one isolated runtime workbook.
 * Deno KV atomic check gives cross-instance exclusion while the lease is live.
 * It is NOT a Google Sheets fencing token: a stale worker after TTL expiry must
 * still be considered unsafe. Gate off until external concurrency E2E.
 */
export type LeaseKvKey=(string|number|boolean|bigint|Uint8Array)[];
export type LeaseKv={
  get<T>(key:readonly (string|number|boolean|bigint|Uint8Array)[]):Promise<{value:T|null;versionstamp:string|null}>;
  atomic(): {
    check(entry:{key:LeaseKvKey;versionstamp:string|null}): ReturnType<LeaseKv["atomic"]>;
    set(key:LeaseKvKey,value:unknown,opts?:{expireIn:number}): ReturnType<LeaseKv["atomic"]>;
    delete(key:LeaseKvKey): ReturnType<LeaseKv["atomic"]>;
    commit():Promise<{ok:boolean}>;
  };
};
type LeaseRow={ownerToken:string;txId:string};
export async function withKvWriterLease<T>(input:{
  kv:LeaseKv;workbookId:string;txId:string;
  action:()=>Promise<T>;leaseMs?:number;
}):Promise<T>{
  const {kv,workbookId,txId}=input;
  if(!workbookId||!txId||workbookId==="ci-placeholder")throw Error("WRITER_LEASE_INVALID_TARGET");
  const leaseMs=input.leaseMs??600_000;
  if(!Number.isSafeInteger(leaseMs)||leaseMs<60_000||leaseMs>3_600_000)
    throw Error("WRITER_LEASE_INVALID_TTL");
  const key:LeaseKvKey=["rpg-v2","semantic-writer-lock",workbookId];
  const existing=await kv.get<LeaseRow>(key);
  if(existing.value)throw Error("WRITER_LEASE_BUSY_RETRY_LATER");
  const ownerToken=crypto.randomUUID();
  const acquired=await kv.atomic()
    .check({key,versionstamp:existing.versionstamp})
    .set(key,{ownerToken,txId}, {expireIn:leaseMs}).commit();
  if(!acquired.ok)throw Error("WRITER_LEASE_BUSY_RETRY_LATER");
  try{
    const check=await kv.get<LeaseRow>(key);
    if(check.value?.ownerToken!==ownerToken)throw Error("WRITER_LEASE_LOST_BEFORE_ACTION");
    return await input.action();
  }finally{
    const current=await kv.get<LeaseRow>(key);
    if(current.value?.ownerToken===ownerToken)
      await kv.atomic().check({key,versionstamp:current.versionstamp}).delete(key).commit();
  }
}
