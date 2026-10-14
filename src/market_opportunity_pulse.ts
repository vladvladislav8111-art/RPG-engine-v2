/** Daily read-only GM estimate, not a real posting, NPC or wage. */
import {deterministicDraw as roll,deny,pass} from "./world_sim_v3/types.ts";
export type MarketPulseInput={
 marketId:string;day:number;minuteOfDay:number;merchantCount:number;
 countBasis:"ESTIMATE"|"COUNTED";countSourceRef:string;maxLeads?:number;
};
export const MARKET_PROFILE={
 privateScribe:24,selfAccounts:56,externalAccounts:20,
 externalNeed:46,selfOverflow:7,externalPost:76,selfPost:55,
 publicBoard:58,takenByOthers:62,early:54,midday:29,
} as const;
const origin="loc.ilyrian.selarin.central_market";
const templates=[
 ["jobtpl.selarin.merchant_reconcile_small","board.selarin.merchant_court"],
 ["jobtpl.selarin.merchant_delivery_dispute","board.selarin.merchant_court"],
 ["jobtpl.selarin.copy_basic","board.selarin.copy_market"],
 ["jobtpl.selarin.copy_index","board.selarin.copy_market"],
 ["jobtpl.selarin.freight_count","board.selarin.west_freight"],
];
const valid=(n:unknown,a:number,b:number)=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=a&&n<=b;
const counts=()=>({open:0,taken:0,future:0});
export function simulateMarketPulse(i:MarketPulseInput){
 if(!i||i.marketId!==origin)return deny("MARKET_SCOPE","Only Selarin central market supported");
 if(!valid(i.day,1,100000)||!valid(i.minuteOfDay,0,1439)||!valid(i.merchantCount,0,500)||
  !["ESTIMATE","COUNTED"].includes(i.countBasis)||
  !/^[A-Za-z0-9._:-]{8,180}$/.test(i.countSourceRef??"")||
  (i.maxLeads!==undefined&&!valid(i.maxLeads,1,24)))
   return deny("MARKET_INPUT","Missing bounded estimate, provenance or saved time");
 const cats={privateScribe:0,selfAccounts:0,externalAccounts:0};
 const work={needsHelp:0,willingToAdvertise:0,publicProspects:0,directProspects:0};
 const board=counts(),direct=counts();
 const leads: Array<{id:string;merchantOrdinal:number;employerId:null;fundsVerified:false;
  templateId:string;venueId:string|null;discovery:"BOARD"|"DIRECT";
  proposedAt:number;estimatedTakenAt:number|null;actualPost:false;committed:false}>=[];
 let next:number|null=null;
 const future=(v:number)=>{if(v>i.minuteOfDay)next=next===null?v:Math.min(next,v);};
 for(let ordinal=1;ordinal<=i.merchantCount;ordinal++){
  const seed="selarin-market-v1|"+i.day+"|"+ordinal;
  const d=(key:string,a:number,b:number)=>roll(seed+"|"+key,a,b);
  const role=roll("selarin-market-v1|"+i.marketId+"|merchant"+ordinal+"|permanent.office.role",1,100);
  if(role<=MARKET_PROFILE.privateScribe){cats.privateScribe++;continue;}
  const self=role<=MARKET_PROFILE.privateScribe+MARKET_PROFILE.selfAccounts;
  if(self)cats.selfAccounts++;else cats.externalAccounts++;
  if(d("need",1,100)>(self?MARKET_PROFILE.selfOverflow:MARKET_PROFILE.externalNeed))continue;
  work.needsHelp++;
  if(d("willing",1,100)>(self?MARKET_PROFILE.selfPost:MARKET_PROFILE.externalPost))continue;
  work.willingToAdvertise++;
  const publicPost=d("channel",1,100)<=MARKET_PROFILE.publicBoard;
  if(publicPost)work.publicProspects++;else work.directProspects++;
  const bucket=d("post.bucket",1,100);
  const at=bucket<=MARKET_PROFILE.early?d("am",435,629):
    bucket<=MARKET_PROFILE.early+MARKET_PROFILE.midday?d("mid",630,809):d("pm",810,1050);
  const taken=d("taken",1,100)<=MARKET_PROFILE.takenByOthers?
    Math.min(1439,at+d("delay",25,290)):null;
  const tally=publicPost?board:direct;
  if(at>i.minuteOfDay)tally.future++;
  else if(taken!==null&&taken<=i.minuteOfDay)tally.taken++;
  else tally.open++;
  future(at);if(taken!==null)future(taken);
  if(at>i.minuteOfDay||(taken!==null&&taken<=i.minuteOfDay))continue;
  const template=templates[d("template",0,templates.length-1)];
  leads.push({id:"marketlead.selarin.central.day"+i.day+".merchant"+ordinal,
   merchantOrdinal:ordinal,employerId:null,fundsVerified:false,
   templateId:template[0],venueId:publicPost?template[1]:null,
   discovery:publicPost?"BOARD":"DIRECT",proposedAt:at,
   estimatedTakenAt:taken,actualPost:false,committed:false});
 }
 leads.sort((a,b)=>Number(a.discovery==="DIRECT")-Number(b.discovery==="DIRECT")||
  a.proposedAt-b.proposedAt||a.merchantOrdinal-b.merchantOrdinal);
 const chosen:typeof leads=[],shown=new Map<string,number>();
 for(const l of leads){
  if(chosen.length>= (i.maxLeads??12))break;
  if(l.venueId){const occupied=shown.get(l.venueId)??0;if(occupied>=6)continue;shown.set(l.venueId,occupied+1);}
  chosen.push(l);
 }
 const visibleBoard=chosen.filter(x=>x.discovery==="BOARD").length;
 return pass({schema:"SELARIN_MARKET_PULSE_V1" as const,marketId:i.marketId,
  day:i.day,minuteOfDay:i.minuteOfDay,merchantCount:i.merchantCount,countBasis:i.countBasis,
  sourceRef:i.countSourceRef,calibration:MARKET_PROFILE,categories:cats,work,
  board:{...board,shown:visibleBoard,deferred:Math.max(0,board.open-visibleBoard)},direct,
  nextCandidateChangeMinute:next,leads:chosen,
  scenarioOnly:true as const,sourceAttested:false as const,
  actualPosts:0 as const,actualAcceptedClaims:0 as const,moneyTransferred:0 as const,
  committed:false as const,gameTimeSeconds:0 as const,
  note:"Merchant ordinals, future posts and taken estimates are GM scenarios; only real NPC, records, actual willingness and budget authorize materialization."});
}
