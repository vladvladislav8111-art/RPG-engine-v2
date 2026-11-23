/** Server-owned release attestation, generated only after a real SQLite restore
 * and successful isolated migration. Contains hashes, never private save data.
 * No client argument can create or alter this attestation.
 */
import type {LabSession} from './session.ts';
import type {LabPack} from './engine.ts';
import type {MigrationBackupReceipt} from './migration_receipt.ts';
export type VerifiedChromaBackup={projectId:string;sessionId:string;revision:number;
 packRevision:number;sha256:string;sessionSha256:string;packSha256:string};
export const VERIFIED_CHROMA_BACKUP:VerifiedChromaBackup={
  "projectId": "chroma_orario_main_20261120",
  "sessionId": "chroma_day0_20261120",
  "revision": 788,
  "packRevision": 1,
  "sha256": "fa259d884c3a84feb69bcf44107b6076c922aaf0b3579ed3772ff40640f05ef9",
  "sessionSha256": "4cbaf66bc2f0c3ea036cc0304f34b27344d9a66e750ad472d5c4cb613e29a4ea",
  "packSha256": "4d38aa11dd8e1063fea611cef1f635f6505410d525b19dcaa1c7628d4d70d328"
};
function canonical(x:unknown):string{
 if(Array.isArray(x))return '['+x.map(v=>canonical(v)).join(',')+']';
 if(x!==null&&typeof x==='object')return '{'+Object.keys(x).filter(k=>(x as Record<string,unknown>)[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical((x as Record<string,unknown>)[k])).join(',')+'}';
 return JSON.stringify(x)??'null';
}
export async function migrationStateHash(x:unknown):Promise<string>{
 const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(x))));
 return Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
}
export async function receiptForVerifiedSnapshot(session:LabSession,pack:LabPack,
 revision:number,packRevision:number,certificate=VERIFIED_CHROMA_BACKUP):Promise<MigrationBackupReceipt>{
 if(session.projectId!==certificate.projectId||session.sessionId!==certificate.sessionId||
    session.player.hero?.id!=='hero.chroma'||revision!==certificate.revision||
    packRevision!==certificate.packRevision||
    await migrationStateHash(session)!==certificate.sessionSha256||
    await migrationStateHash(pack)!==certificate.packSha256)
  throw Error('CHROMA_BACKUP_SNAPSHOT_CHANGED');
 return {schema:'CHROMA_BACKUP_VERIFIED_V1',projectId:certificate.projectId,
  sessionId:certificate.sessionId,revision,sha256:certificate.sha256,
  fullSnapshot:true,restoreVerified:true};
}
