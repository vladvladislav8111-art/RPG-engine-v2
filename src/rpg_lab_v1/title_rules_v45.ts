/** Chroma v4.5 verified titles. Exactly one equipped title changes combat.
 * A title can grant a temporary ability but does not permanently unlock it.
 * The noncombat Floor Breaker entitlement remains passive when unequipped.
 */
import type {SystemPlayer} from './crossover_core.ts';
export const TITLE_DEFS={
 wolf_slayer:{name:'Охотник на волков',condition:'10 unique system wolves',category:'hunt'},
 nest_breaker:{name:'Разоритель ульев',condition:'hive: 30 unique ants + queen + nest',category:'challenge'},
 unbroken:{name:'Несломленный',condition:'three critical-hp victories, no self-harm',category:'survival'},
 silent_path:{name:'Тихая поступь',condition:'silent floor challenge clear',category:'challenge'},
 giant_feller:{name:'Победитель великанов',condition:'giant boss +15 threat solo win',category:'hunt'},
 counterhunter:{name:'Охотник за охотниками',condition:'30 distinct ambush counterwins',category:'challenge'},
 shellbreaker:{name:'Ломатель панцирей',condition:'100 armored monster defeats incl elite',category:'hunt'},
 dungeon_survivor:{name:'Выстоявший в глубине',condition:'survive special deep-floor instance',category:'challenge'},
 floor_breaker:{name:'Покоритель этажа',condition:'confirmed boss kill + instance proof',category:'access'},
} as const;
export type TitleId=keyof typeof TITLE_DEFS;
export type TitleTargetFacts={tags:string[];weakPointConfirmed:boolean;
 jointStrikeConfirmed:boolean;physicalAttack:boolean;};
export type TitleImpact={titleId:TitleId|null;statMultiplier:number;
 physicalDamageMultiplier:number;armorIgnoreFraction:number;attackTempoMultiplier:number;
 detectHiveSignal:boolean;warnAmbushWithinMeters:number;freeSystemInstanceAccess:boolean;};
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const copied=<T>(x:T):T=>structuredClone(x);
const matches=(player:SystemPlayer):TitleId|null=>{
 if(!player.activeTitle)return null;
 if(!Object.hasOwn(TITLE_DEFS,player.activeTitle)||
    !player.titleIds.includes(player.activeTitle))throw Error('TITLE_ACTIVE_NOT_OWNED');
 return player.activeTitle as TitleId;
};
export function grantVerifiedTitle(player:SystemPlayer,e:{titleId:TitleId;
 sourceRef:string;proofRef:string},host:{verifyTitleClear:(titleId:TitleId,proofRef:string)=>boolean}):SystemPlayer{
 if(!Object.hasOwn(TITLE_DEFS,e.titleId)||!ID.test(e.sourceRef)||
    !ID.test(e.proofRef)||e.sourceRef===e.proofRef||
    player.confirmedRewardRefs.includes(e.sourceRef)||player.titleIds.includes(e.titleId)||
    !host.verifyTitleClear(e.titleId,e.proofRef))
  throw Error('TITLE_EVIDENCE_NOT_VERIFIED_OR_DUPLICATE');
 const n=copied(player);n.titleIds.push(e.titleId);n.confirmedRewardRefs.push(e.sourceRef);return n;
}
export function equipVerifiedTitle(player:SystemPlayer,titleId:TitleId|null):SystemPlayer{
 if(titleId!==null&&(titleId==='floor_breaker'||
  !Object.hasOwn(TITLE_DEFS,titleId)||!player.titleIds.includes(titleId)))
  throw Error('TITLE_NOT_EQUIPPABLE_OR_OWNED');
 const n=copied(player);n.activeTitle=titleId;return n;
}
/** Multipliers are scoped to recorded monster traits and target hit facts. */
export function activeTitleImpact(player:SystemPlayer,facts:TitleTargetFacts):TitleImpact{
 const id=matches(player);
 const impact:TitleImpact={titleId:id,statMultiplier:1,physicalDamageMultiplier:1,
  armorIgnoreFraction:0,attackTempoMultiplier:1,detectHiveSignal:false,
  warnAmbushWithinMeters:0,freeSystemInstanceAccess:player.titleIds.includes('floor_breaker')};
 if(!id)return impact;
 switch(id){
  case 'wolf_slayer':
   if(facts.tags.includes('beast'))impact.statMultiplier=1.4;
   break;
  case 'nest_breaker':
   impact.detectHiveSignal=true;
   if(facts.jointStrikeConfirmed&&facts.tags.includes('chitin'))impact.attackTempoMultiplier=1.3;
   break;
  case 'giant_feller':
   if(facts.tags.includes('giant')&&facts.weakPointConfirmed&&facts.physicalAttack)
    impact.physicalDamageMultiplier=1.35;
   break;
  case 'counterhunter':impact.warnAmbushWithinMeters=5;break;
  case 'shellbreaker':
   if(facts.jointStrikeConfirmed&&facts.physicalAttack&&
     (facts.tags.includes('chitin')||facts.tags.includes('crystal')||facts.tags.includes('armor')))
    impact.armorIgnoreFraction=.3;
   break;
 }
 return impact;
}
export type TitleActiveAbility='tenacity_critical_hp'|'silent_steps'|'combat_composure'|'ambush_warning';
export type TitleCombatLedger={battleId:string;spentAbilityKeys:string[];
 activeUntil:Record<string,number>;appliedSourceRefs:string[];};
