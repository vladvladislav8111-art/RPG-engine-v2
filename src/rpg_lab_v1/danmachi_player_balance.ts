/** Cross-universe battle calibration, revision 1.
 * Source-inspired lore anchors: DanMachi Falna ability rank and qualitative
 * level-up are not numerically interchangeable with Solo Leveling stats.
 * ALL combat values, monster HP, XP, gold, ratios below are house rules.
 * No combat victory, damage, loot, XP or Dungeon access is committed by a
 * preview. The narrative decides consequences and retains player agency.
 */
import {awardJinwooEncounter,projectJinwooFalna,CHROMA_BALANCE_FLAG,
 type JinwooStats,type JinwooState} from "./shadow_monarch_rules.ts";
import {CHROMA_LINOS_STONE_BASE_VALIS} from "./chroma_guild_economy.ts";
import {SYSTEM_ENCOUNTER_BY_ID,FIRST_INSTANT_CANON_RULES} from "./orario_system_encounters.ts";
type Tier="ordinary"|"elite"|"rare"|"monster_rex";
export type DanmachiMonsterBalance={
 id:string;name:string;floorMin:number;floorMax:number;
 approximateDanmachiLevel:number;systemThreatLevel:number;kind:Tier;
 combat:JinwooStats;
 hp:number;armor:number;weaponForce:number;
 baseXp:number;baseSystemGold:number;magicStoneValis:number;
 features:string[];loreNote:string;
};
/** DanMachi floors and qualitative categories are lore anchors;
 * numbers and exact System rewards are solely the crossover's design.
 * Monster Rex Goliath is 17F, while 18F Black Goliath is a distinct
 * irregular future event and must never be used as this template.
 */
