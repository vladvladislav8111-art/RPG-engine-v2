import {deny,deterministicDraw,finite,pass,positive,type SimOutcome,type WorldMinute,type Domain} from './types.ts';
export type OfferTemplate={id:string;domain:Domain;service:string;minEffortMinutes:number;maxEffortMinutes:number;minBudgetCopper:number;maxBudgetCopper:number;requires:{skillIds:readonly string[];locationTag:string};kind:'paid_order'|'quest'|'system_objective';};
/** Seeded variants WITHOUT generating new funding, employer, physical stock or canon. */
export const OFFER_TEMPLATES:readonly OfferTemplate[]=[
 {id:'offer.records.reconcile',domain:'knowledge',service:'Сверка двух реальных реестров',minEffortMinutes:45,maxEffortMinutes:240,minBudgetCopper:6,maxBudgetCopper:80,requires:{skillIds:['competence.knowledge.research'],locationTag:'office'},kind:'paid_order'},
 {id:'offer.cargo.audit',domain:'trade',service:'Проверка поступившей партии',minEffortMinutes:30,maxEffortMinutes:300,minBudgetCopper:8,maxBudgetCopper:95,requires:{skillIds:[],locationTag:'warehouse'},kind:'paid_order'},
 {id:'offer.route.survey',domain:'travel',service:'Осмотр доступного маршрута',minEffortMinutes:70,maxEffortMinutes:360,minBudgetCopper:12,maxBudgetCopper:120,requires:{skillIds:[],locationTag:'road'},kind:'quest'},
 {id:'offer.tools.repair',domain:'craft',service:'Ремонт существующего инструмента',minEffortMinutes:80,maxEffortMinutes:480,minBudgetCopper:12,maxBudgetCopper:130,requires:{skillIds:[],locationTag:'workshop'},kind:'paid_order'},
 {id:'offer.material.count',domain:'trade',service:'Инвентаризация складских остатков',minEffortMinutes:30,maxEffortMinutes:240,minBudgetCopper:5,maxBudgetCopper:75,requires:{skillIds:[],locationTag:'warehouse'},kind:'paid_order'},
 {id:'offer.message.delivery',domain:'social',service:'Доставка подтверждённого сообщения',minEffortMinutes:35,maxEffortMinutes:180,minBudgetCopper:3,maxBudgetCopper:45,requires:{skillIds:[],locationTag:'town'},kind:'paid_order'},
 {id:'offer.plant.sample',domain:'exploration',service:'Сбор заказанных образцов с разрешённого участка',minEffortMinutes:80,maxEffortMinutes:400,minBudgetCopper:6,maxBudgetCopper:85,requires:{skillIds:[],locationTag:'wild'},kind:'quest'},
 {id:'offer.watch.patrol',domain:'survival',service:'Дежурство на существующем участке',minEffortMinutes:60,maxEffortMinutes:360,minBudgetCopper:7,maxBudgetCopper:70,requires:{skillIds:[],locationTag:'town'},kind:'paid_order'},
 {id:'offer.training.assist',domain:'social',service:'Помощь на подтверждённой тренировке',minEffortMinutes:30,maxEffortMinutes:160,minBudgetCopper:3,maxBudgetCopper:40,requires:{skillIds:[],locationTag:'school'},kind:'quest'},
 {id:'offer.maps.revision',domain:'knowledge',service:'Исправление конкретной карты по наблюдениям',minEffortMinutes:60,maxEffortMinutes:300,minBudgetCopper:5,maxBudgetCopper:105,requires:{skillIds:[],locationTag:'office'},kind:'quest'},
 {id:'offer.well.testing',domain:'survival',service:'Проверка доступного источника воды',minEffortMinutes:30,maxEffortMinutes:210,minBudgetCopper:5,maxBudgetCopper:70,requires:{skillIds:[],locationTag:'town'},kind:'quest'},
 {id:'offer.fence.inspect',domain:'craft',service:'Осмотр физически существующего ограждения',minEffortMinutes:25,maxEffortMinutes:210,minBudgetCopper:4,maxBudgetCopper:65,requires:{skillIds:[],locationTag:'workshop'},kind:'paid_order'},
 {id:'offer.rescue.support',domain:'social',service:'Поддержка подтверждённой поисковой группы',minEffortMinutes:120,maxEffortMinutes:600,minBudgetCopper:10,maxBudgetCopper:160,requires:{skillIds:[],locationTag:'wild'},kind:'quest'},
 {id:'offer.spare.parts',domain:'craft',service:'Сортировка заказанных запасных деталей',minEffortMinutes:35,maxEffortMinutes:180,minBudgetCopper:5,maxBudgetCopper:60,requires:{skillIds:[],locationTag:'workshop'},kind:'paid_order'},
 {id:'offer.library.index',domain:'knowledge',service:'Индексирование доступных листов',minEffortMinutes:50,maxEffortMinutes:240,minBudgetCopper:4,maxBudgetCopper:90,requires:{skillIds:[],locationTag:'office'},kind:'paid_order'},
 {id:'offer.caravan.guide',domain:'travel',service:'Сопровождение по подтверждённому пути',minEffortMinutes:100,maxEffortMinutes:540,minBudgetCopper:15,maxBudgetCopper:180,requires:{skillIds:[],locationTag:'road'},kind:'quest'},
 {id:'offer.system.milestone',domain:'system',service:'Подтверждённое системное испытание',minEffortMinutes:90,maxEffortMinutes:600,minBudgetCopper:0,maxBudgetCopper:0,requires:{skillIds:[],locationTag:'system'},kind:'system_objective'},
] as const;
export type MaterializedDemand={id:string;issuerId:string;locationId:string;locationTag:string;kind:OfferTemplate['kind'];templateIds:readonly string[];postedAt:WorldMinute;deadline:WorldMinute;remainingSlots:number;fundedCopper:number;escrowId:string|null;physicalSources:readonly string[];sourceRef:string;systemRewardAuthorized:boolean;};
export type GeneratedOffer={id:string;issuerId:string;demandId:string;templateId:string;locationId:string;service:string;durationMinutes:number;patronPayoutCopper:number;sourceEscrowId:string|null;requiresPlayerAcceptance:true;systemReward:'NOT_AUTO_GRANTED';seedRef:string;};
export function generateOffer(input:{demand:MaterializedDemand;templates?:readonly OfferTemplate[];seed:string;now:WorldMinute;maxDraws?:number}):SimOutcome<GeneratedOffer>{
 const {demand,seed,now}=input;const templates=input.templates??OFFER_TEMPLATES;if(!seed||!demand.sourceRef||!demand.issuerId||!demand.locationId||demand.deadline<=now||demand.postedAt>now||demand.remainingSlots<1)return deny('UNMATERIALIZED_DEMAND','No independently active employer or opportunity');
 if(demand.templateIds.length<1||demand.templateIds.length>24)return deny('INVALID_POOL','Offer pool must be finite and from known templates');
 if(demand.kind!=='system_objective'&&(!demand.escrowId||demand.fundedCopper<1))return deny('UNFUNDED','Paid work needs a real reserved patron budget');
 if(demand.kind==='system_objective'&&!demand.systemRewardAuthorized)return deny('NO_SYSTEM_AUTHORITY','System objectives require explicit canonical authority');
 const eligible=templates.filter(t=>t.kind===demand.kind&&t.requires.locationTag===demand.locationTag&&demand.templateIds.includes(t.id));
 if(!eligible.length)return deny('NO_VALID_TEMPLATE','No suitable source-backed canonical template');
 const budgetPerSlot=demand.kind==='system_objective'?0:Math.floor(demand.fundedCopper/demand.remainingSlots);
 const budgetEligible=eligible.filter(t=>demand.kind==='system_objective'||(t.minBudgetCopper<=budgetPerSlot&&t.maxBudgetCopper>=t.minBudgetCopper));
 if(!budgetEligible.length)return deny('BUDGET_TOO_SMALL','Posted budget cannot support a truthful template payout');
 const chosen=budgetEligible[deterministicDraw(seed+':template:'+demand.id,0,budgetEligible.length-1)];
 positive(chosen.maxEffortMinutes,'effort');const duration=deterministicDraw(seed+':duration:'+demand.id,chosen.minEffortMinutes,chosen.maxEffortMinutes);
 const payout=demand.kind==='system_objective'?0:deterministicDraw(seed+':payout:'+demand.id,chosen.minBudgetCopper,Math.min(chosen.maxBudgetCopper,budgetPerSlot));
 if(payout<0||payout>budgetPerSlot)return deny('INSUFFICIENT_FUNDS','Offer cannot mint money');
 return pass({id:'offer.'+demand.id+'.'+chosen.id,issuerId:demand.issuerId,demandId:demand.id,templateId:chosen.id,locationId:demand.locationId,service:chosen.service,durationMinutes:duration,patronPayoutCopper:payout,sourceEscrowId:demand.escrowId,requiresPlayerAcceptance:true,systemReward:'NOT_AUTO_GRANTED',seedRef:seed});
}

/** A board never creates issuers or double-claims the same source escrow. */
export function proposeMaterializedOfferBoard(input:{demands:readonly MaterializedDemand[];seed:string;now:WorldMinute;maxOffers?:number}):SimOutcome<GeneratedOffer[]> {
 const max=input.maxOffers??8;if(!Number.isInteger(max)||max<1||max>16||input.demands.length>max)return deny('BOUNDED_BOARD','Board needs at most 16 preexisting demands');
 const ids=new Set<string>(),escrows=new Set<string>(),board:GeneratedOffer[]=[];
 for(const demand of input.demands){if(ids.has(demand.id))return deny('DUPLICATE_DEMAND','Cannot multiply independent opportunities');ids.add(demand.id);if(demand.escrowId){if(escrows.has(demand.escrowId))return deny('DUPLICATE_ESCROW','One escrow cannot finance multiple independent demands');escrows.add(demand.escrowId);}
 const offer=generateOffer({demand,seed:input.seed+':'+demand.id,now:input.now});if(!offer.ok)return offer;board.push(offer.value);}
 return pass(board);
}
