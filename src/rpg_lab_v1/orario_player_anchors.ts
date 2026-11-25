/** Read-only, player-safe information anchors for the DanMachi Player.
 * Never derive NPC statistics, secret plans, hidden dungeon keys, unused
 * reward tables or the protagonist's unknown future from GM context.
 *
 * The UI may present these data as status bars. It MUST NOT display this
 * entire JSON every narrative turn: display priority is part of the contract.
 */
import type {LabSession} from "./session.ts";
import type {LabPack} from "./engine.ts";
import {readChromaPaletteAnchor} from "./chroma_palette.ts";
import {effectiveJinwooMaxHp,effectiveJinwooMaxMp,effectiveJinwooStaminaReserve,
 shadowCapacity,
 xpToNextLevel} from "./shadow_monarch_rules.ts";
import {previewInjuryPenalties} from "./orario_player_survival.ts";
export const ORARIO_ANCHOR_POLICY={
 schema:"RPG_LAB_ORARIO_ANCHOR_POLICY_V1",
 always:["герой","место","игровое время"],
 onSystemChange:["уровень","XP","характеристики","нераспределённые очки","валюты"],
 onBattleStartAndExchange:["HP","MP","выносливость","активные травмы","доступное оружие"],
 onDailyQuestChange:["упражнения","срок задания","положенная награда"],
 onLootChange:["полученная добыча","магические камни","системное золото","валисы"],
 onShadowChange:["состав армии","вместимость","призванные и сохранённые тени"],
 onPlayerRequest:["инвентарь","характеристики","открытые ключи","известные слухи"],
 gmOnlyNeverShow:["личные воспоминания NPC","степень подозрений NPC",
  "будущие сюжетные арки","системные подземелья без ключа","планы богов",
  "неизвестные численные параметры врага"],
 metaDiscussionAdvancesTime:false,
 everyThirdGameTurnCheckpoint:true,
 noNPCPrivateData:true,
 noLoreRailroading:true
} as const;
const nonneg=(n:number)=>Math.max(0,Math.round(n));
const calcMinutes=(clock:string)=>{
 const m=/^(?:D|Day\s*)(\d+)\s+(\d{1,2}):(\d{2})$/.exec(clock);
 if(!m)return null;
 const day=Number(m[1]),hour=Number(m[2]),minute=Number(m[3]);
 return day>=0&&hour<24&&minute<60?day*1440+hour*60+minute:null;
};
const locationOf=(s:LabSession,pack?:LabPack)=>
 (s.player.locationId&&pack?.locations[s.player.locationId]?.name)||
 s.player.locationId||"Местонахождение не подтверждено";