export const ORARIO_MONSTER_BALANCE:readonly DanmachiMonsterBalance[]=[
 {id:"goblin",name:"Гоблин",floorMin:1,floorMax:4,
  approximateDanmachiLevel:1,systemThreatLevel:1,kind:"ordinary",
  combat:{strength:9,stamina:8,agility:8,perception:7,intelligence:1},
  hp:80,armor:1,weaponForce:3,baseXp:13,baseSystemGold:25,magicStoneValis:28,
  features:["группа","короткое оружие"],loreNote:"Начальные этажи, слабый монстр"},
 {id:"kobold",name:"Кобольд",floorMin:1,floorMax:4,
  approximateDanmachiLevel:1,systemThreatLevel:2,kind:"ordinary",
  combat:{strength:11,stamina:10,agility:11,perception:8,intelligence:1},
  hp:95,armor:1,weaponForce:4,baseXp:17,baseSystemGold:32,magicStoneValis:36,
  features:["рывок","когти"],loreNote:"Начальные этажи, опаснее гоблина в ближнем бою"},
 {id:"dungeon_lizard",name:"Подземная ящерица",floorMin:2,floorMax:4,
  approximateDanmachiLevel:1,systemThreatLevel:3,kind:"ordinary",
  combat:{strength:12,stamina:14,agility:8,perception:8,intelligence:1},
  hp:125,armor:4,weaponForce:4,baseXp:23,baseSystemGold:42,magicStoneValis:52,
  features:["чешуя","низкая посадка"],loreNote:"Местная ящерица; сильнее защищена"},
 {id:"war_shadow",name:"Военная тень",floorMin:5,floorMax:7,
  approximateDanmachiLevel:1,systemThreatLevel:7,kind:"elite",
  combat:{strength:18,stamina:15,agility:23,perception:19,intelligence:2},
  hp:175,armor:2,weaponForce:7,baseXp:96,baseSystemGold:72,magicStoneValis:100,
  features:["скрытность","засада"],loreNote:"Один из опасных для новичков монстров 5–7 этажей"},
 {id:"killer_ant",name:"Муравей-убийца",floorMin:5,floorMax:9,
  approximateDanmachiLevel:1,systemThreatLevel:8,kind:"elite",
  combat:{strength:20,stamina:30,agility:15,perception:12,intelligence:1},
  hp:260,armor:9,weaponForce:8,baseXp:116,baseSystemGold:84,magicStoneValis:130,
  features:["панцирь","зов сородичей"],loreNote:"Угроза толпой даже подготовленным новичкам"},
 /** Upper floors, 7–10: canon species; numerical values are crossover house rules.
  * Their magic stone appraisal is provided by CHROMA_LINOS_STONE_BASE_VALIS.
  */
 {id:"purple_moth",name:"Фиолетовый мотылёк",floorMin:7,floorMax:7,
  approximateDanmachiLevel:1,systemThreatLevel:6,kind:"ordinary",
  combat:{strength:12,stamina:10,agility:27,perception:20,intelligence:1},
  hp:105,armor:0,weaponForce:5,baseXp:58,baseSystemGold:55,magicStoneValis:675,
  features:["полёт","ядовитая пыльца","уклонение от ударов"],
  loreNote:"Хрупкий противник 7-го этажа: опасен в группе и при долгом воздействии пыльцы"},
 {id:"needle_rabbit",name:"Игольчатый кролик",floorMin:7,floorMax:10,
  approximateDanmachiLevel:1,systemThreatLevel:9,kind:"ordinary",
  combat:{strength:21,stamina:16,agility:34,perception:23,intelligence:1},
  hp:165,armor:2,weaponForce:10,baseXp:96,baseSystemGold:85,magicStoneValis:1000,
  features:["быстрый прыжок","колющий рог","резкая смена траектории"],
  loreNote:"Зверь 7–10-го этажей: опаснее начальных гоблинов и кобольдов, но хрупче муравья"},
 /** Upper floors, 10–12: groups of imps and especially dangerous heavy orcs. */
 {id:"imp",name:"Имп",floorMin:10,floorMax:12,
  approximateDanmachiLevel:1,systemThreatLevel:12,kind:"ordinary",
  combat:{strength:24,stamina:20,agility:36,perception:29,intelligence:4},
  hp:195,armor:3,weaponForce:10,baseXp:155,baseSystemGold:110,magicStoneValis:1750,
  features:["маневренность","атаки группой","хитрость","засада в тумане"],
  loreNote:"Подвижный бес 10-го этажа, опасен численностью и атаками с разных сторон"},
 {id:"orc",name:"Орк",floorMin:10,floorMax:12,
  approximateDanmachiLevel:1,systemThreatLevel:16,kind:"elite",
  combat:{strength:47,stamina:53,agility:20,perception:17,intelligence:2},
  hp:660,armor:13,weaponForce:19,baseXp:340,baseSystemGold:210,magicStoneValis:5500,
  features:["тяжёлый удар","толстая шкура","длинные руки","высокая масса"],
  loreNote:"Крупный и крайне опасный противник 10–12-го этажей: прямой удар может вывести из боя даже сильного авантюриста"},
 {id:"silverback",name:"Сильвербек",floorMin:11,floorMax:12,
  approximateDanmachiLevel:1,systemThreatLevel:12,kind:"rare",
  combat:{strength:34,stamina:39,agility:22,perception:16,intelligence:2},
  hp:430,armor:7,weaponForce:11,baseXp:115,baseSystemGold:145,magicStoneValis:240,
  features:["мощный удар","бросок"],loreNote:"Крайне опасен для неготового 1-го уровня"},
 {id:"infant_dragon",name:"Молодой дракон",floorMin:11,floorMax:12,
  approximateDanmachiLevel:2,systemThreatLevel:20,kind:"rare",
  combat:{strength:48,stamina:57,agility:21,perception:22,intelligence:17},
  hp:700,armor:13,weaponForce:19,baseXp:245,baseSystemGold:285,magicStoneValis:550,
  features:["огонь","чешуя"],loreNote:"Редкий монстр, опасность примерно второго уровня"},
 {id:"minotaur",name:"Минотавр",floorMin:15,floorMax:17,
  approximateDanmachiLevel:2,systemThreatLevel:25,kind:"rare",
  combat:{strength:68,stamina:59,agility:29,perception:22,intelligence:1},
  hp:930,armor:8,weaponForce:20,baseXp:360,baseSystemGold:430,magicStoneValis:780,
  features:["мощь","страх","натиск"],loreNote:"Минотавр гораздо сильнее начинающего; на 5-м этаже возможен только как отдельная подтверждённая аномалия"},
 {id:"goliath_17",name:"Голиаф семнадцатого этажа",
  floorMin:17,floorMax:17,approximateDanmachiLevel:4,systemThreatLevel:50,kind:"monster_rex",
  combat:{strength:260,stamina:330,agility:77,perception:60,intelligence:8},
  hp:9400,armor:35,weaponForce:65,
  baseXp:2450,baseSystemGold:2100,magicStoneValis:7500,
  features:["огромный размер","ударная волна","босс этажа"],
  loreNote:"Обычный Голиаф 17F, не чёрный аномальный Голиаф 18F"},
];
export const ORARIO_MONSTER_BY_ID:Readonly<Record<string,DanmachiMonsterBalance>>={
 ...Object.fromEntries(ORARIO_MONSTER_BALANCE.map(x=>[x.id,x])),
 ...SYSTEM_ENCOUNTER_BY_ID
};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const safeNum=(x:number,lo:number,hi:number)=>Number.isFinite(x)&&x>=lo&&x<=hi;
const weighted=(s:JinwooStats,kind:"attack"|"guard"|"magic")=>
 kind==="attack"?s.strength*.46+s.agility*.27+s.perception*.22+s.stamina*.05:
 kind==="guard"?s.stamina*.54+s.agility*.28+s.perception*.18:
 s.intelligence*.78+s.perception*.22;
