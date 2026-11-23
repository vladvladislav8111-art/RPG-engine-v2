/** Offline-only full-snapshot rehearsal. Never opens a remote KV.
 * Usage: deno run --unstable-kv --allow-read --allow-env --node-modules-dir=manual scripts/chroma_backup_dry_run.ts SNAPSHOT.json
 * Use CI placeholder env when importing http.ts; no real Google credentials needed.
 */
import {restoreProjectBackupToEmptyKv,type ProjectBackup} from "../src/rpg_lab_v1/project_backup.ts";
import {decodeLabPack,type LabStored} from "../src/rpg_lab_v1/storage_codec.ts";
import {decodeLabSessionFromKv} from "../src/rpg_lab_v1/session_kv.ts";
import type {LabSessionStored} from "../src/rpg_lab_v1/session_storage.ts";
import {commitLabCampaignEventInKv} from "../src/rpg_lab_v1/http.ts";
import {effectiveJinwooMaxHp,effectiveJinwooMaxMp} from "../src/rpg_lab_v1/shadow_monarch_rules.ts";
const input=Deno.args[0];if(!input)throw Error("FULL_BACKUP_FILE_REQUIRED");
const snapshot=JSON.parse(await Deno.readTextFile(input)) as ProjectBackup;
const {projectId,sessionId,revision}=snapshot;
const kv=await Deno.openKv(":memory:");
try{
 await restoreProjectBackupToEmptyKv(kv,snapshot);
 const packRecord=await kv.get<LabStored>(["rpg-lab-v1","projects",projectId]);
 const pack=await decodeLabPack(packRecord.value!);
 const key=["rpg-lab-v1","sessions",projectId,sessionId];
 const load=async()=>decodeLabSessionFromKv(kv,projectId,sessionId,(await kv.get<LabSessionStored>(key)).value!,pack);
 const before=await load();
 await kv.set(["rpg-lab-v1","migration_backups",projectId,sessionId],{
  schema:"CHROMA_BACKUP_VERIFIED_V1",projectId,sessionId,revision,
  sha256:snapshot.sha256,fullSnapshot:true,restoreVerified:true,
 });
 await commitLabCampaignEventInKv(kv,{projectId,sessionId,expectedRevision:revision,
  expectedPackRevision:packRecord.value!.revision,event:{sourceRef:"chroma.v47.offline.migration",
   kind:"schema_migration",time:before.gameClock,summary:"Изолированный dry-run миграции v4.7",knownBy:[],gmConfirmed:true,
   playerSystem:{kind:"chroma_v4_migrate",playerApproved:true,args:{confirmedBackup:true}},
  }});
 const after=await load(),a=before.player.jinwoo!,b=after.player.jinwoo!;
 const protectedKeys=["systemLevel","xp","gold","valis","freeStatPoints","inventory","magicStones","defeatedTargetRefs","falna","skillMastery","unlockedSkills","fatigue","dailyTraining"] as const;
 const preserved=Object.fromEntries(protectedKeys.map(k=>[k,JSON.stringify(a[k])===JSON.stringify(b[k])]));
 if(Object.values(preserved).some(v=>!v)||JSON.stringify(before.npcs)!==JSON.stringify(after.npcs)||before.gameClock!==after.gameClock)
  throw Error("MIGRATION_PROTECTED_DATA_CHANGED");
 if(JSON.stringify(b.appliedRewardRefs.slice(0,-1))!==JSON.stringify(a.appliedRewardRefs))throw Error("MIGRATION_REWARD_HISTORY_CHANGED");
 const report={mode:"OFFLINE_COPY_ONLY",backupSha256:snapshot.sha256,revisionBefore:revision,revisionAfter:revision+1,
  clock:after.gameClock,preserved,npcStateUnchanged:true,
  hp:{before:a.hp,oldMax:effectiveJinwooMaxHp(a),after:b.hp,newMax:effectiveJinwooMaxHp(b)},
  mp:{before:a.mp,oldMax:effectiveJinwooMaxMp(a),after:b.mp,newMax:effectiveJinwooMaxMp(b)},
  liveMigrationPerformed:false,productionRollbackVerified:false};
 console.log(JSON.stringify(report,null,2));
}finally{kv.close();}
