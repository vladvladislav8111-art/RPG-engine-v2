/** Read-only, proportional resource migration for Chroma's first v4 load. */
import {projectFalna,type FalnaStateV4,type FiveStats} from './crossover_core.ts';
export type ResourceRebase={
 old:{hp:number;maxHp:number;mp:number;maxMp:number};
 proposed:{hp:number;maxHp:number;mp:number;maxMp:number};
 ratios:{hp:number;mp:number};
 noFreeHealing:true;
 requiresAtomicMigration:true;
};
const valid=(x:number)=>Number.isSafeInteger(x)&&x>=0;
/** This is the current Chroma-specific server approximation, not a canon DanMachi equation. */
export function chromaMaxResources(systemLevel:number,combined:FiveStats){
 if(!Number.isSafeInteger(systemLevel)||systemLevel<1||systemLevel>10000)
  throw Error('REBASE_SYSTEM_LEVEL_INVALID');
 for(const x of Object.values(combined))if(!valid(x))throw Error('REBASE_COMBINED_STATS_INVALID');
 const d=systemLevel-1,e=Math.max(10,combined.stamina);
 const hp=Math.round(100+100*(e-10)+10*d+d*d+
  1.14*Math.max(0,systemLevel-50)*(e-10));
 const mp=Math.max(10,Math.round(10+10*(combined.intelligence-10)+8*d));
 if(!Number.isSafeInteger(hp)||!Number.isSafeInteger(mp)||hp<1||mp<1)
  throw Error('REBASE_RESOURCE_LIMIT_OVERFLOW');
 return {maxHp:hp,maxMp:mp};
}
export function previewResourceRebase(args:{
 systemLevel:number;systemStats:FiveStats;falna:FalnaStateV4|null;
 oldHp:number;oldMaxHp:number;oldMp:number;oldMaxMp:number;
}):ResourceRebase{
 for(const n of [args.oldHp,args.oldMaxHp,args.oldMp,args.oldMaxMp])
  if(!valid(n))throw Error('REBASE_LEGACY_RESOURCE_INVALID');
 if(args.oldMaxHp<1||args.oldMaxMp<1||args.oldHp>args.oldMaxHp||args.oldMp>args.oldMaxMp)
  throw Error('REBASE_LEGACY_RESOURCE_BOUNDS');
 const combined=args.falna?projectFalna(args.falna,args.systemStats).combined:args.systemStats;
 const {maxHp,maxMp}=chromaMaxResources(args.systemLevel,combined);
 const hpRatio=args.oldHp/args.oldMaxHp,mpRatio=args.oldMp/args.oldMaxMp;
 return {old:{hp:args.oldHp,maxHp:args.oldMaxHp,mp:args.oldMp,maxMp:args.oldMaxMp},
  proposed:{hp:Math.min(maxHp,Math.round(maxHp*hpRatio)),maxHp,
   mp:Math.min(maxMp,Math.round(maxMp*mpRatio)),maxMp},
  ratios:{hp:hpRatio,mp:mpRatio},noFreeHealing:true,requiresAtomicMigration:true};
}