export type BalanceOutlook="controlled"|"advantaged"|"contested"|"dangerous"|"overwhelming";
export function comparePlayerToOrarioMonster(s:JinwooState,params:{
 monsterId:string;floor:number;monsterCount?:number;
 confirmedIrregularRef?:string;
}){
 const mob=ORARIO_MONSTER_BY_ID[params.monsterId];
 if(!mob)throw Error("BALANCE_MONSTER_UNKNOWN");
 if(!Number.isSafeInteger(params.floor)||params.floor<1||params.floor>100)
  throw Error("BALANCE_FLOOR_INVALID");
 if((params.floor<mob.floorMin||params.floor>mob.floorMax)&&
  !/^[a-zA-Z_][\w.:-]{0,79}$/.test(params.confirmedIrregularRef??""))
  throw Error("BALANCE_MONSTER_OUTSIDE_KNOWN_FLOOR");
 const count=params.monsterCount??1;
 if(!Number.isSafeInteger(count)||count<1||count>20)
  throw Error("BALANCE_GROUP_INVALID");
 const total=projectJinwooFalna(s).total;
 // Original Wolf Slayer title: +40% combat stats against beast-type mobs.
 // This projection does NOT mutate System points or permanently refill HP/MP.
 const beasts=new Set(["system.dungeon_wolf","system.razan",
  "system.briga","system.kasaka","kobold","dungeon_lizard","needle_rabbit",
  "silverback","infant_dragon","minotaur"]);
 if(s.storyFlags.includes("title.wolf_slayer")&&beasts.has(mob.id))
  for(const key of ["strength","stamina","agility","perception","intelligence"] as const)
   total[key]=Math.round(total[key]*FIRST_INSTANT_CANON_RULES.wolfSlayerCombatStatsMultiplier);
 const attack=weighted(total,"attack"),guard=weighted(total,"guard");
 const enemyAttack=weighted(mob.combat,"attack"),enemyGuard=weighted(mob.combat,"guard");
 const offenseRatio=attack/enemyGuard;
 const defenseRatio=guard/enemyAttack;
 const score=Math.sqrt(Math.max(.01,offenseRatio*defenseRatio))/
  Math.sqrt(count);
 const outcome:BalanceOutlook=score>=2.4?"controlled":
  score>=1.38?"advantaged":score>=.82?"contested":
  score>=.46?"dangerous":"overwhelming";
 return {
  player:{...total},monsterId:mob.id,monsterName:mob.name,monsterCount:count,
  scenarioFloor:params.floor,monsterCanonicalLevelApprox:mob.approximateDanmachiLevel,
  monsterSystemThreatLevel:mob.systemThreatLevel,monsterThreatClass:mob.kind,
  offenseRatio:+offenseRatio.toFixed(3),defenseRatio:+defenseRatio.toFixed(3),
  estimatedEngagementRatio:+score.toFixed(3),outlook:outcome,
  warnsAboutBoss:mob.kind==="monster_rex",
  abilitiesNotCaptured:mob.features,
  noVictoryGuaranteed:true,noFreeDamageOrXP:true,
  relativeScaleIsHouseRule:true,readOnly:true
 };
}
export type FalnaBenchmark={
 divineLevel:number;currentStatus:{strength:number;endurance:number;
  dexterity:number;agility:number;magic:number};
 legacyPerAbility?:{strength:number;endurance:number;
  dexterity:number;agility:number;magic:number};
};
export function estimateFalnaAdventurerBenchmark(c:FalnaBenchmark){
 if(!Number.isInteger(c.divineLevel)||c.divineLevel<1||c.divineLevel>10)
  throw Error("BALANCE_FALNA_LEVEL_INVALID");
 const rankKeys=["strength","endurance","dexterity","agility","magic"] as const;
 for(const k of rankKeys){
  if(!Number.isSafeInteger(c.currentStatus[k])||c.currentStatus[k]<0||
   c.currentStatus[k]>1999||
   (c.legacyPerAbility!==undefined&&
   (!Number.isSafeInteger(c.legacyPerAbility[k])||
    c.legacyPerAbility[k]<0||c.legacyPerAbility[k]>18000)))
    throw Error("BALANCE_FALNA_STATUS_INVALID");
 }
 const base=10*Math.pow(1.75,c.divineLevel-1);
 const axis=(k:typeof rankKeys[number])=>{
  const current=c.currentStatus[k];
  const legacy=c.legacyPerAbility?.[k]??0;
  return +(base*(1+current/1500)*(1+legacy/6000)).toFixed(2);
 };
 return {model:"illustrative_not_official_stat_conversion",
  divineLevel:c.divineLevel,
  combat:{strength:axis("strength"),stamina:axis("endurance"),
   agility:axis("agility"),perception:axis("dexterity"),
   intelligence:axis("magic")} as JinwooStats,
  hiddenExceliaCarryIncluded:c.legacyPerAbility!==undefined,
  noAutomaticWin:true};
}
export type CombatMove="strike"|"magic"|"guard";
export type ExchangePreview={
 hitChancePercent:number;damageIfHit:number;expectedDamage:number;
 attackerResourceCost:{mp:number;fatigue:number};
 counterHitChancePercent:number;counterDamageIfHit:number;
 opponentFeatures:string[];noCommittedAttack:true;
};
export function previewCombatExchange(s:JinwooState,params:{
 monsterId:string;floor:number;move:CombatMove;
 weaponPower:number;armorPower:number;positionBonus?:number;
 proficiencyBonus?:number;spellMpCost?:number;spellId?:string;monsterCount?:number;
 confirmedIrregularRef?:string;
}):ExchangePreview{
 const threat=comparePlayerToOrarioMonster(s,params);
 const mob=ORARIO_MONSTER_BY_ID[params.monsterId],p=threat.player;
 if(!safeNum(params.weaponPower,0,200)||!safeNum(params.armorPower,0,200)||
  !safeNum(params.positionBonus??0,-25,25)||
  !safeNum(params.proficiencyBonus??0,-10,20))
  throw Error("BALANCE_BATTLE_INPUT_INVALID");
 const spellCost=params.spellMpCost??0;
 const spellId=params.spellId;
 const legitimateSpell=typeof spellId==="string"&&
  /^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(spellId)&&
  (s.unlockedSkills.includes(spellId)||s.falna.skills.includes(spellId))&&
  (spellId==="rulers_authority"||spellId.startsWith("magic_")||
   spellId.startsWith("spell_")||
   (s.falna.skills.includes(spellId)&&
    /^(fire|ice|wind|thunder|lightning|water|earth|dark|light|bolt|arc|flame|frost|nova|ray|arrow|blast)/i.test(spellId)));
 if(params.move==="magic"&&
  (!Number.isSafeInteger(spellCost)||spellCost<1||
   spellCost>s.mp||!legitimateSpell))
  throw Error("BALANCE_MAGIC_NOT_AVAILABLE");
 if(params.move!=="magic"&&
  (params.spellMpCost!==undefined||spellId!==undefined))
  throw Error("BALANCE_MAGIC_COST_WITHOUT_SPELL");
 const guard=params.move==="guard";
 const pos=params.positionBonus??0,prof=params.proficiencyBonus??0;
 const chance=clamp(Math.round(74+
  18*Math.log(Math.max(.01,(p.agility+p.perception)/
   (mob.combat.agility+mob.combat.perception)))+pos+prof-
  s.fatigue*.16),8,97);
 const damage=guard?0:Math.max(1,Math.round(
  (params.move==="magic"?p.intelligence*1.7:
   p.strength*1.4)+params.weaponPower-
  mob.combat.stamina*.35-mob.armor*1.6));
 // Player advantage and reach must matter in each short exchange.
 const enemyChance=clamp(Math.round(35+
  18*Math.log(Math.max(.01,(mob.combat.agility+mob.combat.perception)/
   (p.agility+p.perception)))-
  pos-(guard?18:0)+s.fatigue*.08),2,95);
 const enemyDamage=Math.max(1,Math.round(mob.combat.strength*1.3+
  mob.weaponForce-p.stamina*.35-params.armorPower*1.6));
 return {hitChancePercent:guard?0:chance,
  damageIfHit:damage,expectedDamage:+(chance*damage/100).toFixed(1),
  attackerResourceCost:{mp:params.move==="magic"?params.spellMpCost!:0,
   // Seconds-long exchanges, scaled by the effective endurance attribute.
   fatigue:+((params.move==="magic"?2:guard?.7:1.2)*
    (10/Math.max(10,p.stamina))).toFixed(2)},
  counterHitChancePercent:enemyChance,
  counterDamageIfHit:guard?Math.max(1,Math.ceil(enemyDamage*.35)):enemyDamage,
  opponentFeatures:mob.features,noCommittedAttack:true};
}
export function previewBalancedMonsterReward(s:JinwooState,params:{
 monsterId:string;floor:number;monsterRef:string;
 partySize?:number;contributionPercent?:number;
 confirmedIrregularRef?:string;
}){
 const mob=ORARIO_MONSTER_BY_ID[params.monsterId];
 const r=comparePlayerToOrarioMonster(s,params);
 if(!/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(params.monsterRef))
  throw Error("BALANCE_REWARD_TARGET_INVALID");
 const party=params.partySize??1,con=params.contributionPercent??100;
 if(!Number.isSafeInteger(party)||party<1||party>8||
  !Number.isSafeInteger(con)||con<1||con>100)
  throw Error("BALANCE_REWARD_PARTICIPATION_INVALID");
 const pOff=weighted(r.player,"attack"),pGuard=weighted(r.player,"guard");
 const mOff=weighted(mob.combat,"attack"),mGuard=weighted(mob.combat,"guard");
 const relative=(mOff*.6+mGuard*.4)/(pOff*.6+pGuard*.4);
 // A stronger hero still gets the monster's established base XP; increased
  // leveling thresholds already slow progression. Preserve old gold scaling.
 const goldFactor=relative<.20?0:clamp(Math.pow(relative,.72),.18,2.1);
 const cooperation=(con/100)/(1+.32*(party-1));
 const higherThreat=Math.max(0,mob.systemThreatLevel-s.systemLevel);
 const higherThreatBonus=1+Math.min(5,higherThreat)*.05;
 const xp=Math.max(0,Math.round(mob.baseXp*cooperation*higherThreatBonus));
 const systemGold=Math.max(0,Math.round(
  mob.baseSystemGold*Math.sqrt(Math.max(.04,goldFactor))*
  cooperation));
 return {
  monsterId:mob.id,monsterRef:params.monsterRef,
  earnedOnlyAfterConfirmedDefeat:true,
  xp,systemGold,potentialMagicStoneValis:s.storyFlags.includes(CHROMA_BALANCE_FLAG)?
    (CHROMA_LINOS_STONE_BASE_VALIS[mob.id]??mob.magicStoneValis):
    mob.magicStoneValis,
   monsterSystemThreatLevel:mob.systemThreatLevel,monsterThreatClass:mob.kind,
  lootIsSeparateFromXP:true,notAutoAwarded:true,
  playerAlreadyReceivedXp:s.defeatedTargetRefs.includes(params.monsterRef),
  threatRelativeToPlayer:+relative.toFixed(3),
  note:"House reward formula; a confirmed fight may additionally earn Falna excelia only by a god's update."
 };
}
export function commitBalancedMonsterDefeat(s:JinwooState,e:{
 sourceRef:string;monsterId:string;floor:number;monsterRef:string;
 confirmedDefeat:boolean;killer:"player"|"shadow";
 shadowId?:string;
 partySize?:number;contributionPercent?:number;
 confirmedIrregularRef?:string;
}):JinwooState{
 if(!e.confirmedDefeat)throw Error("BALANCE_UNCONFIRMED_DEFEAT");
 const reward=previewBalancedMonsterReward(s,e);
 const n=awardJinwooEncounter(s,{
  sourceRef:e.sourceRef,targetRef:e.monsterRef,
  confirmed:true,xp:reward.xp,systemGold:reward.systemGold,
  killer:e.killer,shadowId:e.shadowId,
  isNewDefeat:!reward.playerAlreadyReceivedXp,
  gmThreatRated:true
 });
 n.defeatEvidence={...(n.defeatEvidence??{}),[e.monsterRef]:{
  monsterId:e.monsterId,sourceRef:e.sourceRef,
  floor:e.floor
 }};
 // Source-backed canonical Wolf Slayer title: only actual unique defeated
 // System wolves count, never spawns, attacks, or narrative observations.
 if(e.killer==="player"&&e.monsterId==="system.dungeon_wolf"&&
    n.dungeonKeys["instant.first"]?.state==="entered"&&
    !n.storyFlags.includes("title.wolf_slayer")){
  const wolves=Object.entries(n.defeatEvidence).filter(([ref,proof])=>
   proof.monsterId==="system.dungeon_wolf"&&n.defeatedTargetRefs.includes(ref));
  if(wolves.length>=FIRST_INSTANT_CANON_RULES.wolfSlayerEarnedAtUniqueWolves)
   n.storyFlags.push("title.wolf_slayer");
 }
 return n;
}
export const CROSSOVER_BALANCE_NOTES=[
 "Solo Leveling five stats are not numerically identical to Falna's five per-level abilities.",
 "DanMachi level-up gives a large qualitative boost. Benchmark is heuristic and not proof of fixed level equivalence.",
 "Spell requires a verified skill and MP; a high intelligence score alone is not free magic.",
 "Monster power, behavior, magic stone value, XP, combat damage are campaign house rules.",
 "Monster Rex Goliath is Floor 17 Lv4 equivalent; irregular 18F Black Goliath is separate, future-only.",
 "Minotaur appearing near Bell at 5F is a confirmed unusual situation, not a normal monster encounter.",
 "Even equal numbers do not determine outcome: terrain, numbers, surprise, injuries, magic and player decisions matter.",
 "Experience is earned for locally confirmed monster victories; Falna excelia never double-awards System XP."
] as const;
