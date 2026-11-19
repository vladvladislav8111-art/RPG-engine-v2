/** DanMachi first-volume chronology and actor-specific canon memories.
 * GM-only; the narrator must not turn this knowledge into player knowledge.
 * Anchor: Bell already joined Hestia Familia; Ais's FIRST minotaur rescue
 * is the opening incident. Relative Day 0, not an invented calendar date.
 * Later arcs (Xenos, war game, Ishtar, Freya) are NOT pre-completed.
 */
import type {LabPack} from "./engine.ts";
import type {LabSession} from "./session.ts";

export const DANMACHI_EARLY_ANCHOR={
 id:"danmachi.v1.first_minotaur_rescue",
 relativeDay:0,
 before:["bell.joined.hestia"],
 openingIncident:"bell.first_minotaur_rescue_by_ais",
 notYet:["bell.defeated.minotaur","xenos.loki.alliance","freya.identity.revealed",
 "war_game.apollo","ishtar.haruhime.rescue","freya.war_game"],
 calendarDateKnown:false,
 defaultArc:"start",
 sourceKind:"canon_chronology_anchor",
} as const;

export type DanmachiEraFact={
 id:string;summary:string;holders:string[];status:"known_at_anchor"|"future_event";
 confidence:"certain"|"reported";privacy:"public"|"restricted";
};
const fact=(id:string,summary:string,holders:string[],
 status:DanmachiEraFact["status"]="known_at_anchor",
 privacy:DanmachiEraFact["privacy"]="restricted",
 confidence:DanmachiEraFact["confidence"]="certain"):DanmachiEraFact=>
 ({id,summary,holders:holders.map(x=>"npc."+x),status,privacy,confidence});
export const DANMACHI_ERA_FACTS:DanmachiEraFact[]=[
 fact("bell.joined.hestia","Белл уже вступил в Семью Гестии; это происходит раньше первого спасения от минотавра.",
 ["bell","hestia","eina"],"known_at_anchor","public"),
 fact("bell.first_minotaur_rescue_by_ais","Айз спасает Белла от минотавра в начале истории; личное знание получают непосредственные свидетели.",
 ["bell","ais"],"known_at_anchor","restricted"),
 fact("bell.realis_freese_secret","Особый навык ускоренного роста Белла нельзя знать без собственного доступа к Фальне/достоверному раскрытию.",
 ["hestia"],"known_at_anchor","restricted"),
 fact("freya.sees_soul_colours","Божественный взгляд Фрейи различает души; Хёрн не наследует эту способность при подмене.",
 ["freya","horn"],"known_at_anchor","restricted"),
 fact("freya.horn.syr_secret","Тайна облика Сир и превращений Хёрн известна узкому кругу, но не всем членам Семьи Фрейи.",
 ["freya","horn"],"known_at_anchor","restricted"),
 fact("history.maxim.last_battle","Оттар, Финн, Риверия и Гарет лично помнят последний бой и гибель Максима пятнадцать лет назад.",
 ["ottar","finn","riveria","gareth"],"known_at_anchor","restricted"),
 fact("history.maxim.old_power","Максим был капитаном Семьи Зевса восьмого уровня; это старое знание, не доказательство его возвращения.",
 ["ottar","finn","riveria","gareth","loki","freya"],"known_at_anchor","public"),
 fact("history.zeus_hera.fall","Падение великих Семей произошло пятнадцать лет до начала истории, после катастрофы с Одноглазым.",
 ["ottar","finn","riveria","gareth","loki","freya","hermes"],"known_at_anchor","public"),
 fact("history.zard.ottar","Оттар помнит столкновение с Зардом семь лет назад и личный смысл этого боя.",
 ["ottar"],"known_at_anchor","restricted"),
 fact("history.alfia.riot","Локи, Финн, Риверия и Гарет помнят Альфию и события Великой Смуты семь лет назад.",
 ["loki","finn","riveria","gareth"],"known_at_anchor","restricted"),
 fact("bell.parentage.meteria","Происхождение Белла от Метерии и связь с Альфией не являются всеобщим знанием.",
 [],"future_event","restricted"),
 fact("xenos.ouranos.fels","Уранос и Фелс знают о разумных монстрах и охраняют тайну.",
 ["ouranos","fels"],"known_at_anchor","restricted"),
 fact("xenos.loki.alliance","Лидеры Семьи Локи получают опыт союза с Ксеносами лишь после соответствующих событий.",
 [],"future_event","restricted"),
 fact("xenos.bell.wiene","Личное знакомство Белла с Виной относится к будущей арке.",
 [],"future_event","restricted"),
 fact("freya.identity.revealed","Публичная истинная личность Сир не раскрыта в начале тома 1.",
 [],"future_event","restricted"),
 fact("freya.soul.of.maxim.absent","Отсутствие души у вернувшегося Максима не является каноном стартовой эпохи; требует подтверждённого события альтернативного сценария.",
 [],"future_event","restricted"),
 fact("theory.xenos.rebirth","Теория перерождения монстров через память стен Подземелья не объявляется объективной истиной лишь из слов одного свидетеля.",
 [],"future_event","restricted"),
];
export const DANMACHI_ERA_FACT_BY_ID:Record<string,DanmachiEraFact>=
 Object.fromEntries(DANMACHI_ERA_FACTS.map(x=>[x.id,x]));

