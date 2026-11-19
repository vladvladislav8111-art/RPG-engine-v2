/** GM-only story hooks for a DanMachi/Solo Leveling crossover.
 * These are situations to adjudicate, NOT automatic arcs, spawned NPCs,
 * XP, rewards, or facts in any character's knowledge.
 */
import {shopAvailable,type JinwooPhase,type JinwooState} from "./shadow_monarch_rules.ts";
export type JinwooNarrativeHook={
 id:string;
 tags:string[];
 minPhase:JinwooPhase;
 requiresSkill?:string;
 relevantNpcIds:string[];
 playerVisibleOnTrigger:boolean;
 gmQuestion:string;
 continuityGuard:string;
 escalation:"personal"|"local"|"faction"|"world";
};
const H=(id:string,tags:string[],phase:JinwooPhase,npcs:string[],
 question:string,guard:string,escalation:JinwooNarrativeHook["escalation"]="local",
 requiresSkill?:string):JinwooNarrativeHook=>({
 id,tags,minPhase:phase,relevantNpcIds:npcs,playerVisibleOnTrigger:false,
 gmQuestion:question,continuityGuard:guard,escalation,
 ...(requiresSkill?{requiresSkill}:{}),
});
export const JINWOO_STORY_HOOKS:readonly JinwooNarrativeHook[]=[
 H("status.first_contact",["first_status","system"],
  "player_system",[],
  "Новый герой приходит в себя в лазарете Орарио. Подтверждено ли первое открытие Системы и что он реально знает?",
  "Интерфейс видит только Игрок. Не раскрывать будущие сюжетные задания."),
 H("daily.deadline",["day_advance","daily"],
  "player_system",[],
  "Было ли задание объявлено заранее, и совершал ли герой действия для выполнения?",
  "Штрафная зона не появляется тайно из-за пропущенного ведущим времени."),
 H("shop.currency",["shop","equipment","loot"],
  "player_system",["npc.eina"],
  "Достаточно ли системного золота? Кто мог заметить материализацию предмета?",
  "Золото не равно валис. Невозможно продать один предмет дважды или покупать заблокированное."),
 H("guild.status",["guild","falna","registration"],
  "player_system",["npc.eina","npc.hestia","npc.ouranos"],
  "Что реально увидит Гильдия, если герой не имеет обычной Фальны?",
  "Игрок без благословения не получает Фальну автоматически; регистраторы не видят HUD."),
 H("bell.aiz.rescue",["bell","first_minotaur","ais"],
  "player_system",["npc.bell","npc.ais","npc.hestia","npc.eina"],
  "Вмешивается ли герой в событие или лишь слышит о нём?",
  "Относительный День 0: Белл уже в Семье Гестии. Личная встреча требует присутствия."),
 H("freya.soul",["freya","soul_sight","mystery"],
  "player_system",["npc.freya","npc.horn","npc.ottar"],
  "Увидела ли настоящая Фрейя необычную душу? Кто в действительности присутствовал?",
  "Хёрн не видит цвет душ, даже под обликом Фрейи. Не раскрывать тайны остальных."),
 H("class.trial",["job_change","quest","level_40"],
  "player_system",[],
  "Подтверждены ли уровень, согласие героя и исход самостоятельного испытания?",
  "Нельзя вручить класс, тени или титул только по фразе ведущего."),
 H("shadow.magic_stone",["shadow_extraction","magic_stone","dungeon"],
  "shadow_class",["npc.eina","npc.riveria"],
  "Есть ли у героя целый, подтверждённо полученный магический камень конкретного монстра?",
  "Камень является новой основой тени только по правилу кроссовера; после успеха поглощается, продать его уже нельзя.",
  "faction","shadow_extraction"),
 H("shadow.first_witness",["shadow_army","public","rumor"],
  "shadow_class",["npc.finn","npc.riveria","npc.gareth","npc.loki"],
  "Кто именно видел призыв и какие выводы допустимы после одного наблюдения?",
  "Наблюдение не является мгновенной дружбой, войной или полным знанием механизма."),
 H("shadow.human",["human_shadow","ethics","death"],
  "shadow_class",["npc.finn","npc.freya","npc.ottar"],
  "Была ли смерть подтверждена, был ли покойный известен присутствующим?",
  "Извлечение человеческой тени допускается по силе Джин-Ву, но вызывает индивидуальные последствия. Не писать мысли героя."),
 H("shadow.named_companion",["shadow_naming","shadow_personality"],
  "shadow_class",[],
  "Подтверждены ли личность, происхождение, ранг и самостоятельная манера именованной тени?",
  "Игрис, Беру и Беллион не возникают в чистой игре только из-за известного имени."),
 H("shadow.patrol",["shadow_guard","offscreen","escort"],
  "shadow_class",["npc.hedin","npc.allen"],
  "Куда приказано идти и что тень могла узнать без прямой передачи сведений?",
  "Планы теней, их результат и сообщения требуют подтверждённых источников."),
 H("shadow.exchange",["teleport","shadow_exchange"],
  "shadow_class",["npc.finn","npc.hedin"],
  "Размещена ли целевая тень, действует ли перезарядка, замечен ли переход?",
  "До полной власти необходимо соблюсти условия и не телепортировать людей без основания.",
  "faction","shadow_exchange"),
 H("shadow.domain",["domain","shadow_buff","battle"],
  "shadow_class",["npc.riveria","npc.ottar"],
  "На каких теней распространяется усиление и что уже доказано боем?",
  "Не объявлять домен всемогущим или способным аннулировать законы Фальны.",
  "faction","monarch_domain"),
 H("xenos.first_contact",["xenos","sentient_monster"],
  "shadow_class",["npc.ouranos","npc.fels"],
  "Кто знает о разумности монстра, какие есть источники и что делает герой?",
  "Уранос/Фелс имеют закрытые знания; Финн, Риверия и Белл не знают событий будущих арок."),
 H("black_heart",["black_heart","ashborn","near_death"],
  "shadow_class",[],
  "Существует ли подтверждённый сценарный переход к наследию Ашборна?",
  "Чёрное сердце не является ежедневным бесплатным воскрешением и не добавляется в инвентарь за XP.",
  "world"),
 H("monarch.succession",["succession","true_monarch","full_power"],
  "true_monarch",["npc.freya","npc.ouranos","npc.loki"],
  "Как объяснить миром уже свершившееся пробуждение, не стирая последствий?",
  "В каноне старая Система исчезает; продолжение магазина требует явно выбранной AU-конфигурации.",
  "world"),
 H("monarch.power_vs_dragon",["black_dragon","extreme_battle"],
  "true_monarch",["npc.ottar","npc.finn","npc.riveria"],
  "Есть ли достаточно известных фактов о противнике и какова цена публичной демонстрации?",
  "Не фиксировать победу или извлечение Одноглазого заранее и не присваивать ему чужую биографию.",
  "world"),
];
const phaseOrder:Record<JinwooPhase,number>={
 player_system:0,shadow_class:1,true_monarch:2};
export function previewJinwooNarrativeHooks(state:JinwooState,tags:string[]):{
 hooks:JinwooNarrativeHook[];readOnly:true;
 noNpcKnowledgeGrant:true;noAutomaticEvents:true;gmOnly:true;
}{
 if(!Array.isArray(tags)||tags.length>24||
  tags.some(t=>typeof t!=="string"||!/^[a-z_]{1,40}$/.test(t)))
  throw Error("JINWOO_STORY_TRIGGER_INVALID");
 const set=new Set(tags);
 return {hooks:JINWOO_STORY_HOOKS.filter(h=>
  phaseOrder[h.minPhase]<=phaseOrder[state.phase]&&
  (h.id!=="class.trial"||state.phase==="player_system")&&
  (!["daily.deadline","shop.currency"].includes(h.id)||shopAvailable(state))&&
  h.tags.some(x=>set.has(x))&&
  (!h.requiresSkill||state.unlockedSkills.includes(h.requiresSkill))),
  readOnly:true,noNpcKnowledgeGrant:true,noAutomaticEvents:true,gmOnly:true};
}
