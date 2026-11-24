/** Bounded deterministic GM hunt: all individual actions reuse the live
 * combat, skills, rewards and loot handlers. No independent damage formula.
 * A sector population is a local encounter model, not a global Dungeon census.
 */
import type {LabSession} from "./session.ts";
import type {OrarioPlayerAction} from "./orario_player_event.ts";
import {narrativeMinute} from "./events.ts";
import {boundedChildRef} from "./event_child_refs.ts";
import {getV4MonsterCard,listV4CombatCards} from "./live_monster_profile.ts";
import {monsterForPlayer} from "./danmachi_player_balance.ts";
import {previewVerifiedLoadout} from "./danmachi_player_equipment.ts";
import {effectiveJinwooMaxHp,effectiveJinwooMaxMp,effectiveJinwooStaminaReserve,
 xpToNextLevel,type JinwooState} from "./shadow_monarch_rules.ts";
const REF=/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const int=(x:unknown,a:number,b:number):x is number=>
 typeof x==="number"&&Number.isSafeInteger(x)&&x>=a&&x<=b;
const hash=(s:string)=>{let h=2166136261>>>0;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const alpha=(n:number)=>{let out="";do{out=String.fromCharCode(97+n%26)+out;n=Math.floor(n/26);}while(n);return out;};
const clock=(m:number)=>"D"+Math.floor(m/1440)+" "+String(Math.floor(m%1440/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
const round=(v:number)=>Math.round(v*100)/100;
const knownVital=new Set(["killer_ant","needle_rabbit","kobold","goblin","dungeon_lizard","war_shadow","orc","silverback","imp","bad_bat","frog_shooter","almiraj","jack_bird","minotaur"]);
export type HuntOptions={
 floor:number;durationMinutes:number;intervalMinutes:number;mode:"ant_chain"|"patrol";
 weaponId:string;baitWeaponId:string;speedAt:number;stopHpPercent:number;
 stopFatigue:number;collectStones:boolean;collectMaterials:boolean;includeOtherMonsters:boolean;
};
export type HuntSector={index:number;pending:number;reserve:number;signalled:number;defeated:number;};
type Snapshot={level:number;xp:number;hp:number;hpMax:number;mp:number;mpMax:number;
 fatigue:number;stamina:{current:number;max:number;fatiguePercent:number};
 gold:number;valis:number;freeStatPoints:number;};
export type HuntEncounterReceipt={targetRef:string;monsterId:string;time:string;sector:number;
 outcome:"victory"|"ongoing"|"unconscious";exchangeCount:number;baitWounded:boolean;
 summoned:number;speedActivated:boolean;xp:number;gold:number;damageTaken:number;
 defeatRef:string|null;stoneRef:string|null;material:string|null;};
export type HuntBlockReceipt={from:string;to:string;sector:number;openedSector:boolean;
 localCleared:boolean;encounters:HuntEncounterReceipt[];};
export type HuntReceipt={schema:"CHROMA_HUNT_BATCH_V1";sourceRef:string;startClock:string;
 endClock:string;options:HuntOptions;stopReason:"duration"|"hp"|"fatigue"|"mana_for_group"|
 "encounter_limit"|"unresolved_battle"|"unconscious"|"stone_capacity";
 before:Snapshot;after:Snapshot;totals:{kills:number;xp:number;gold:number;stones:number;
 materials:number;damageTaken:number;speedActivations:number;mpSpent:number;exchanges:number};
 blocks:HuntBlockReceipt[];remaining:HuntSector|null;locationId:string;};
type Apply=(s:LabSession,a:OrarioPlayerAction,ref:string,time:string)=>JinwooState;
function snap(s:JinwooState):Snapshot{return {level:s.systemLevel,xp:s.xp,hp:s.hp,hpMax:effectiveJinwooMaxHp(s),
 mp:s.mp,mpMax:effectiveJinwooMaxMp(s),fatigue:round(s.fatigue),stamina:effectiveJinwooStaminaReserve(s),
 gold:s.gold,valis:s.valis,freeStatPoints:s.freeStatPoints};}
function gained(before:Snapshot,after:Snapshot){
 let xp=after.xp-before.xp;for(let i=before.level;i<after.level;i++)xp+=xpToNextLevel(i,true);return xp;
}
function options(q:Record<string,unknown>):HuntOptions{
 const allowed=new Set(["floor","durationMinutes","intervalMinutes","mode","weaponId","baitWeaponId","speedAt",
 "stopHpPercent","stopFatigue","collectStones","collectMaterials","includeOtherMonsters"]);
 if(Object.keys(q).some(k=>!allowed.has(k)))throw Error("HUNT_OPTION_UNKNOWN");
 const o={floor:q.floor,durationMinutes:q.durationMinutes,intervalMinutes:q.intervalMinutes??10,
 mode:q.mode??"ant_chain",weaponId:q.weaponId??"kasaka_fang",baitWeaponId:q.baitWeaponId??"steel_dagger",
 speedAt:q.speedAt??4,stopHpPercent:q.stopHpPercent??35,stopFatigue:q.stopFatigue??70,
 collectStones:q.collectStones??true,collectMaterials:q.collectMaterials??false,includeOtherMonsters:q.includeOtherMonsters??true};
 if(!int(o.floor,1,100)||!int(o.durationMinutes,5,180)||!int(o.intervalMinutes,5,10)||
  !["ant_chain","patrol"].includes(String(o.mode))||!int(o.speedAt,3,8)||
  !int(o.stopHpPercent,10,95)||!int(o.stopFatigue,10,95)||
  !["kasaka_fang","steel_dagger","dagger_hardened","dagger_basic"].includes(String(o.weaponId))||
  !["steel_dagger","dagger_hardened","dagger_basic"].includes(String(o.baitWeaponId))||
  typeof o.collectStones!=="boolean"||typeof o.collectMaterials!=="boolean"||
  typeof o.includeOtherMonsters!=="boolean")throw Error("HUNT_OPTIONS_INVALID");
 if(o.mode==="ant_chain"&&(o.floor<7||o.floor>9))throw Error("HUNT_ANT_FLOOR_INVALID");
 return o as HuntOptions;
}
function naturalSpecies(floor:number){
 return listV4CombatCards().filter(id=>{const c=getV4MonsterCard(id)!;
  return c.origin==="DanMachi"&&c.canSpawnNaturally&&!c.requiresStoryTrigger&&
   c.kind!=="босс"&&c.kind!=="легенда"&&c.floorRanges.some(([lo,hi])=>floor>=lo&&floor<=hi);
 });
}
/** Preview and CAS commit call this exact function with the same sourceRef.
 * The caller cannot supply rewards, rolls, enemy HP or population counts.
 */
export function runChromaHuntBatch(session:LabSession,sourceRef:string,q:Record<string,unknown>,apply:Apply){
 const original=session.player.jinwoo,location=session.player.locationId??"";
 const start=narrativeMinute(session.gameClock);
 if(session.projectId!=="chroma_orario_main_20261120"||session.sessionId!=="chroma_day0_20261120"||
   session.player.hero?.id!=="hero.chroma"||!original||!original.storyFlags.includes("chroma_crossover_v4")||
   !location.startsWith("orario.dungeon")||start===null||!REF.test(sourceRef)||
   original.appliedRewardRefs.includes(sourceRef)||original.activeEncounter||original.awaitingActivation||original.hp<=0||
   Object.values(original.dungeonKeys).some(k=>k.state==="entered"))
  throw Error("HUNT_SESSION_NOT_READY");
 const o=options(q),species=naturalSpecies(o.floor);
 if(!species.length)throw Error("HUNT_NO_NATURAL_SPECIES");
 previewVerifiedLoadout(original,{weaponId:o.weaponId});
 if(o.mode==="ant_chain")previewVerifiedLoadout(original,{weaponId:o.baitWeaponId});
 const before=snap(original);let p=structuredClone(original);
 const previous=p.lastHuntBatch;delete p.lastHuntBatch;
 let sector:HuntSector|null=previous?.endClock===session.gameClock&&previous.locationId===location&&
   previous.options.floor===o.floor&&previous.options.mode==="ant_chain"&&o.mode==="ant_chain"&&previous.remaining?
   structuredClone(previous.remaining):null;
 let index=sector?.index??0,serial=0,enemyCount=0;
 let reason:HuntReceipt["stopReason"]="duration",end=start;
 const totals:HuntReceipt["totals"]={kills:0,xp:0,gold:0,stones:0,materials:0,damageTaken:0,speedActivations:0,mpSpent:0,exchanges:0};
 const blocks:HuntBlockReceipt[]=[];
 const child=(kind:string)=>boundedChildRef(sourceRef,"hunt.","."+kind+"."+alpha(serial++));
 const act=(minute:number,kind:string,args:Record<string,unknown>,ref=child(kind.replace(/_/g,".")))=>{
  p=apply({...session,gameClock:clock(minute),player:{...session.player,jinwoo:p}},
   {kind,playerApproved:true,args},ref,clock(minute));return ref;
 };
 const stop=():HuntReceipt["stopReason"]|null=>p.hp<=0?"unconscious":
  p.hp/effectiveJinwooMaxHp(p)*100<=o.stopHpPercent?"hp":
  p.fatigue>=o.stopFatigue?"fatigue":
  o.collectStones&&Object.keys(p.magicStones).length>=500?"stone_capacity":
  enemyCount>=48?"encounter_limit":null;
 const seed=(s:string)=>hash(session.sessionId+"|"+session.gameClock+"|"+o.floor+"|"+s);
 function fight(minute:number,id:string,chain:HuntSector|null):HuntEncounterReceipt{
  const targetRef=child("target"),card=monsterForPlayer(p,id,{floor:o.floor,monsterRef:targetRef});
  const b=snap(p);enemyCount++;
  const r:HuntEncounterReceipt={targetRef,monsterId:id,time:clock(minute),sector:chain?.index??index,
   outcome:"ongoing",exchangeCount:0,baitWounded:false,summoned:0,speedActivated:false,
   xp:0,gold:0,damageTaken:0,defeatRef:null,stoneRef:null,material:null};
  act(minute,"start_battle",{monsterId:id,monsterRef:targetRef,floor:o.floor,confirmedHostile:true});
  const attack=(weaponId:string,bait:boolean)=>{
   const hp=p.hp;
   act(minute,"combat_exchange",{move:"strike",loadout:{weaponId},targetLocation:bait?"left_leg":"head",
    ...(!bait&&knownVital.has(id)?{vitalTarget:"brain",confirmedWeakPointHit:true}:{}),tacticalApproach:"standard"});
   r.damageTaken+=Math.max(0,hp-p.hp);r.exchangeCount++;totals.exchanges++;
  };
  if(chain&&chain.reserve>0){
   const initial=p.activeEncounter!.enemyHp;
   for(let j=0;j<3&&p.activeEncounter&&p.hp>0&&p.activeEncounter.enemyHp===initial&&!stop();j++)
    attack(o.baitWeaponId,true);
   if(p.activeEncounter&&p.hp>0&&p.activeEncounter.enemyHp<initial){
    r.baitWounded=true;r.summoned=Math.min(chain.reserve,1+seed("signal|"+chain.index+"|"+chain.signalled)%2);
    chain.signalled++;chain.reserve-=r.summoned;chain.pending+=r.summoned;
   }else if(p.activeEncounter&&p.hp>0){reason=stop()??"unresolved_battle";}
  }
  if(reason==="duration"&&p.activeEncounter&&chain&&chain.pending+1>=o.speedAt&&
    !(p.activeSkills??[]).some(x=>["quicksilver","sprint"].includes(x.id)&&x.expiresMinute>minute)){
   const skillId=p.unlockedSkills.includes("quicksilver")?"quicksilver":
     p.unlockedSkills.includes("sprint")?"sprint":null;
   if(skillId){
    const need=skillId==="quicksilver"?7:6;
    if(p.mp<need)reason="mana_for_group";
    else {const mp=p.mp;act(minute,"activate_skill",{skillId,durationMinutes:1});
     r.speedActivated=true;totals.speedActivations++;totals.mpSpent+=mp-p.mp;}
   }
  }
  for(let j=0;j<6&&reason==="duration"&&p.activeEncounter&&!stop();j++)attack(o.weaponId,false);
  if(p.defeatedTargetRefs.includes(targetRef)){
   r.outcome="victory";r.defeatRef=p.defeatEvidence?.[targetRef]?.sourceRef??null;
   if(!r.defeatRef)throw Error("HUNT_MISSING_DEFEAT_PROOF");
   totals.kills++;if(chain)chain.defeated++;
   if(o.collectStones&&card.magicStoneValis>0&&Object.keys(p.magicStones).length<500){
    const stoneId=child("stone");
    r.stoneRef=act(minute,"stone_collect",{monsterId:id,monsterRef:targetRef,stoneId,
     monsterName:card.name,confirmedLoot:true,intact:true,powerRating:card.systemThreatLevel,
     powerTier:card.kind==="elite"?"elite":"common",corruptedMana:false,acquisition:"own_kill",
     sizePct:100,saturationPct:100,integrityPct:100});totals.stones++;
   }
   if(o.collectMaterials){const old=p.chromaV4Meta!.recoveredMaterials.length;
    act(minute,"monster_drop",{monsterId:id,monsterRef:targetRef,confirmedDefeat:true});
    if(p.chromaV4Meta!.recoveredMaterials.length>old){r.material=p.chromaV4Meta!.recoveredMaterials.at(-1)!.itemId;totals.materials++;}
   }
  }else{r.outcome=p.hp<=0?"unconscious":"ongoing";reason=stop()??(reason==="duration"?"unresolved_battle":reason);}
  const after=snap(p);r.xp=gained(b,after);r.gold=after.gold-b.gold;
  totals.xp+=r.xp;totals.gold+=r.gold;totals.damageTaken+=r.damageTaken;
  if(reason==="duration")reason=stop()??"duration";
  return r;
 }
 for(let offset=0;offset<o.durationMinutes&&reason==="duration";offset+=o.intervalMinutes){
  const from=start+offset,to=Math.min(start+o.durationMinutes,from+o.intervalMinutes);
  const priorStop=stop();if(priorStop){reason=priorStop;break;}
  const b:HuntBlockReceipt={from:clock(from),to:clock(to),sector:sector?.index??index,openedSector:false,localCleared:false,encounters:[]};
  blocks.push(b);end=to;
  if(o.mode==="ant_chain"){
   if(!sector){index++;b.sector=index;b.openedSector=true;
    // Local model: a sector has a finite reachable population; occasional empty
    // search intervals and different sector sizes prevent perpetual respawn.
    const density=seed("sector|"+index)%10;
    if(density>=2)sector={index,pending:1,reserve:2+seed("population|"+index)%7,signalled:0,defeated:0};
   }
   const slots=Math.min(5,Math.max(1,Math.floor((to-from)/2)));
   for(let slot=0;sector&&sector.pending>0&&slot<slots&&reason==="duration";slot++){
    const minute=Math.min(to,from+2+Math.floor(slot/2));sector.pending--;
    b.encounters.push(fight(minute,"killer_ant",sector));
    if(reason!=="duration"){end=minute;b.to=clock(end);break;}
   }
   if(sector&&sector.pending===0&&sector.reserve===0&&!p.activeEncounter){b.localCleared=true;sector=null;}
   // Opportunistic fights happen on the way through an empty/cleared sector,
   // not as invented simultaneous attacks while an ant encounter is active.
   const others=species.filter(x=>x!=="killer_ant");
   if(reason==="duration"&&!sector&&o.includeOtherMonsters&&others.length&&
     b.encounters.length<slots&&seed("incidental|"+offset)%3!==0){
    const minute=to;const id=others[seed("species|"+offset)%others.length];
    b.encounters.push(fight(minute,id,null));if(reason!=="duration"){end=minute;b.to=clock(end);}
   }
  }else{
   const count=Math.min(Math.floor((to-from)/2),seed("patrol-count|"+offset)%3);
   for(let j=0;j<count&&reason==="duration";j++){
    const minute=Math.min(to,from+3+j*2);
    b.encounters.push(fight(minute,species[seed("patrol-species|"+offset+"|"+j)%species.length],null));
    if(reason!=="duration"){end=minute;b.to=clock(end);}
   }
  }
 }
 // A refusal before any elapsed time does not create a fake completed turn.
 if(end<=start)throw Error("HUNT_STOP_BEFORE_START:"+reason);
 const receipt:HuntReceipt={schema:"CHROMA_HUNT_BATCH_V1",sourceRef,startClock:session.gameClock,endClock:clock(end),
  options:o,stopReason:reason,before,after:snap(p),totals,blocks,
  remaining:sector?structuredClone(sector):null,locationId:location};
 p.appliedRewardRefs.push(sourceRef);p.lastHuntBatch=receipt;
 return {next:p,receipt};
}
