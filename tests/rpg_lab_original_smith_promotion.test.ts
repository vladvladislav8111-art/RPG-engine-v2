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
 adaptiveAxes:[
  {axisId:"method.prototype_open",aspect:"method",
   label:"Готовность испытывать непривычные конструкции",
   lowerPole:"склонен работать лишь с хорошо известными решениями",
   upperPole:"готов проводить проверенные испытания новых решений",
   coreGuard:"Не скрывает дефекты и не выдаёт непроверенное изделие за безопасное"},
  {axisId:"habit.delegate",aspect:"habit",
   label:"Делегирование простых задач ученику",
   lowerPole:"сначала всё делает сам",
   upperPole:"разрешает ученику выполнять рутинные работы под контролем",
   coreGuard:"Отвечает за безопасность ученика и результаты работы"},
  {axisId:"interaction.clients",aspect:"interaction",
   label:"Манера разговора с постоянными заказчиками",
   lowerPole:"короткий сухой разговор",
   upperPole:"говорит немного теплее и подробнее",
   coreGuard:"Не льстит, не рассказывает секреты и не подчиняется клиенту"}
 ],
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
 const oldPackJson=JSON.stringify(world),oldSessionJson=JSON.stringify(session);
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
 assert.equal(JSON.stringify(world),oldPackJson);
 assert.equal(JSON.stringify(session),oldSessionJson);
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

