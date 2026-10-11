import {deny,finite,pass,positive,unique,type SimOutcome} from './types.ts';
export type MaterialLot={id:string;templateId:string;qty:number;unitMassGrams:number;custodianId:string;locationId:string;reservedQty:number};
export type StockTransfer={lotId:string;quantity:number;fromCustodian:string;toCustodian:string;destination:string;causeRef:string};
export type TransferPlan={before:MaterialLot;afterSource:MaterialLot|null;received:MaterialLot;physicalDeltaGrams:0;causalRef:string};
/** No independent total-weight copies, no duplication or ownership teleport. */
export function planCustodyTransfer(lots:readonly MaterialLot[],req:StockTransfer):SimOutcome<TransferPlan>{
 if(!req.causeRef)return deny('NO_CAUSE','Physical transfers require committed factual cause');positive(req.quantity,'quantity');const matches=lots.filter(l=>l.id===req.lotId);if(matches.length!==1)return deny('DUPLICATE_OR_MISSING_LOT','Lot ID must have exactly one physical owner');
 const lot=matches[0];for(const k of ['qty','unitMassGrams','reservedQty'] as const)finite(lot[k],k);if(lot.qty<lot.reservedQty)return deny('BAD_RESERVATION','Reserved stock exceeds existing stock');
 if(lot.custodianId!==req.fromCustodian||!req.toCustodian||req.fromCustodian===req.toCustodian)return deny('CUSTODY','Unauthorized or identity custody transfer');
 if(req.quantity>lot.qty-lot.reservedQty)return deny('INSUFFICIENT_STOCK','Stock already held by another obligation');
 const remainder=lot.qty-req.quantity;const source=remainder?{...lot,qty:remainder}:null;
 const received:MaterialLot={...lot,id:lot.id+'.transfer.'+req.causeRef,qty:req.quantity,reservedQty:0,custodianId:req.toCustodian,locationId:req.destination};
 if(lots.some(l=>l.id===received.id))return deny('DUPLICATE_RECEIVER','Destination identity already present');
 return pass({before:lot,afterSource:source,received,physicalDeltaGrams:0,causalRef:req.causeRef});
}
export function inventoryMassGrams(lots:readonly MaterialLot[]):number{
 if(!unique(lots.map(l=>l.id)))throw Error('multiple owners for a single physical item');let total=0;for(const l of lots){finite(l.qty,'qty');finite(l.unitMassGrams,'unitMassGrams');total+=l.qty*l.unitMassGrams;}if(!Number.isSafeInteger(total))throw Error('unsafe mass');return total;
}
