import test from "node:test";
import assert from "node:assert/strict";
import {buildFreshDanmachiLabPack} from "../src/rpg_lab_v1/danmachi_starter.ts";
import {applyConfirmedLabEvent,type LabConfirmedEvent} from "../src/rpg_lab_v1/events.ts";
import {buildLabSceneBrief} from "../src/rpg_lab_v1/living_world.ts";
import {previewOriginalNpcPromotion,type LabOriginalNpcSeed} from "../src/rpg_lab_v1/original_npc_promotion.ts";
import type {LabNpc} from "../src/rpg_lab_v1/engine.ts";
import type {LabSession} from "../src/rpg_lab_v1/session.ts";

/** A fictional original smith, not an existing DanMachi canon person. */
const world=buildFreshDanmachiLabPack("smith_lab");
const smithId="npc.original.ivar_kell";
const seed:LabOriginalNpcSeed={
 npcId:smithId,publicName:"Ивар Келл",workplaceId:"orario.hephaestus",
 observedAppearance:"Седина на висках, старый ожог на левом предплечье, защитные очки на фартуке",
 firstEncounterRef:"evt.ivar.first",independentChoiceRef:"evt.ivar.refusal",
 witnessNpcId:"npc.tsubaki"
};
/** Author-authored GM data, not automatically known to player or other NPCs. */
const smith:LabNpc={
 name:"Ивар Келл",canonRef:"original.ivar_kell",faction:"independent",
 entryArc:"start",knownFacts:[],
 traits:["практичный","упрямый","осторожный","дорожит словом","язвителен с халтурщиками"],
 goals:["сохранить мастерскую","обучить подмастерья","не продавать заведомо опасную броню"],
 speechStyle:"Короткие предметные фразы и сухой юмор; сперва осмотрит вещь, потом назовёт цену.",
 voice:{
  register:"низкий, сухой",tempo:"медленно, ускоряется при обсуждении трещин",
  verbalTics:["Покажи шов","Металл не врёт","Без пробы не обещаю"],
  sampleLines:[
   "Приноси хоть мешок валис. Если накладка лопнет на третьем ударе, деньги уже никого не спасут.",
   "Царапину можно скрыть. Трещину скрывать нельзя.",
   "Хочешь другого мастера? Иди. Но я такого не подпишу."
  ],
  mannerisms:["постукивает по сварному шву","проверяет заклёпки пальцами","помечает спорные размеры мелом"],
  avoidCaricature:["не соглашаться ради одобрения игрока","не отказывать от каждого заказа",
   "не превращать в мудрого наставника или скрытого мастера без оснований"]
 },
 habitualLogic:{
  priorities:["надёжность изделия","репутация","благополучие подмастерья","сроки и деньги"],
  defaultInference:["богатство заказчика не заменяет испытаний",
   "новая технология интересна, но сначала нужны измерения"],
  conflictTriggers:["попытка скрыть опасный дефект","давление деньгами","угроза подмастерью"],
  socialBiases:["уважает честные договорённости, не комплименты",
   "доверие и благодарность различны"],
  limits:["не обещает непроверенных характеристик","откажется от опасной сделки",
   "сохраняет профессиональную дистанцию"]
 },
 originalCore:{
  role:"кузнец-ремонтник с небольшой независимой мастерской",
  homeLocationId:"orario.hephaestus",
  publicAppearance:seed.observedAppearance,
  normalSchedule:"Утром приём заказов, днём горячая ковка, вечером расчёты и обучение подмастерья.",
  personalGoal:"Сохранить дело и научить подмастерья не продавать опасные изделия ради быстрой прибыли.",
  privateHistory:"Когда-то выпустил спешно починенный наплечник; подмастерье пострадал на тренировке. Случай скрывает от новых клиентов. Только GM знает этот авторский факт.",
  internalConflict:"Денег не хватает, но отказ от доходного рискованного заказа кажется единственно честным выходом.",
  fear:"Опять допустить травму из-за халтуры и потерять мастерскую до обучения ученика.",
  values:["честный труд","безопасность чужой жизни","самостоятельность ученика","уважение к договору"],
  priorConnections:["Знаком с несколькими соседними мастерами, но не имеет автоматически близких отношений с Гефест или Цубаки"],
  autonomousActions:["ведёт заказы и сметы","проверяет материал","обучает ученика","ищет выгодного поставщика угля"],
  relationshipGates:["уважает доказанное мастерство","доверяет лишь после последовательных честных сделок",
   "не прощает сознательную подставу за одно извинение"],
  boundaries:["не подпишет рискованную броню без проверки","не раскрывает семейные проблемы клиентам",
   "не бросит ученика по первому требованию игрока"],
  departureConditions:["после отказа вернётся к оплаченной работе",
   "может навсегда прекратить сотрудничество с опасным клиентом"]
 },
 responsePatterns:{
  work_request:[{emotion:"сухое внимание",motive:"понять задачу и стоимость",
   condition:"клиент принёс вещь на ремонт"}],
  unexpected_mercy:[{emotion:"сдержанная настороженность",motive:"выяснить причину щедрости",
   condition:"лично увидел необъяснимую доброту"}],
  boundary_violation:[{emotion:"раздражение",motive:"сохранить ответственность и безопасность",
   condition:"клиент требует скрыть опасную трещину"}],
  disengagement:[{emotion:"спокойное безразличие",motive:"вернуться к собственным заказам",
   condition:"работа завершена или отказ принят"}]
 }
};
const fresh=():LabSession=>({
 schema:"RPG_LAB_SESSION_V1",projectId:world.projectId,sessionId:"smith_test",
 gameClock:"D0 08:00",roleplayGuard:"strict",
 player:{resources:{},stats:{},inventory:{},locationId:"orario.hephaestus"},
 discovered:["orario.hephaestus"],npcs:{},events:[]
});
const scene=(ref:string,time:string,kind:string,summary:string):LabConfirmedEvent=>({
 sourceRef:ref,time,kind,summary,locationId:"orario.hephaestus",
 playerWitnessed:true,knownBy:["npc.tsubaki"],gmConfirmed:true,
 observations:[{npcId:"npc.tsubaki",channel:"seen",perceivedFact:summary,
  learnedAt:time,confidence:"certain",salience:"important",privacy:"small_group"}]
});
const oneVisit=()=>applyConfirmedLabEvent(fresh(),world,
 scene("evt.ivar.first","D0 08:15","npc_background_contact",
  "Ивар Келл осмотрел наруч, заметил трещину и отказался обещать надёжность без испытания."));