/** Evidence-bearing events exercise evolution, not unconditional GM prose. */
const smithObserved=(ref:string,time:string,delta?:-1|1,previousRef="evt.ivar.refusal"):LabConfirmedEvent=>({
 sourceRef:ref,time,kind:"npc_independent_choice",gmConfirmed:true,
 summary:"Ивар оценил результат испытания нестандартного изделия.",
 knownBy:[smithId],locationId:"orario.hephaestus",
 observations:[{npcId:smithId,channel:"experienced",
  perceivedFact:"Ивар лично испытал образец и записал результат",learnedAt:time,
  confidence:"certain",salience:"important",privacy:"private"}],
 ...(delta===undefined?{}:{npcAdaptations:[{
  npcId:smithId,axisId:"method.prototype_open",delta,
  interpretation:delta===1?
   "Осторожно расширяет круг технологий для испытаний, сохраняя контроль прочности":
   "После выявленного дефекта осторожнее относится к очередному эксперименту",
  evidenceRefs:[previousRef,ref]
 }]})
});
test("smith changes approach over days, never abandons safety or his identity",()=>{
 const p=previewOriginalNpcPromotion(world,significantHistory(),seed,smith);
 const pack=p.proposedPack,oldCore=JSON.stringify(pack.npcProfiles[smithId].originalCore);
 const oldTraits=JSON.stringify(pack.npcProfiles[smithId].traits);
 let state=p.proposedSession;
 let previousRef="evt.ivar.refusal";
 for(const [ref,time,delta,expected] of [
  ["evt.smith.test1","D1 11:00",1,1],
  ["evt.smith.test2","D3 11:00",1,2],
  ["evt.smith.test3","D7 11:00",1,3],
  ["evt.smith.fail","D10 11:00",-1,2]
 ] as const){
  state=applyConfirmedLabEvent(state,pack,smithObserved(ref,time,delta,previousRef));
  assert.equal(state.npcs[smithId].adaptations?.["method.prototype_open"].score,expected);
  previousRef=ref;
 }
 const ctx=buildLabSceneBrief(pack,state,{npcIds:[smithId]});
 assert.equal(ctx.actors[0].acquiredAdaptations["method.prototype_open"].score,2);
 assert.equal(ctx.actors[0].personalityAnchorsRemainFixed,true);
 assert.equal(JSON.stringify(pack.npcProfiles[smithId].traits),oldTraits);
 assert.equal(JSON.stringify(pack.npcProfiles[smithId].originalCore),oldCore);
 assert.equal(state.npcs[smithId].adaptations?.["method.prototype_open"].revision,4);
 assert.equal(state.npcs[smithId].relationships,undefined);
 assert.equal(state.npcs[smithId].socialDynamics,undefined);
 assert.equal(state.playerFog,undefined);
});
test("passage of time and an unwitnessed compliment do not evolve a character",()=>{
 const p=previewOriginalNpcPromotion(world,significantHistory(),seed,smith);
 const timeOnly=applyConfirmedLabEvent(p.proposedSession,p.proposedPack,{
  sourceRef:"evt.smith.wait",time:"D2 12:00",kind:"player_turn",
  summary:"Прошло два дня",knownBy:[],gmConfirmed:true
 });
 assert.equal(timeOnly.npcs[smithId].adaptations,undefined);
 const rumor={...smithObserved("evt.smith.false","D2 14:00",1),knownBy:[]};
 assert.throws(()=>applyConfirmedLabEvent(p.proposedSession,p.proposedPack,rumor),
  /LAB_EVENT_NO_DIRECT_WITNESS_EVIDENCE|LAB_ADAPTATION_ACTOR_UNKNOWN/);
});
test("unknown core edits, instant flips and unsupported evidence are rejected",()=>{
 const p=previewOriginalNpcPromotion(world,significantHistory(),seed,smith);
 const first=smithObserved("evt.smith.firsttest","D1 11:00",1);
 const leap=structuredClone(first);leap.npcAdaptations![0].delta=3 as 1;
 assert.throws(()=>applyConfirmedLabEvent(p.proposedSession,p.proposedPack,leap),
  /LAB_ADAPTATION_CHANGE_INVALID/);
 const core=structuredClone(first);core.npcAdaptations![0].axisId="values.sell_unsafe_armor";
 assert.throws(()=>applyConfirmedLabEvent(p.proposedSession,p.proposedPack,core),
  /LAB_ADAPTATION_AXIS_NOT_ALLOWED/);
 const early=applyConfirmedLabEvent(p.proposedSession,p.proposedPack,first);
 assert.throws(()=>applyConfirmedLabEvent(early,p.proposedPack,
  smithObserved("evt.smith.soon","D1 11:30",1)),
  /LAB_ADAPTATION_TOO_RAPID/);
 const unsupported=structuredClone(first);
 unsupported.npcAdaptations![0].evidenceRefs=["evt.smith.firsttest"];
 assert.throws(()=>applyConfirmedLabEvent(p.proposedSession,p.proposedPack,unsupported),
  /LAB_ADAPTATION_CHANGE_INVALID/);
});

