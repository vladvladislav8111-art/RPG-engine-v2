/** Explicit v4.8 critical profile. No free hit, penetration or duplicated critical. */
export function criticalProfile(id:"critical_attack"|"mutilation",level:number){
 const max=id==="critical_attack"?5:10;
 if(!Number.isSafeInteger(level)||level<1||level>max)throw Error("V48_CRITICAL_LEVEL_INVALID");
 return id==="critical_attack"?{mp:70-(level-1)*10,multiplier:2+(level-1)*.25,strikes:1}:
  {mp:Math.round(150-(level-1)*50/9),multiplier:3+(level-1)/9,strikes:3+Math.floor((level-1)*7/9),seriesDurationMs:300-20*(level-1)};
}
export function criticalMultiplier(weakPoint:boolean,forced?:number){return forced??(weakPoint?1.5:1)}
/** A miss ends the chain; no extra target and no extra vital proof. */
export function criticalChain(profile:{strikes:number},firstHit:boolean,damage:number,hp:number,hit:(i:number)=>boolean){
 if(!firstHit)return [];
 const strikes=[damage];
 for(let i=1;i<profile.strikes&&strikes.reduce((a,b)=>a+b,0)<hp;i++){
  if(!hit(i))break;strikes.push(damage);
 }
 return strikes;
}

/** Fixed System acceleration; not a buff lifetime or wall-clock sleep. */
export type MutilationReceipt={sourceRef:string;enemyRef:string;plannedStrikes:number;
 attemptedStrikes:number;landedStrikes:number;plannedDurationMs:number;elapsedMs:number};
export function timedMutilationChain(profile:{strikes:number;seriesDurationMs:number},firstHit:boolean,damage:number,hp:number,hit:(i:number)=>boolean){
 if(!Number.isSafeInteger(profile.strikes)||profile.strikes<3||profile.strikes>10||
  !Number.isSafeInteger(profile.seriesDurationMs)||profile.seriesDurationMs<120||profile.seriesDurationMs>300)
  throw Error("V48_MUTILATION_TIMING_INVALID");
 let attempts=1;
 const impacts=criticalChain(profile,firstHit,damage,hp,i=>{attempts++;return hit(i)});
 return {impacts,plannedStrikes:profile.strikes,attemptedStrikes:attempts,
  landedStrikes:impacts.length,plannedDurationMs:profile.seriesDurationMs,
  elapsedMs:Math.ceil(profile.seriesDurationMs*attempts/profile.strikes)};
}
