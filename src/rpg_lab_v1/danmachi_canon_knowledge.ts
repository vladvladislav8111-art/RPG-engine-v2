/** First-era public lore and genuinely person-specific background.
 * Public truths are only usable when the NPC's canon knownFacts includes them.
 * Secrets remain GM-private even if the host reads the whole pack.
 */
export type LabCanonFact={
 summary:string;visibility:"public"|"private";entryArc:string;
};
export const danmachiCanonFacts:Record<string,LabCanonFact>={
 "canon.orario.guild":{summary:"Гильдия следит за авантюристами, регистрацией Семей и Подземельем",visibility:"public",entryArc:"start"},
 "canon.orario.daedalus":{summary:"Дедал был знаменитым архитектором Орарио; улица Дедала названа в его честь. Одинаковое имя не доказывает родство.",visibility:"public",entryArc:"start"},
 "canon.orario.dungeon":{summary:"Под Орарио расположено опасное Подземелье, и для новичков верхние этажи всё ещё смертельно опасны.",visibility:"public",entryArc:"start"},
 "canon.orario.falna":{summary:"Божественная Фальна даётся членам Семей, а переход к другому богу не является простым одновременным вступлением в две Семьи.",visibility:"public",entryArc:"start"},
 "canon.ganesha.monsterphilia":{summary:"Семья Ганеши отвечает за безопасность и укрощение монстров на Монстрофилии.",visibility:"public",entryArc:"start"},
 "canon.loki.familia":{summary:"Семья Локи возглавляется Финном; Риверия и Гарет занимают старшие командные роли, а Локи её богиня.",visibility:"public",entryArc:"start"},
 "canon.hephaestus.familia":{summary:"Гефест руководит выдающейся кузнечной Семьёй; Цубаки известна мастерством и опытом.",visibility:"public",entryArc:"start"},
 "canon.hestia.familia":{summary:"Гестия лично заботится о Белле Кранеле и имеет маленькую Семью в начале истории.",visibility:"public",entryArc:"start"},
 "canon.freya.familia":{summary:"Фрейя богиня красоты и владычица сильной Семьи, а Оттар её выдающийся боец.",visibility:"public",entryArc:"start"},
 "canon.hermes.familia":{summary:"Гермес покровитель предприимчивой Семьи, а Асфи известна изготовлением магических предметов.",visibility:"public",entryArc:"start"},
 "canon.guild.advisors":{summary:"Эйна работает советницей авантюристов и строго относится к подготовке молодых бойцов.",visibility:"public",entryArc:"start"},
 "canon.loki.aiz":{summary:"Айз тренируется почти постоянно и является одной из сильнейших мечниц Семьи Локи.",visibility:"public",entryArc:"start"},
 "canon.loki.twins":{summary:"Тиона и Тионе сёстры-амазонки; старшая Тионе оберегает младшую Тиону и неравнодушна к Финну.",visibility:"public",entryArc:"start"},
 "canon.loki.bete":{summary:"Бете груб в разговорах, но его гордость и стремление к силе не исключают заботы о боевых товарищах.",visibility:"private",entryArc:"start"},
 "canon.bell.hero_dream":{summary:"Белл мечтает о подвигах и стремится приблизиться к Айз; его убеждения важны для его собственного роста.",visibility:"private",entryArc:"start"},
 "canon.bell.realis_freese":{summary:"Рост Белла связан с редким личным навыком и чувствами; это не общедоступное знание всех богов.",visibility:"private",entryArc:"start"},
 "canon.loki.freya_rival":{summary:"Локи и Фрейя имеют собственные трения и политические интересы, но не всегда конфликтуют открыто.",visibility:"private",entryArc:"start"},
 "canon.freya.syr":{summary:"Личность Сир связана с Фрейей и Хёрн. Не раскрывать без сюжетного события.",visibility:"private",entryArc:"freya"},
 "canon.xenos.urano":{summary:"Уранос и Фелс скрывают знание о ксеносах, поскольку публичное раскрытие может вызвать массовую угрозу.",visibility:"private",entryArc:"xenos"},
 "canon.filvis.past":{summary:"Прошлое Филвис содержит опасную тайну, которую она не расскажет новому знакомому.",visibility:"private",entryArc:"sword_oratoria"},
 "canon.ryuu.astrea":{summary:"Рю имеет трагическую историю своей прежней Семьи; она очень осторожна в доверии.",visibility:"private",entryArc:"season4"},
 "canon.ganesha.security":{summary:"Шакти руководит дисциплиной и безопасностью Семьи Ганеши, а занятия для чужого авантюриста потребуют решения и ресурсов.",visibility:"public",entryArc:"start"},
 "canon.miach.resources":{summary:"Семья Миаха бедна, поэтому даже полезное исследование может затормозиться из-за денег и инструментов.",visibility:"public",entryArc:"start"},
};
export function selectDanmachiCanonKnowledge(id:string,faction:string):string[]{
 const known=new Set(["canon.orario.dungeon","canon.orario.falna"]);
 if(["guild","loki","hephaestus","hermes","ganesha","freya"].includes(faction)){
  known.add("canon.orario.guild");known.add("canon.orario.daedalus");
 }
 const factionFact="canon."+faction+".familia";
 if(danmachiCanonFacts[factionFact])known.add(factionFact);
 const specifically:Record<string,string[]>={
  loki:["canon.loki.freya_rival","canon.loki.aiz","canon.loki.twins","canon.loki.bete",
   "canon.freya.familia","canon.hephaestus.familia"],
  finn:["canon.loki.familia","canon.loki.aiz","canon.freya.familia"],
  riveria:["canon.loki.familia","canon.loki.aiz","canon.loki.bete"],
  tione:["canon.loki.twins"],tiona:["canon.loki.twins"],
  ais:["canon.loki.familia"],bete:["canon.loki.bete"],
  hephaestus:["canon.hephaestus.familia","canon.loki.familia"],
  tsubaki:["canon.hephaestus.familia","canon.ganesha.security"],
  ganesha:["canon.ganesha.monsterphilia","canon.ganesha.security"],
  shakti:["canon.ganesha.monsterphilia","canon.ganesha.security"],
  ilta:["canon.ganesha.monsterphilia"],
  hestia:["canon.hestia.familia","canon.hephaestus.familia"],
  bell:["canon.bell.hero_dream","canon.hestia.familia","canon.loki.aiz"],
  eina:["canon.guild.advisors","canon.hestia.familia"],
  freya:["canon.freya.familia","canon.freya.syr"],
  ottar:["canon.freya.familia","canon.freya.syr"],
  horn:["canon.freya.familia","canon.freya.syr"],
  syr:["canon.freya.syr"],
  hermes:["canon.hermes.familia","canon.hestia.familia"],
  asfi:["canon.hermes.familia"],
  miach:["canon.miach.resources"],
  nahza:["canon.miach.resources"],
  ouranos:["canon.xenos.urano"],
  fels:["canon.xenos.urano"],
  filvis:["canon.filvis.past"],
  ryuu:["canon.ryuu.astrea"],
 };
 for(const fact of specifically[id]??[])known.add(fact);
 return [...known];
}