// A scripted 100-day scenario tests the deterministic rules, NOT AI personality quality.
// The NPC acts while the player is elsewhere; no relationship auto-improves.
type SmithArc={day:number;axis:string;delta:-1|1;detail:string};
const hundredDayArc:SmithArc[]=[
 {day:1,axis:"method.prototype_open",delta:1,
  detail:"Ивар сам проверил необычный шарнир и согласился назначить ещё одно испытание"},
 {day:3,axis:"interaction.clients",delta:1,
  detail:"Постоянный заказчик спокойно признал свою ошибку; Ивар стал чуть терпеливее"},
 {day:4,axis:"method.prototype_open",delta:1,
  detail:"Второй образец выдержал нагрузку; Ивар пересмотрел часть сомнений"},
 {day:7,axis:"habit.delegate",delta:1,
  detail:"Подмастерье точно изготовил безопасные заклёпки под наблюдением Ивара"},
 {day:10,axis:"method.prototype_open",delta:1,
  detail:"После третьей проверки Ивар начал сам предлагать испытания нестандартных узлов"},
 {day:19,axis:"habit.delegate",delta:1,
  detail:"Ученик без ошибок выполнил повторную рутинную работу и сам показал результаты проверки"},
 {day:25,axis:"interaction.clients",delta:1,
  detail:"Заказчица выполнила договор, заранее сообщив о задержке; Ивар стал разговорчивее"},
 {day:30,axis:"method.prototype_open",delta:-1,
  detail:"Под нагрузкой новая конструкция показала скрытую трещину; Ивар ужесточил проверку"},
 {day:40,axis:"interaction.clients",delta:-1,
  detail:"Покупатель попытался скрыть повреждение и обвинить кузнеца; Ивар охладел"},
 {day:47,axis:"habit.delegate",delta:-1,
  detail:"Подмастерье забыл проверить заклёпку; Ивар вернул ему часть работы на перепроверку"},
 {day:61,axis:"method.prototype_open",delta:-1,
  detail:"Поставщик срезал пробный образец со скрытым дефектом; Ивар отказался применять материал"},
 {day:72,axis:"habit.delegate",delta:1,
  detail:"После длительной тренировки подмастерье показал повторяемую надёжность"},
 {day:85,axis:"interaction.clients",delta:-1,
  detail:"Клиент потребовал подделать клеймо контроля; Ивар отказал и оборвал сотрудничество"},
 {day:100,axis:"method.prototype_open",delta:1,
  detail:"Ивар самостоятельно придумал безопасную серию испытаний и оценил удачный прототип"}
];
test("100 days: three non-core aspects evolve unevenly while original character remains recognizable",()=>{
 const preview=previewOriginalNpcPromotion(world,significantHistory(),seed,smith);
 const pack=preview.proposedPack;
 let state=preview.proposedSession;
 const origin={
  traits:JSON.stringify(pack.npcProfiles[smithId].traits),
  core:JSON.stringify(pack.npcProfiles[smithId].originalCore),
  logic:JSON.stringify(pack.npcProfiles[smithId].habitualLogic),
  voice:JSON.stringify(pack.npcProfiles[smithId].voice)
 };
 // User leaves the workshop. Subsequent decisions are from Ivar alone.
 state=applyConfirmedLabEvent(state,pack,{
  sourceRef:"evt.player.left_smith",time:"D0 10:00",kind:"player_turn",
  summary:"Игрок покинул мастерские и ушёл в Подземелье",knownBy:[],
  discovered:["orario.dungeon.upper"],playerLocationId:"orario.dungeon.upper",
  gmConfirmed:true
 });
 const score:Record<string,number>={};
 const lastProof:Record<string,string>={};
 const checkpoints:Record<number,Record<string,number>>={};
 for(const step of hundredDayArc){
  const ref="evt.ivar.day_"+step.day;
  const clock="D"+step.day+" 15:00";
  const e:LabConfirmedEvent={
   sourceRef:ref,time:clock,kind:"npc_independent_choice",
   locationId:"orario.hephaestus",knownBy:[smithId],
   summary:step.detail,gmConfirmed:true,playerWitnessed:false,
   observations:[{
    npcId:smithId,channel:"experienced",perceivedFact:step.detail,
    learnedAt:clock,confidence:"certain",salience:"important",privacy:"private"
   }],
   worldActions:[{
    npcId:smithId,locationId:"orario.hephaestus",
    action:"Ивар принял собственное профессиональное решение",
    outcome:step.detail,privacy:"hidden"
   }],
   npcAdaptations:[{
    npcId:smithId,axisId:step.axis,delta:step.delta,
    interpretation:step.detail,
    evidenceRefs:[lastProof[step.axis]??"evt.ivar.refusal",ref]
   }]
  };
  state=applyConfirmedLabEvent(state,pack,e);
  score[step.axis]=(score[step.axis]??0)+step.delta;
  lastProof[step.axis]=ref;
  assert.equal(state.npcs[smithId].adaptations?.[step.axis].score,score[step.axis]);
  assert.equal(state.player.locationId,"orario.dungeon.upper");
  assert.equal(state.npcs[smithId].relationships,undefined);
  assert.equal(state.npcs[smithId].socialDynamics,undefined);
  assert.equal(state.playerFog,undefined);
  if([10,30,61,85,100].includes(step.day))
   checkpoints[step.day]={...score};
  // There is no pack rewrite or telepathic dissemination of private memories.
  assert.equal(JSON.stringify(pack.npcProfiles[smithId].traits),origin.traits);
  assert.equal(JSON.stringify(pack.npcProfiles[smithId].originalCore),origin.core);
  assert.equal(JSON.stringify(pack.npcProfiles[smithId].habitualLogic),origin.logic);
  assert.equal(JSON.stringify(pack.npcProfiles[smithId].voice),origin.voice);
 }
 assert.equal(state.gameClock,"D100 15:00");
 assert.equal(hundredDayArc.length,14);
 assert.equal(state.worldEvents?.length,14);
 assert.deepEqual(checkpoints[10],{
  "method.prototype_open":3,"interaction.clients":1,"habit.delegate":1
 });
 assert.deepEqual(checkpoints[30],{
  "method.prototype_open":2,"interaction.clients":2,"habit.delegate":2
 });
 assert.deepEqual(checkpoints[61],{
  "method.prototype_open":1,"interaction.clients":1,"habit.delegate":1
 });
 assert.deepEqual(checkpoints[85],{
  "method.prototype_open":1,"interaction.clients":0,"habit.delegate":2
 });
 assert.deepEqual(checkpoints[100],{
  "method.prototype_open":2,"interaction.clients":0,"habit.delegate":2
 });
 const actor=buildLabSceneBrief(pack,state,{npcIds:[smithId]}).actors[0];
 assert.equal(actor.canonAnchors.join("|"),pack.npcProfiles[smithId].traits.join("|"));
 assert.equal(actor.acquiredAdaptations["method.prototype_open"].score,2);
 assert.equal(actor.acquiredAdaptations["interaction.clients"].score,0);
 assert.equal(actor.acquiredAdaptations["habit.delegate"].score,2);
 assert.equal(actor.originalCore?.personalGoal,smith.originalCore?.personalGoal);
 assert.equal(state.npcs[smithId].memories.length,2+hundredDayArc.length);
 assert.equal(state.events.length,3+hundredDayArc.length);
});
test("100 days of silence do not change non-core habits or forge memories",()=>{
 const p=previewOriginalNpcPromotion(world,significantHistory(),seed,smith);
 const state=applyConfirmedLabEvent(p.proposedSession,p.proposedPack,{
  sourceRef:"evt.ivar.silent_hundred",time:"D100 16:00",
  kind:"world_tick",summary:"Сто дней прошло без подтверждённого личного опыта Ивара",
  knownBy:[],gmConfirmed:true
 });
 assert.equal(state.npcs[smithId].adaptations,undefined);
 assert.equal(state.npcs[smithId].memories.length,2);
 assert.equal(state.npcs[smithId].relationships,undefined);
 assert.equal(state.npcs[smithId].socialDynamics,undefined);
});
test("adaptation must follow its last accepted causal proof, not reuse an unrelated first day",()=>{
 const p=previewOriginalNpcPromotion(world,significantHistory(),seed,smith);
 const first=applyConfirmedLabEvent(p.proposedSession,p.proposedPack,
  smithObserved("evt.ivar.first_prototype","D1 12:00",1));
 const second=smithObserved("evt.ivar.second_prototype","D3 12:00",1);
 assert.throws(()=>applyConfirmedLabEvent(first,p.proposedPack,second),
  /LAB_ADAPTATION_CAUSAL_CHAIN_BROKEN/);
 const linked=smithObserved("evt.ivar.second_prototype","D3 12:00",1,"evt.ivar.first_prototype");
 const valid=applyConfirmedLabEvent(first,p.proposedPack,linked);
 assert.equal(valid.npcs[smithId].adaptations?.["method.prototype_open"].score,2);
});
