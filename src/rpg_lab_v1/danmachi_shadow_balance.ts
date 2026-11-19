/** Battle rank, growth and resource accounting for DanMachi-acquired shadows.
 * Preserve Solo Leveling's qualitative strengths: loyalty, independent orders,
 * limited class storage, regeneration conditional on Monarch's mana, and strong
 * named veterans. No arbitrary continuous MP upkeep for merely existing.
 * All rank thresholds and numbers below are campaign house rules.
 */
import type {JinwooShadow,JinwooState} from "./shadow_monarch_rules.ts";
import {shadowCapacity,projectJinwooFalna,resurrectJinwooShadow} from
 "./shadow_monarch_rules.ts";
import {ORARIO_MONSTER_BY_ID} from "./danmachi_player_balance.ts";
export type ShadowRank=JinwooShadow["powerTier"];
const RANKS:readonly ShadowRank[]=[
 "common","elite","knight","commander","marshal"
];
const rankN=(r:ShadowRank)=>RANKS.indexOf(r);
export const SHADOW_BALANCE_PRESET={
 id:"danmachi.shadow.army.v1",
 noPassiveSummonUpkeep:true,
 lossOfBodyNotPermanentWhileManaAvailable:true,
 cannotBypassNoShadowSource:true,
 promotionalVictoryCounts:[8,24,70,180],
 maximumArmyOnlyAfterActualSuccession:true,
 specialKnightHasOwnOrigin:true,
 namedShadowsDoNotAutoImport:true
} as const;
const valid=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
export function shadowRevivalMpCost(rank:ShadowRank,phase:JinwooState["phase"]):number{
 const cost:Record<ShadowRank,number>={
  common:8,elite:18,knight:45,commander:120,marshal:300
 };
 if(phase==="true_monarch")return Math.max(1,Math.ceil(cost[rank]*.35));
 return cost[rank];
}
export function shadowRankUpgradeThreshold(shadow:JinwooShadow):number|null{
 const i=rankN(shadow.powerTier);
 return i>=0&&i<SHADOW_BALANCE_PRESET.promotionalVictoryCounts.length?
  SHADOW_BALANCE_PRESET.promotionalVictoryCounts[i]:null;
}
export function previewArmyBalance(s:JinwooState){
 const cap=shadowCapacity(s);
 const byRank=Object.fromEntries(RANKS.map(rank=>[
  rank,s.shadowRoster.filter(sh=>sh.powerTier===rank).length])) as Record<ShadowRank,number>;
 return {
  phase:s.phase,roster:s.shadowRoster.length,capacity:cap,
  slotsRemaining:Math.max(0,cap-s.shadowRoster.length),byRank,
  regenerationHasManaCost:true,passiveStorageManaPerMinute:0,
  namedSoldiers:s.shadowRoster.filter(sh=>sh.name&&sh.powerTier!=="common")
    .map(sh=>({id:sh.id,name:sh.name,rank:sh.powerTier})),
  withoutVerifiedSourcesNoGrowth:true,readOnly:true
 };
}
export function previewShadowCombatStrength(s:JinwooState,input:{
 shadowId:string;verifiedMonsterTemplateId?:string;
}){
 const sh=s.shadowRoster.find(sh=>sh.id===input.shadowId);
 if(!sh)throw Error("BALANCE_SHADOW_NOT_OWNED");
 const mob=input.verifiedMonsterTemplateId?
  ORARIO_MONSTER_BY_ID[input.verifiedMonsterTemplateId]:undefined;
 if(input.verifiedMonsterTemplateId&&!mob)
  throw Error("BALANCE_SHADOW_ORIGIN_UNKNOWN");
 const rankScale=[.75,.9,1.05,1.3,1.7][rankN(sh.powerTier)]??.75;
 const sovereign=s.phase==="true_monarch"?1.2:1;
 const domain=s.unlockedSkills.includes("monarch_domain")?1.5:1;
 // The Domain multiplier is POTENTIAL only; it requires a confirmed active
 // ability and MP in battle. Never silently apply it to every soldier.
 const physical=mob?{
  attack:Math.round(mob.combat.strength*rankScale*sovereign),
  guard:Math.round(mob.combat.stamina*rankScale*sovereign),
  agility:Math.round(mob.combat.agility*rankScale*sovereign)
 }:null;
 return {shadowId:sh.id,rank:sh.powerTier,
  physicalIfOriginVerified:physical,
  potentialDomainMultiplier:domain,
  domainActive:false,
  manaPerMinuteWhenSimplySummoned:0,
  revivalMpIfDestroyed:shadowRevivalMpCost(sh.powerTier,s.phase),
  sourceRequired:true,readOnly:true};
}
export function previewShadowOrder(s:JinwooState,e:{
 shadowIds:string[];action:"guard"|"attack"|"scout"|"escort"|"return"|"hold";
 confirmedLocationRef?:string;
}){
 if(!Array.isArray(e.shadowIds)||e.shadowIds.length<1||
  e.shadowIds.length>shadowCapacity(s)||new Set(e.shadowIds).size!==e.shadowIds.length)
  throw Error("BALANCE_SHADOW_ORDER_INVALID");
 for(const id of e.shadowIds)
  if(!s.shadowRoster.some(x=>x.id===id))throw Error("BALANCE_SHADOW_NOT_OWNED");
 if(["scout","escort"].includes(e.action)&&
  !valid(e.confirmedLocationRef??""))
  throw Error("BALANCE_SHADOW_LOCATION_REQUIRED");
 return {soldierCount:e.shadowIds.length,action:e.action,
  noAutomaticSuccess:true,independentNPCReactionRequired:true,
  needsConfirmedTravelAndCombatEvents:true,storedArmyUnchanged:true,
  noContinuousManaUpkeep:true,readOnly:true};
}
export function recordShadowVerifiedVictory(s:JinwooState,e:{
 sourceRef:string;shadowId:string;targetRef:string;
 contributedToConfirmedKill:boolean;confirmedChallengeWorthXp:boolean;
 commanderFeatRef?:string;
}):JinwooState{
 if(!e.contributedToConfirmedKill||!e.confirmedChallengeWorthXp||
  !valid(e.sourceRef)||!valid(e.targetRef)||
  s.appliedRewardRefs.includes(e.sourceRef)||
  !s.defeatedTargetRefs.includes(e.targetRef))
  throw Error("BALANCE_SHADOW_VICTORY_NOT_CONFIRMED");
 const sh=s.shadowRoster.find(x=>x.id===e.shadowId);
 if(!sh)throw Error("BALANCE_SHADOW_NOT_OWNED");
 if((sh.victoryRefs??[]).includes(e.targetRef))
  throw Error("BALANCE_SHADOW_DUPLICATE_VICTORY");
 const n=structuredClone(s);
 const own=n.shadowRoster.find(x=>x.id===e.shadowId)!;
 own.victoryRefs=[...(own.victoryRefs??[]),e.targetRef];
 own.victories=(own.victories??0)+1;
 const need=shadowRankUpgradeThreshold(own);
 const nextRank=RANKS[rankN(own.powerTier)+1];
 const highRank=rankN(own.powerTier)>=2;
 const storyGate=highRank?!!e.commanderFeatRef&&
  n.storyFlags.includes(e.commanderFeatRef):true;
 if(need!==null&&own.victories>=need&&nextRank&&storyGate)
  own.powerTier=nextRank;
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
export function recoverShadowWithBalancedMana(s:JinwooState,e:{
 sourceRef:string;shadowId:string;confirmedBodyDestroyed:boolean;
}):JinwooState{
 const sh=s.shadowRoster.find(x=>x.id===e.shadowId);
 if(!sh)throw Error("BALANCE_SHADOW_NOT_OWNED");
 const cost=shadowRevivalMpCost(sh.powerTier,s.phase);
 return resurrectJinwooShadow(s,{
  sourceRef:e.sourceRef,shadowId:e.shadowId,
  confirmedDefeat:e.confirmedBodyDestroyed,manaCost:cost
 });
}
export function previewMonarchDomain(s:JinwooState,e:{
 confirmedActive:boolean;durationMinutes:number;
}){
 if(!s.unlockedSkills.includes("monarch_domain")||
  !e.confirmedActive||!Number.isSafeInteger(e.durationMinutes)||
  e.durationMinutes<1||e.durationMinutes>60)
  throw Error("BALANCE_DOMAIN_LOCKED_OR_NOT_ACTIVATED");
 // Strength buff is canon concept; precise +50% and maintenance are house values.
 const mpCost=Math.ceil(e.durationMinutes*
  (2+Math.ceil(s.shadowRoster.length/25)));
 return {damageScale:1.5,mpCost,possible:s.mp>=mpCost,
  noAutomaticCombatOutcome:true,notAppliedUnlessCommitted:true};
}
