/** Authoritative opt-in Linos mechanics for a NEW isolated DanMachi campaign.
 * Formula provenance: Linos new character Bible, sections 10, 11, 18, 23.
 * All money/resource effects are previews until a confirmed Lab event commits.
 */
export const LINOS_SKILLS=[
 "optical_new","optical_hide","magic_drive","living_network","cutting_loop",
 "web_regeneration","healing_cocoon","draining_bindings","microspikes",
 "sensory_network","recolor",
] as const;
export type LinosSkill=typeof LINOS_SKILLS[number];
export const LINOS_STATS=["str","end","dex","agi","mag"] as const;
export type LinosStat=typeof LINOS_STATS[number];
export type LinosScores=Record<LinosStat,number>;
export const LINOS_RANKS=["I","H","G","F","E","D","C","B","A","S"] as const;
export type LinosRank=typeof LINOS_RANKS[number];
export type LinosState={
 blessed:boolean;level:number;current:LinosScores;past:LinosScores;
 threadRank:LinosRank|null;unlockedSkills:LinosSkill[];mp:number;
};
export type LinosAbilityRequest={
 ability:"thread"|LinosSkill;
 lengthM?:number;diameterMm?:number;seconds?:number;
 loops?:number;zones?:number;trigger?:"none"|"light"|"medium"|"heavy";
 mode?:"idle"|"fast"|"moderate"|"loaded";
 externalMaterialProvided?:boolean;
};
const number=(v:unknown,min:number,max:number,code:string):number=>{
 if(typeof v!=="number"||!Number.isFinite(v)||v<min||v>max)throw Error(code);
 return v;
};
const round=(v:number)=>Math.round((v+Number.EPSILON)*1e6)/1e6;
const scores=():LinosScores=>({str:0,end:0,dex:0,agi:0,mag:0});
export const newLinosState=():LinosState=>({
 blessed:false,level:0,current:scores(),past:scores(),threadRank:null,
 unlockedSkills:[],mp:2400,
});
export function linosScale(state:LinosState){
 const mag=state.current.mag+state.past.mag;
 const F=state.blessed?2*1.8**(state.level-1)*(1+mag/3000):1;
 const rank=state.threadRank?LINOS_RANKS.indexOf(state.threadRank):-1;
 const skill=rank<0?1:rank===9?2:1.05+0.1*rank;
 const thread=F*skill;
 const maxMp=Math.round(2400*thread);
 return {magPoints:mag,magMultiplier:round(F),skillMultiplier:round(skill),
  threadMultiplier:round(thread),maxMp,
  breakLoad2mmKgf:round(480*thread),creation8HandsMps:round(8*thread),
  gestureRangeM:round(20*Math.min(3,Math.sqrt(F))),
  mentalRangeM:round(40*Math.min(3,Math.sqrt(F))),
  naturalBaseMp:2400,mpRecoveryPerMinute:maxMp/1440,
  regenInCombat:false,regenWhenUsingThread:false,
 };
}
export function linosAttributes(state:LinosState){
 const value={} as Record<LinosStat,{points:number;multiplier:number;bonusPercent:number}>;
 for(const stat of LINOS_STATS){
  const p=state.current[stat]+state.past[stat];
  const f=state.blessed?2*1.8**(state.level-1)*(1+p/3000):1;
  value[stat]={points:p,multiplier:round(f),bonusPercent:round((f-1)*100)};
 }
 return value;
}
export function validateLinosState(s:LinosState):LinosState{
 if(!s||typeof s!=="object"||Array.isArray(s)||typeof s.blessed!=="boolean"||
    !Number.isInteger(s.level)||s.level<0||s.level>10||
    (s.blessed?s.level<1:s.level!==0))throw Error("LINOS_STATE_INVALID");
 for(const k of ["current","past"] as const){
  if(!s[k]||typeof s[k]!=="object")throw Error("LINOS_STATS_MISSING");
  for(const stat of LINOS_STATS){
   const n=number(s[k][stat],0,100000,"LINOS_STAT_INVALID");
   if(!Number.isInteger(n)||(k==="current"&&n>1999))throw Error("LINOS_STAT_INVALID");
  }
 }
 if(!Array.isArray(s.unlockedSkills)||s.unlockedSkills.length>LINOS_SKILLS.length||
  new Set(s.unlockedSkills).size!==s.unlockedSkills.length||
  s.unlockedSkills.some(x=>!LINOS_SKILLS.includes(x)))throw Error("LINOS_SKILLS_INVALID");
 if(s.threadRank!==null&&!LINOS_RANKS.includes(s.threadRank))throw Error("LINOS_RANK_INVALID");
 if(!s.blessed&&(s.threadRank!==null||s.unlockedSkills.length>0||
    [...LINOS_STATS].some(k=>s.current[k]!==0||s.past[k]!==0)))throw Error("LINOS_UNBLESSED_FALNA_INVALID");
 number(s.mp,0,1e12,"LINOS_MP_INVALID");
 if(s.mp>linosScale(s).maxMp+1e-6)throw Error("LINOS_MP_ABOVE_MAX");
 return s;
}
export function linosProfile(s:LinosState,diameterMm=2,hands=8){
 validateLinosState(s);
 number(diameterMm,0.01,100,"LINOS_THREAD_DIAMETER");
 if(!Number.isInteger(hands)||hands<1||hands>8)throw Error("LINOS_HANDS_INVALID");
 const derived=linosScale(s),costPerM=diameterMm/0.2;
 return {schema:"LINOS_PROFILE_V1",blessed:s.blessed,level:s.level,rank:s.threadRank,
  attributes:linosAttributes(s),mp:s.mp,maxMp:derived.maxMp,mpPerHourQuiet:round(derived.maxMp/24),
  noRegenInCombat:true,noRegenWhileUsingThread:true,regenFullHoursNoThread:24,
  thread:{diameterMm,kgf:round(480*(diameterMm/2)**2*derived.threadMultiplier),
   creationMps:round(hands*derived.threadMultiplier),costPerMeterMp:round(costPerM),
   maxCreatableMetersIfNoOtherCosts:round(s.mp/costPerM),
   gestureRangeM:derived.gestureRangeM,mentalRangeM:derived.mentalRangeM,
   maxChannels:84,passiveMaterialPersists:true},
  unlockedSkills:[...s.unlockedSkills],skillMultiplier:derived.skillMultiplier,
  threadMultiplier:derived.threadMultiplier,
  authoritativeAtCommitOnly:true,
 };
}
export function linosCastCost(r:LinosAbilityRequest){
 if(!r||typeof r!=="object")throw Error("LINOS_CAST_INVALID");
 const allowed=new Set(["thread",...LINOS_SKILLS]);
 if(!allowed.has(r.ability))throw Error("LINOS_CAST_UNKNOWN");
 const d=number(r.diameterMm??0.2,0.01,100,"LINOS_CAST_DIAMETER");
 const length=number(r.lengthM??0,0,100000,"LINOS_CAST_LENGTH");
 const seconds=number(r.seconds??0,0,86400,"LINOS_CAST_DURATION");
 const loops=number(r.loops??1,1,2,"LINOS_CAST_LOOPS");
 const zones=number(r.zones??1,1,3,"LINOS_CAST_ZONES");
 if(!Number.isInteger(loops)||!Number.isInteger(zones))throw Error("LINOS_CAST_COUNT");
 const meterCost=length*d/0.2;
 const mode=r.mode??"idle";
 if(!["idle","fast","moderate","loaded"].includes(mode))throw Error("LINOS_CAST_MODE");
 const tr=r.trigger??"none";
 if(!["none","light","medium","heavy"].includes(tr))throw Error("LINOS_CAST_TRIGGER");
 let cost=0,materialMp=0,details="";
 switch(r.ability){
  case "thread":
   if(length<=0)throw Error("LINOS_CAST_LENGTH_REQUIRED");
   cost=meterCost;materialMp=meterCost;details="Creation only; any active control is a separate cost";break;
  case "optical_new":
   if(length<=0)throw Error("LINOS_CAST_LENGTH_REQUIRED");
   materialMp=meterCost;cost=12+2*meterCost;
   details="12 MP setup plus original fiber and equal optical shaping surcharge";break;
  case "optical_hide":{
   if(length<=0)throw Error("LINOS_CAST_LENGTH_REQUIRED");
   const blocks=Math.ceil(length/10);cost=blocks*(15+seconds);
   details="Temporary optical camouflage of previously created thread";break;
  }
  case "magic_drive":
   if(seconds<=0)throw Error("LINOS_CAST_DURATION_REQUIRED");
   cost=loops*(10+seconds*(mode==="idle"?1:mode==="fast"?3:mode==="moderate"?5:10));
   details="20-40 rev/sec for approximately 0.3 m diameter; linear limit 40 m/s";break;
  case "living_network":
   cost=zones*(5+2*seconds/60)+(tr==="none"?0:tr==="light"?5:tr==="medium"?15:30);
   details="3x3 m zone, <=3 zones, charged separately for each trigger";break;
  case "cutting_loop":
   if(seconds<=0)throw Error("LINOS_CAST_DURATION_REQUIRED");
   cost=15+seconds*(mode==="idle"?2:mode==="moderate"?5:10);
   details="Use magic_drive cost instead if driving the same loop with an existing drive";break;
  case "web_regeneration":
   if(!r.externalMaterialProvided||length<=0)throw Error("LINOS_REPAIR_EXTERNAL_RESOURCE_REQUIRED");
   cost=15+0.4*meterCost;details="External suitable material must be consumed separately";break;
  case "healing_cocoon":
   if(seconds<=0||seconds>900)throw Error("LINOS_HEAL_DURATION_INVALID");
   cost=10+20*seconds/60;
   details="Approx 3% target max HP / minute; capped at 15 minutes; cocoon material separate";break;
  case "draining_bindings":
   if(seconds<=0||seconds>30)throw Error("LINOS_DRAIN_DURATION_INVALID");
   cost=10+20*seconds/10;details="Up to 10% target stamina / 10 seconds; max 30% per episode";break;
  case "microspikes":
   if(length<=0)throw Error("LINOS_CAST_LENGTH_REQUIRED");
   cost=10+0.5*meterCost;details="Treatment only; fiber creation charged separately";break;
  case "sensory_network":
   if(length<=0)throw Error("LINOS_CAST_LENGTH_REQUIRED");
   cost=Math.ceil(length/10)*(5+2*seconds/60);
   details="Contact sensing, not identity or omniscience";break;
  case "recolor":
   if(length<=0)throw Error("LINOS_CAST_LENGTH_REQUIRED");
   cost=5+0.5*meterCost;details="Changing already-existing fiber, not creating new fiber";break;
 }
 if(!Number.isFinite(cost)||cost>1e10)throw Error("LINOS_CAST_TOO_EXPENSIVE");
 return {ability:r.ability,costMp:round(cost),materialMp:round(materialMp),
  durationSeconds:seconds,description:details,includesMaterial:materialMp>0,
  passiveRegenDuringUse:false};
}
export function previewLinosCast(s:LinosState,r:LinosAbilityRequest){
 validateLinosState(s);
 const priced=linosCastCost(r);
 const available=r.ability==="thread"||s.unlockedSkills.includes(r.ability as LinosSkill);
 return {...priced,unlocked:available,canCast:available&&s.mp>=priced.costMp,
  mpBefore:s.mp,mpAfterIfCommitted:available&&s.mp>=priced.costMp?round(s.mp-priced.costMp):null,
  committed:false};
}
export function resolveLinosCast(s:LinosState,r:LinosAbilityRequest):LinosState{
 const proposed=previewLinosCast(s,r);
 if(!proposed.unlocked)throw Error("LINOS_SKILL_NOT_UNLOCKED");
 if(!proposed.canCast)throw Error("LINOS_MP_INSUFFICIENT");
 return {...s,mp:round(s.mp-proposed.costMp)};
}
export function regenerateLinosMp(s:LinosState,minutes:number,kind:"quiet"|"combat"|"thread_use"){
 validateLinosState(s);
 number(minutes,0,10080,"LINOS_RECOVERY_DURATION");
 if(!["quiet","combat","thread_use"].includes(kind))throw Error("LINOS_RECOVERY_KIND");
 const gained=kind==="quiet"?linosScale(s).maxMp*minutes/1440:0;
 const after=round(Math.min(linosScale(s).maxMp,s.mp+gained));
 return {state:{...s,mp:after},gainedMp:round(after-s.mp),
  noRegen:kind!=="quiet",elapsedMinutes:minutes};
}