const significantHistory=()=>applyConfirmedLabEvent(oneVisit(),world,
 scene("evt.ivar.refusal","D0 09:10","npc_independent_choice",
  "Ивар Келл отказался скрыть опасную трещину за двойную плату и упустил заказ."));

test("smith: background encounter plus witnessed refusal builds a deep, stable NPC preview",()=>{
 const session=significantHistory();
 const oldPack=structuredClone(world),oldSession=structuredClone(session);
 const preview=previewOriginalNpcPromotion(world,session,seed,smith);
 assert.equal(preview.from,"background");
 assert.equal(preview.to,"full_core");
 assert.equal(preview.committed,false);
 assert.equal(preview.needsAtomicPackAndSessionWrite,true);
 assert.equal(preview.proposedPack.npcProfiles[smithId].originalCore?.fear,smith.originalCore?.fear);
 assert.deepEqual(preview.sourceRefs,[seed.firstEncounterRef,seed.independentChoiceRef]);
 assert.deepEqual(preview.proposedSession.npcs[smithId].memories.map(m=>m.sourceRef),preview.sourceRefs);
 assert.equal(preview.proposedSession.npcs[smithId].socialDynamics,undefined);
 assert.equal(preview.proposedSession.npcs[smithId].relationships,undefined);
 assert.equal(preview.proposedSession.playerFog,undefined);
 assert.equal(preview.proposedPack.npcProfiles["npc.loki"].name,world.npcProfiles["npc.loki"].name);
 assert.deepEqual(world,oldPack);
 assert.deepEqual(session,oldSession);
 assert.equal(world.npcProfiles[smithId],undefined);
 const ctx=buildLabSceneBrief(preview.proposedPack,preview.proposedSession,{npcIds:[smithId]});
 assert.equal(ctx.actors[0].originalCore?.personalGoal,smith.originalCore?.personalGoal);
});
test("one or twenty purchases alone do not qualify for full promotion",()=>{
 assert.throws(()=>previewOriginalNpcPromotion(world,oneVisit(),seed,smith),
  /LAB_ORIGINAL_PROMOTION_NO_CONFIRMED_IDENTITY_OR_CHOICE/);
});
test("rejects invented witnesses, forged identity, unsupported secrets and canon replacement",()=>{
 const s=significantHistory(),bad=structuredClone(s);
 delete bad.npcs["npc.tsubaki"];
 assert.throws(()=>previewOriginalNpcPromotion(world,bad,seed,smith),
  /LAB_ORIGINAL_PROMOTION_UNVERIFIED_WITNESS/);
 assert.throws(()=>previewOriginalNpcPromotion(world,s,{...seed,publicName:"Не тот мастер"},smith),
  /LAB_ORIGINAL_PROMOTION_PROFILE_INCOMPLETE/);
 assert.throws(()=>previewOriginalNpcPromotion(world,s,{...seed,npcId:"npc.bete"},smith),
  /LAB_ORIGINAL_PROMOTION_SEED_INVALID/);
 assert.throws(()=>previewOriginalNpcPromotion(world,s,seed,{...smith,knownFacts:["invented.secret"]}),
  /LAB_ORIGINAL_PROMOTION_PROFILE_INCOMPLETE/);
});
test("registered NPC cannot be silently overwritten",()=>{
 const p=previewOriginalNpcPromotion(world,significantHistory(),seed,smith);
 assert.throws(()=>previewOriginalNpcPromotion(p.proposedPack,p.proposedSession,seed,smith),
  /LAB_ORIGINAL_PROMOTION_ALREADY_REGISTERED/);
});
