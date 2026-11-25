/** Guarded v4.8 rune state. All mutations are made on a cloned, CAS-confirmed
 * Player event. No new rune is usable without its earned stone and study.
 * Spatial outcomes are GM-adjudicated against the world, not inferred from MP.
 */
import type {JinwooState,JinwooStats} from "./shadow_monarch_rules.ts";
import {usesSharpnessRules} from "./chroma_sharpness_v48.ts";
import {V48_RUNE_LINES,runeProfile,runeBloodCost,storeHostilePain} from "./chroma_rune_profiles_v48.ts";
const valid=(s:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(s);
const int=(n:number,min:number,max:number)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export const V48_SOURCE=Object.fromEntries(V48_RUNE_LINES.map(r=>[r.monsterId,r]));
export const V48_BASE=new Set(V48_RUNE_LINES.map(r=>r.id));
const LINES=new Set(V48_RUNE_LINES.flatMap(r=>[r.id,r.evolution]));
export function v48Known(id:string){return LINES.has(id);}
export type V48Mastery={level:number;xp:number;uses:number;refs:string[]};
type Buff={untilMinute:number;value:number;remaining:number};
export type V48Runtime={
 mastery:Record<string,V48Mastery>;
 blood?:Buff;muscle?:Buff;shield?:Buff;thrust?:Buff;stance?:Buff;
 pain?:{encounterRef:string;amount:number};
 fear?:{encounterRef:string;untilMinute:number;value:number};
 lastAction?:{sourceRef:string;skillId:string;kind:string;value:number;aux?:number;untilMinute:number};
};
export function readV48(s:JinwooState):V48Runtime{return s.chromaV4Meta?.v48Runtime??{mastery:{}}}
function mutable(s:JinwooState):V48Runtime{
 if(!usesSharpnessRules(s.storyFlags)||!s.chromaV4Meta)throw Error("V48_NOT_ENABLED");
 return s.chromaV4Meta.v48Runtime??={mastery:{}};
}
export function ownsV48(s:JinwooState,id:string):boolean{
 return usesSharpnessRules(s.storyFlags)&&!!s.chromaV4Meta?.learnedSkills.includes(id)&&s.unlockedSkills.includes(id);
}
export function levelV48(s:JinwooState,id:string):number{
 if(!ownsV48(s,id))return 0;
 const l=readV48(s).mastery[id]?.level??1;if(!int(l,1,10))throw Error("V48_LEVEL_INVALID");return l;
}
function stat(s:JinwooState,base:string,evo:string,key:string,fallback=0){
 const e=levelV48(s,evo),b=levelV48(s,base);
 const p=e?runeProfile(evo,e):b?runeProfile(base,b):null;
 const value=p?(p as Record<string,unknown>)[key]:undefined;
 return typeof value==="number"?value:fallback;
}
export function practiceV48(s:JinwooState,skillId:string,ref:string){
 if(!ownsV48(s,skillId)||!valid(ref))return;
 const rt=mutable(s),old=rt.mastery[skillId]??{level:1,xp:0,uses:0,refs:[]};
 if(old.level===10||old.refs.includes(ref))return;
 let level=old.level,xp=old.xp+12;
 while(level<10&&xp>=Math.ceil(45*level**1.4)){xp-=Math.ceil(45*level**1.4);level++;}
 // No rolling eviction while this skill is trainable; replay cannot regain XP.
 if(old.refs.length>=2048)throw Error("V48_PRACTICE_LEDGER_FULL");
 rt.mastery[skillId]={level,xp:level===10?0:xp,uses:old.uses+1,refs:[...old.refs,ref]};
}
export function practiceLine(s:JinwooState,base:string,evo:string,ref:string){
 practiceV48(s,ownsV48(s,evo)?evo:base,ref);
}
export function evolveV48(s:JinwooState,e:{skillId:string;sourceRef:string;proofRef:string;verifiedFeat:boolean}){
 const line=V48_RUNE_LINES.find(r=>r.id===e.skillId);
 if(!line||!e.verifiedFeat||!valid(e.sourceRef)||!valid(e.proofRef)||e.sourceRef===e.proofRef||
  s.appliedRewardRefs.includes(e.sourceRef)||s.appliedRewardRefs.includes(e.proofRef)||
  levelV48(s,line.id)!==10||ownsV48(s,line.evolution))throw Error("V48_EVOLUTION_NOT_EARNED");
 const n=structuredClone(s),m=n.chromaV4Meta!;
 m.learnedSkills=m.learnedSkills.filter(x=>x!==line.id);m.learnedSkills.push(line.evolution);
 n.unlockedSkills=n.unlockedSkills.filter(x=>x!==line.id);n.unlockedSkills.push(line.evolution);
 mutable(n).mastery[line.evolution]={level:1,xp:0,uses:0,refs:[]};
 n.appliedRewardRefs.push(e.sourceRef,e.proofRef);return n;
}
export function v48Strength(s:JinwooState){return stat(s,"minotaur_strength","titan_might","strengthPct")}
export function v48Reserve(s:JinwooState){return stat(s,"body_reserve","overload","reservePct")}
export function v48Regen(s:JinwooState){return stat(s,"regeneration","living_core","naturalHealMultiplier",1)}
export function v48Edge(s:JinwooState,base:number|null){return base===null?null:base*(1+stat(s,"edge_sharpness","cleaving_blade","sharpnessPct")/100)}
export function v48Pierce(s:JinwooState,minute:number){
 const base=stat(s,"piercing","breakthrough","piercing");
 const x=readV48(s).thrust;return usesSharpnessRules(s.storyFlags)&&minute>=0&&x&&x.untilMinute>minute&&x.remaining?Math.max(base,x.value):base;
}
export function v48Fatigue(s:JinwooState,cost:number,maxSP:number,ref:string){
 if(!usesSharpnessRules(s.storyFlags)){s.fatigue=Math.min(100,s.fatigue+cost);return}
 const actual=cost*(1-stat(s,"body_reserve","overload","spCostReductionPct")/100)/(1+v48Reserve(s)/100);
 const excess=Math.max(0,actual-(100-s.fatigue)),ratio=stat(s,"body_reserve","overload","spPerMp");
 if(excess>0&&ratio>0){
  const mp=Math.ceil(excess*maxSP/100/ratio);if(s.mp<mp)throw Error("V48_OVERLOAD_MP_INSUFFICIENT");s.mp-=mp;
 }
 s.fatigue=Math.min(100,s.fatigue+actual);
 if(cost>0&&v48Reserve(s)>0)practiceLine(s,"body_reserve","overload",ref);
}
export function v48BattleBonus(s:JinwooState,minute:number,total:JinwooStats,isStrike:boolean){
 const r=readV48(s),on=usesSharpnessRules(s.storyFlags)&&minute>=0;
 const blood=on&&r.blood&&r.blood.untilMinute>minute?r.blood.value:0;
 const muscle=on&&isStrike&&r.muscle&&r.muscle.untilMinute>minute&&r.muscle.remaining?r.muscle.value:0;
 return {strength:Math.round(total.strength*(v48Strength(s)+blood+muscle)/100),
  agility:Math.round(total.agility*blood/100),perception:Math.round(total.perception*blood/100)};
}
export function v48StrikePractice(s:JinwooState,minute:number,ref:string,hit:boolean,thrust:boolean,edged:boolean,armor:number){
 if(!usesSharpnessRules(s.storyFlags))return;
 const rt=mutable(s);
 for(const [key,base,evo,applies] of [["muscle","muscle_acceleration","chain_power",true],["thrust","piercing","breakthrough",thrust]] as const){
  const b=rt[key];if(applies&&b&&b.untilMinute>minute&&b.remaining>0){b.remaining--;if(hit)practiceLine(s,base,evo,ref);if(!b.remaining)delete rt[key];}
 }
 if(hit){
  if(v48Strength(s)>0)practiceLine(s,"minotaur_strength","titan_might",ref);
  if(edged&&armor>0)practiceLine(s,"edge_sharpness","cleaving_blade",ref);
  if(thrust&&armor>=5)practiceLine(s,"piercing","breakthrough",ref);
  if(rt.blood&&rt.blood.untilMinute>minute)practiceV48(s,"blood_burning",ref);
 }
}
export function v48PhysicalShield(s:JinwooState,damage:number,minute:number,ref:string){
 if(!usesSharpnessRules(s.storyFlags)||damage<=0)return damage;
 const rt=mutable(s),b=rt.shield;if(!b||minute<0||b.untilMinute<=minute||b.remaining<=0)return damage;
 const absorbed=Math.min(damage,b.value);b.remaining--;if(!b.remaining)delete rt.shield;
 if(absorbed)practiceLine(s,"physical_shield","layered_shield",ref);
 return damage-absorbed;
}
export function v48PainStore(s:JinwooState,loss:number,maxHp:number,ref:string){
 const e=levelV48(s,"retribution"),b=levelV48(s,"pain_storage");if(!e&&!b||loss<=0)return;
 const rt=mutable(s),prev=rt.pain?.encounterRef===ref?rt.pain.amount:0;
 rt.pain={encounterRef:ref,amount:storeHostilePain(prev,loss,maxHp,e||b,!!e)};
 practiceLine(s,"pain_storage","retribution",ref);
}
export function v48PainRelease(s:JinwooState,ref:string,percent=100){
 if(!usesSharpnessRules(s.storyFlags))return 0;
 if(!int(percent,1,100)||percent!==100&&!ownsV48(s,"retribution"))throw Error("V48_PAIN_PERCENT_INVALID");
 const rt=mutable(s),p=rt.pain;if(!p||p.encounterRef!==ref)return 0;
 const amount=Math.floor(p.amount*percent/100);p.amount-=amount;if(!p.amount)delete rt.pain;return amount;
}
export function v48Fear(s:JinwooState,ref:string,minute:number){
 const x=readV48(s).fear;return usesSharpnessRules(s.storyFlags)&&x&&x.encounterRef===ref&&x.untilMinute>minute?x.value:0;
}
export function v48EndBattle(s:JinwooState){
 if(!usesSharpnessRules(s.storyFlags)||!s.chromaV4Meta?.v48Runtime)return;
 const r=s.chromaV4Meta.v48Runtime;delete r.pain;delete r.fear;
}
export function v48World(s:JinwooState,minute:number){
 const r=readV48(s),stance=r.stance&&r.stance.untilMinute>minute?r.stance.value:0;
 return {heatResistance:stat(s,"dragon_blood","blood_burning","heatResistancePct"),
  fallReduction:stat(s,"soft_landing","air_support","fallReductionPct"),
  breathMultiplier:stat(s,"second_breath","autonomous_breathing","breathMultiplier",1),
  echoRadius:stat(s,"echolocation","spatial_perception","radius"),
  echoImages:ownsV48(s,"spatial_perception"),
  dangerRadius:stat(s,"sixth_sense","danger_harbinger","radius"),
  dangerLeadSeconds:stat(s,"sixth_sense","danger_harbinger","leadSeconds"),
  dangerDirection:ownsV48(s,"danger_harbinger"),
  flexibilityStage:stat(s,"flexibility","anomalous_flexibility","stage"),
  mobilityPct:stat(s,"flexibility","anomalous_flexibility","mobilityPct"),
  anomalousFlexibility:ownsV48(s,"anomalous_flexibility"),
  knockbackResistance:Math.max(stance,stat(s,"immovability","steadfast_fortress","knockbackResistancePct"))};
}
export function v48Hazard(s:JinwooState,damage:number,kind:"fall"|"heat"|"magic",minute:number,ref:string){
 if(!int(damage,0,1e9))throw Error("V48_HAZARD_INVALID");
 const w=v48World(s,minute),pct=kind==="fall"?w.fallReduction:kind==="heat"?w.heatResistance:0;
 let remaining=Math.round(damage*(1-pct/100));
 if(pct&&damage>remaining)kind==="fall"?practiceLine(s,"soft_landing","air_support",ref):practiceLine(s,"dragon_blood","blood_burning",ref);
 if(kind==="magic"&&usesSharpnessRules(s.storyFlags)&&s.chromaV4Meta?.runeRuntime){
  const rt=s.chromaV4Meta.runeRuntime;
  for(const x of rt.effects.filter(x=>x.targetId==="hero.chroma"&&x.type==="magic_barrier"&&x.expiresSecond>Math.max(rt.nowSecond,minute*60))){
   const a=Math.min(remaining,Math.floor(x.power));x.power-=a;remaining-=a;if(!remaining)break;
  }
  rt.effects=rt.effects.filter(x=>x.type!=="magic_barrier"||x.power>0);
 }
 return remaining;
}
export function castV48(s:JinwooState,e:{sourceRef:string;skillId:string;minute:number;maxHp:number;
 hpPercent?:number;count?:number;durationSeconds?:number;elapsedMinutes?:number;
 enemyRef?:string;enemyLevel?:number;damage?:number;hit?:boolean}){
 if(!ownsV48(s,e.skillId)||!valid(e.sourceRef)||s.appliedRewardRefs.includes(e.sourceRef)||
  !int(e.minute,0,1e9)||!int(e.maxHp,1,1e9)||s.hp<=0)throw Error("V48_CAST_NOT_AUTHORIZED");
 const n=structuredClone(s),rt=mutable(n),id=e.skillId,l=levelV48(n,id);
 const p=runeProfile(id,l) as Record<string,unknown>;
 const get=(k:string)=>{const v=p[k];if(typeof v!=="number")throw Error("V48_PROFILE_INVALID");return v};
 const put=(key:"blood"|"muscle"|"shield"|"thrust"|"stance",value:number,remaining:number)=>{
  const prior=rt[key];if(prior&&prior.untilMinute>e.minute&&prior.remaining>0)throw Error("V48_BUFF_ALREADY_ACTIVE");
  rt[key]={untilMinute:e.minute+1,value,remaining};
 };
 let cost=0,value=0,aux:number|undefined,kind=id,until=e.minute+1;
 switch(id){
 case "blood_burning":{const b=runeBloodCost(e.maxHp,n.hp,l,e.hpPercent??10);put("blood",b.bonusPct,1);n.hp-=b.loss;value=b.bonusPct;aux=b.loss;break;}
 case "muscle_acceleration":case "chain_power":{const count=e.count??1;if(!int(count,1,get("moves")))throw Error("V48_COUNT_INVALID");value=get("powerPct");cost=get("mp")*count;put("muscle",value,count);aux=count;break;}
 case "physical_shield":case "layered_shield":{const layers=e.count??1;if(!int(layers,1,get("layers")))throw Error("V48_COUNT_INVALID");value=Math.floor(e.maxHp*get("maxHpPct")/100);cost=Math.ceil(value/get("damagePerMp"))*layers;put("shield",value,layers);aux=layers;break;}
 case "breakthrough":value=get("activePiercing");cost=get("mp");put("thrust",value,1);break;
 case "steadfast_fortress":value=get("activeResistancePct");cost=get("mp");put("stance",value,1);break;
 case "echolocation":case "spatial_perception":cost=get("mp");value=get("radius");kind=id==="echolocation"?"scan_presence":"scan_shapes";break;
 case "air_support":{const count=e.count??1;if(!int(count,1,get("platforms")))throw Error("V48_COUNT_INVALID");cost=count*get("mpPerPlatform");value=count;break;}
 case "autonomous_breathing":{const seconds=e.durationSeconds??60;if(!int(seconds,1,600))throw Error("V48_DURATION_INVALID");cost=Math.ceil(seconds/60)*get("mpPerMinute");value=seconds;until=e.minute+Math.ceil(seconds/60);break;}
 case "living_core":if((e.elapsedMinutes??0)<1||n.activeEncounter)throw Error("V48_HEAL_NEEDS_CONFIRMED_RECOVERY_INTERVAL");cost=get("mp");value=Math.min(e.maxHp-n.hp,Math.floor(e.maxHp*get("healMaxHpPct")/100));n.hp+=value;if(value)practiceV48(n,id,e.sourceRef);break;
 case "dragon_presence":case "dragon_authority":cost=get("mp");if(e.enemyRef&&e.enemyLevel!==undefined&&e.enemyLevel<n.systemLevel){value=Math.round(get("fearPct"));rt.fear={encounterRef:e.enemyRef,untilMinute:until,value};practiceV48(n,id,e.enemyRef);}break;
 case "cleaving_blade":if(!n.activeEncounter||n.activeEncounter.enemyRef!==e.enemyRef||!int(e.damage??-1,0,1e9))throw Error("V48_CLEAVE_TARGET_INVALID");cost=get("mp");aux=get("range");value=e.hit?Math.min(n.activeEncounter.enemyHp,e.damage!):0;n.activeEncounter.enemyHp-=value;if(value)practiceV48(n,id,e.enemyRef!);break;
 default:throw Error("V48_PASSIVE_OR_UNKNOWN_CAST");
 }
 if(n.mp<cost)throw Error("V48_MP_INSUFFICIENT");n.mp-=cost;
 rt.lastAction={sourceRef:e.sourceRef,skillId:id,kind,value,untilMinute:until,...(aux===undefined?{}:{aux})};
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function validateV48Runtime(r:V48Runtime){
 if(!r||!r.mastery||Object.keys(r.mastery).length>32)throw Error("V48_LEDGER_INVALID");
 for(const [id,p] of Object.entries(r.mastery))if(!v48Known(id)||!int(p.level,1,10)||!int(p.xp,0,2000)||!int(p.uses,0,2048)||!Array.isArray(p.refs)||p.refs.length>2048||p.refs.some(x=>!valid(x))||new Set(p.refs).size!==p.refs.length)throw Error("V48_MASTERY_INVALID");
 for(const b of [r.blood,r.muscle,r.shield,r.thrust,r.stance])if(b&&(!int(b.untilMinute,0,1e9)||!Number.isFinite(b.value)||b.value<0||b.value>1e9||!int(b.remaining,0,5)))throw Error("V48_BUFF_INVALID");
 if(r.pain&&(!valid(r.pain.encounterRef)||!int(r.pain.amount,0,1e9)))throw Error("V48_PAIN_INVALID");
 if(r.fear&&(!valid(r.fear.encounterRef)||!int(r.fear.untilMinute,0,1e9)||!int(r.fear.value,0,100)))throw Error("V48_FEAR_INVALID");
 if(r.lastAction&&(!valid(r.lastAction.sourceRef)||!v48Known(r.lastAction.skillId)||!int(r.lastAction.untilMinute,0,1e9)||!Number.isFinite(r.lastAction.value)||r.lastAction.value<0))throw Error("V48_ACTION_INVALID");
}
