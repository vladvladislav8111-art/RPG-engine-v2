import {deny,finite,pass,positive,type SimOutcome} from './types.ts';
export type RouteEdge={id:string;from:string;to:string;distanceMeters:number;terrain:'road'|'trail'|'mud'|'mountain';open:boolean;hazardId?:string;feeCopper:number};
export type TravelEstimate={routeIds:string[];meters:number;minutes:number;feesCopper:number;hazards:string[];requiresPlayerConfirmation:true};
/** Player explicitly supplies route. No auto-selected destination or encounter. */
export function estimateRoute(input:{start:string;routeIds:readonly string[];edges:readonly RouteEdge[];speedMetersPerMinute:number;loadMultiplier:number;weatherMultiplier:number;knownCopper:number;maxSegments?:number}):SimOutcome<TravelEstimate>{
 const {edges,routeIds}=input;const max=input.maxSegments??24;if(routeIds.length===0||routeIds.length>max||max>40)return deny('ROUTE_BOUNDS','Travel requires one finite player-chosen route');
 if(!(input.speedMetersPerMinute>0&&Number.isFinite(input.speedMetersPerMinute))||!(input.loadMultiplier>=1&&input.loadMultiplier<=3)||!(input.weatherMultiplier>=1&&input.weatherMultiplier<=4))return deny('BAD_SPEED','Travel modifiers outside bounds');finite(input.knownCopper,'knownCopper');
 let at=input.start,meters=0,feesCopper=0,weighted=0;const hazards:string[]=[];
 for(const id of routeIds){const matches=edges.filter(e=>e.id===id);if(matches.length!==1)return deny('UNKNOWN_ROUTE','Unverified edge');const e=matches[0];positive(e.distanceMeters,'distanceMeters');finite(e.feeCopper,'feeCopper');if(!e.open)return deny('CLOSED_ROUTE',id);if(e.from!==at)return deny('DISCONNECTED_ROUTE',id);
 at=e.to;meters+=e.distanceMeters;feesCopper+=e.feeCopper;const terrain=e.terrain==='road'?1:e.terrain==='trail'?1.25:e.terrain==='mud'?1.7:2.1;weighted+=e.distanceMeters*terrain;if(e.hazardId)hazards.push(e.hazardId);}
 if(feesCopper>input.knownCopper)return deny('INSUFFICIENT_FUNDS','Cannot automatically borrow route fees');const minutes=Math.ceil(weighted/input.speedMetersPerMinute*input.loadMultiplier*input.weatherMultiplier);if(!Number.isSafeInteger(minutes)||minutes>365*1440)return deny('UNBOUNDED_TRAVEL','Travel too large for one resolution');
 return pass({routeIds:[...routeIds],meters,minutes,feesCopper,hazards,requiresPlayerConfirmation:true});
}
