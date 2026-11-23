/** Chroma v4.5: effective Rune Skills. Pure, event-proven simulation.
 * Not an automatic live install. All numbers are game-design house rules.
 * Host supplies saved proof and target snapshots, never accepts client-made damage.
 */
export const RUNE_SKILLS = {
 stealth:{name:'Скрытность',source:'war_shadow',kind:'utility',baseMp:5,cooldown:5},
 minor_healing:{name:'Малое исцеление',source:'blue_papilio',kind:'healing',baseMp:20,cooldown:6},
 flame_breath:{name:'Огненное дыхание',source:'hellhound',kind:'offense',baseMp:15,cooldown:4},
 fire_projectile:{name:'Огненный снаряд',source:'firebird',kind:'offense',baseMp:12,cooldown:2},
 sonic_pulse:{name:'Звуковой импульс',source:'siren',kind:'control',baseMp:18,cooldown:6},
 focused_light:{name:'Световой луч',source:'light_quartz',kind:'offense',baseMp:24,cooldown:8},
 mana_barrier:{name:'Магический барьер',source:'carbuncle',kind:'defense',baseMp:20,cooldown:8},
 paralyzing_toxin:{name:'Парализующий токсин',source:'basilisk',kind:'control',baseMp:14,cooldown:6},
 toxic_quills:{name:'Ядовитый веер',source:'peluda',kind:'offense',baseMp:18,cooldown:5},
 binding_web:{name:'Клейкая нить',source:'deformis_spider',kind:'control',baseMp:8,cooldown:3},
 electric_pulse:{name:'Молниевый импульс',source:'thunder_snake',kind:'control',baseMp:16,cooldown:5},
 acid_spit:{name:'Кислотный плевок',source:'arachne',kind:'offense',baseMp:15,cooldown:5},
 rulers_touch:{name:'Прикосновение властителя',source:'sl_igris',kind:'utility',baseMp:12,cooldown:2},
 // Evolves after a separate confirmed class-era feat; never a direct rune drop.
 rulers_authority:{name:'Власть правителя',source:'evolution',kind:'utility',baseMp:20,cooldown:2},
} as const;
export type RuneSkillId = keyof typeof RUNE_SKILLS;
export type RuneMastery = {level:number;xp:number;uses:number;effectiveEncounterRefs:string[]};
export type RuneWound={kind:'bleeding'|'burn'|'muscle'|'severe'|'lost_limb';severity:1|2|3};
export type RuneTarget = {
 id:string;kind:'player'|'ally'|'monster'|'object';
 hp:number;maxHp:number;armor:number;strength:number;magicResistancePct:number;
 size:'small'|'medium'|'large'|'giant';poisonImmune:boolean;
 weightKg?:number;position?:{x:number;y:number;z:number};wounds:RuneWound[];
};
export type RuneStatus='stealth'|'barrier'|'burning'|'stagger'|'paralyzed'|
 'poisoned'|'webbed'|'acid_erosion'|'telekinetic_hold';
export type RuneEffect={id:string;sourceRef:string;targetId:string;
 type:RuneStatus;expiresSecond:number;power:number;location?:string};
export type RuneEncounter={nowSecond:number;casterId:string;mp:number;maxMp:number;
 intelligence:number;learnedSkills:string[];mastery:Partial<Record<RuneSkillId,RuneMastery>>;
 cooldownReadyAt:Partial<Record<RuneSkillId,number>>;targets:Record<string,RuneTarget>;
 effects:RuneEffect[];usedRefs:string[];};
export type RuneCast={sourceRef:string;proofRef:string;encounterRef:string;
 nowSecond:number;skillId:RuneSkillId;targetIds:string[];confirmedHit:boolean;
 durationSeconds?:number;channelSeconds?:number;preparedSeconds?:number;
 hitLocation?:string;};
export type RuneCastResult={state:RuneEncounter;receipt:{sourceRef:string;skillId:RuneSkillId;
 mpSpent:number;affectedTargets:string[];damage:Record<string,number>;
 healed:Record<string,number>;newEffects:RuneEffect[];masteryLevel:number;
 effective:boolean;};};
