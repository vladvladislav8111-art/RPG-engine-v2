/** v4 authoritative monster adapter. Only the GM event writer may provide proof refs.
 * Reads the agreed 156-entry bloat-safe catalog; 21 story-only entities remain excluded.
 * Produces a source-driven combat profile, never accepting client-defined HP or XP.
 */
import catalog from '../data/monster_adapter_v4.json' with {type:'json'};

type CatalogCard = {
 id:string; name:string; origin:string;kind:string;
 systemLevelMin:number;systemLevelMax:number;baseXp:number;baseGold:number;
 priceMagicStoneValis:number|null;canSpawnNaturally:boolean;
 requiresStoryTrigger:boolean;floorRanges:number[][];floorMin:number|null;
 hp?:number; tactics?:string[];
};
type Five={strength:number;stamina:number;agility:number;perception:number;intelligence:number};
export type LiveMonsterCard={id:string;name:string;floorMin:number;floorMax:number;
 approximateDanmachiLevel:number;systemThreatLevel:number;
 kind:'ordinary'|'elite'|'rare'|'monster_rex';combat:Five;
 hp:number;armor:number;weaponForce:number;baseXp:number;baseSystemGold:number;
 magicStoneValis:number;features:string[];loreNote:string;
 v4FloorRanges:number[][];v4RequiresStoryTrigger:boolean;
 v4Origin:string;};
const map=new Map<string,CatalogCard>((catalog.monsters as CatalogCard[]).map(c=>[c.id,c]));
const id=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
const safeInt=(n:number)=>Number.isSafeInteger(n)&&n>=0;
function integerHash(input:string):number {
 let h=2166136261>>>0;for(const ch of input){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
 return h>>>0;
}
const tier=(c:CatalogCard):LiveMonsterCard['kind']=>
 c.kind==='босс'||c.kind==='легенда'?'monster_rex':
 c.kind==='элитный'||c.kind==='опасный'?'elite':
 c.kind==='редкий'||c.kind==='особый'?'rare':'ordinary';
export function listV4CombatCards(){return [...map.keys()];}
export function getV4MonsterCard(id0:string){return map.get(id0)??null;}
export function adaptMonsterForV4(args:{monsterId:string;eventProofRef:string;
 floor:number|null;mode:'natural'|'scripted'|'system_instance';
 confirmedStoryTrigger:boolean;}):LiveMonsterCard{
 const c=map.get(args.monsterId);
 if(!c)throw Error('V4_MONSTER_NOT_IN_COMBAT_CATALOG');
 if(!id(args.eventProofRef))throw Error('V4_MONSTER_PROOF_REF_INVALID');
 if(args.mode==='natural'){
  if(!c.canSpawnNaturally||c.requiresStoryTrigger||c.origin==='Solo Leveling')
   throw Error('V4_MONSTER_NATURAL_SPAWN_FORBIDDEN');
  if(!safeInt(args.floor!)||args.floor!<1||
     !c.floorRanges.some(r=>args.floor!>=r[0]&&args.floor!<=r[1]))
   throw Error('V4_MONSTER_FLOOR_NOT_AVAILABLE');
 }else if(args.mode==='system_instance'){
  if(c.origin!=='Solo Leveling'||!args.confirmedStoryTrigger)
   throw Error('V4_MONSTER_SYSTEM_INSTANCE_PROOF_REQUIRED');
 }else if(args.mode==='scripted'){
  if(c.origin==='Solo Leveling'||!args.confirmedStoryTrigger)
   throw Error('V4_MONSTER_SCRIPTED_PROOF_REQUIRED');
 }else throw Error('V4_MONSTER_SPAWN_MODE_INVALID');
 const gap=c.systemLevelMax-c.systemLevelMin;
 if(!safeInt(gap)||gap>1000||!safeInt(c.systemLevelMin)||c.systemLevelMin<1)
  throw Error('V4_MONSTER_LEVEL_CATALOG_INVALID');
 // An immutable event proof determines the actual member of the level range.
 const level=c.systemLevelMin+integerHash(args.eventProofRef+'|'+c.id)%(gap+1);
 const category=tier(c), boss=category==='monster_rex';
 const inferredHp=Math.round((45+6*level+1.3*level*level)*(boss?2.5:category==='elite'?1.3:1));
 const hp=c.hp??inferredHp;
 if(!safeInt(hp)||hp<1||!safeInt(c.baseXp)||c.baseXp<1||
    !safeInt(c.baseGold)||!safeInt(c.priceMagicStoneValis??0))
  throw Error('V4_MONSTER_INVALID_STATS');
 const factor=category==='monster_rex'?1.65:category==='elite'?1.2:1;
 const combat:Five={
  strength:Math.max(1,Math.round((7+level*2.2)*factor)),
  stamina:Math.max(1,Math.round((7+level*2.3)*factor)),
  agility:Math.max(1,Math.round((7+level*1.8)*(boss?1.05:1))),
  perception:Math.max(1,Math.round(5+level*1.4)),
  intelligence:Math.max(1,Math.round(1+level*.35)),
 };
 return {id:c.id,name:c.name,
  floorMin:c.floorRanges.reduce((v,r)=>Math.min(v,r[0]),100),
  floorMax:c.floorRanges.reduce((v,r)=>Math.max(v,r[1]),0),
  approximateDanmachiLevel:Math.max(1,Math.ceil(level/12)),
  systemThreatLevel:level,kind:category,combat,hp,
  armor:Math.max(0,Math.round(level*.75*(boss?1.3:1))),
  weaponForce:Math.max(1,Math.round(level*.9*(boss?1.5:1))),
  baseXp:c.baseXp,baseSystemGold:c.baseGold,
  magicStoneValis:c.priceMagicStoneValis??0,
  features:[...(c.tactics??[])],loreNote:'DanMachi × Solo Leveling v4: проектная числовая модель',
  v4FloorRanges:c.floorRanges.map(x=>[...x]),
  v4RequiresStoryTrigger:c.requiresStoryTrigger,
  v4Origin:c.origin};
}
