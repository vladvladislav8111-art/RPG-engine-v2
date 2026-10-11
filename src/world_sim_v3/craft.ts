import {deny,finite,pass,positive,type SimOutcome} from './types.ts';
import {staffedMinutes,type Interval} from './time.ts';
import type {MaterialLot} from './inventory.ts';
export type CraftOrder={id:string;makerId:string;buyerId:string;recipeId:string;paidReceiptId:string;status:'accepted'|'working'|'quality_check'|'completed'|'cancelled';progressMinutes:number;requiredMinutes:number;materials:readonly {lotId:string;qty:number}[];resultTemplateId:string;resultQuantity:number;deliveryCustodianId:string};
export type CraftPlan={orderId:string;additionalWorkMinutes:number;newProgressMinutes:number;nextStatus:'working'|'quality_check';materialsRemainReserved:true;finishedItemsCreated:false;requiresIndependentQualityCheck:boolean};
/** Workday-gated progress, without consuming materials twice or auto-delivering. */
export function advanceCraftOrder(input:{order:CraftOrder;interval:Interval;makerSchedule:readonly {weekday:number;startMinute:number;endMinute:number}[];holidays:ReadonlySet<number>;makerAvailable:boolean;lots:readonly MaterialLot[];maxStaffedMinutes:number;weekdayAnchor:number}):SimOutcome<CraftPlan>{
 const {order}=input;if(!order.paidReceiptId||!order.id||!order.makerId||!order.buyerId)return deny('UNFUNDED_ORDER','No verified customer prepayment/source');
 if(!['accepted','working'].includes(order.status))return deny('NOT_ACTIVE','Craft order is not eligible for automatic progress');
 positive(order.requiredMinutes,'requiredMinutes');finite(order.progressMinutes,'progressMinutes');if(order.progressMinutes>order.requiredMinutes)return deny('BAD_PROGRESS','Prior work exceeds recipe');
 for(const material of order.materials){positive(material.qty,'qty');const items=input.lots.filter(l=>l.id===material.lotId);if(items.length!==1||items[0].reservedQty<material.qty||items[0].qty<material.qty)return deny('NO_RESERVED_MATERIAL','Physical stock/reservations missing');}
 if(!input.makerAvailable)return pass({orderId:order.id,additionalWorkMinutes:0,newProgressMinutes:order.progressMinutes,nextStatus:'working',materialsRemainReserved:true,finishedItemsCreated:false,requiresIndependentQualityCheck:false});
 finite(input.maxStaffedMinutes,'maxStaffedMinutes');const staffed=staffedMinutes({window:input.interval,dailyWindows:input.makerSchedule,holidays:input.holidays,weekdayAnchor:input.weekdayAnchor});
 const minutes=Math.min(staffed,input.maxStaffedMinutes,order.requiredMinutes-order.progressMinutes);
 const total=order.progressMinutes+minutes;return pass({orderId:order.id,additionalWorkMinutes:minutes,newProgressMinutes:total,nextStatus:total===order.requiredMinutes?'quality_check':'working',materialsRemainReserved:true,finishedItemsCreated:false,requiresIndependentQualityCheck:total===order.requiredMinutes});
}
export type QualityEvidence={orderId:string;inspectorId:string;sourceRef:string;passed:boolean;verified:boolean};
export function approveCraftCompletion(order:CraftOrder,quality:QualityEvidence):SimOutcome<{orderId:string;event:'MAKE_PRODUCTS_AND_CONSUME_RESERVED_ONCE';quantity:number;templateId:string;consume:readonly {lotId:string;qty:number}[];buyerMustCollect:true}> {
 if(order.status!=='quality_check'||order.progressMinutes<order.requiredMinutes||!quality.verified||!quality.passed||quality.orderId!==order.id||quality.inspectorId!==order.makerId||!quality.sourceRef)return deny('NO_CRAFT_QC','Cannot mint finished goods before actual staffed work and quality evidence');
 positive(order.resultQuantity,'quantity');return pass({orderId:order.id,event:'MAKE_PRODUCTS_AND_CONSUME_RESERVED_ONCE',quantity:order.resultQuantity,templateId:order.resultTemplateId,consume:order.materials.map(x=>({lotId:x.lotId,qty:x.qty})),buyerMustCollect:true});
}
export type WorkshopSlot={orderId:string;acceptedAt:number;neededMinutes:number;priorityClass:'contracted'|'optional'};
/** No two simultaneous orders can claim the same staffed person-hours. */
export function allocateWorkshopCapacity(slots:readonly WorkshopSlot[],staffMinutes:number):SimOutcome<{orderId:string;allocatedMinutes:number}[]>{
 finite(staffMinutes,'staffMinutes');if(slots.length>64)return deny('WORKSHOP_PAGE','More than 64 concurrent jobs need a workshop snapshot');
 const ids=new Set<string>();for(const s of slots){if(ids.has(s.orderId))return deny('DUPLICATE_ORDER','An order was counted twice');ids.add(s.orderId);finite(s.acceptedAt,'acceptedAt');finite(s.neededMinutes,'neededMinutes');}
 let remaining=staffMinutes;const sorted=[...slots].sort((a,b)=>a.priorityClass===b.priorityClass?a.acceptedAt-b.acceptedAt:a.priorityClass==='contracted'?-1:1);
 return pass(sorted.map(s=>{const n=Math.min(remaining,s.neededMinutes);remaining-=n;return {orderId:s.orderId,allocatedMinutes:n};}));
}
