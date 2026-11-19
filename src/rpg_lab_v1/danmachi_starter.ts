/** New clean-room DanMachi starter, separate from prior saved campaigns.
 * Only templates and canonical voices are loaded; no previous player's Linos
 * powers, old scenes, private NPC opinions or story flags are inherited.
 */
import {validateLabPack,type LabPack} from "./engine.ts";
import {buildDanmachiCanonCast} from "./danmachi_cast.ts";
import {buildDanmachiStoryArcs} from "./danmachi_story_arcs.ts";
import {danmachiCanonFacts} from "./danmachi_canon_knowledge.ts";
const loc=(name:string,kind:string,neighbors:Record<string,number>={})=>
 ({name,kind,neighbors});
export const DANMACHI_STARTER_VERSION="DANMACHI_FRESH_WORLD_V1";
export function buildFreshDanmachiLabPack(projectId:string):LabPack{
 const locations={
  "orario.gate":loc("Ворота Орарио","public",{"orario.guild":12}),
  "orario.guild":loc("Гильдия","guild",{"orario.gate":12,"orario.plaza":8}),
  "orario.plaza":loc("Центральная площадь","public",{"orario.guild":8,"orario.tavern":10}),
  "orario.tavern":loc("Хозяйка изобилия","tavern",{"orario.plaza":10}),
  "orario.daedalus":loc("Улица Дедала","street",{"orario.plaza":15}),
  "orario.hephaestus":loc("Мастерские Гефест","workshop",{"orario.guild":18}),
  "orario.miach":loc("Аптека Миаха","shop",{"orario.guild":14}),
  "orario.loki.manor":loc("Сумеречный особняк","familia",{"orario.plaza":20}),
  "orario.loki.range":loc("Площадка семьи Локи","training",{"orario.loki.manor":2}),
  "orario.hestia.church":loc("Заброшенная церковь","familia",{"orario.plaza":15}),
  "orario.ganesha":loc("Резиденция семьи Ганеши","familia",{"orario.plaza":15}),
  "orario.monsterphilia":loc("Арена Монстрофилии","arena",{"orario.plaza":12}),
  "orario.dungeon.gate":loc("Вход в Подземелье","dungeon",{"orario.guild":20}),
  "orario.dungeon.upper":loc("Верхние этажи Подземелья","dungeon",{"orario.dungeon.gate":6}),
  "orario.dungeon.middle":loc("Средние этажи Подземелья","dungeon",{"orario.dungeon.upper":18}),
  "orario.redlight":loc("Квартал удовольствий","district",{"orario.plaza":18}),
  "orario.festival":loc("Фестивальная площадь","district",{"orario.plaza":15}),
 };
 const pack:LabPack={
  schema:"RPG_LAB_PACK_V1",projectId,worldId:"danmachi.orario",
  formulas:{},resources:{hp:{min:0,max:100},mp:{min:0,max:100},
   stamina:{min:0,max:100}},lootTables:{},prices:{},economy:{taxRate:0},
  locations,npcProfiles:buildDanmachiCanonCast(),
  canonFacts:structuredClone(danmachiCanonFacts),
  storyArcs:buildDanmachiStoryArcs(),
  progression:{}
 };
 return validateLabPack(pack);
}
