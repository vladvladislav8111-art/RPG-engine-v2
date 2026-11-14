/**
 * DanMachi-derived table-driven exploration proposals.
 * No combat damage or action decisions, no writes, no authoritative random grants.
 * Every check describes a *possible* scene, never a guaranteed spawned enemy.
 */
import type {LabPack} from "./engine.ts";
export type LabEncounterProfile={
 floor:number;region:string;monsterChance:number;adventurerChance:number;
 fightingChance:number;strayChance:number;birthWindowMin:number;birthWindowMax:number;
 densityTier:string;specialRule:string;
};
export type LabMonster={
 name:string;floorMin:number;floorMax:number;origin:"C"|"A"|"H";
 rarity:"обычный"|"редкий"|"босс";lootTableId?:string;
 note?:string;
};
type Req=Record<string,unknown>;
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const num=(v:unknown,min:number,max:number,label:string)=>{
 if(typeof v!=="number"||!Number.isFinite(v)||v<min||v>max)throw Error(label);return v;
};
const id=(v:unknown)=>{if(typeof v!=="string"||!ID.test(v))throw Error("LAB_DUNGEON_ID_INVALID");return v;};
export function validateEncounterProfile(p:LabEncounterProfile):void{
 if(!obj(p))throw Error("LAB_DUNGEON_PROFILE_INVALID");
 if(!Number.isInteger(num(p.floor,1,100,"LAB_DUNGEON_FLOOR_INVALID")))throw Error("LAB_DUNGEON_FLOOR_INTEGER");
 for(const name of ["monsterChance","adventurerChance","fightingChance","strayChance"] as const)
  num(p[name],0,1,"LAB_DUNGEON_CHANCE_INVALID");
 num(p.birthWindowMin,0,10080,"LAB_DUNGEON_BIRTH_INVALID");
 num(p.birthWindowMax,p.birthWindowMin,10080,"LAB_DUNGEON_BIRTH_INVALID");
 for(const str of [p.region,p.densityTier,p.specialRule])
  if(typeof str!=="string"||str.length>400)throw Error("LAB_DUNGEON_TEXT_INVALID");
 if([18,28,39,50].includes(p.floor)&&p.monsterChance!==0)
  throw Error("LAB_DUNGEON_SAFE_FLOOR_SPAWN");
 if([18,28,39,50].includes(p.floor)&&p.birthWindowMax!==0)
  throw Error("LAB_DUNGEON_SAFE_FLOOR_BIRTH");
}
export function validateMonster(m:LabMonster):void{
 if(!obj(m)||typeof m.name!=="string"||m.name.length<1||m.name.length>150)
  throw Error("LAB_MONSTER_INVALID");
 num(m.floorMin,1,100,"LAB_MONSTER_FLOOR");
 num(m.floorMax,m.floorMin,100,"LAB_MONSTER_FLOOR");
 if(!Number.isInteger(m.floorMin)||!Number.isInteger(m.floorMax))throw Error("LAB_MONSTER_FLOOR");
 if(!["C","A","H"].includes(m.origin)||!["обычный","редкий","босс"].includes(m.rarity))
  throw Error("LAB_MONSTER_CLASSIFICATION");
 if(m.lootTableId!==undefined)id(m.lootTableId);
 if(m.note!==undefined&&(typeof m.note!=="string"||m.note.length>300))throw Error("LAB_MONSTER_NOTE");
}
function seedHash(s:string):number{
 let h=2166136261>>>0;
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
 return h>>>0;
}
function rngFor(seed:string):()=>number{
 let x=seedHash(seed)||0x9e3779b9;
 return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};
}
const overTime=(chance:number,minutes:number)=>Math.min(0.999,1-Math.pow(1-chance,minutes/10));
const round=(n:number)=>Math.round(n*1e6)/1e6;
const weights=(r:LabMonster["rarity"])=>r==="редкий"?0.08:r==="обычный"?1:0;
export function previewDungeonExplore(pack:LabPack,raw:Req){
 const floor=num(raw.floor,1,50,"LAB_DUNGEON_FLOOR_INVALID");
 if(!Number.isInteger(floor))throw Error("LAB_DUNGEON_FLOOR_INTEGER");
 const floorId="dungeon_f"+String(floor).padStart(2,"0");
 const profile=pack.encounterProfiles?.[floorId];
 if(!profile)throw Error("LAB_DUNGEON_PROFILE_MISSING");
 const eventId=id(raw.eventId),seed=raw.seed;
 if(typeof seed!=="string"||seed.length<1||seed.length>180)throw Error("LAB_DUNGEON_SEED_INVALID");
 const minutes=num(raw.minutes??10,1,60,"LAB_DUNGEON_MINUTES_INVALID");
 const noise=num(raw.noiseFactor??1,0,3,"LAB_DUNGEON_NOISE_INVALID");
 const traffic=num(raw.trafficFactor??1,0,3,"LAB_DUNGEON_TRAFFIC_INVALID");
 if(raw.allowHomebrew!==undefined&&typeof raw.allowHomebrew!=="boolean")throw Error("LAB_DUNGEON_HOMEBREW_FLAG");
 const excluded=raw.excludeMonsterIds??[];
 if(!Array.isArray(excluded)||excluded.length>100||excluded.some(e=>typeof e!=="string"||!ID.test(e)))
  throw Error("LAB_DUNGEON_EXCLUSIONS_INVALID");
 const safe=[18,28,39,50].includes(floor);
 const localChance=overTime(Math.min(0.99,profile.monsterChance*noise),minutes);
 const strayChance=safe?overTime(profile.strayChance,minutes):0;
 const advChance=overTime(Math.min(0.99,profile.adventurerChance*traffic),minutes);
 const random=rngFor(pack.projectId+"|"+eventId+"|"+seed+"|"+floor);
 // Fixed draw order makes prediction reproducible, not an authoritative in-game event.
 const monsterPresent=(!safe&&random()<localChance)||(safe&&random()<strayChance);
 const adventurersPresent=random()<advChance;
 const adventurersFighting=adventurersPresent&&random()<profile.fightingChance;
 const allowHomebrew=raw.allowHomebrew===true;
 const candidates=Object.entries(pack.bestiary??{})
  .filter(([mid,m])=>!excluded.includes(mid)&&m.floorMin<=floor&&floor<=m.floorMax&&
    m.rarity!=="босс"&&(allowHomebrew||m.origin!=="H")&&weights(m.rarity)>0)
  .sort(([a],[b])=>a.localeCompare(b));
 // No invented species when a floor has no documented candidate.
 const total=candidates.reduce((sum,[,m])=>sum+weights(m.rarity),0);
 let chosen:null|{monsterId:string;name:string;rarity:string;origin:string;lootTableId:string|null}=null;
 if(monsterPresent&&total>0){
  let roll=random()*total;
  const entry=candidates.find(([,m])=>(roll-=weights(m.rarity))<0)??candidates[candidates.length-1];
  chosen={monsterId:entry[0],name:entry[1].name,rarity:entry[1].rarity,
    origin:entry[1].origin,lootTableId:entry[1].lootTableId??null};
 }
 return {eventId,floor,floorId,region:profile.region,intervalMinutes:minutes,safeFloor:safe,
  rollsArePreviewOnly:true,authoritativeRng:false,noSpawnCommitted:true,noNpcActionCommitted:true,
  requiresGMSceneInterpretation:true,
  encounterProbabilities:{monster:round(safe?strayChance:localChance),adventurer:round(advChance),
   adventurerAlreadyFightingConditional:profile.fightingChance},
  monsterEvidenceCandidate:monsterPresent?(chosen??{monsterId:null,unresolvedReason:"NO_ELIGIBLE_SPECIES"}):null,
  otherExpeditionCandidate:adventurersPresent?
   {alreadyFighting:adventurersFighting,identity:"UNDETERMINED",agency:"INDEPENDENT"}:null,
  birthWindowMinutes:safe?null:{min:profile.birthWindowMin,max:profile.birthWindowMax},
  specialRule:profile.specialRule,legacySaveTouched:false};
}