export function readOrarioPlayerAnchors(s:LabSession,pack?:LabPack){
 const p=s.player.jinwoo;
 if(!p)return {
  schema:"RPG_LAB_ORARIO_PLAYER_ANCHORS_V1",
  available:false,readOnly:true,
  hero:{id:"hero.unset",name:"Игрок",race:"не определена",age:null},
  chromaPalette:s.player.chromaPalette?readChromaPaletteAnchor(s.player.chromaPalette):null,
  scene:{gameClock:s.gameClock,location:locationOf(s,pack),
   locationId:s.player.locationId??null,guard:s.roleplayGuard??"legacy"},
  vitals:{hp:null,mp:null,stamina:null,injuries:[] as {
   location:string;kind:string;severity:number;treated:boolean}[]},
  systemActivated:false,
  system:null,falna:null,currencies:null,inventory:null,
  activeQuest:null,shadows:null,openKeys:[] as {id:string;status:string}[],
  intactStones:null,combat:null,
  displayPolicy:ORARIO_ANCHOR_POLICY
 };
 const hidden=p.awaitingActivation===true;
 const hero=s.player.hero;
 const base={
  schema:"RPG_LAB_ORARIO_PLAYER_ANCHORS_V1",
  available:true,readOnly:true,
  chromaPalette:s.player.chromaPalette?readChromaPaletteAnchor(s.player.chromaPalette):null,
  hero:{id:hero?.id??"hero.unset",
   name:hero?.name??"Игрок",
   race:hero?.race??"не определена",
   age:hero?.age??null},
  scene:{gameClock:s.gameClock,location:locationOf(s,pack),
   locationId:s.player.locationId??null,
   guard:s.roleplayGuard??"legacy"},
  /** Physical wellbeing is visible even before the first System window. */
  vitals:{hp:hidden?null:{current:p.hp,max:effectiveJinwooMaxHp(p)},
   mp:hidden?null:{current:p.mp,max:effectiveJinwooMaxMp(p)},
   stamina:hidden?null:{...effectiveJinwooStaminaReserve(p),
    derivedFromFatigue:true},
   injuries:(p.injuries??[]).filter(x=>x.active).map(x=>({
    location:x.location,kind:x.kind,severity:x.severity,
    treated:x.treated}))},
  systemActivated:!hidden,
  ...(!hidden?{
   system:{level:p.systemLevel,xp:p.xp,
    xpRequired:xpToNextLevel(p.systemLevel),
    unspentPoints:p.freeStatPoints,
    skillMastery:structuredClone(p.skillMastery??{}),
    ...(p.lastMutilation?{lastMutilation:{...p.lastMutilation}}:{}),
    attributes:{...p.stats},phase:p.phase},
   falna:{present:p.falna.blessed,divineLevel:p.falna.blessed?
    p.falna.divineLevel:null,godNameNotAutoRevealed:true},
   currencies:{systemGold:p.gold,valis:p.valis},
   inventory:{itemTypes:Object.keys(p.inventory).filter(k=>p.inventory[k]>0).length,
    items:Object.entries(p.inventory).filter(x=>x[1]>0).slice(0,25)
     .map(([id,quantity])=>({id,quantity})),
    notFullIfLong:Object.keys(p.inventory).length>25,
    ammunition:p.ammoRemaining??null},
   activeQuest:p.dailyTraining?{
    day:p.dailyTraining.day,status:p.dailyTraining.status,
    exercises:{...p.dailyTraining.exercises},
    deadlineMinute:p.dailyTraining.deadlineMinute,
    remainingMinutes:calcMinutes(s.gameClock)===null?null:
     Math.max(0,p.dailyTraining.deadlineMinute-calcMinutes(s.gameClock)!),
    choiceAvailable:p.dailyTraining.status==="active"&&
     Object.values(p.dailyTraining.exercises).every((n,i)=>
      n>=[100,100,100,10000][i])
   }:null,
   shadows:{count:p.shadowRoster.length,
    capacity:shadowCapacity(p),
    active:p.shadowRoster.filter(x=>!x.stored).length,
    stored:p.shadowRoster.filter(x=>x.stored).length,
    ownedNames:p.shadowRoster.slice(0,20).map(x=>({
     id:x.id,name:x.name,rank:x.powerTier,deployed:!x.stored}))},
   openKeys:Object.values(p.dungeonKeys).map(x=>({
    id:x.id,status:x.state})),
   intactStones:Object.values(p.magicStones).filter(x=>
    x.state==="held").length,
   combat:p.activeEncounter?{
    active:true,round:p.activeEncounter.round,
    enemyLabel:"Противник",
    enemyHpHidden:true,
    enemyOtherStatsHidden:true,
    showFullPlayerResourceBars:true
   }:null
  }:{system:null,falna:null,currencies:null,inventory:null,
   activeQuest:null,shadows:null,openKeys:[],intactStones:null,combat:null}),
  displayPolicy:ORARIO_ANCHOR_POLICY
 };
 return base;
}
export function readOrarioGmAnchors(s:LabSession,npcIds:string[]){
 if(!s.player.jinwoo)return {
  schema:"RPG_LAB_ORARIO_GM_ANCHORS_V1",
  audience:"GM_ONLY" as const,available:false,readOnly:true,
  privateNpcAnchors:[] as {npcId:string;memories:number;
   suspicion:number;personalKnowledgeNotShared:boolean;
   mustReadActualCoreBeforeDialogue:boolean}[],
  worldEvents:0,openProjects:0,rumorCandidates:0,
  playerActionsRemainPlayerControlled:true,
  sourceRefAndRevisionRequired:true,
  spoilerFilterEnforcedInPlayerAnchors:true
 };
 if(!Array.isArray(npcIds)||npcIds.length>8||
  npcIds.some(x=>typeof x!=="string"||x.length>80))
  throw Error("ORARIO_GM_ANCHOR_NPC_SELECTION_INVALID");
 return {schema:"RPG_LAB_ORARIO_GM_ANCHORS_V1",
  audience:"GM_ONLY" as const,
  privateNpcAnchors:npcIds.map(npcId=>({
   npcId,memories:s.npcs[npcId]?.memories.length??0,
   suspicion:s.npcs[npcId]?.suspicion?.score??0,
   personalKnowledgeNotShared:true,
   mustReadActualCoreBeforeDialogue:true
  })),
  worldEvents:s.worldEvents?.length??0,
  openProjects:Object.keys(s.worldProjects??{}).length,
  rumorCandidates:Object.keys(s.ambientRumors??{}).length,
  playerActionsRemainPlayerControlled:true,
  sourceRefAndRevisionRequired:true,
  spoilerFilterEnforcedInPlayerAnchors:true,
  readOnly:true};
}