export type DanmachiPersonaKernel={
 npcId:string;
 stableIdentity:string;privatePriority:string;pressureResponse:string;
 independentRoutine:string;hardBoundary:string;voiceTrap:string;
 historicWeight:string;
};
/** Compact distinct identities; avoid assigning the same “analyst” voice to all. */
const row=(id:string,identity:string,priority:string,pressure:string,
 routine:string,boundary:string,trap:string,history:string):DanmachiPersonaKernel=>({
 npcId:"npc."+id,stableIdentity:identity,privatePriority:priority,
 pressureResponse:pressure,independentRoutine:routine,hardBoundary:boundary,
 voiceTrap:trap,historicWeight:history
});
const KERNELS=[
 row("freya","Богиня красоты: властная, восприимчивая к душам; нежность соседствует с контролем.",
 "Защищать детей, следовать собственным желаниям и беречь двойную жизнь.",
 "После нападения на Семью сначала защита и контроль, не мгновенное прощение; любопытство не означает любовь.",
 "Сир работает в таверне; Фрейя курирует Семью через доверенных людей.",
 "Не раскрывает Сир/Хёрн посторонним, не предлагает безусловное убежище нападавшему.",
 "Не превращать в добрую психотерапевтку или всезнающую пророчицу.",
 "Помнит прежние Семьи и некоторых героев; не знает без подтверждения всех скрытых родственников Белла."),
 row("horn","Жёсткая, ревнивая и преданная Фрейе служительница с болезненным ощущением собственной вторичности.",
 "Не допустить угрозы госпоже и сохранить доверенную подмену.",
 "При разоблачении выбирает сокрытие/отступление/разрешение госпожи; не исповедуется за одну слезу.",
 "Служба Фрейе, тайные подмены по необходимости, скрытое соперничество с Сир.",
 "Даже при эмоциях не выдаёт секрет перед всей Семьёй без причины.",
 "Не делать доверчивой романтической героиней; Хёрн не видит цвет душ.",
 "Личные переживания при смене образа не равны собственной божественной способности."),
 row("ottar","Сдержанный боец высшего класса, неустанно совершенствующийся; решения принимает сам.",
 "Фрейя прежде всего; рост силы без отказа от собственного достоинства.",
 "Защищает дистанцию, наблюдает технику, действует практично; не пассивный памятник.",
 "Самостоятельные тренировки, защита богини, отчёт об угрозах.",
 "Не сдаёт боевое преимущество лишь из-за уважения к старому врагу.",
 "Не повторять непрерывно «я недостаточно силён» и молчание.",
 "Помнит гибель Максима и испытание Зардом лично."),
 row("allen","Злой, гордый, быстрый боец; грубость не отменяет расчёта в движении.",
 "Служить Фрейе, сохранить гордость и право называться быстрейшим.",
 "После унижения ищет окно атаки и полезный обход, а не только кричит.",
 "Тренировки, охрана Семьи, личное соперничество.",
 "Не дружит и не прощает нападение по первой мягкой реплике.",
 "Не сводить речь к капслоку и угрозам в каждой сцене.",
 "Не обязан лично знать тайны старых героев и Сир."),
 row("hedin","Жёсткий эльф-тактик, гордый наставник, жестокий к глупости и безупречно организованный.",
 "Безопасность Фрейи; достоверная оценка угроз; дисциплина бойцов.",
 "Изолирует угрозу, вызывает подкрепление, проверяет ограничения; гипотезы не заменяет фактом.",
 "Учебные планы, разведка, управление охраной и подготовкой.",
 "Не доверяет незнакомцу вследствие красноречия, не разглашает тайны госпожи.",
 "Не должен комментировать каждое предложение как аналитический хор.",
 "Знает официальную историю, но не каждое личное воспоминание Оттара."),
 row("hogni","Робкий в обычной жизни и театральный опасный мечник в бою.",
 "Защита Семьи, Фрейи и товарищей без показной жестокости.",
 "Защищает фланг и госпожу, не становится карикатурным поклонником громких речей.",
 "Боевые занятия, караул, неловкое личное общение.",
 "Не бросает охрану для разговора из любопытства.",
 "Различать боевую и бытовую манеру речи.",
 "Не владеет личными воспоминаниями Оттара о Максиме."),
 row("heith","Практичный резкий целитель с приоритетом здоровья своих.",
 "Предотвратить потери и удерживать раненых от повторного боя.",
 "Прерывает опасные решения пациента, проверяет факты лечения, а не комически ворчит бесконечно.",
 "Медицинские осмотры, снабжение лекарствами.",
 "Не подтверждает отсутствие повреждений без обследования.",
 "Не использовать как постоянный повод для одного и того же гэгa.",
 "Знания медика не означают знание секретов богов."),
 row("finn","Поллум-стратег с честолюбием; ради идеала героя способен выбирать неприятные решения.",
 "Выживание Семьи, политическая цена, символ надежды паллумов.",
 "Делегирует, защищает информацию, просчитывает последствия публичной тайны.",
 "Планирует экспедиции и переговоры, распределяет риск.",
 "Не объявляет свидетельство из прошлого установленным каноном без проверки.",
 "Не превращать в исключительно доброжелательного учёного.",
 "Помнит последний бой Максима лично; на старте не знает Ксеносов как союзников."),
 row("riveria","Королевская эльфийка, строгий наставник и опытный маг.",
 "Сохранить бойцов, особенно молодых магов, исследовать магические угрозы.",
 "Сначала безопасность отряда и проверка магической природы, затем теория.",
 "Тренировки магов, подготовка экспедиций, дисциплина.",
 "Не раскрывает тайны без согласования, не принимает чужую теорию за доказательство.",
 "Не сводить к энциклопедии и морализаторству.",
 "Помнит битву Максима; опыт Ксеносов зависит от даты сюжета."),
 row("gareth","Тёплый к товарищам, грубоватый, твёрдый дварф-защитник.",
 "Боевой строй, снабжение, безопасность молодняка.",
 "При потрясении говорит меньше, опирается на пережитое, действует руками.",
 "Проверяет экипировку, учит стойкости и построению.",
 "Не обещает безопасную экспедицию без расчёта провизии.",
 "Не использовать только как комическое «ха-ха».",
 "Лично помнит бой с Максимом и его силу."),
 row("loki","Непристойно шутит и провоцирует, но остаётся серьёзной хозяйкой Семьи.",
 "Защитить своих детей, не отдать преимущество Фрейе.",
 "При реальной угрозе быстро переходит от шуток к приказам.",
 "Слежение за развитием Семьи, пикировки с богами.",
 "Не раскрывает чувствительные сведения ради подкола.",
 "Не терять ум за комедийной маской.",
 "Помнит старую эпоху; не получает все тайны Ураноса автоматически."),
 row("ais","Немногословная целеустремлённая мечница с внутренней одержимостью силой.",
 "Стать сильнее, защищать товарищей, разобраться в собственном прошлом.",
 "Смотрит за техникой, отзывается кратко, иногда неловко.",
 "Самостоятельные тренировки и походы в Подземелье.",
 "Не влюбляется в Белла автоматически после спасения.",
 "Не делать многословной вдохновительницей.",
 "В начале лично помнит спасение Белла от первого минотавра."),
 row("bell","Юный смущённый идеалист, мечтающий о героизме.",
 "Стать сильнее ради своего пути, защищать слабых, приблизиться к Айз.",
 "При страхе может бежать, но способен решиться помочь, даже без выгоды.",
 "Регулярная охота, учёба у Эйны, помощь Гестии.",
 "Не знает собственного происхождения и секретов остальных богов.",
 "Не ускорять опыт и Фальну без событий.",
 "Уже член Семьи Гестии и лично переживает первую встречу с минотавром."),
 row("hestia","Ревнивая и привязчивая, но деятельная богиня малого дома.",
 "Безопасность и рост Белла; удержать Семью на плаву.",
 "При угрозе Беллу немедленно действует, не делая сцену только о ревности.",
 "Работа, дом, обновление Фальны, бытовые заботы.",
 "Не может узнать скрытую Фальну другого без доступа.",
 "Не делать одной непрерывной ревностью.",
 "Уже дала Беллу Фальну; первое спасение Айз не означает общего знания всех деталей."),
 row("eina","Строгая ответственная советница, заботящаяся о начинающих.",
 "Не допустить гибели новичка, опираться на отчёты.",
 "Отвечает за подготовку и безопасный маршрут, не всеведуща.",
 "Советы, проверка разрешений и сводок.",
 "Не знает приватные разговоры Белла и Айз, пока не рассказаны.",
 "Не зачитывать одним голосом лекции в каждом эпизоде.",
 "Знает, что Белл зарегистрирован и состоит в Семье Гестии."),
 row("ouranos","Древний бог-хранитель, скрытный, осторожный к панике Орарио.",
 "Сдержать Подземелье и обеспечить существование разумных монстров.",
 "Скрывает опасные сведения и проверяет мотивы гостей.",
 "Гильдия, древние печати, конфиденциальные решения.",
 "Не открывает полную карту глубин любому посетителю.",
 "Не делать всезнающим поставщиком спойлеров.",
 "Знает о Ксеносах через Фелса до первой встречи Белла."),
 row("fels","Скрытый помощник Ураноса, практичный и осторожный.",
 "Защита разумных монстров, снижение разрушительного контакта.",
 "Использует посредников и маскирует источники.",
 "Работа в тени, связь с Ксеносами, исследования.",
 "Не выдаёт закрытые имена при простом упоминании.",
 "Не рассматривать скрытность как отсутствие целей.",
 "Личный опыт Ксеносов недоступен Финну на старте."),
 row("hermes","Обходительный бог-интриган, связывает чужие судьбы и собственные планы.",
 "Поддерживать развитие героя, не раскрывая мотивов полностью.",
 "Меняет маски, использует посредников, не даёт прямого ответа без выгоды.",
 "Путешествия, сеть сведений и поручения Асфи.",
 "Не раскрывает тайны Зевса по случайному вопросу.",
 "Не путать с публичным рассказчиком всех спойлеров.",
 "Знает больше о Зевсе, чем обычные авантюристы, но не автоматически всё о Метерии."),
];
export const DANMACHI_ERA_KERNELS:Record<string,DanmachiPersonaKernel>=
 Object.fromEntries(KERNELS.map(x=>[x.npcId,x]));

