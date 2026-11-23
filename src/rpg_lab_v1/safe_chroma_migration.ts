/**
 * Dry-run, fail-closed migration. Never writes KV, never resets a save.
 * Numeric Falna layers for previously promoted gods' levels cannot be invented.
 */
import {
  FALNA_STAT_KEYS, type FalnaLayer, type FalnaStateV4,
  type FalnaStats, type FiveStats, projectFalna,
} from './crossover_core.ts';

type LegacyFalna={blessed:boolean;godId:string|null;divineLevel:number;
 status:FalnaStats;skills:string[];lastUpdatedRef:string|null};
export type LegacyChromaCore={
 systemLevel:number;xp:number;gold:number;freeStatPoints:number;
 stats:FiveStats;hp:number;mp:number;fatigue:number;
 appliedRewardRefs:string[];defeatedTargetRefs:string[];
 falna:LegacyFalna;
 [key:string]:unknown;
};
export type ProposedSaveV4<T extends LegacyChromaCore>=T & {
 layeredFalnaV4:FalnaStateV4|null;
 crossoverSchema:'chroma_v4_staged';
};
export function previewChromaMigration<T extends LegacyChromaCore>(
 original:T,
 historicLayers?:FalnaLayer[],
):{candidate:ProposedSaveV4<T>;falnaBonus:FiveStats|null;safeToCommit:boolean;
 requiresNewResourceRecalibration:true;notes:string[]} {
 const s=structuredClone(original);
 if(!Number.isSafeInteger(s.systemLevel)||s.systemLevel<1||
   !Number.isSafeInteger(s.xp)||s.xp<0||
   !Number.isSafeInteger(s.gold)||s.gold<0||
   !Number.isSafeInteger(s.freeStatPoints)||s.freeStatPoints<0||
   !Number.isFinite(s.hp)||s.hp<0||!Number.isFinite(s.mp)||s.mp<0||
   !Number.isFinite(s.fatigue)||s.fatigue<0||s.fatigue>100)
  throw Error('CHROMA_LEGACY_NUMERIC_STATE_INVALID');
 if(!Array.isArray(s.appliedRewardRefs)||!Array.isArray(s.defeatedTargetRefs))
  throw Error('CHROMA_LEGACY_PROOFS_INVALID');
 if(s.layeredFalnaV4!==undefined || s.crossoverSchema!==undefined)
  throw Error('CHROMA_ALREADY_MIGRATED_OR_PARTIAL_STATE');
 let layeredFalnaV4:FalnaStateV4|null=null;
 let falnaBonus:FiveStats|null=null;
 if(s.falna.blessed){
  if(!s.falna.godId||!Number.isSafeInteger(s.falna.divineLevel)||s.falna.divineLevel<1)
   throw Error('CHROMA_FALNA_BLESSING_INVALID');
  // For a level-two-plus player, require the actual god-verified history.
  if(s.falna.divineLevel>1&&(!historicLayers||historicLayers.length!==s.falna.divineLevel-1))
   throw Error('CHROMA_HISTORICAL_FALNA_LAYER_PROOF_REQUIRED');
  layeredFalnaV4={divineLevel:s.falna.divineLevel,
   current:structuredClone(s.falna.status),sealedLayers:structuredClone(historicLayers??[])};
  const projected=projectFalna(layeredFalnaV4,s.stats);
  falnaBonus=projected.falna;
 }else{
  if(historicLayers?.length)throw Error('CHROMA_UNBLESSED_CANNOT_HAVE_FALNA_HISTORY');
 }
 // Preserve every existing live number. Never implicitly grant level-ups,
 // reward diffs, HP, MP or inventory items during mere schema migration.
 const candidate={...s,crossoverSchema:'chroma_v4_staged' as const,layeredFalnaV4} as ProposedSaveV4<T>;
 return {candidate,falnaBonus,safeToCommit:false,requiresNewResourceRecalibration:true,
  notes:['Preview only; current save and sourceRefs untouched.',
   'Confirm new effective HP/MP by the release runtime without applying healing.',
   'Keep rollback snapshot and enforce revision-checked atomic write.',
   'Never replay old defeatedTargetRefs or award XP for previous kills.']};
}
