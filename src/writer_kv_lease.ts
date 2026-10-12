/** Optional fail-closed writer exclusion for one runtime workbook.
 * Cross-instance ownership uses Deno KV atomic CAS with **no automatic TTL**.
 * A crashed process intentionally leaves an orphan lock: never silently expire
 * and allow a suspended stale writer to overwrite Google Sheets later.
 * Before a manual operator recovery, drain/stop all workers and reconcile the
 * durable SESSION_LOG, Docs receipts and the KV lock owner. Feature OFF until
 * real shared-KV concurrency and recovery E2E has been verified.
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
  action:(lease:{assertOwner:()=>Promise<void>})=>Promise<T>;
  leaseMs?:number;releaseOnError?:boolean;
}):Promise<T>{
  const {kv,workbookId,txId}=input;
  if(!workbookId||!txId||workbookId==="ci-placeholder")throw Error("WRITER_LEASE_INVALID_TARGET");
  // A time-bound lease cannot fence delayed writes to Google Sheets. Reject
  // even a seemingly generous TTL; fail closed instead of risking stale writes.
  if(input.leaseMs!==undefined)
    throw Error("WRITER_LEASE_TTL_UNSAFE_WITHOUT_GOOGLE_FENCING");
  const key:LeaseKvKey=["rpg-v2","semantic-writer-lock",workbookId];
  const existing=await kv.get<LeaseRow>(key);
  if(existing.value)throw Error("WRITER_LEASE_BUSY_RETRY_LATER");
  const ownerToken=crypto.randomUUID();
  const acquired=await kv.atomic()
    .check({key,versionstamp:existing.versionstamp})
    .set(key,{ownerToken,txId}).commit();
  if(!acquired.ok)throw Error("WRITER_LEASE_BUSY_RETRY_LATER");
  let finished=false;
  // Capture the initial CAS versionstamp. An ABA delete/re-create of the
  // same owner token is not authority to continue old Google operations.
  const guard=async()=>{
    const present=await kv.get<LeaseRow>(key);
    if(!present.value || present.value.ownerToken!==ownerToken ||
       present.value.txId!==txId || present.versionstamp!==initialStamp)
      throw Error("WRITER_LEASE_LOST_BEFORE_GOOGLE_STAGE");
  };
  let initialStamp:string|null=null;
  try{
    const check=await kv.get<LeaseRow>(key);
    if(check.value?.ownerToken!==ownerToken || check.value.txId!==txId)
      throw Error("WRITER_LEASE_LOST_BEFORE_ACTION");
    initialStamp=check.versionstamp;
    const result=await input.action({assertOwner:guard});
    finished=true;
    return result;
  }finally{
    // Google Sheets may have accepted a batch that subsequently timed out.
    // Never free the production writer after an ambiguous failed action.
    // The lock survives until workers are drained and the durable TX is reconciled.
    if(finished||input.releaseOnError!==false){
      const current=await kv.get<LeaseRow>(key);
      // Even an apparently successful Google write cannot report success if
      // another holder replaced the lock or CAS release failed.
      if(current.value?.ownerToken!==ownerToken ||
         current.value.txId!==txId ||
         current.versionstamp!==initialStamp){
        if(finished)throw Error("WRITER_LEASE_LOST_AFTER_ACTION");
      }else{
        const released=await kv.atomic()
          .check({key,versionstamp:current.versionstamp}).delete(key).commit();
        if(!released.ok)throw Error("WRITER_LEASE_RELEASE_RACE");
      }
    }
  }
}
