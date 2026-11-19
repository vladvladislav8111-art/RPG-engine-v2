/** Sung Jinwoo / Shadow Monarch crossover preparation for DanMachi RPG Lab.
 *
 * Pure, testable rulebook only. NO live campaign/save mutations. No automatic
 * system/falna grants. "Adaptation" numeric values are not Solo Leveling canon.
 * Player controls a NEW hero with equivalent Player/Monarch powers, not Sung Jinwoo.
 */
export type JinwooPhase="player_system"|"shadow_class"|"true_monarch";
export type PostAscensionInterface="canon_disappears"|"crossover_persists";
export type ShadowTraceRule="intact_magic_stone"|"corpse_required"|"monarch_imprint";
export type JinwooStat="strength"|"stamina"|"agility"|"perception"|"intelligence";
export const JINWOO_STATS:JinwooStat[]=[
 "strength","stamina","agility","perception","intelligence"
];
export const JINWOO_CAMPAIGN_PRESET={
 id:"danmachi.player.shadow_monarch_crossover_v2",
 storyAnchor:"danmachi.v1.first_minotaur_rescue",
 heroIdentity:null,
 heroIsSungJinwoo:false,
 entry:"Player first awakening in an Orario medical ward, no imported Korean life",
 systemActivation:"confirmed_first_login_in_orario",
 playerControls:"All protagonist speech, behavior, trust and development decisions",
 defaultPhase:"player_system" as JinwooPhase,
 alternatives:["shadow_class","true_monarch"] as JinwooPhase[],
 noOldCampaignImport:true,
 noAutomaticShadowArmy:true,
 startingAppearance:null,
 fullMonarchPotential:true,
 sourceDistinction:"The Player System and fully awakened Shadow Monarch are distinct chronological states.",
} as const;
export const JINWOO_CANON_VS_ADAPTATION={
 canon:[
 "At each System level-up every one of five attributes gains 1, plus 5 assignable points.",
 "Daily training quests can award 3 attribute points; missed quests can lead to a penalty area.",
 "The System's private store accepts gold; only its Player sees the interface.",
 "Shadow Extraction and Preservation unlock through the job-change quest; early extraction has three tries per victim.",
 "The fully awakened Shadow Monarch loses the original System menus, shop and quests.",
 "Removing or breaking a DanMachi monster's magic stone causes its body to vanish.",
 "DanMachi Falna is a deity-granted blessing with distinct five-stat and level advancement rules.",
 ],
 adaptation:[
 "All store prices and thresholds below are game-design values, NOT official Solo Leveling prices.",
 "The XP curve, additive Falna-to-System bonuses and shadow success chances are crossover balance conventions.",
 "If the Player interface survives full succession, that is an explicit alternate-universe rule.",
 "An intact monster magic stone can be used as a shadow-body blueprint; this is a DanMachi crossover rule, NOT canon. Consuming the stone forfeits Guild valis.",
 "Story thresholds for Monarch's Domain, Shadow Exchange and Black Heart are evidence-gated, not automatically earned.",
 ]
} as const;
export type ShopKind="consumable"|"weapon"|"armor"|"utility"|"material"|"rune"|"quest";
export type ShopEntry={
 id:string;name:string;kind:ShopKind;goldPrice:number;
 minSystemLevel:number;unique:boolean;
 availability:"routine"|"story_unlocked";
 source:"canon_concept_adapted_price"|"crossover_only";
 effect:string;
};
/** Expanded merchant catalog: every price and level gate is a crossover
 * convention, not a quotation from the light novel. No pay-to-win omnipotence.
 */
