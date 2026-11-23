/** Persistent monster combat conditions for Chroma v4.
 * The authoritative RPG Lab combat handler supplies confirmed strikes and
 * separately derived physical damage. This helper cannot award XP or loot.
 */
import {confirmKasakaHit,tickBleeding,type TargetCondition} from './crossover_core.ts';

export type CombatStatusSnapshot = Pick<TargetCondition,'bleedingWounds'|'paralyzedLocations'>;
export type CombatStatusInput = {
 enemyHp:number; enemyMaxHp:number; physiology:TargetCondition['physiology'];
 status?:Partial<CombatStatusSnapshot>;hasMagicStone?:boolean;
};
export type ConfirmedImpact = {
 weaponId:string; attackLanded:boolean; penetrated:boolean;
 physicalDamage:number; location:string;
 /** This only applies when a journal-backed weak-point event is supplied. */
 weakPoint?:'none'|'brain'|'heart'|'magic_stone';
 confirmedVitalEvidence?:boolean;
};
const nonneg=(x:number)=>Number.isSafeInteger(x)&&x>=0;
const validLoc=(x:string)=>/^[a-z][a-z0-9_]{1,39}$/.test(x);

export function readCombatCondition(input:CombatStatusInput):TargetCondition{
 if(!nonneg(input.enemyHp)||!nonneg(input.enemyMaxHp)||
    input.enemyMaxHp<1||input.enemyHp>input.enemyMaxHp)
  throw Error('V4_ENEMY_HEALTH_INVALID');
 if(!['ordinary','large','stone_core'].includes(input.physiology))
  throw Error('V4_ENEMY_PHYSIOLOGY_INVALID');
 const bleeding=input.status?.bleedingWounds??[];
 const paralyzed=input.status?.paralyzedLocations??[];
 if(bleeding.length>256||paralyzed.length>256||
    bleeding.some(w=>!Number.isFinite(w.damageFractionPerSecond)||
      w.damageFractionPerSecond<=0||w.damageFractionPerSecond>0.1||
      !nonneg(w.secondsRemaining)||w.secondsRemaining>3600)||
    paralyzed.some(p=>!validLoc(p.location)||!nonneg(p.secondsRemaining)||
      p.secondsRemaining>3600))
  throw Error('V4_ENEMY_STATUS_INVALID');
 return {maxHp:input.enemyMaxHp,hp:input.enemyHp,armorPenetrated:true,
  hasMagicStone:input.hasMagicStone??false,
  physiology:input.physiology,poisonedLocations:[],
  bleedingWounds:structuredClone(bleeding),
  paralyzedLocations:structuredClone(paralyzed)};
}

/** Each wound is independent; a resistance must be evidenced, not injected for a boss. */
export function applyConfirmedImpacts(initial:TargetCondition,impacts:ConfirmedImpact[]):{
 target:TargetCondition;directDamage:number;vitalKill:boolean;kasakaWoundsAdded:number;
}{
 if(impacts.length>2)throw Error('V4_MAX_TWO_STRIKES_PER_EXCHANGE');
 let target=structuredClone(initial),vitalKill=false,kasakaWoundsAdded=0;
 const before=target.hp;
 for(const strike of impacts){
  if(!nonneg(strike.physicalDamage)||!validLoc(strike.location))
   throw Error('V4_STRIKE_NOT_VERIFIED');
  if(!strike.attackLanded||!strike.penetrated||target.hp<=0)continue;
  const kasaka=strike.weaponId==='kasaka_fang';
  // The authoritatively confirmed hit may target a vital organ. Without
  // separate journal evidence, the safe default is a non-vital strike.
  const vital=(strike.confirmedVitalEvidence===true&&strike.weakPoint)||'none';
  const result=confirmKasakaHit(target,{
   hit:true,penetrated:true,physicalDamage:strike.physicalDamage,
   weakPoint:vital,hitLocation:strike.location,
   bleedingSeconds:kasaka?10:0,paralysisSeconds:kasaka?3:0,
  });
  const priorWounds=target.bleedingWounds.length;
  target=result.target;
  vitalKill ||= result.instantKill;
  kasakaWoundsAdded += target.bleedingWounds.length-priorWounds;
 }
 return {target,directDamage:before-target.hp,vitalKill,kasakaWoundsAdded};
}

/** At most 60 seconds may elapse per verified combat micro-exchange. */
export function advanceEnemyStatuses(target:TargetCondition,seconds=1){
 if(!nonneg(seconds)||seconds<1||seconds>60)
  throw Error('V4_COMBAT_TICK_INVALID');
 const advanced=tickBleeding(target,seconds);
 advanced.hp=Math.max(0,Math.round(advanced.hp));
 return advanced;
}

/** Effect does not grant a free hit: it only changes retaliation capability. */
export function paralysisCounterPenalty(target:TargetCondition):number{
 const active=target.paralyzedLocations.filter(p=>p.secondsRemaining>0);
 if(active.some(p=>p.location==='whole_body'))return 100;
 let penalty=0;
 for(const p of active){
  if(p.location.includes('arm'))penalty+=20;
  else if(p.location.includes('leg')||p.location.includes('knee'))penalty+=15;
  else if(p.location==='head'||p.location==='neck')penalty+=25;
  else penalty+=5;
 }
 return Math.min(90,penalty);
}