const ID=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const clone=<T>(x:T):T=>structuredClone(x);
const finite=(x:number)=>Number.isFinite(x)&&x>=0;
const safeNumber=(n:number,lo:number,hi:number)=>Number.isFinite(n)&&n>=lo&&n<=hi;
const effectId=(sourceRef:string,type:string,index:number)=>{
 let h=2166136261>>>0;for(const c of `${sourceRef}|${type}|${index}`){
  h^=c.charCodeAt(0);h=Math.imul(h,16777619);
 }return `rune.fx.${(h>>>0).toString(16)}.${index}`;
};
const scale=(level:number)=>Math.pow(1.15,level-1); // 15% per mastery level
const stats=(x:RuneEncounter,k:RuneSkillId):RuneMastery=>x.mastery[k]??{
 level:1,xp:0,uses:0,effectiveEncounterRefs:[]};
export function runeSkillCatalog(){return Object.entries(RUNE_SKILLS).map(([id,c])=>({id,...c}));}
export function validateRuneEncounter(e:RuneEncounter){
 if(!Number.isSafeInteger(e.nowSecond)||e.nowSecond<0||!ID.test(e.casterId)||
    !Number.isSafeInteger(e.mp)||!Number.isSafeInteger(e.maxMp)||
    e.mp<0||e.mp>e.maxMp||!safeNumber(e.intelligence,0,1000000)||
    !e.targets[e.casterId]||e.targets[e.casterId].kind!=='player'||
    !Array.isArray(e.learnedSkills)||!Array.isArray(e.effects)||!Array.isArray(e.usedRefs))throw Error('RUNE_STATE_INVALID');
 for(const [id,t] of Object.entries(e.targets)){
  if(id!==t.id||!ID.test(id)||!safeNumber(t.hp,0,t.maxHp)||
   !safeNumber(t.maxHp,1,1e9)||!safeNumber(t.armor,0,1e6)||
   !safeNumber(t.strength,0,1e6)||!safeNumber(t.magicResistancePct,0,100)||
   !Array.isArray(t.wounds))throw Error('RUNE_TARGET_STATE_INVALID');
 }
 for(const f of e.effects)
  if(!ID.test(f.id)||!ID.test(f.targetId)||!e.targets[f.targetId]||
     !Number.isSafeInteger(f.expiresSecond)||!finite(f.power))
   throw Error('RUNE_EFFECT_STATE_INVALID');
}
export function activeRuneEffects(state:RuneEncounter,targetId:string,nowSecond=state.nowSecond){
 return state.effects.filter(f=>f.targetId===targetId&&f.expiresSecond>nowSecond);
}
export function effectiveRuneArmor(state:RuneEncounter,targetId:string){
 const target=state.targets[targetId];if(!target)throw Error('RUNE_TARGET_NOT_FOUND');
 const acid=activeRuneEffects(state,targetId).filter(x=>x.type==='acid_erosion')
  .reduce((total,x)=>total+x.power,0);
 return Math.max(0,Math.round(target.armor-acid));
}
export function canRuneTargetAct(state:RuneEncounter,targetId:string,location?:string){
 const effects=activeRuneEffects(state,targetId);
 return !effects.some(x=>x.type==='stagger'||x.type==='webbed'||
  (x.type==='paralyzed'&&(x.location==='whole_body'||(location!==undefined&&x.location===location))));
}
export function absorbRuneShield(state:RuneEncounter,e:{targetId:string;incomingDamage:number;
 sourceRef:string;attackFromFront:boolean}){
 if(!Number.isSafeInteger(e.incomingDamage)||e.incomingDamage<0||!ID.test(e.sourceRef)||
    state.usedRefs.includes(e.sourceRef))throw Error('RUNE_SHIELD_DAMAGE_INVALID');
 const n=clone(state);
 const barriers=n.effects.filter(x=>x.targetId===e.targetId&&x.type==='barrier'&&
  x.expiresSecond>n.nowSecond&&
  (x.location!=='front' || e.attackFromFront)).sort((a,b)=>a.expiresSecond-b.expiresSecond);
 let pending=e.incomingDamage,blocked=0;
 for(const barrier of barriers){
  if(!pending)break;
  const absorb=Math.min(pending,Math.floor(barrier.power));
  barrier.power-=absorb;pending-=absorb;blocked+=absorb;
 }
 n.effects=n.effects.filter(x=>x.type!=='barrier'||x.power>0);
 n.usedRefs.push(e.sourceRef);
 return {state:n,blocked,remainingDamage:pending};
}
/** Only a verified event writer can supply proof. Denied casts are atomic. */
export function executeRuneCast(state:RuneEncounter,a:RuneCast,host:{
 /** Verify full serialized action, especially hit, channel and target identity. */
 verifySavedAction:(cast:RuneCast)=>boolean;
}):RuneCastResult{
 validateRuneEncounter(state);
 if(!ID.test(a.sourceRef)||!ID.test(a.proofRef)||!ID.test(a.encounterRef)||
    a.sourceRef===a.proofRef||state.usedRefs.includes(a.sourceRef)||
    !Number.isSafeInteger(a.nowSecond)||a.nowSecond<state.nowSecond||
    !Object.hasOwn(RUNE_SKILLS,a.skillId)||!state.learnedSkills.includes(a.skillId)||
    !Array.isArray(a.targetIds)||!a.targetIds.length||a.targetIds.length>5||
    new Set(a.targetIds).size!==a.targetIds.length||
    a.targetIds.some(id=>!ID.test(id)||!state.targets[id])||
    !host.verifySavedAction(a))
  throw Error('RUNE_CAST_UNVERIFIED_OR_NOT_OWNED');
 if(a.nowSecond<(state.cooldownReadyAt[a.skillId]??0))throw Error('RUNE_COOLDOWN_ACTIVE');
 const n=clone(state);n.nowSecond=a.nowSecond;
 n.effects=n.effects.filter(x=>x.expiresSecond>n.nowSecond);
 const cfg=RUNE_SKILLS[a.skillId];
 const mastery=stats(n,a.skillId);
 if(!Number.isSafeInteger(mastery.level)||mastery.level<1||mastery.level>10)
  throw Error('RUNE_MASTERY_LEVEL_INVALID');
 const mult=scale(mastery.level),int=n.intelligence;
 const isHit=Boolean(a.confirmedHit);
 const targets=a.targetIds.map(id=>n.targets[id]);
 const friendly=targets.every(t=>['player','ally'].includes(t.kind));
 const hostile=targets.every(t=>t.kind==='monster');
 const objectOnly=targets.every(t=>t.kind==='object');
 const validFireTargets=targets.every(t=>t.kind==='monster'||t.kind==='object');
 const validWebTargets=targets.every(t=>t.kind==='monster'||t.kind==='object');
 const offensive=['flame_breath','fire_projectile','sonic_pulse','focused_light',
  'paralyzing_toxin','toxic_quills','electric_pulse','acid_spit','binding_web'].includes(a.skillId);
 const single=['fire_projectile','focused_light','paralyzing_toxin','electric_pulse',
  'acid_spit','minor_healing','mana_barrier','stealth','rulers_touch','rulers_authority'];
 if(single.includes(a.skillId)&&targets.length!==1)throw Error('RUNE_TARGET_COUNT_INVALID');
 if((offensive&&!hostile&&
      !(a.skillId==='flame_breath'&&validFireTargets)&&
      !(a.skillId==='fire_projectile'&&validFireTargets)&&
      !(a.skillId==='binding_web'&&validWebTargets)&&
      !(a.skillId==='acid_spit'&&validFireTargets))||
    (a.skillId==='minor_healing'&&!friendly)||
    (a.skillId==='mana_barrier'&&(!friendly||(targets[0].id!==n.casterId&&mastery.level<7)))||
    (a.skillId==='stealth'&&targets[0].id!==n.casterId)||
    (['rulers_touch','rulers_authority'].includes(a.skillId)&&!objectOnly))
  throw Error('RUNE_TARGET_TYPE_INVALID');
 const duration=a.durationSeconds??0,channel=a.channelSeconds??0;
 if(!Number.isSafeInteger(duration)||duration<0||duration>60||
    !Number.isSafeInteger(channel)||channel<0||channel>10)
  throw Error('RUNE_DURATION_INVALID');
 if(a.skillId==='focused_light'&&(!Number.isSafeInteger(a.preparedSeconds)|| (a.preparedSeconds??0)<1))
  throw Error('RUNE_LIGHT_REQUIRES_CHARGE');
 if(a.skillId==='stealth'&&(duration<1||duration>30))throw Error('RUNE_STEALTH_DURATION_INVALID');
 if(a.skillId==='binding_web'&&(duration<1||duration>4))throw Error('RUNE_WEB_SIZE_INVALID');
 if(['rulers_touch','rulers_authority'].includes(a.skillId)&&channel<1)
  throw Error('RUNE_TELEKINESIS_CHANNEL_REQUIRED');
 if(a.skillId==='rulers_touch'||a.skillId==='rulers_authority'){
  const limit=(a.skillId==='rulers_touch'?10:50)+int*(a.skillId==='rulers_touch'?1:3);
  if(targets[0].weightKg===undefined||!safeNumber(targets[0].weightKg,0,limit*mult))
   throw Error('RUNE_TELEKINESIS_WEIGHT_LIMIT');
 }
 const mpCost=cfg.baseMp+(a.skillId==='stealth'?2*duration:
  a.skillId==='binding_web'?4*(duration-1):
  a.skillId==='rulers_touch'||a.skillId==='rulers_authority'?3*channel:0);
 if(n.mp<mpCost)throw Error('RUNE_MP_INSUFFICIENT');
 n.mp-=mpCost;
 if(offensive)n.effects=n.effects.filter(x=>!(x.targetId===n.casterId&&x.type==='stealth'));
 const damage:Record<string,number>={},healed:Record<string,number>={},newEffects:RuneEffect[]=[];
 let woundTreated=false;
 const add=(targetId:string,type:RuneStatus,seconds:number,power:number,location?:string)=>{
  const effect:RuneEffect={id:effectId(a.sourceRef,type,newEffects.length),sourceRef:a.sourceRef,
   targetId,type,expiresSecond:a.nowSecond+seconds,power,
   ...(location?{location}:{})};
  n.effects.push(effect);newEffects.push(effect);
 };
 const harm=(t:RuneTarget,base:number,armorScale:number)=>{
  if(!isHit)return 0;
  const dealt=Math.max(0,Math.round((base*mult)*(1-t.magicResistancePct/100)-
   effectiveRuneArmor(n,t.id)*armorScale));
  t.hp=Math.max(0,t.hp-dealt);if(dealt>0)damage[t.id]=dealt;return dealt;
 };
 switch(a.skillId){
  case 'stealth':add(n.casterId,'stealth',duration,1);break;
  case 'minor_healing':{
   const t=targets[0],amount=Math.max(0,Math.min(t.maxHp-t.hp,Math.round((130+2*int)*mult)));
   t.hp+=amount;healed[t.id]=amount;
   if(mastery.level>=4){
    const idx=t.wounds.findIndex(w=>w.severity<=2&&
     (w.kind==='bleeding'||w.kind==='burn'||w.kind==='muscle'));
    if(idx>=0){t.wounds.splice(idx,1);woundTreated=true;}
    else if(mastery.level>=7){
     const severe=t.wounds.find(w=>w.severity===3&&w.kind!=='lost_limb');
     if(severe){severe.severity=2;woundTreated=true;}
    }
   }
   // Severe wounds and amputations are not repaired by Minor Healing.
   break;
  }
  case 'flame_breath':
   for(const t of targets){
    if(t.kind==='object'){if(isHit)add(t.id,'burning',10,Math.round((9+int*.25)*mult));}
    else if(harm(t,70+2*int,.7)>0)add(t.id,'burning',6,Math.round((9+int*.25)*mult));
   }
   break;
  case 'fire_projectile':{
   const t=targets[0];
   if(t.kind==='object'){if(isHit)add(t.id,'burning',8,Math.round((8+int*.25)*mult));}
   else if(harm(t,115+int*3.5,.65)>0)add(t.id,'burning',4,Math.round((8+int*.25)*mult));
   break;
  }
  case 'sonic_pulse':
   for(const t of targets)if(harm(t,25+int*.7,.15)>0&&t.magicResistancePct<85)
    add(t.id,'stagger',Math.max(1,Math.round(1*mult)),1);
   break;
  case 'focused_light':harm(targets[0],210+int*3.3,.1);break;
  case 'mana_barrier':add(targets[0].id,'barrier',15,Math.round((200+5*int)*mult),
   mastery.level>=4?'all_sides':'front');break;
  case 'paralyzing_toxin':{
   const t=targets[0];harm(t,40+int*.7,.3);
   if(isHit&&!t.poisonImmune&&t.magicResistancePct<95)
    add(t.id,'paralyzed',t.size==='giant'?1:Math.max(2,Math.round(3*mult)),1,
     t.size==='giant'?(a.hitLocation??'limb'):'whole_body');break;
  }
  case 'toxic_quills':
   for(const t of targets){
    harm(t,40+int*.95,.55);
    if(isHit&&!t.poisonImmune)add(t.id,'poisoned',6,Math.round((7+int*.22)*mult));
   }
   break;
  case 'binding_web':
   for(const t of targets)if(isHit){
    const webPower=(60+int*2)*mult*(duration/2);
    const seconds=Math.max(1,Math.min(15,Math.ceil(6*webPower/Math.max(1,t.strength*2))));
    add(t.id,'webbed',seconds,webPower);
   }
   break;
  case 'electric_pulse':{
   const t=targets[0];if(harm(t,90+int*2.2,.4)>0&&t.magicResistancePct<90)
    add(t.id,'stagger',Math.max(1,Math.round(1*mult)),1);break;
  }
  case 'acid_spit':{
   const t=targets[0];if(t.kind!=='object')harm(t,90+int*1.8,.6);
   if(isHit)add(t.id,'acid_erosion',25,Math.min(t.armor,
     Math.max(1,Math.round((5+int*.25)*mult))));break;
  }
  case 'rulers_touch':case 'rulers_authority':
   add(targets[0].id,'telekinetic_hold',channel,
     targets[0].weightKg??0);break;
 }
 n.cooldownReadyAt[a.skillId]=a.nowSecond+cfg.cooldown;
 n.usedRefs.push(a.sourceRef);
 const effective=woundTreated||newEffects.length>0||Object.values(damage).some(v=>v>0)||
  Object.values(healed).some(v=>v>0);
 if(effective&&!mastery.effectiveEncounterRefs.includes(a.encounterRef)){
  const expGain=12,threshold=(level:number)=>Math.ceil(45*level**1.4);
  let xp=mastery.xp+expGain,level=mastery.level;
  while(level<10&&xp>=threshold(level)){xp-=threshold(level);level++;}
  n.mastery[a.skillId]={level,xp:level===10?0:xp,uses:mastery.uses+1,
   effectiveEncounterRefs:[...mastery.effectiveEncounterRefs.slice(-199),a.encounterRef]};
 }
 return {state:n,receipt:{sourceRef:a.sourceRef,skillId:a.skillId,mpSpent:mpCost,
  affectedTargets:[...new Set([...newEffects.map(x=>x.targetId),...Object.keys(damage),...Object.keys(healed)])],
  damage,healed,newEffects,masteryLevel:n.mastery[a.skillId]?.level??mastery.level,effective}};
}
/** This time transition cannot travel backwards or grant extra mastery. */
export function tickRuneEffects(state:RuneEncounter,nextSecond:number):RuneEncounter{
 validateRuneEncounter(state);
 if(!Number.isSafeInteger(nextSecond)||nextSecond<state.nowSecond||nextSecond-state.nowSecond>600)
  throw Error('RUNE_TIME_STEP_INVALID');
 const n=clone(state);
 for(let t=n.nowSecond;t<nextSecond;t++){
  for(const effect of n.effects){
   if(effect.expiresSecond<=t)continue;
   if(effect.type==='burning'||effect.type==='poisoned'){
    const target=n.targets[effect.targetId];
    target.hp=Math.max(0,target.hp-Math.round(effect.power));
   }
  }
 }
 n.nowSecond=nextSecond;n.effects=n.effects.filter(e=>e.expiresSecond>nextSecond);
 return n;
}
/** Scripted feat + mastery. No second stone or accidental automatic upgrade. */
export function evolveRulersTouch(state:RuneEncounter,e:{sourceRef:string;proofRef:string;
 confirmedFeat:boolean},host:{verifyEvolutionFeat:(proofRef:string)=>boolean}):RuneEncounter{
 if(!ID.test(e.sourceRef)||!ID.test(e.proofRef)||e.sourceRef===e.proofRef||
    state.usedRefs.includes(e.sourceRef)||!e.confirmedFeat||
    !host.verifyEvolutionFeat(e.proofRef)||!state.learnedSkills.includes('rulers_touch')||
    state.learnedSkills.includes('rulers_authority')||stats(state,'rulers_touch').level<6)
  throw Error('RUNE_RULER_EVOLUTION_NOT_EARNED');
 const n=clone(state);
 n.learnedSkills=n.learnedSkills.filter(x=>x!=='rulers_touch');
 n.learnedSkills.push('rulers_authority');
 n.mastery.rulers_authority={...clone(stats(n,'rulers_touch')),effectiveEncounterRefs:[]};
 n.usedRefs.push(e.sourceRef);return n;
}

