/** PRIVATE GM-only System instance encounter templates.
 * Canon-inspired landmarks, all exact numerical threat/reward values are
 * crossover rules. The Player never gets automatic preview knowledge.
 * Separate from Orario Dungeon floors: these enemies cannot spawn on Floor 1.
 */
import type {DanmachiMonsterBalance} from "./danmachi_player_balance.ts";
import type {JinwooState} from "./shadow_monarch_rules.ts";
export const SYSTEM_ENCOUNTER_DEFS={
 "system.dungeon_wolf":{instance:"instant.first",stage:1,importance:"mob"},
 "system.razan":{instance:"instant.first",stage:2,importance:"mob"},
 "system.briga":{instance:"instant.first",stage:2,importance:"mob"},
 "system.kasaka":{instance:"instant.first",stage:3,importance:"boss"},
 "system.knight_guard":{instance:"job.change",stage:1,importance:"mob"},
 "system.igris":{instance:"job.change",stage:2,importance:"boss"},
 "system.demon_guard":{instance:"demon.castle",stage:1,importance:"mob"},
 "system.demon_king":{instance:"demon.castle",stage:100,importance:"boss"},
 "system.architect_trial":{instance:"temple.return",stage:1,importance:"boss"}
} as const;
export type SystemEncounterId=keyof typeof SYSTEM_ENCOUNTER_DEFS;
export const SYSTEM_ENCOUNTER_MOBS:readonly DanmachiMonsterBalance[]=[
 {id:"system.dungeon_wolf",name:"Системный волк",floorMin:1,floorMax:100,
  approximateDanmachiLevel:1,systemThreatLevel:5,kind:"ordinary",
  combat:{strength:16,stamina:13,agility:17,perception:16,intelligence:1},
  hp:140,armor:1,weaponForce:5,baseXp:33,baseSystemGold:30,magicStoneValis:0,
  features:["стая","прыжок"],loreNote:"Только экземпляр первого системного подземелья"},
 {id:"system.razan",name:"Разан Чёрной Тени",
  floorMin:1,floorMax:100,approximateDanmachiLevel:1,
  systemThreatLevel:10,kind:"ordinary",
  combat:{strength:24,stamina:23,agility:25,perception:22,intelligence:1},
  hp:210,armor:4,weaponForce:9,baseXp:72,baseSystemGold:44,
  magicStoneValis:0,features:["нападение с земли","слаженные атаки","подвижность"],
  loreNote:"Канонический второй подвальный уровень Хапчжона; действует вместе с Бригами"},
 {id:"system.briga",name:"Острокоготный Брига",
  floorMin:1,floorMax:100,approximateDanmachiLevel:1,
  systemThreatLevel:9,kind:"ordinary",
  combat:{strength:20,stamina:19,agility:29,perception:23,intelligence:2},
  hp:170,armor:2,weaponForce:9,baseXp:59,baseSystemGold:49,
  magicStoneValis:0,features:["атака с потолка","длинные когти","внезапный прыжок"],
  loreNote:"Канонический второй подвальный уровень Хапчжона; засады сверху"},
 {id:"system.kasaka",name:"Касака, синий ядовитый змей",
  floorMin:1,floorMax:100,approximateDanmachiLevel:2,systemThreatLevel:15,kind:"rare",
  combat:{strength:31,stamina:35,agility:26,perception:22,intelligence:3},
  hp:640,armor:11,weaponForce:12,baseXp:460,baseSystemGold:370,
  magicStoneValis:0,features:["яд","длинное тело","толстая чешуя"],
  loreNote:"Босс первого инстанса; победа и награда не предрешены"},
 {id:"system.knight_guard",name:"Бронированный рыцарь испытания",
  floorMin:1,floorMax:100,approximateDanmachiLevel:2,systemThreatLevel:25,kind:"elite",
  combat:{strength:58,stamina:64,agility:45,perception:48,intelligence:5},
  hp:900,armor:23,weaponForce:25,baseXp:320,baseSystemGold:230,
  magicStoneValis:0,features:["оружие","броня","строй"],
  loreNote:"Системный противник классового испытания"},
 {id:"system.igris",name:"Игрис, алый рыцарь",
  floorMin:1,floorMax:100,approximateDanmachiLevel:4,systemThreatLevel:50,kind:"monster_rex",
  combat:{strength:152,stamina:169,agility:144,perception:138,intelligence:20},
  hp:4000,armor:40,weaponForce:45,baseXp:2900,baseSystemGold:1350,
  magicStoneValis:0,features:["мастер клинка","бронировка","командир"],
  loreNote:"Первый рыцарь становится доступен только после честной победы и принятия награды"},
 {id:"system.demon_guard",name:"Демон-страж Замка",
  floorMin:1,floorMax:100,approximateDanmachiLevel:3,systemThreatLevel:40,kind:"elite",
  combat:{strength:100,stamina:110,agility:98,perception:66,intelligence:36},
  hp:1200,armor:20,weaponForce:36,baseXp:950,baseSystemGold:620,
  magicStoneValis:0,features:["огонь","мораль отряда"],
  loreNote:"Одна из промежуточных ступеней, не автоматический пропуск к боссу"},
 {id:"system.demon_king",name:"Демонический король Баран",
  floorMin:1,floorMax:100,approximateDanmachiLevel:7,systemThreatLevel:100,kind:"monster_rex",
  combat:{strength:760,stamina:850,agility:680,perception:520,intelligence:610},
  hp:45000,armor:110,weaponForce:160,baseXp:22000,baseSystemGold:14000,
  magicStoneValis:0,features:["магия молний","босс","высокое сопротивление"],
  loreNote:"Поздний босс Замка демонов, без гарантии победы или Святой воды"},
 {id:"system.architect_trial",name:"Испытание Архитектора",
  floorMin:1,floorMax:100,approximateDanmachiLevel:8,systemThreatLevel:120,kind:"monster_rex",
  combat:{strength:1200,stamina:1100,agility:950,perception:920,intelligence:1000},
  hp:58000,armor:140,weaponForce:200,baseXp:0,baseSystemGold:0,
  magicStoneValis:0,features:["сценарные правила","контроль арены","тайна Системы"],
  loreNote:"Сюжетная развязка, исход определяется реальными событиями, не прокруткой сюжета"}
];
export const SYSTEM_ENCOUNTER_BY_ID:Readonly<Record<string,DanmachiMonsterBalance>>=
 Object.fromEntries(SYSTEM_ENCOUNTER_MOBS.map(m=>[m.id,m]));
