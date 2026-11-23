/** Solo Leveling System-generated dungeon keys inside DanMachi Orario.
 * Story dungeons are PRIVATE System instances, not ordinary Dungeon floors.
 * Named boss encounters are prepared as possible challenges, not spawned,
 * defeated, or extracted without an authorized event.
 */
import type {JinwooState,SystemDungeonKeyState} from "./shadow_monarch_rules.ts";
export type SystemDungeonDefinition={
 id:string;title:string;unlockHint:string;rewardCondition:
  "daily_random_box"|"player_level_40"|"secret_daily"|"later_system_story";
 minSystemLevel:number;
 oncePerCampaign:true;difficulty:"early"|"class_trial"|"s_rank"|"final";
 potentialBoss:string;relativeEntry:"orario_door"|"system_instance"|"event_location";
 gmOnly:true;
};
const key=(id:string,title:string,condition:SystemDungeonDefinition["rewardCondition"],
 minSystemLevel:number,difficulty:SystemDungeonDefinition["difficulty"],
 potentialBoss:string,relativeEntry:SystemDungeonDefinition["relativeEntry"]):
 SystemDungeonDefinition=>({
 id,title,unlockHint:"Granted only after a confirmed System reward, not by calendar or narrator fiat",
 rewardCondition:condition,minSystemLevel,oncePerCampaign:true,
 difficulty,potentialBoss,relativeEntry,gmOnly:true
});
export const SYSTEM_DUNGEON_DEFINITIONS:readonly SystemDungeonDefinition[]=[
 key("instant.first","Первое мгновенное подземелье","daily_random_box",1,"early",
  "Синий ядовитый змей Касака (возможная системная встреча)","orario_door"),
 key("job.change","Испытание смены класса","player_level_40",40,"class_trial",
  "Красный рыцарь Игрис (возможный противник)","system_instance"),
 key("demon.castle","Замок демонов","secret_daily",1,"s_rank",
  "Врата Замка демонов и цепочка его этажей","orario_door"),
 key("temple.return","Возвращение к тайне Системы","later_system_story",40,"final",
  "Скрытая поздняя история Архитектора / наследия Ашборна","event_location"),
];
const lookup:Record<string,SystemDungeonDefinition>=Object.fromEntries(
 SYSTEM_DUNGEON_DEFINITIONS.map(x=>[x.id,x]));
const valid=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
function conditions(s:JinwooState,d:SystemDungeonDefinition):boolean{
 if(s.awaitingActivation||s.phase==="true_monarch"&&
  s.postAscensionInterface==="canon_disappears")return false;
 if(s.systemLevel<d.minSystemLevel)return false;
 switch(d.rewardCondition){
  case "daily_random_box":return s.completedDailyDays.length>=1&&
   s.storyFlags.includes("quest.reward.instant_key_from_box")&&
   (s.inventory.system_instant_dungeon_key??0)>0;
  case "player_level_40":return s.phase==="player_system"&&
   s.systemLevel>=40;
  case "secret_daily":return s.storyFlags.includes("quest.secret_daily.overachievement");
  case "later_system_story":return s.phase==="shadow_class"&&
   s.storyFlags.includes("quest.system_architect.call");
 }
}
export function previewSystemDungeonKeyOffers(s:JinwooState){
 return {gmOnly:true,readOnly:true,playerDoesNotKnowUnseenKeys:true,
  candidates:SYSTEM_DUNGEON_DEFINITIONS.filter(d=>conditions(s,d)&&
   !s.dungeonKeys[d.id]),noAutomaticIssue:true};
}
export function issueSystemDungeonKey(s:JinwooState,e:{
 sourceRef:string;dungeonId:string;confirmedReward:true;
}):JinwooState{
 const d=lookup[e.dungeonId];
 if(!d||!e.confirmedReward||!valid(e.sourceRef)||
  s.appliedRewardRefs.includes(e.sourceRef)||s.dungeonKeys[e.dungeonId]||
  !conditions(s,d))
  throw Error("SYSTEM_DUNGEON_KEY_REWARD_NOT_EARNED");
 const n=structuredClone(s);
 if(e.dungeonId==="instant.first"){
  n.inventory.system_instant_dungeon_key--;
  if(n.inventory.system_instant_dungeon_key===0)
   delete n.inventory.system_instant_dungeon_key;
 }
 n.dungeonKeys[e.dungeonId]={
  id:d.id,issuedRef:e.sourceRef,state:"held"} as SystemDungeonKeyState;
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
export function enterSystemDungeon(s:JinwooState,e:{
 sourceRef:string;dungeonId:string;confirmedEntry:true;
 entranceLocationRef:string;
}):JinwooState{
 const d=lookup[e.dungeonId],issued=s.dungeonKeys[e.dungeonId];
 if(!d||!issued||issued.state!=="held"||!e.confirmedEntry||
  !valid(e.sourceRef)||!valid(e.entranceLocationRef)||
  s.appliedRewardRefs.includes(e.sourceRef))
  throw Error("SYSTEM_DUNGEON_ENTRY_NOT_VERIFIED");
 const n=structuredClone(s);
 n.dungeonKeys[e.dungeonId].state="entered";
 n.dungeonKeys[e.dungeonId].entryLocationRef=e.entranceLocationRef;
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
export function completeSystemDungeon(s:JinwooState,e:{
 sourceRef:string;dungeonId:string;confirmedClear:true;
}):JinwooState{
 const issued=s.dungeonKeys[e.dungeonId];
 if(!lookup[e.dungeonId]||!issued||issued.state!=="entered"||
  !e.confirmedClear||!valid(e.sourceRef)||
  s.appliedRewardRefs.includes(e.sourceRef))
  throw Error("SYSTEM_DUNGEON_CLEAR_UNVERIFIED");
 const n=structuredClone(s);
 n.dungeonKeys[e.dungeonId].state="cleared";
 n.dungeonKeys[e.dungeonId].completionRef=e.sourceRef;
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}

/** One-use emergency return, accessible only after an actually recovered
 * Instant Return Crystal drop. It does not count as defeating the boss.
 */
export function useConfirmedInstantReturnCrystal(s:JinwooState,e:{
 sourceRef:string;confirmedUse:boolean;playerApproved:boolean;
}):JinwooState{
 if(!e.confirmedUse||!e.playerApproved||!valid(e.sourceRef)||
    s.appliedRewardRefs.includes(e.sourceRef)||
    s.dungeonKeys["instant.first"]?.state!=="entered"||
    (s.inventory.instant_return_crystal??0)<1||
    s.activeEncounter||s.hp<=0)
  throw Error("INSTANT_RETURN_CRYSTAL_NOT_AVAILABLE");
 const n=structuredClone(s);
 n.inventory.instant_return_crystal--;
 if(n.inventory.instant_return_crystal===0)
  delete n.inventory.instant_return_crystal;
 n.dungeonKeys["instant.first"].state="retreated";
 n.dungeonKeys["instant.first"].completionRef=e.sourceRef;
 n.storyFlags.push("instant.first.retreat_via_crystal");
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