/** Movement in the real world, not just a decorative telekinetic status. */
export type RuneObjectMove={sourceRef:string;proofRef:string;objectId:string;
 nowSecond:number;next:{x:number;y:number;z:number}};
export function moveHeldRuneObject(state:RuneEncounter,e:RuneObjectMove,
 host:{verifySavedMovement:(movement:RuneObjectMove)=>boolean}):RuneEncounter{
 validateRuneEncounter(state);
 if(!ID.test(e.sourceRef)||!ID.test(e.proofRef)||e.sourceRef===e.proofRef||
  state.usedRefs.includes(e.sourceRef)||!host.verifySavedMovement(e)||
  !Number.isSafeInteger(e.nowSecond)||e.nowSecond<state.nowSecond||
  e.nowSecond-state.nowSecond>10||!Object.values(e.next).every(v=>Number.isFinite(v)))
  throw Error('RUNE_OBJECT_MOVE_NOT_VERIFIED');
 const object=state.targets[e.objectId];
 if(!object||object.kind!=='object'||!object.position)
  throw Error('RUNE_MOVABLE_OBJECT_UNKNOWN');
 const hold=state.effects.find(f=>f.targetId===e.objectId&&f.type==='telekinetic_hold'&&
  f.expiresSecond>e.nowSecond);
 if(!hold)throw Error('RUNE_TELEKINETIC_HOLD_EXPIRED');
 const distance=(p:{x:number;y:number;z:number},q:{x:number;y:number;z:number})=>
  Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z);
 const traveled=distance(e.next,object.position);
 const seconds=Math.max(1,e.nowSecond-state.nowSecond);
 const movementSpeedCap=12*Math.pow(1.15,Math.max(0,stats(state,'rulers_touch').level-1));
 const distanceFromCaster=distance(e.next,state.targets[state.casterId].position??{x:0,y:0,z:0});
 if(traveled>movementSpeedCap*seconds||distanceFromCaster>20)
  throw Error('RUNE_TELEKINETIC_RANGE_OR_SPEED');
 const n=clone(state);n.targets[e.objectId].position={...e.next};
 n.nowSecond=e.nowSecond;n.usedRefs.push(e.sourceRef);return n;
}
/** Stealth affects ordinary senses, never magical sensing or guaranteed invisibility. */
export function runeStealthDetection(state:RuneEncounter,e:{observerDistanceMeters:number;
 ordinaryVisualRangeMeters:number;observerHasMagicSense:boolean;
 casterAttacking:boolean;}):{seenVisually:boolean;heardFootsteps:boolean;magicSenseBypassed:boolean}{
 if(![e.observerDistanceMeters,e.ordinaryVisualRangeMeters].every(x=>Number.isFinite(x)&&x>=0))
  throw Error('RUNE_DETECTION_INPUT_INVALID');
 const hidden=!e.casterAttacking&&activeRuneEffects(state,state.casterId).some(x=>x.type==='stealth');
 const visualRange=e.ordinaryVisualRangeMeters*(hidden?.45:1);
 return {seenVisually:e.observerDistanceMeters<=visualRange,
  heardFootsteps:!hidden,magicSenseBypassed:e.observerHasMagicSense};
}
