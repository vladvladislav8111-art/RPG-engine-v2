/** The Player's intact magic-stone shadow imprint rule.
 *
 * Crossover-specific: DanMachi stones represent the defeated monster's body
 * template ONLY for a Shadow-Class Player. One stone => either one shadow OR
 * a local-valis sale. No shadow before Job Change, no shattered-stone imprint,
 * and all sources must be committed before runtime usage.
 */
import type {JinwooMagicStone,JinwooShadow,JinwooState} from
 "./shadow_monarch_rules.ts";
import {shadowCapacity} from "./shadow_monarch_rules.ts";
const valid=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
const clone=(s:JinwooState)=>structuredClone(s);
function gate(s:JinwooState,sourceRef:string){
 if(!valid(sourceRef)||s.appliedRewardRefs.includes(sourceRef))
  throw Error("PLAYER_MAGIC_STONE_DUPLICATE_EVENT");
}
export type AcquiredStone={
 sourceRef:string;stoneId:string;monsterRef:string;monsterName:string;
 confirmedLoot:boolean;intact:boolean;powerRating:number;
 powerTier:JinwooShadow["powerTier"];guildValueValis:number;
 corruptedMana:boolean;
};
export function addConfirmedMagicStone(s:JinwooState,e:AcquiredStone):JinwooState{
 gate(s,e.sourceRef);
 if(!e.confirmedLoot||!e.intact||!valid(e.stoneId)||!valid(e.monsterRef)||
  !s.defeatedTargetRefs.includes(e.monsterRef)||!e.monsterName.trim()||
  !Number.isSafeInteger(e.powerRating)||e.powerRating<1||e.powerRating>10000||
  !Number.isSafeInteger(e.guildValueValis)||e.guildValueValis<1||
  e.guildValueValis>10000000||!!s.magicStones[e.stoneId]||
  Object.values(s.magicStones).some(v=>v.monsterRef===e.monsterRef)||
  s.shadowRoster.some(sh=>sh.id===e.monsterRef)||
  Object.keys(s.magicStones).length>=500)
  throw Error("PLAYER_MAGIC_STONE_LOOT_NOT_VERIFIED");
 const n=clone(s);
 n.magicStones[e.stoneId]={
  id:e.stoneId,monsterRef:e.monsterRef,monsterName:e.monsterName,
  kind:"monster",powerRating:e.powerRating,
  powerTier:e.powerTier,guildValueValis:e.guildValueValis,
  corruptedMana:e.corruptedMana,intact:true,state:"held",
  collectedRef:e.sourceRef,
 } as JinwooMagicStone;
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function sellConfirmedMagicStone(s:JinwooState,e:{
 sourceRef:string;stoneId:string;confirmedGuildExchange:boolean;
}):JinwooState{
 gate(s,e.sourceRef);
 const stone=s.magicStones[e.stoneId];
 if(!stone||stone.state!=="held"||!stone.intact||
  !e.confirmedGuildExchange)
  throw Error("PLAYER_MAGIC_STONE_SALE_NOT_VERIFIED");
 const n=clone(s);n.magicStones[e.stoneId].state="sold";
 n.valis+=stone.guildValueValis;
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export type MagicStoneExtraction={
 sourceRef:string;stoneId:string;roll:number;
 confirmedShadowCommand:boolean;
};
export type MagicStoneExtractionResult={
 next:JinwooState;success:boolean;
 reason?:"corrupted_mana"|"beyond_current_power"|"no_army_capacity"|
  "three_attempts_expended"|"chance_failed";
 chance:number;stoneConsumed:boolean;
};
export function extractShadowFromMagicStone(s:JinwooState,
 e:MagicStoneExtraction):MagicStoneExtractionResult{
 gate(s,e.sourceRef);
 if(s.phase==="player_system"||
  !s.unlockedSkills.includes("shadow_extraction"))
  throw Error("PLAYER_SHADOW_CLASS_REQUIRED");
 if(!e.confirmedShadowCommand||!Number.isSafeInteger(e.roll)||
  e.roll<1||e.roll>100||!valid(e.stoneId))
  throw Error("PLAYER_SHADOW_ATTEMPT_NOT_VERIFIED");
 const stone=s.magicStones[e.stoneId];
 if(!stone||stone.state!=="held"||!stone.intact)
  throw Error("PLAYER_MAGIC_STONE_INTACT_REQUIRED");
 if(s.shadowRoster.some(x=>x.id===stone.monsterRef))
  throw Error("PLAYER_SHADOW_ALREADY_REGISTERED");
 const attempts=s.extractionAttempts[stone.monsterRef]??0;
 if(attempts>=3)return {next:s,success:false,
  reason:"three_attempts_expended",chance:0,stoneConsumed:false};
 const cap=shadowCapacity(s);
 const n=clone(s);
 n.extractionAttempts[stone.monsterRef]=attempts+1;
 n.appliedRewardRefs.push(e.sourceRef);
 const relative=stone.powerRating/Math.max(1,s.systemLevel);
 const chance=relative<=0.6?90:relative<=1.1?65:relative<=1.75?25:0;
 const reason=stone.corruptedMana?"corrupted_mana":
  relative>1.75?"beyond_current_power":
  n.shadowRoster.length>=cap?"no_army_capacity":
  e.roll>chance?"chance_failed":undefined;
 if(reason)return {next:n,success:false,reason,chance,stoneConsumed:false};
 n.shadowRoster.push({
  id:stone.monsterRef,name:stone.monsterName,
  originRef:e.sourceRef,originalKind:"monster",
  powerTier:stone.powerTier,defeatedCount:0,stored:true
 });
 n.magicStones[e.stoneId].state="consumed_by_shadow";
 return {next:n,success:true,chance,stoneConsumed:true};
}
export function playerStoneLedger(s:JinwooState){
 return Object.values(s.magicStones).map(x=>({
  stoneId:x.id,monster:x.monsterName,state:x.state,
  canAttempt:x.state==="held"&&x.intact&&
   (s.extractionAttempts[x.monsterRef]??0)<3&&
   s.phase!=="player_system"&&s.unlockedSkills.includes("shadow_extraction"),
  guildValis:x.state==="held"?x.guildValueValis:0
 }));
}
