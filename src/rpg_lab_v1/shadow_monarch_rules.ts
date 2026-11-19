/** Sung Jinwoo / Shadow Monarch crossover preparation for DanMachi RPG Lab.
 *
 * Pure, testable rulebook only. NO live campaign/save mutations. No automatic
 * system/falna grants. "Adaptation" numeric values are not Solo Leveling canon.
 * Enable only after the player approves which phase of Jinwoo they control.
 */
export type JinwooPhase="player_system"|"shadow_class"|"true_monarch";
export type PostAscensionInterface="canon_disappears"|"crossover_persists";
export type ShadowTraceRule="corpse_required"|"monarch_imprint";
export type JinwooStat="strength"|"stamina"|"agility"|"perception"|"intelligence";
export const JINWOO_STATS:JinwooStat[]=[
 "strength","stamina","agility","perception","intelligence"
];
export const JINWOO_CAMPAIGN_PRESET={
 id:"danmachi.jinwoo.crossover_v1",
 storyAnchor:"danmachi.v1.first_minotaur_rescue",
 heroIdentity:"Sung Jinwoo (appearance pending)",
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
 "The XP curve, Falna projection coefficients and shadow success chances are crossover balance conventions.",
 "If the Player interface survives full succession, that is an explicit alternate-universe rule.",
 "A destroyed magic stone gives no extraction corpse; a post-ascension imprint exception requires enabling that rule.",
 "Story thresholds for Monarch's Domain, Shadow Exchange and Black Heart are evidence-gated, not automatically earned.",
 ]
} as const;
export type ShopKind="consumable"|"weapon"|"utility"|"quest";
export type ShopEntry={
 id:string;name:string;kind:ShopKind;goldPrice:number;
 minSystemLevel:number;unique:boolean;
 availability:"routine"|"story_unlocked";
 source:"canon_concept_adapted_price"|"crossover_only";
 effect:string;
};
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
export interface JinwooState{
 schema:"DANMACHI_JINWOO_PREP_V1";
 phase:JinwooPhase;postAscensionInterface:PostAscensionInterface;
 shadowTraceRule:ShadowTraceRule;
 systemLevel:number;xp:number;freeStatPoints:number;stats:JinwooStats;
 hp:number;mp:number;fatigue:number;
 gold:number;inventory:Record<string,number>;
 shadowRoster:JinwooShadow[];extractionAttempts:Record<string,number>;
 unlockedShopItems:string[];unlockedSkills:string[];
 appliedRewardRefs:string[];defeatedTargetRefs:string[];completedDailyDays:string[];
 storyFlags:string[]; 
 /** A Falna cannot exist before a god gives a blessing. Never auto-rank on System level-up. */
 falna:{blessed:boolean;divineLevel:number;lastUpdatedRef:string|null};
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
  phase,postAscensionInterface:config?.postAscensionInterface??"canon_disappears",
  shadowTraceRule:config?.shadowTraceRule??"corpse_required",
  systemLevel:1,xp:0,freeStatPoints:0,stats,
  hp:playerMaxHp(stats),mp:playerMaxMp(stats),fatigue:0,
  gold:0,inventory:{},shadowRoster:[],extractionAttempts:{},
  unlockedShopItems:[],unlockedSkills:[],appliedRewardRefs:[],defeatedTargetRefs:[],
  completedDailyDays:[],storyFlags:[],
  falna:{blessed:false,divineLevel:0,lastUpdatedRef:null}};
}
const validRef=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
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
  n.hp=playerMaxHp(n.stats);n.mp=playerMaxMp(n.stats);
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
 n.hp=Math.min(n.hp,playerMaxHp(n.stats));
 n.mp=Math.min(n.mp,playerMaxMp(n.stats));
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
export type FalnaProjection={
 blessed:boolean;divineLevel:number|null;sourceOfCombatPower:"SYSTEM_NOT_FALNA";
 display:{
  strength:number;endurance:number;dexterity:number;agility:number;magic:number;
 }|null;
 overRank:boolean;
 explanation:string;
};
/** Display-only: Falna stats reflect the System; they never also grant power.
 * 12 points per post-baseline stat is a house rule; caps apply to a status
 * sheet, NOT to genuine System potential. Perception is not dexterity itself.
 */
export function projectJinwooFalna(s:JinwooState):FalnaProjection{
 if(!s.falna.blessed)return {blessed:false,divineLevel:null,display:null,
  overRank:false,sourceOfCombatPower:"SYSTEM_NOT_FALNA",
  explanation:"Без благословения бога настоящей Фальны нет; личный HUD не виден богам."};
 const stat=(n:number)=>Math.max(0,Math.round((n-10)*12));
 const r={
  strength:stat(s.stats.strength),endurance:stat(s.stats.stamina),
  dexterity:stat((s.stats.agility+s.stats.perception)/2),
  agility:stat(s.stats.agility),magic:stat(s.stats.intelligence),
 };
 const overflow=Object.values(r).some(x=>x>999);
 return {blessed:true,divineLevel:s.falna.divineLevel,
  display:Object.fromEntries(Object.entries(r).map(([k,v])=>
   [k,Math.min(999,v)])) as FalnaProjection["display"],
  overRank:overflow,sourceOfCombatPower:"SYSTEM_NOT_FALNA",
  explanation:"Отображение параметров Системы в Фальне без второго увеличения силы. "+
   "Ранг Фальны меняется только при подтверждённом событии благословения и обновления богом."};
}
