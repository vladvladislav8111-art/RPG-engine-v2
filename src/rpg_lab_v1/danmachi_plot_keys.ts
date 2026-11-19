/** DanMachi arc activation keys, sealed until their actual story hinges.
 * GM-private: not a spoiler list for the player. Each key is a proposal
 * until explicitly committed with source evidence in the campaign session.
 * Story moves in parallel even when the player is elsewhere.
 * No invented absolute day offsets: prerequisites and confirmed world events
 * determine the right phase, not a fabricated fast-forward schedule.
 */
import type {JinwooState} from "./shadow_monarch_rules.ts";
export type PlotKeyTrigger="player_proximity"|"world_event"|"personal_contact"|"quest_outcome";
export type PlotKey={
 id:string;label:string;minimumWorldDay:number;trigger:PlotKeyTrigger;
 prereqs:string[];topicTags:string[];
 knowledgeOwners:string[];spoilerSensitive:boolean;
};
const key=(id:string,label:string,day:number,trigger:PlotKeyTrigger,
 prereqs:string[],topicTags:string[],knowledgeOwners:string[],
 spoilerSensitive=true):PlotKey=>({
 id,label,minimumWorldDay:day,trigger,prereqs,topicTags,knowledgeOwners,
 spoilerSensitive
});
export const DANMACHI_PLOT_KEYS:readonly PlotKey[]=[
 key("orario.arrival","Появление героя в Орарио",0,"world_event",[],["orario","arrival"],[] ,false),
 key("player.awakening","Пробуждение интерфейса Игрока",0,"quest_outcome",
  ["orario.arrival"],["awakening","system","medical"],[],false),
 key("bell.first_minotaur","Первая встреча Белла с Айз и минотавром",0,"world_event",
  ["orario.arrival"],["bell","ais","first_minotaur"],["npc.bell","npc.ais"],false),
 key("guild.registration","Возможность регистрации и договорённостей с Гильдией",0,"personal_contact",
  ["orario.arrival"],["guild","eina"],["npc.eina"],false),
 key("monstrophilia","Монстрофилия Ганеши",0,"world_event",
  ["orario.arrival"],["ganesha","monstrophilia"],["npc.ganesha","npc.loki","npc.freya"]),
 key("silverback.escape","Побег сильвербека на празднике",0,"world_event",
  ["monstrophilia"],["silverback","ganesha","freya"],["npc.ganesha","npc.freya"]),
 key("bell.second_minotaur","Вторая встреча Белла с минотавром",0,"world_event",
  ["bell.first_minotaur"],["bell","minotaur_revenge"],["npc.bell","npc.ais"]),
 key("loki.expedition","Очередная экспедиция Семьи Локи",0,"world_event",
  ["orario.arrival"],["loki","expedition"],["npc.finn","npc.riveria","npc.gareth"]),
 key("apollo.wargame","События конфликта с Аполлоном",0,"world_event",
  ["bell.second_minotaur"],["apollo","wargame"],["npc.apollo","npc.hestia"]),
 key("ishtar.haruhime","История квартала удовольствий",0,"world_event",
  ["apollo.wargame"],["ishtar","haruhime"],["npc.ishtar"]),
 key("xenos.open","Открытие истории разумных монстров",0,"world_event",
  ["ishtar.haruhime"],["xenos","wiene"],["npc.ouranos","npc.fels"]),
 key("freyja.late","Поздний конфликт вокруг Фрейи",0,"world_event",
  ["xenos.open"],["freya","syr","late_arc"],["npc.freya","npc.horn"]),
 key("shadow.job_change","Классовое испытание Теневого Монарха",0,"quest_outcome",
  ["player.awakening"],["shadow","job_change","quest"],[]),
 key("shadow.ashborn","Передача власти Монарха теней",0,"quest_outcome",
  ["shadow.job_change"],["ashborn","full_monarch"],[]),
];
const byId:Record<string,PlotKey>=Object.fromEntries(
 DANMACHI_PLOT_KEYS.map(x=>[x.id,x])
);
export const plotFlag=(id:string)=>"plot.key."+id;
const ref=(x:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(x);
export function previewDanmachiPlotKeys(s:JinwooState,params:{
 worldDay:number;topicTags:string[];confirmedTrigger:PlotKeyTrigger|null;
}){
 if(!Number.isSafeInteger(params.worldDay)||params.worldDay<0||
  !Array.isArray(params.topicTags)||params.topicTags.length>24)
  throw Error("PLAYER_PLOT_PREVIEW_INVALID");
 const tags=new Set(params.topicTags);
 return {gmOnly:true,readOnly:true,spoilersHiddenFromPlayer:true,
  options:DANMACHI_PLOT_KEYS.filter(k=>
    params.worldDay>=k.minimumWorldDay&&
    (params.confirmedTrigger===null||k.trigger===params.confirmedTrigger)&&
    k.topicTags.some(t=>tags.has(t))&&
    k.prereqs.every(p=>s.storyFlags.includes(plotFlag(p)))&&
    !s.storyFlags.includes(plotFlag(k.id)))};
}
export function grantDanmachiPlotKey(s:JinwooState,entry:{
 sourceRef:string;keyId:string;worldDay:number;trigger:PlotKeyTrigger;
 gmConfirmed:boolean;eventRef:string;witnessIds?:string[];
}):JinwooState{
 const k=byId[entry.keyId];
 if(!k||!entry.gmConfirmed||!ref(entry.sourceRef)||!ref(entry.eventRef)||
  !Number.isSafeInteger(entry.worldDay)||entry.worldDay<k.minimumWorldDay||
  k.trigger!==entry.trigger||s.appliedRewardRefs.includes(entry.sourceRef)||
  !k.prereqs.every(p=>s.storyFlags.includes(plotFlag(p)))||
  s.storyFlags.includes(plotFlag(k.id))||
  (entry.witnessIds??[]).some(id=>!ref(id)))
  throw Error("PLAYER_PLOT_KEY_UNAVAILABLE_OR_UNCONFIRMED");
 const n=structuredClone(s);
 n.storyFlags.push(plotFlag(k.id));
 n.appliedRewardRefs.push(entry.sourceRef);
 return n;
}