const extra=(id:string,name:string,kind:ShopKind,goldPrice:number,
 minSystemLevel:number,effect:string,unlock=false,unique=false):ShopEntry=>({
 id,name,kind,goldPrice,minSystemLevel,unique,
 availability:unlock?"story_unlocked":"routine",source:"crossover_only",effect
});
export const JINWOO_STORE_EXTENSIONS:readonly ShopEntry[]=[
 extra("potion_hp_large","Большое зелье HP","consumable",1500,25,"Восстанавливает 70% HP, если лечебные предметы разрешены условиями боя"),
 extra("potion_mp_large","Большое зелье MP","consumable",1900,25,"Восстанавливает 70% MP при соблюдении ограничений"),
 extra("potion_hp_supreme","Высшее зелье HP","consumable",5800,50,"Восстанавливает 95% HP, не воскрешает погибших"),
 extra("potion_mp_supreme","Высшее зелье MP","consumable",6500,50,"Восстанавливает 95% MP"),
 extra("potion_fatigue","Тоник от усталости","consumable",420,6,"Уменьшает усталость, не отменяет потребность во сне"),
 extra("potion_antidote_greater","Сильное противоядие","consumable",1200,20,"Лечит многие сильные обычные яды, не любые божественные эффекты"),
 extra("ointment_burn","Ожоговая мазь","consumable",150,1,"Первая помощь, не регенерирует утраченные конечности"),
 extra("wound_dressing","Перевязочный набор","consumable",90,1,"Останавливает неосложнённое кровотечение после применения"),
 extra("potion_focus","Настой концентрации","consumable",600,12,"Кратковременная концентрация, не даёт новые навыки"),
 extra("potion_cold_resistance","Эликсир против холода","consumable",1250,18,"Ограниченное сопротивление холоду, не абсолютная защита"),
 extra("potion_fire_resistance","Эликсир против огня","consumable",1250,18,"Ограниченное сопротивление огню, не абсолютная защита"),
 extra("blade_training","Учебный меч","weapon",250,1,"Тупой тренировочный клинок"),
 extra("sword_iron","Железный меч","weapon",1100,1,"Простое оружие, без системных легендарных свойств"),
 extra("spear_steel","Стальное копьё","weapon",1600,3,"Оружие средней дистанции, требует навыка"),
 extra("shortbow","Короткий лук","weapon",850,1,"Обычное дистанционное оружие"),
 extra("arrow_bundle","Колчан стрел","weapon",120,1,"20 простых стрел"),
 extra("daggers_throwing","Набор метательных ножей","weapon",230,1,"5 ножей без самовосполнения"),
 extra("dagger_hardened","Усиленный кинжал","weapon",2300,12,"Улучшенная сталь и баланс, не универсальное пробитие брони"),
 extra("sword_obsidian","Обсидиановый клинок","weapon",7900,28,"Редкое оружие с износом и требованиями"),
 extra("dagger_shadowbound","Теневой клинок","weapon",18500,42,"Эффект завязан на уже открытые теневые способности",true,true),
 extra("leather_armor","Кожаный нагрудник","armor",680,1,"Небольшая защита с ограничением подвижности"),
 extra("chainmail_armor","Кольчуга","armor",2800,12,"Хорошая защита от режущих, вес экипировки учитывается"),
 extra("steel_shield","Стальной щит","armor",1900,6,"Нужна свободная рука и обучение"),
 extra("boots_quiet","Мягкие бесшумные сапоги","armor",980,8,"Снижают обычный шум шагов, не гарантируют невидимость"),
 extra("gloves_grip","Перчатки альпиниста","armor",340,2,"Улучшенное сцепление с поверхностями"),
 extra("cloak_dark","Тёмный плащ","armor",1100,10,"Помогает скрытности при слабом освещении"),
 extra("cloak_ember","Плащ защиты от жара","armor",3500,22,"Частичная защита от огня"),
 extra("necklace_ward","Амулет защиты от магии","armor",12500,40,"Частичная защита от магии, не противодействует аркануму",true,true),
 extra("rope_coil","Прочная верёвка 20 м","utility",130,1,"Обычная верёвка; изнашивается и рвётся"),
 extra("torch_bundle","Факелы, 5 шт.","utility",45,1,"Горят ограниченное время"),
 extra("lamp_crystal","Фонарь с кристаллом","utility",460,4,"Ограниченный ресурс свечения, не бесконечная энергия"),
 extra("hook_grappling","Абордажный крюк","utility",410,3,"Требует опоры и свободных рук"),
 extra("chalk_map","Мел и бумага для карты","utility",35,1,"Материалы для ориентирования"),
 extra("sleeping_kit","Походный спальник","utility",280,1,"Уменьшает бытовые неудобства, не даёт безопасный сон в бою"),
 extra("tent_light","Лёгкая палатка","utility",750,5,"Для безопасных стоянок, не непробиваемое убежище"),
 extra("repair_kit","Набор ухода за оружием","utility",260,4,"Уменьшает износ, требует времени и инструментов"),
 extra("sealing_bag","Защитный мешочек для камней","utility",420,8,"Безопаснее переносить камни, не заменяет хранилище теней"),
 extra("marking_beacon","Световой маячок","utility",830,14,"Помечает место на ограниченное время, не мгновенный телепорт"),
 extra("trap_wire","Ловушечная проволока","material",170,6,"Сборка механических ловушек требует труда"),
 extra("iron_ingot","Слиток очищенного железа","material",190,1,"Материал для мастера, не создаёт оружие сам"),
 extra("monster_residue","Пустой флакон для эссенции","material",65,1,"Тара для собранного материала, не экстракт монстра"),
 extra("rune_stealth","Руна Скрытности","rune",7400,25,"После подтверждённого изучения может дать Скрытность",true,true),
 extra("rune_quicksilver","Руна Ускорения","rune",9200,30,"После подтверждённого изучения может дать Ускорение",true,true),
 extra("rune_perception","Руна Обострённого восприятия","rune",3900,18,"Временная тренировка восприятия, не автоматическое повышение уровня",true,true),
];
export const JINWOO_STORE:readonly ShopEntry[]=[
 {id:"potion_hp_small",name:"Малое зелье HP",kind:"consumable",goldPrice:100,
  minSystemLevel:1,unique:false,availability:"routine",source:"canon_concept_adapted_price",
  effect:"Восстанавливает 20% максимального HP без воскрешения; не преодолевает блокировки сценарного испытания"},
 {id:"potion_mp_small",name:"Малое зелье MP",kind:"consumable",goldPrice:130,
  minSystemLevel:1,unique:false,availability:"routine",source:"canon_concept_adapted_price",
  effect:"Восстанавливает 20% максимального MP"},
 {id:"potion_hp_medium",name:"Среднее зелье HP",kind:"consumable",goldPrice:400,
  minSystemLevel:12,unique:false,availability:"routine",source:"canon_concept_adapted_price",
  effect:"Восстанавливает 45% максимального HP при отсутствии сценарного запрета"},
 {id:"potion_mp_medium",name:"Среднее зелье MP",kind:"consumable",goldPrice:500,
  minSystemLevel:12,unique:false,availability:"routine",source:"canon_concept_adapted_price",
  effect:"Восстанавливает 45% максимального MP"},
 {id:"potion_detox",name:"Противоядие Системы",kind:"consumable",goldPrice:250,
  minSystemLevel:7,unique:false,availability:"routine",source:"canon_concept_adapted_price",
  effect:"Очищает обычные токсины; не снимает безусловно уникальные божественные проклятия"},
 {id:"blade_steel",name:"Кинжал охотника",kind:"weapon",goldPrice:850,
  minSystemLevel:1,unique:false,availability:"routine",source:"crossover_only",
  effect:"Физическое оружие без автоматического пробивания Фальны"},
 {id:"knight_killer",name:"Убийца рыцарей",kind:"weapon",goldPrice:6500,
  minSystemLevel:20,unique:true,availability:"routine",source:"canon_concept_adapted_price",
  effect:"Каноническая идея кинжала против брони; стоимость/порог для этой кампании адаптированы"},
 {id:"return_stone",name:"Камень возвращения",kind:"utility",goldPrice:1800,
  minSystemLevel:15,unique:false,availability:"story_unlocked",source:"canon_concept_adapted_price",
  effect:"Только в отмеченном системном испытании. Не телепортирует бесконтрольно из любого этажа Подземелья"},
 {id:"holy_water_recipe",name:"Рецепт Святой воды жизни",kind:"quest",goldPrice:0,
  minSystemLevel:60,unique:true,availability:"story_unlocked",source:"canon_concept_adapted_price",
  effect:"Открывается отдельной сюжетной цепочкой и материалами; не покупается как бесконечное лечение"},
 ...JINWOO_STORE_EXTENSIONS,
];
export const JINWOO_SPECIAL_REWARDS={
 blessedRandomBox:"Выбор награды из валидного списка по событию, не мгновенно любой предмет.",
 cursedRandomBox:"Выбор подходящей для текущей угрозы награды, не гарантия победы.",
 titleConqueror:"Выдаётся только после соответствующего испытания.",
 blackHeart:"Особая сюжетная ступень, не бесплатное бесконечное воскрешение.",
 shadowKnightIgris:"Имена известных теней не означают их автоматический перенос в чистую кампанию.",
} as const;
export const JINWOO_SKILL_GRAPH=[
 {id:"stealth",phase:"player_system",gate:"Подтверждённый навык / руна / задание"},
 {id:"quicksilver",phase:"player_system",gate:"Подтверждённая награда или приобретение навыка"},
 {id:"rulers_authority",phase:"player_system",gate:"Специальная руна или событие"},
 {id:"shadow_extraction",phase:"shadow_class",gate:"Завершённый квест изменения класса"},
 {id:"shadow_storage",phase:"shadow_class",gate:"Завершённый квест изменения класса"},
 {id:"monarch_domain",phase:"shadow_class",gate:"Доказанное развитие класса"},
 {id:"shadow_exchange",phase:"shadow_class",gate:"Доказанное развитие класса, а не стартовая бесплатная телепортация"},
 {id:"black_heart",phase:"shadow_class",gate:"Отдельная поздняя арка преемственности Ашборна"},
 {id:"true_monarch_power",phase:"true_monarch",gate:"Завершение передачи власти; исходная Система исчезает"},
] as const;
export interface JinwooStats{
 strength:number;stamina:number;agility:number;perception:number;intelligence:number;
}
export interface JinwooShadow{
 id:string;name:string;originRef:string;originalKind:"monster"|"human"|"other";
 powerTier:"common"|"elite"|"knight"|"commander"|"marshal";
 defeatedCount:number;stored:boolean;
}
export interface JinwooMagicStone{
 id:string;monsterRef:string;monsterName:string;kind:"monster";
 powerRating:number;powerTier:JinwooShadow["powerTier"];
 guildValueValis:number;corruptedMana:boolean;
 intact:boolean;state:"held"|"consumed_by_shadow"|"sold";
 collectedRef:string;
}
export interface JinwooFalnaScores{
 strength:number;endurance:number;dexterity:number;agility:number;magic:number;
}
export const ZERO_FALNA_SCORES:Readonly<JinwooFalnaScores>={
 strength:0,endurance:0,dexterity:0,agility:0,magic:0
};
export interface JinwooState{
 schema:"DANMACHI_JINWOO_PREP_V1";
 phase:JinwooPhase;postAscensionInterface:PostAscensionInterface;
 /** The selected new campaign begins here, before the first System panel. */
 awaitingActivation?:boolean;
 shadowTraceRule:ShadowTraceRule;
 systemLevel:number;xp:number;freeStatPoints:number;stats:JinwooStats;
 hp:number;mp:number;fatigue:number;
 gold:number;valis:number;inventory:Record<string,number>;
 magicStones:Record<string,JinwooMagicStone>;
 shadowRoster:JinwooShadow[];extractionAttempts:Record<string,number>;
 unlockedShopItems:string[];unlockedSkills:string[];
 appliedRewardRefs:string[];defeatedTargetRefs:string[];completedDailyDays:string[];
 storyFlags:string[]; 
 /** A Falna cannot exist before a god gives a blessing. Never auto-rank on System level-up. */
 falna:{blessed:boolean;godId:string|null;divineLevel:number;
  lastUpdatedRef:string|null;status:JinwooFalnaScores;skills:string[]};
}
export const JINWOO_INITIAL_STATS:Readonly<JinwooStats>={
 strength:10,stamina:10,agility:10,perception:10,intelligence:10
}; // an explicitly chosen crossover baseline, not asserted as exact novel values
export function playerMaxHp(stats:JinwooStats):number{return 100+stats.stamina*20;}
export function playerMaxMp(stats:JinwooStats):number{return 40+stats.intelligence*10;}
export function newJinwooPreparation(config?:{
 phase?:JinwooPhase;postAscensionInterface?:PostAscensionInterface;
 shadowTraceRule?:ShadowTraceRule;
}):JinwooState{
 const phase=config?.phase??"player_system";
 if(!["player_system","shadow_class","true_monarch"].includes(phase))
  throw Error("JINWOO_PHASE_INVALID");
 const stats={...JINWOO_INITIAL_STATS};
 return {schema:"DANMACHI_JINWOO_PREP_V1",
  phase,awaitingActivation:false,
  postAscensionInterface:config?.postAscensionInterface??"canon_disappears",
  shadowTraceRule:config?.shadowTraceRule??"intact_magic_stone",
  systemLevel:1,xp:0,freeStatPoints:0,stats,
  hp:playerMaxHp(stats),mp:playerMaxMp(stats),fatigue:0,
  gold:0,valis:0,inventory:{},magicStones:{},shadowRoster:[],extractionAttempts:{},
  unlockedShopItems:[],unlockedSkills:[],appliedRewardRefs:[],defeatedTargetRefs:[],
  completedDailyDays:[],storyFlags:[],
  falna:{blessed:false,godId:null,divineLevel:0,lastUpdatedRef:null,
   status:{...ZERO_FALNA_SCORES},skills:[]}};
}
/** Use this for NEW campaign initialization. No XP/shop before opening System. */
export function newOrarioPlayerAwakening():JinwooState{
 const n=newJinwooPreparation();
 n.awaitingActivation=true;return n;
}
const validRef=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
export function activateOrarioPlayerSystem(s:JinwooState,e:{
 sourceRef:string;confirmedAwakening:boolean;
}):JinwooState{
 requireReward(s,e.sourceRef);
 if(!s.awaitingActivation||!e.confirmedAwakening)
  throw Error("JINWOO_AWAKENING_NOT_CONFIRMED");
 const n=clone(s);
 n.awaitingActivation=false;
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
function requireReward(s:JinwooState,ref:string){
 if(!validRef(ref)||s.appliedRewardRefs.includes(ref))
  throw Error("JINWOO_REWARD_SOURCE_DUPLICATE_OR_INVALID");
}
const clone=(s:JinwooState)=>structuredClone(s);
const max=(s:JinwooState)=>s.phase!=="player_system";
export const SYSTEM_XP_FORMULA="100 * level^1.5; CROSSOVER, NOT NOVEL CANON";
export function xpToNextLevel(level:number):number{
 if(!Number.isSafeInteger(level)||level<1||level>10000)
  throw Error("JINWOO_LEVEL_INVALID");
 return Math.ceil(100*Math.pow(level,1.5));
}
function assertPlayerSystem(s:JinwooState){
 if(s.awaitingActivation)throw Error("JINWOO_SYSTEM_NOT_ACTIVATED");
 if(s.phase==="true_monarch"&&s.postAscensionInterface!=="crossover_persists")
  throw Error("JINWOO_CANON_SYSTEM_REMOVED");
}
export function awardJinwooEncounter(s:JinwooState,e:{
 sourceRef:string;targetRef:string;confirmed:boolean;
 xp:number;systemGold:number;killer:"player"|"shadow";
 isNewDefeat:boolean;gmThreatRated:boolean;
}):JinwooState{
 assertPlayerSystem(s);requireReward(s,e.sourceRef);
 if(!e.confirmed||!e.gmThreatRated||!e.isNewDefeat||
  !validRef(e.targetRef)||s.defeatedTargetRefs.includes(e.targetRef)||
  !Number.isSafeInteger(e.xp)||e.xp<0||e.xp>1000000||
  !Number.isSafeInteger(e.systemGold)||e.systemGold<0||e.systemGold>1000000||
  !["player","shadow"].includes(e.killer))
  throw Error("JINWOO_UNCONFIRMED_XP_OR_KILL");
 const n=clone(s);
 n.appliedRewardRefs.push(e.sourceRef);
 n.defeatedTargetRefs.push(e.targetRef);
 n.gold+=e.systemGold;
 n.xp+=e.xp;
 let steps=0;
 while(n.xp>=xpToNextLevel(n.systemLevel)){
  if(++steps>200)throw Error("JINWOO_LEVEL_BATCH_EXCEEDED");
  n.xp-=xpToNextLevel(n.systemLevel);
  n.systemLevel++;
  for(const key of JINWOO_STATS)n.stats[key]++;
  n.freeStatPoints+=5;
  // In the System-era, level-up heals HP/MP; scripted trials can disable
  // it at the GM scene layer and therefore must not use this generic grant.
  n.hp=effectiveJinwooMaxHp(n);n.mp=effectiveJinwooMaxMp(n);
 }
 return n;
}
export function allocateJinwooPoints(s:JinwooState,alloc:Partial<JinwooStats>){
 assertPlayerSystem(s);
 let total=0;
 for(const [key,v] of Object.entries(alloc)){
  if(!JINWOO_STATS.includes(key as JinwooStat)||!Number.isSafeInteger(v)||v<0)
   throw Error("JINWOO_STAT_ALLOCATION_INVALID");
  total+=v;
 }
 if(total>s.freeStatPoints)throw Error("JINWOO_STAT_POINTS_INSUFFICIENT");
 const n=clone(s);
 for(const key of JINWOO_STATS)n.stats[key]+=(alloc[key]??0);
 n.freeStatPoints-=total;
 n.hp=Math.min(n.hp,effectiveJinwooMaxHp(n));
 n.mp=Math.min(n.mp,effectiveJinwooMaxMp(n));
 return n;
}
export function completeJinwooDaily(s:JinwooState,e:{
 day:number;sourceRef:string;proofConfirmed:boolean;
}):JinwooState{
 assertPlayerSystem(s);requireReward(s,e.sourceRef);
 if(!Number.isSafeInteger(e.day)||e.day<0||!e.proofConfirmed||
  s.completedDailyDays.includes(String(e.day)))
  throw Error("JINWOO_DAILY_NOT_CONFIRMED_OR_DUPLICATE");
 const n=clone(s);n.completedDailyDays.push(String(e.day));
 n.appliedRewardRefs.push(e.sourceRef);n.freeStatPoints+=3;return n;
}
export function shopAvailable(s:JinwooState){
 if(s.awaitingActivation)return false;
 return s.phase!=="true_monarch"||
  s.postAscensionInterface==="crossover_persists";
}
export function visibleJinwooStore(s:JinwooState):ShopEntry[]{
 if(!shopAvailable(s))return [];
 return JINWOO_STORE.filter(entry=>entry.minSystemLevel<=s.systemLevel&&
  (entry.availability==="routine"||s.unlockedShopItems.includes(entry.id)));
}
export function purchaseJinwooItem(s:JinwooState,e:{
 sourceRef:string;itemId:string;quantity:number;
}):JinwooState{
 if(!shopAvailable(s))throw Error("JINWOO_STORE_REMOVED_WITH_SYSTEM");
 requireReward(s,e.sourceRef);
 if(!Number.isSafeInteger(e.quantity)||e.quantity<1||e.quantity>100)
  throw Error("JINWOO_INVALID_PURCHASE");
 const item=visibleJinwooStore(s).find(x=>x.id===e.itemId);
 if(!item||item.goldPrice===0)throw Error("JINWOO_ITEM_LOCKED_OR_QUEST_ONLY");
 if(item.unique&&(e.quantity!==1||(s.inventory[item.id]??0)>0))
  throw Error("JINWOO_UNIQUE_ITEM_ALREADY_OWNED");
 const cost=item.goldPrice*e.quantity;
 if(cost>s.gold)throw Error("JINWOO_GOLD_INSUFFICIENT");
 const n=clone(s);n.gold-=cost;
 n.inventory[item.id]=(n.inventory[item.id]??0)+e.quantity;
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function grantJinwooStoryUnlock(s:JinwooState,e:{
 sourceRef:string;confirmed:boolean;type:"skill"|"shop"|"story";
 id:string;
}):JinwooState{
 requireReward(s,e.sourceRef);
 if(!e.confirmed||!validRef(e.id))throw Error("JINWOO_UNLOCK_UNCONFIRMED");
 if(e.type==="skill"&&!JINWOO_SKILL_GRAPH.some(x=>x.id===e.id))
  throw Error("JINWOO_UNKNOWN_SKILL");
 if(e.type==="shop"&&!JINWOO_STORE.some(x=>x.id===e.id))
  throw Error("JINWOO_UNKNOWN_SHOP_ITEM");
 const n=clone(s);
 const field=e.type==="skill"?"unlockedSkills":e.type==="shop"?
  "unlockedShopItems":"storyFlags";
 if(n[field].includes(e.id))throw Error("JINWOO_ALREADY_UNLOCKED");
 n[field].push(e.id);n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function changeJinwooPhase(s:JinwooState,e:{
 sourceRef:string;confirmed:boolean;to:JinwooPhase;qualifyingStoryRef:string;
}):JinwooState{
 requireReward(s,e.sourceRef);
 if(!e.confirmed||!validRef(e.qualifyingStoryRef)||
  !s.storyFlags.includes(e.qualifyingStoryRef))
  throw Error("JINWOO_PHASE_QUEST_MISSING");
 if(!(s.phase==="player_system"&&e.to==="shadow_class"&&s.systemLevel>=40||
  s.phase==="shadow_class"&&e.to==="true_monarch"))
  throw Error("JINWOO_PHASE_TRANSITION_INVALID");
 const n=clone(s);
 n.phase=e.to;n.appliedRewardRefs.push(e.sourceRef);return n;
}
export type ExtractionFailure="no_remains"|"corrupt_mana"|"too_strong"|
 "too_old"|"attempts_exhausted"|"roll_failed"|"capacity_full";
export type ExtractionRequest={
 sourceRef:string;targetRef:string;confirmedDeath:true;
 originalKind:"monster"|"human"|"other";
 name:string;powerTier:JinwooShadow["powerTier"];
 targetPower:"weaker"|"peer"|"stronger"|"overwhelming";
 corpsePresent:boolean;magicStoneIntact:boolean;
 residualImprint:boolean;corruptedMana:boolean;
 minutesSinceDeath:number;roll:number;
};
/** Early storage starts at 30, expands through confirmed phase/skill events.
 * The game's exact numeric capacity progression is an explicit adaptation. */
export function shadowCapacity(s:JinwooState):number{
 if(s.phase==="player_system")return 0;
 if(s.phase==="true_monarch")return 100000;
 return 30+Math.max(0,s.systemLevel-40)*2;
}
export function attemptJinwooShadowExtraction(s:JinwooState,
 e:ExtractionRequest):{next:JinwooState;success:boolean;reason?:ExtractionFailure;chance:number}{
 if(!max(s)||!s.unlockedSkills.includes("shadow_extraction"))
  throw Error("JINWOO_SHADOW_CLASS_NOT_UNLOCKED");
 requireReward(s,e.sourceRef);
 if(!e.confirmedDeath||!validRef(e.targetRef)||!e.name.trim()||
  !Number.isSafeInteger(e.roll)||e.roll<1||e.roll>100||
  !Number.isSafeInteger(e.minutesSinceDeath)||e.minutesSinceDeath<0||
  !["weaker","peer","stronger","overwhelming"].includes(e.targetPower))
  throw Error("JINWOO_SHADOW_EXTRACTION_SOURCE_INVALID");
 const attempt=s.extractionAttempts[e.targetRef]??0;
 if(s.shadowRoster.some(x=>x.id===e.targetRef))
  throw Error("JINWOO_SHADOW_ALREADY_OWNED");
 if(attempt>=3)return {next:s,success:false,reason:"attempts_exhausted",chance:0};
 const n=clone(s);n.appliedRewardRefs.push(e.sourceRef);
 n.extractionAttempts[e.targetRef]=attempt+1;
 const anchored=(e.corpsePresent&&
  (e.originalKind!=="monster"||e.magicStoneIntact))||
  (s.phase==="true_monarch"&&s.shadowTraceRule==="monarch_imprint"&&e.residualImprint);
 const fail:ExtractionFailure|undefined=
  !anchored?"no_remains":e.corruptedMana?"corrupt_mana":
  e.targetPower==="overwhelming"?"too_strong":
  e.minutesSinceDeath>60?"too_old":
  n.shadowRoster.length>=shadowCapacity(n)?"capacity_full":undefined;
 const base=e.targetPower==="weaker"?90:
  e.targetPower==="peer"?65:e.targetPower==="stronger"?25:0;
 const chance=fail?0:Math.max(5,base-Math.floor(e.minutesSinceDeath/5)*3);
 if(fail||e.roll>chance)return {next:n,success:false,
  reason:fail??"roll_failed",chance};
 n.shadowRoster.push({id:e.targetRef,name:e.name,
  originRef:e.sourceRef,originalKind:e.originalKind,
  powerTier:e.powerTier,defeatedCount:0,stored:true});
 return {next:n,success:true,chance};
}
export function resurrectJinwooShadow(s:JinwooState,e:{
 sourceRef:string;shadowId:string;confirmedDefeat:boolean;manaCost:number;
}):JinwooState{
 requireReward(s,e.sourceRef);
 const sh=s.shadowRoster.find(x=>x.id===e.shadowId);
 if(!sh||!e.confirmedDefeat||!Number.isSafeInteger(e.manaCost)||e.manaCost<0||
  e.manaCost>s.mp)throw Error("JINWOO_SHADOW_REGEN_UNAVAILABLE");
 const n=clone(s);
 const target=n.shadowRoster.find(x=>x.id===e.shadowId)!;
 target.defeatedCount++;target.stored=true;
 n.mp-=e.manaCost;n.appliedRewardRefs.push(e.sourceRef);return n;
}
/** Falna is an INDEPENDENT earned blessing and buffs the Player's System.
 * House rule: +1 System stat for each 50 earned corresponding Falna points;
 * +5 across the five attributes per Falna level after level 1.
 * Falna never copies System XP/stats and cannot override later Monarch tiers.
 */
export const FALNA_BONUS_POINTS_PER_STAT=50;
export const FALNA_BONUS_PER_DIVINE_LEVEL=5;
export type FalnaProjection={
 blessed:boolean;divineLevel:number|null;sourceOfCombatPower:"SYSTEM_PLUS_FALNA";
 display:JinwooFalnaScores|null;
 base:JinwooStats;bonus:JinwooStats;total:JinwooStats;
 overRank:boolean;
 explanation:string;
};
export function projectJinwooFalna(s:JinwooState):FalnaProjection{
 const blessed=s.falna.blessed;
 const r=blessed?s.falna.status:null;
 const levelBonus=blessed?Math.max(0,s.falna.divineLevel-1)*
  FALNA_BONUS_PER_DIVINE_LEVEL:0;
 const val=(v:number)=>Math.floor(v/FALNA_BONUS_POINTS_PER_STAT)+levelBonus;
 const bonus:JinwooStats={
  strength:r?val(r.strength):0,
  stamina:r?val(r.endurance):0,
  agility:r?val(r.agility):0,
  perception:r?val(r.dexterity):0,
  intelligence:r?val(r.magic):0
 };
 const total={...s.stats};
 for(const k of JINWOO_STATS)total[k]+=bonus[k];
 return {blessed,divineLevel:blessed?s.falna.divineLevel:null,display:r?{...r}:null,
  base:{...s.stats},bonus,total,sourceOfCombatPower:"SYSTEM_PLUS_FALNA",
  overRank:!!r&&Object.values(r).some(x=>x>999),
  explanation:blessed?"Фальна является независимым божественным усилением поверх Системы Игрока; "+
   "новая сила не конвертируется обратно в очки Фальны.":
   "До принятия благословения бога Система Игрока существует самостоятельно."};
}
export function grantJinwooFalna(s:JinwooState,e:{
 sourceRef:string;godId:string;godConfirmed:boolean;
}):JinwooState{
 requireReward(s,e.sourceRef);
 if(s.falna.blessed||!e.godConfirmed||!validRef(e.godId))
  throw Error("JINWOO_FALNA_GOD_CONSENT_REQUIRED");
 const n=clone(s);n.falna={blessed:true,godId:e.godId,
  divineLevel:1,lastUpdatedRef:e.sourceRef,
  status:{...ZERO_FALNA_SCORES},skills:[]};
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function updateJinwooFalna(s:JinwooState,e:{
 sourceRef:string;godId:string;godConfirmed:boolean;
 newStatus:JinwooFalnaScores;
 levelUpFeatRef?:string;newSkill?:string;
}):JinwooState{
 requireReward(s,e.sourceRef);
 if(!s.falna.blessed||!e.godConfirmed||e.godId!==s.falna.godId)
  throw Error("JINWOO_FALNA_GOD_CONSENT_REQUIRED");
 for(const k of ["strength","endurance","dexterity","agility","magic"] as const){
  const v=e.newStatus[k];
  if(!Number.isSafeInteger(v)||v<s.falna.status[k]||v>1999)
   throw Error("JINWOO_FALNA_STATUS_INVALID");
 }
 if(e.levelUpFeatRef!==undefined&&(!validRef(e.levelUpFeatRef)||
  !s.storyFlags.includes(e.levelUpFeatRef)))
  throw Error("JINWOO_FALNA_LEVEL_FEAT_UNVERIFIED");
 if(e.newSkill!==undefined&&
  (!validRef(e.newSkill)||s.falna.skills.includes(e.newSkill)))
  throw Error("JINWOO_FALNA_SKILL_UNVERIFIED");
 const n=clone(s);
 n.falna.status={...e.newStatus};
 if(e.levelUpFeatRef!==undefined)n.falna.divineLevel++;
 if(e.newSkill!==undefined)n.falna.skills.push(e.newSkill);
 n.falna.lastUpdatedRef=e.sourceRef;
 n.appliedRewardRefs.push(e.sourceRef);return n;
}
export function effectiveJinwooMaxHp(s:JinwooState){
 return playerMaxHp(projectJinwooFalna(s).total);
}
export function effectiveJinwooMaxMp(s:JinwooState){
 return playerMaxMp(projectJinwooFalna(s).total);
}