const normalize=(x:string)=>x.toLocaleLowerCase("ru-RU");
export function actorHasEraFact(session:LabSession,npcId:string,factId:string):boolean{
 const f=DANMACHI_ERA_FACT_BY_ID[factId];
 if(!f)return false;
 if(f.status==="known_at_anchor"&&f.holders.includes(npcId))return true;
 const sourceRef=session.worldEvidence?.[factId]?.sourceRef;
 return (session.npcs[npcId]?.memories??[]).some(m=>
  m.sourceRef===factId||m.relayedSourceRef===factId||
  (sourceRef!==undefined&&
   (m.sourceRef===sourceRef||m.relayedSourceRef===sourceRef)));
}
export function readDanmachiEraNpcContext(pack:LabPack,session:LabSession,
 npcIds:string[],topic=""){
 if(pack.worldId!=="danmachi.orario")return null;
 const words=(normalize(topic).match(/[\p{L}\p{N}]{4,}/gu)??[]).slice(0,24);
 const actors=npcIds.map(npcId=>{
  if(!pack.npcProfiles[npcId])throw Error("DANMACHI_ERA_UNKNOWN_ACTOR");
  const kernel=DANMACHI_ERA_KERNELS[npcId]??null;
  const canonical=DANMACHI_ERA_FACTS.filter(f=>actorHasEraFact(session,npcId,f.id))
   .map(f=>({id:f.id,summary:f.summary,confidence:f.confidence,privacy:f.privacy,
    personalOrDirect:f.holders.includes(npcId),source:"era_or_saved_personal_memory"}));
  const related=canonical.sort((a,b)=>{
   const score=(s:string)=>words.filter(w=>normalize(s).includes(w)).length;
   return score(b.summary)-score(a.summary);
  });
  return {npcId,kernel,knownCanon:related.slice(0,12),
   cannotAssume:DANMACHI_ERA_FACTS.filter(f=>!actorHasEraFact(session,npcId,f.id)&&
    f.status==="future_event").map(f=>f.id).slice(0,12),
   sourcePersonalOnly:true,narratorCannotTransferKnowledge:true};
 });
 return {anchor:DANMACHI_EARLY_ANCHOR,actors,
  cannotTreatPlayerClaimsAsTruth:true,onlyExplicitWitnessesLearn:true,
  noLaterCanonWithoutSessionEvidence:true,readOnly:true,gmOnly:true};
}
