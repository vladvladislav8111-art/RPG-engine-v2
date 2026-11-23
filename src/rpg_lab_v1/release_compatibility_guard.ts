/**
 * Deployment gates for translating historic RPG Lab monster cards into v4.
 * This module is read-only. A legacy card is NOT silently re-leveled: combat
 * force, XP and drop tables must be adopted together in a reviewed release.
 */
import catalog from '../data/monster_adapter_v4.json' with {type:'json'};
import {xpForDefeat} from './crossover_core.ts';

type Card={id:string;name:string;systemLevelMin:number;systemLevelMax:number;
 baseXp:number;baseGold:number;priceMagicStoneValis:number|null;
 canSpawnNaturally:boolean;requiresStoryTrigger:boolean;kind:string;
 floorMin:number|null;origin:string};
const byId=new Map((catalog.monsters as Card[]).map(c=>[c.id,c]));
export type LegacyCard={id:string;systemThreatLevel:number;
 baseXp:number;baseSystemGold:number;magicStoneValis:number;
 hp:number;armor:number;floorMin:number};
export type MigrationConflict={id:string;reason:string;legacy:number|string|null;v4:number|string|null};
export type CompatibilityAudit={compatible:boolean;matched:number;conflicts:MigrationConflict[];
 coverage:{unknownLegacyIds:string[];knownCombatCards:number}};
const fail=(id:string,reason:string,legacy:number|string|null,v4:number|string|null):MigrationConflict=>
 ({id,reason,legacy,v4});
export function auditLegacyMonsters(cards:readonly LegacyCard[]):CompatibilityAudit{
 const conflicts:MigrationConflict[]=[];
 const unknownLegacyIds:string[]=[];
 const seen=new Set<string>();
 for(const m of cards){
  if(seen.has(m.id)){conflicts.push(fail(m.id,'duplicate_legacy_id',m.id,null));continue;}
  seen.add(m.id);
  const c=byId.get(m.id);
  if(!c){unknownLegacyIds.push(m.id);conflicts.push(fail(m.id,'missing_v4_card',m.id,null));continue;}
  if(m.systemThreatLevel<c.systemLevelMin||m.systemThreatLevel>c.systemLevelMax)
   conflicts.push(fail(m.id,'threat_level_range',m.systemThreatLevel,
    `${c.systemLevelMin}-${c.systemLevelMax}`));
  if(m.baseXp!==c.baseXp)
   conflicts.push(fail(m.id,'xp_base',m.baseXp,c.baseXp));
  if(m.magicStoneValis!==c.priceMagicStoneValis)
   conflicts.push(fail(m.id,'stone_value',m.magicStoneValis,c.priceMagicStoneValis));
  if(m.floorMin<c.floorMin! && c.canSpawnNaturally)
   conflicts.push(fail(m.id,'floor_min',m.floorMin,c.floorMin));
 }
 return {compatible:conflicts.length===0,matched:seen.size-unknownLegacyIds.length,
  conflicts,coverage:{unknownLegacyIds,knownCombatCards:byId.size}};
}
/** A new catalog card can earn *more* XP, but only if combat strength is also updated. */
export function readProjectedMonsterReward(monsterId:string,level:number,playerLevel:number){
 const c=byId.get(monsterId);
 if(!c)throw Error('V4_MONSTER_MISSING');
 if(!Number.isSafeInteger(level)||level<c.systemLevelMin||level>c.systemLevelMax)
  throw Error('V4_LEVEL_OUTSIDE_CARD');
 return {xp:xpForDefeat(c.baseXp,level,playerLevel),systemGold:c.baseGold,
  potentialStoneValis:c.priceMagicStoneValis,
  titleOrRuneSource:!!(catalog.monsters as Array<{id:string;rune:unknown}>).find(x=>x.id===monsterId)?.rune};
}
/** Enforce explicit campaign identity at every production adapter boundary. */
export function checkCampaignIdentity(args:{projectId:string;sessionId:string;
 packProjectId:string;sessionProjectId:string;heroId:string}){
 const ok=/^[A-Za-z0-9_-]{3,64}$/;
 if(!ok.test(args.projectId)||!ok.test(args.sessionId)||
   args.projectId!==args.packProjectId||args.projectId!==args.sessionProjectId||
   args.heroId!=='hero.chroma') throw Error('V4_WRONG_CAMPAIGN_OR_PLAYER');
 return true;
}