/** Title-granted skills cannot be used when the title is not currently equipped. */
export function activateTitleAbility(player:SystemPlayer,ledger:TitleCombatLedger,e:{
 sourceRef:string;proofRef:string;ability:TitleActiveAbility;nowSecond:number;
 currentHp:number;maxHp:number;isPhysicalDamage?:boolean;incomingDamage?:number;
 threatDistanceMeters?:number;ambushConfirmed?:boolean;
 },host:{verifyEventProof:(proofRef:string,ability:TitleActiveAbility)=>boolean}){
 const id=matches(player);
 const grants:Partial<Record<TitleId,TitleActiveAbility>>={
  unbroken:'tenacity_critical_hp',silent_path:'silent_steps',
  dungeon_survivor:'combat_composure',counterhunter:'ambush_warning'};
 if(!id||grants[id]!==e.ability||!ID.test(e.sourceRef)||!ID.test(e.proofRef)||
   e.proofRef===e.sourceRef||ledger.appliedSourceRefs.includes(e.sourceRef)||
   !Number.isSafeInteger(e.nowSecond)||e.nowSecond<0||
   !host.verifyEventProof(e.proofRef,e.ability))throw Error('TITLE_ABILITY_NOT_PROVEN');
 const n=copied(player),l=copied(ledger);
 let damagePrevented=0,mpCost=0,durationSeconds=0;
 if(e.ability==='tenacity_critical_hp'){
  if(!e.isPhysicalDamage||!Number.isSafeInteger(e.incomingDamage)||(e.incomingDamage??0)<1||
     !Number.isSafeInteger(e.currentHp)||!Number.isSafeInteger(e.maxHp)||
     e.maxHp<1||e.currentHp<0||e.currentHp>e.maxHp||e.currentHp/e.maxHp>=.2||
     l.spentAbilityKeys.includes('tenacity_critical_hp'))
    throw Error('TITLE_TENACITY_NOT_AVAILABLE');
  damagePrevented=Math.round((e.incomingDamage??0)*.35);
  l.spentAbilityKeys.push('tenacity_critical_hp');
 }else if(e.ability==='ambush_warning'){
  if(e.ambushConfirmed!==true||typeof e.threatDistanceMeters!=='number'||
    e.threatDistanceMeters<0||e.threatDistanceMeters>5)
   throw Error('TITLE_AMBUSH_OUT_OF_RANGE_OR_UNVERIFIED');
  if(l.spentAbilityKeys.includes(`ambush.${e.proofRef}`))throw Error('TITLE_AMBUSH_ALREADY_WARNED');
  l.spentAbilityKeys.push(`ambush.${e.proofRef}`);
 }else if(e.ability==='silent_steps'){
  mpCost=8;durationSeconds=30;
 }else if(e.ability==='combat_composure'){
  mpCost=18;durationSeconds=15;
 }
 if(n.mp<mpCost)throw Error('TITLE_MP_INSUFFICIENT');
 if(durationSeconds>0){
  if((l.activeUntil[e.ability]??0)>e.nowSecond)
   throw Error('TITLE_ABILITY_ALREADY_ACTIVE');
  l.activeUntil[e.ability]=e.nowSecond+durationSeconds;
 }
 n.mp-=mpCost;l.appliedSourceRefs.push(e.sourceRef);
 return {player:n,ledger:l,mpCost,damagePrevented,durationSeconds,
  note:e.ability==='silent_steps'?'Suppresses footstep/gear noise only, not visibility.':
   e.ability==='combat_composure'?'Ignores pain and fatigue accuracy penalties for 15s.':null};
}
