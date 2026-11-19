/** Deterministic GM-only independent NPC intentions, not automatic events.
 * Each proposed intention retains actor, evidence, deadline and next action.
 * A separate source-bound event commit must make an outcome true.
 */
import type {LabPack} from "./engine.ts";
import type {LabSession} from "./session.ts";
import {DANMACHI_ERA_KERNELS} from "./danmachi_era_cores_v2.ts";
export type DanmachiSignalKind=
 "freya_threat"|"maxim_appearance"|"unknown_letter"|"xenos_report"|
 "bell_rescued"|"familia_hurt"|"ordinary_contact";
export type DanmachiActorSignal={actorId:string;sourceRef:string;kind:DanmachiSignalKind};
export type DanmachiIntent={
 actorId:string;action:string;reason:string;atMinute:number;nextReviewMinute:number;
 triggerRef:string|null;kind:"reactive"|"routine";priority:"urgent"|"normal";
 privateUntilConfirmed:true;alreadyOccurred:false;requiresConfirmation:true;
 projectDraft:{ownerNpcId:string;originRef:string;title:string;
  status:"proposed";privacy:"hidden";nextReviewMinute:number}|null;
};
const BEHAVIOURS:Record<string,Partial<Record<DanmachiSignalKind,string>>>={
 "npc.freya":{freya_threat:"Защитить детей и собрать проверенные сведения о нападавшем, не обещая прощения",
  maxim_appearance:"Лично проверить божественным взглядом без предположения о воскресении",
  unknown_letter:"Проверить содержание и решить, отвечать ли самостоятельно",
  xenos_report:"Проверить происхождение слуха, не раскрывая ненужные тайны"},
 "npc.ottar":{freya_threat:"Прикрыть Фрейю и ограничить противнику доступ, сохраняя боевую инициативу",
  maxim_appearance:"Сравнить облик с собственным воспоминанием о последнем бое",
  familia_hurt:"Прикрыть раненых и обеспечить медицинскую помощь"},
 "npc.horn":{freya_threat:"Защитить настоящую Фрейю и сохранить секрет подмены",
  unknown_letter:"Передать госпоже лично без обсуждения с посторонними",
  maxim_appearance:"Не выдавать секреты, вести наблюдение по поручению госпожи"},
 "npc.allen":{freya_threat:"Оценить вектор рывка и попытаться отрезать атаку на госпожу",
  familia_hurt:"Перехватить угрожающего товарищам противника, не ждать общей реплики"},
 "npc.hedin":{freya_threat:"Развести бойцов, закрыть подходы, анализировать фактически проверенные пределы атаки",
  unknown_letter:"Охранять путь доставки и отделить автора от догадок",
  maxim_appearance:"Уточнить происхождение явления и запретить самовольную атаку"},
 "npc.hogni":{freya_threat:"Занять защитный фланг рядом с Фрейей и дождаться боевого окна"},
 "npc.heith":{familia_hurt:"Осмотреть раненых, не принимать отчёт противника за медицинское заключение"},
 "npc.finn":{maxim_appearance:"Проверить воспоминания лично и отделить свидетельство от доказательства",
  xenos_report:"Ограничить распространение тайны и запросить подтверждение у доверенных лиц"},
 "npc.riveria":{maxim_appearance:"Наблюдать магическую природу явления без опасного эксперимента",
  xenos_report:"Сравнить свидетельства и оценить угрозу бойцам от контакта"},
 "npc.gareth":{maxim_appearance:"Оценить облик прежнего противника и безопасность сопровождающих"},
 "npc.loki":{xenos_report:"Согласовать закрытую проверку сведений, не разглашать их младшим"},
 "npc.bell":{bell_rescued:"Осмыслить спасение и вернуться к тренировкам, не получая бесплатный рост"},
 "npc.ais":{bell_rescued:"Убедиться, что спасённый жив, затем продолжить свои тренировки"},
 "npc.hestia":{bell_rescued:"Оценить безопасность Белла и обновить его Фальну при личном контакте"},
 "npc.eina":{bell_rescued:"Разобрать ошибки новичка и ограничить опасные этажи"},
 "npc.ouranos":{xenos_report:"Защитить источники и поручить Фелсу осторожную проверку"},
 "npc.fels":{xenos_report:"Проверить безопасность разумных монстров и каналы связи"},
};
const hash=(s:string)=>{let h=2166136261>>>0;
 for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
 return h>>>0;};