export function isSystemEncounterId(x:string):x is SystemEncounterId{
 return Object.hasOwn(SYSTEM_ENCOUNTER_DEFS,x);
}
export function systemEncounterEntryAllowed(s:JinwooState,monsterId:string){
 if(!isSystemEncounterId(monsterId))return false;
 const d=SYSTEM_ENCOUNTER_DEFS[monsterId];
 return s.dungeonKeys[d.instance]?.state==="entered";
}
export const SYSTEM_BOSS_REQUIRED_FOR_CLEAR:Readonly<Record<string,string>>={
 "instant.first":"system.kasaka",
 "job.change":"system.igris",
 "demon.castle":"system.demon_king",
 "temple.return":"system.architect_trial"
};
export function verifySystemDungeonBossEvidence(s:JinwooState,dungeonId:string){
 const boss=SYSTEM_BOSS_REQUIRED_FOR_CLEAR[dungeonId];
 if(!boss)return false;
 return Object.values(s.defeatEvidence??{}).some(v=>v.monsterId===boss);
}

/** Canonical route metadata, GM-only until discovered by Player.
 * All metro side corridors are local navigation, not replacement floors.
 * Early-floor respawn is allowed only after a substantial revisit and never
 * by replaying a previously defeated monsterRef.
 */
export const FIRST_INSTANT_CANON_ROUTE=[
 {stage:1,id:"hapjeong.b1",monsters:["system.dungeon_wolf"],
  gameplay:"wolf_hunt",knownToPlayerOnlyWhenSeen:true},
 {stage:2,id:"hapjeong.b2",monsters:["system.razan","system.briga"],
  gameplay:"mixed_ambush_and_backtracking",knownToPlayerOnlyWhenSeen:true},
 {stage:3,id:"hapjeong.b3",monsters:["system.kasaka"],
  gameplay:"final_boss_area",knownToPlayerOnlyWhenSeen:true}
] as const;
/** Source-approved, non-automatic reward discovery. Titles are earned
 * with unique defeated wolf refs; no retroactive granting on a deploy.
 */
export const FIRST_INSTANT_CANON_RULES={
 wolfSlayerEarnedAtUniqueWolves:10,
 wolfSlayerCombatStatsMultiplier:1.40,
 returnCrystal:"potential_discoverable_single_use_drop_not_granted",
 respawn:"earlier_floor_patrol_after_departure_new_unique_refs",
 bossDefeatRequiredForClear:true
} as const;
