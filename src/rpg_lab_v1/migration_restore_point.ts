import type {LabSessionStored} from './session_storage.ts';
export type MigrationRestorePoint={schema:'CHROMA_MIGRATION_RESTORE_POINT_V1';
 projectId:string;sessionId:string;originalRevision:number;migratedRevision:number;
 packRevision:number;packSha256:string;sessionSha256:string;backupSha256:string;
 originalHead:LabSessionStored;rolledBack?:boolean;rollbackRevision?:number};