const known=(s:LabSession,actorId:string,ref:string)=>
 (s.npcs[actorId]?.memories??[]).some(m=>m.sourceRef===ref||
 m.relayedSourceRef===ref);
export function proposeDanmachiNpcIntentCycle(pack:LabPack,session:LabSession,options:{
 npcIds:string[];fromMinute:number;toMinute:number;signals?:DanmachiActorSignal[];
 maxPerActor?:number;
}){
 if(pack.worldId!=="danmachi.orario")return {intents:[],readOnly:true,committed:false};
 const {npcIds,fromMinute,toMinute}=options;
 if(!Array.isArray(npcIds)||npcIds.length>8||new Set(npcIds).size!==npcIds.length||
  npcIds.some(x=>!pack.npcProfiles[x]))throw Error("DANMACHI_INTENT_ACTORS_INVALID");
 if(!Number.isSafeInteger(fromMinute)||!Number.isSafeInteger(toMinute)||
  fromMinute<0||toMinute<fromMinute||toMinute-fromMinute>10080)
  throw Error("DANMACHI_INTENT_CLOCK_INVALID");
 const max=options.maxPerActor??2;
 if(!Number.isInteger(max)||max<1||max>3)throw Error("DANMACHI_INTENT_LIMIT_INVALID");
 const signals=options.signals??[];
 if(!Array.isArray(signals)||signals.length>16)throw Error("DANMACHI_INTENT_SIGNAL_INVALID");
 for(const signal of signals){
  if(!signal||!npcIds.includes(signal.actorId)||
   !/^[\w.:-]{1,80}$/.test(signal.sourceRef)||
   !["freya_threat","maxim_appearance","unknown_letter","xenos_report",
     "bell_rescued","familia_hurt","ordinary_contact"].includes(signal.kind)||
   !known(session,signal.actorId,signal.sourceRef))
   throw Error("DANMACHI_INTENT_SIGNAL_NOT_PERSONALLY_KNOWN");
 }
 const intents:DanmachiIntent[]=[];
 for(const actorId of npcIds){
  const kernel=DANMACHI_ERA_KERNELS[actorId];if(!kernel)continue;
  const actorSignals=signals.filter(s=>s.actorId===actorId).slice(0,max);
  const profile=pack.npcProfiles[actorId];
  for(const signal of actorSignals){
   const action=BEHAVIOURS[actorId]?.[signal.kind]??
    "Оценить лично известное событие через собственные цели и ограничения";
   const at=fromMinute;
   const review=Math.max(at+1,toMinute);
   intents.push({actorId,action,reason:kernel.privatePriority,
    atMinute:at,nextReviewMinute:review,triggerRef:signal.sourceRef,
    kind:"reactive",priority:"urgent",privateUntilConfirmed:true,
    alreadyOccurred:false,requiresConfirmation:true,
    projectDraft:{ownerNpcId:actorId,originRef:signal.sourceRef,
      title:action.slice(0,120),status:"proposed",privacy:"hidden",
      nextReviewMinute:review}});
  }
  if(toMinute>fromMinute&&actorSignals.length<max){
   const active=Object.values(session.worldProjects??{}).some(p=>
      p.ownerNpcId===actorId&&["accepted","active","blocked"].includes(p.status));
   if(!active){
    let added=0;
    const firstDay=Math.floor(fromMinute/1440);
    const lastDay=Math.floor((toMinute-1)/1440);
    for(let day=firstDay;day<=lastDay&&added<max-actorSignals.length;day++){
     const minute=day*1440+480+
      hash(session.sessionId+"|"+actorId+"|"+day)%650;
     if(minute<=fromMinute||minute>toMinute)continue;
     intents.push({actorId,action:kernel.independentRoutine,
      reason:profile.goals[0]??kernel.privatePriority,
      atMinute:minute,nextReviewMinute:minute+1440,triggerRef:null,
      kind:"routine",priority:"normal",privateUntilConfirmed:true,
      alreadyOccurred:false,requiresConfirmation:true,projectDraft:null});
     added++;
    }
   }
  }
 }
 return {anchor:"danmachi.v1.first_minotaur_rescue",
  intents:intents.slice(0,24),worldClockWouldAdvance:false,readOnly:true,committed:false,
  sourceBoundOnly:true,noFreeNpcKnowledge:true,
  persistence:"After GM confirmation store a source-bound NPC decision/worldProject in LabSession; never auto-commit routine."};
}
