/** Operator-only KV receipt. Gameplay flags are never a backup attestation. */
export type MigrationBackupReceipt={
 schema:"CHROMA_BACKUP_VERIFIED_V1";projectId:string;sessionId:string;
 revision:number;sha256:string;fullSnapshot:true;restoreVerified:true;
};
export function requireMigrationReceipt(receipt:MigrationBackupReceipt|undefined,
 projectId:string,sessionId:string):MigrationBackupReceipt{
 if(!receipt||receipt.schema!=="CHROMA_BACKUP_VERIFIED_V1"||
    receipt.projectId!==projectId||receipt.sessionId!==sessionId||
    !Number.isSafeInteger(receipt.revision)||receipt.revision<1||
    !/^[a-f0-9]{64}$/.test(receipt.sha256)||
    receipt.fullSnapshot!==true||receipt.restoreVerified!==true)
  throw Error("CHROMA_VERIFIED_BACKUP_RECEIPT_REQUIRED");
 return receipt;
}
