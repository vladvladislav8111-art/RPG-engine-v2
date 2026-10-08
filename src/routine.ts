import { config } from "./config.ts";
import { sheetsBatchGet } from "./google.ts";
import { PREGEN_TABLES, TABLES } from "./schema.ts";

type RoutineInput =
 | { type:"walk"; destinationId:string; mode?:"normal"|"loaded" }
 | { type:"eat"; serviceId:string; foodId?:"food.bread_loaf"|"food.light_snack"|"food.ordinary_meal"|"food.substantial_meal"|"food.field_ration"|"food.fruit_portion"; quotedPriceC?:number; durationMinutes?:number }
 | { type:"sleep"; serviceId?:string; durationMinutes:number; quotedPriceC?:number }
 | { type:"use_service"; serviceId:string; quotedPriceC?:number; durationMinutes?:number }
 | { type:"buy"; serviceId:string; quantity?:number; quotedPriceC?:number; durationMinutes?:number; itemId:string; templateId:string; item:string; unit:string; inventoryLocation?:string; tags?:string; conditionNotes?:string };

function str(v:unknown){ return String(v??"").trim(); }
function num(v:unknown){ const n=Number(str(v).replace(",",".")); return Number.isFinite(n)?n:null; }
function objects(rows:unknown[][]){
 if(!rows.length) return [] as Record<string,unknown>[];
 const h=rows[0].map(str);
 return rows.slice(1).filter(r=>r.some(v=>str(v)!=="")).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??null])));
}
function findControl(rows:unknown[][],key:string){ return rows.find(r=>str(r[0])===key)?.[1]??null; }
function hash32(input:string){ let h=0x811c9dc5; for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,0x01000193);} return h>>>0; }
function parsePrice(text:string,seed:string){
 const range=text.match(/([0-9]+(?:[.,][0-9]+)?)\s*[–—-]\s*([0-9]+(?:[.,][0-9]+)?)\s*c/i);
 if(range){
  const min=Math.round(Number(range[1].replace(",","."))), max=Math.round(Number(range[2].replace(",",".")));
  if(Number.isFinite(min)&&Number.isFinite(max)&&max>=min) return {min,max,quote:min+(hash32(seed)%(max-min+1)),source:"CANON_RANGE"};
 }
 const exact=text.match(/(?:^|[^0-9])([0-9]+(?:[.,][0-9]+)?)\s*c(?:\b|\/|$)/i);
 if(exact){ const q=Math.round(Number(exact[1].replace(",","."))); if(Number.isFinite(q)) return {min:q,max:q,quote:q,source:"EXACT_MODEL"}; }
 return null;
}
function parseDuration(text:string,seed:string,fallback:number){
 const range=text.match(/([0-9]+)\s*[–—-]\s*([0-9]+)\s*(?:min|minutes|мин)/i);
 if(range){const a=Number(range[1]),b=Number(range[2]);return a+(hash32(seed)%(Math.max(a,b)-Math.min(a,b)+1));}
 const single=text.match(/(?:~\s*)?([0-9]+)\s*(?:min|minutes|мин)/i); if(single)return Number(single[1]);
 const hours=text.match(/(?:~\s*)?([0-9]+(?:[.,][0-9]+)?)\s*h/i); if(hours)return Math.round(Number(hours[1].replace(",","."))*60);
 return fallback;
}
function dijkstra(edges:Record<string,unknown>[],from:string,to:string){
 const graph=new Map<string,Array<{to:string,d:number}>>();
 for(const e of edges){
  const a=str(e["From"]),b=str(e["To"]),d=num(e["Distance km"]); if(!a||!b||d==null) continue;
  if(!graph.has(a))graph.set(a,[]); if(!graph.has(b))graph.set(b,[]);
  graph.get(a)!.push({to:b,d}); graph.get(b)!.push({to:a,d});
 }
 const dist=new Map<string,number>([[from,0]]), prev=new Map<string,string>(), open=new Set<string>([from]);
 while(open.size){
  let u=[...open].sort((a,b)=>(dist.get(a)??Infinity)-(dist.get(b)??Infinity))[0]; open.delete(u);
  if(u===to)break;
  for(const edge of graph.get(u)??[]){
   const nd=(dist.get(u)??Infinity)+edge.d;
   if(nd<(dist.get(edge.to)??Infinity)){dist.set(edge.to,nd);prev.set(edge.to,u);open.add(edge.to);}
  }
 }
 if(!dist.has(to)) return null;
 const path=[to]; let cur=to; while(cur!==from){const p=prev.get(cur);if(!p)return null;path.push(p);cur=p;} path.reverse();
 return {distanceKm:Math.round((dist.get(to)??0)*100)/100,path};
}
function weatherMultiplier(rows:Record<string,unknown>[]){
 const w=rows.find(r=>str(r["Weather ID"])==="weather.selarin.current"); if(!w)return 1;
 const t=(str(w["Precipitation overnight"])+" "+str(w["Ground"])+" "+str(w["Wind"])).toLowerCase();
 let m=1;
 if(t.includes("heavy rain"))m*=1.2; else if(t.includes("steady rain"))m*=1.12; else if(t.includes("light"))m*=1.05;
 if(t.includes("very wet")||t.includes("puddl"))m*=1.06;
 if(t.includes("strong")||t.includes("gust"))m*=1.04;
 return Math.round(m*100)/100;
}

export async function resolveRoutineAction(input:RoutineInput){
 const runtime=await sheetsBatchGet(config.files.TEMP_RUNTIME,[
  "CONTROL!A1:D12","PLAYER_RESOURCES!A1:E30",TABLES.WEATHER_CURRENT.range,TABLES.SERVICES_CURRENT.range
 ]);
 const pregen=await sheetsBatchGet(config.files.GM_PREGEN,[
  PREGEN_TABLES.MAP_EDGES,PREGEN_TABLES.LOCATIONS,PREGEN_TABLES.SERVICE_DIRECTORY,PREGEN_TABLES.SELARIN_ROUTINE_ACTIONS
 ]);
 const control=runtime["CONTROL!A1:D12"]??[];
 const saveId=str(findControl(control,"save_id")), day=Number(findControl(control,"world_day")), time=str(findControl(control,"world_time"));
 const currentLocation=str(findControl(control,"current_location_id"));
 const edges=objects(pregen[PREGEN_TABLES.MAP_EDGES]??[]);
 const locations=objects(pregen[PREGEN_TABLES.LOCATIONS]??[]);
 const services=[...objects(runtime[TABLES.SERVICES_CURRENT.range]??[]),...objects(pregen[PREGEN_TABLES.SERVICE_DIRECTORY]??[])];
 const weather=objects(runtime[TABLES.WEATHER_CURRENT.range]??[]);
 const profileRows=objects(pregen[PREGEN_TABLES.SELARIN_ROUTINE_ACTIONS]??[]);
 const resourceRows=objects(runtime["PLAYER_RESOURCES!A1:E30"]??[]);
 const moneyRow=resourceRows.find(r=>str(r["Resource"])==="Money");
 const money=num(moneyRow?.["Current"]);
 const base={saveId,worldDay:day,worldTime:time,currentLocation,requiresCommit:true,playerChoicePreserved:true};

 if(input.type==="walk"){
  const route=dijkstra(edges,currentLocation,input.destinationId);
  if(!route) return {...base,ok:false,reason:"NO_CANONICAL_ROUTE",destinationId:input.destinationId};
  const mode=input.mode??"normal";
  const p=profileRows.find(r=>str(r["Routine type"])==="walk"&&str(r["Mode"])===mode);
  const speed=num(p?.["Value"])??(mode==="loaded"?3.8:4.5);
  const env=weatherMultiplier(weather);
  const durationMinutes=Math.max(1,Math.round(route.distanceKm/speed*60*env));
  const dest=locations.find(r=>str(r["Location ID"])===input.destinationId);
  return {...base,ok:true,type:input.type,route,durationMinutes,environmentMultiplier:env,
   semanticDraft:{elapsedSeconds:durationMinutes*60,control:{locationId:input.destinationId,locationDisplay:dest?.["Name"]??input.destinationId},
    exertionEvents:[{actionId:mode==="loaded"?"action.walk.loaded":"action.walk.normal",durationMinutes,environmentMultiplier:env,reason:"routine route travel"}],
    survival:{defaultActivity:"travel"}}
  };
 }

 const serviceId=input.serviceId;
 const service=services.find(r=>str(r["Service ID"])===serviceId);
 if(!service) return {...base,ok:false,reason:"UNKNOWN_SERVICE",serviceId};
 const serviceLocation=str(service["Location"]);
 if(serviceLocation && serviceLocation!==currentLocation && !currentLocation.startsWith(serviceLocation+".") && !serviceLocation.startsWith(currentLocation+".")){
  return {...base,ok:false,reason:"SERVICE_NOT_AT_CURRENT_LOCATION",serviceId,serviceLocation,currentLocation};
 }
 const priceText=str(service["Price"]??service["Price model"]);
 const quoted=(input as any).quotedPriceC;
 const parsed=quoted!=null?{quote:Math.round(quoted),min:Math.round(quoted),max:Math.round(quoted),source:"EXPLICIT_QUOTE"}:parsePrice(priceText,day+"|"+time+"|"+serviceId);
 if(!parsed) return {...base,ok:false,reason:"REQUIRES_PROVIDER_QUOTE",serviceId,priceModel:priceText};
 const quantity=input.type==="buy"?Math.max(1,Math.floor(input.quantity??1)):1;
 const totalPrice=parsed.quote*quantity;
 if(money!=null && totalPrice>money) return {...base,ok:false,reason:"INSUFFICIENT_FUNDS",serviceId,totalPrice,money};
 const typical=str(service["Duration"]??service["Typical duration"]);
 const fallback=input.type==="eat"?20:input.type==="buy"?10:30;
 const durationMinutes=(input as any).durationMinutes??parseDuration(typical,day+"|"+time+"|"+serviceId,fallback);
 const resourceDeltas=totalPrice?[{resource:"Money",delta:-totalPrice}]:[];

 if(input.type==="eat"){
  return {...base,ok:true,type:input.type,serviceId,quote:{...parsed,totalPrice},durationMinutes,
   semanticDraft:{elapsedSeconds:durationMinutes*60,resourceDeltas,
    survival:{defaultActivity:"normal",foodIntakes:[{foodId:input.foodId??"food.ordinary_meal",count:1}]},
    exertionEvents:[{actionId:"action.calm.eat",durationMinutes,reason:"routine meal"}]}
  };
 }
 if(input.type==="sleep"){
  const d=Math.max(1,Math.round(input.durationMinutes));
  const rest=d>=450?[{restId:"rest.full",durationMinutes:d,usefulSleep:true,reason:"routine sleep"}]:
             d>=20?[{restId:"rest.short",durationMinutes:d,usefulSleep:false,reason:"routine rest"}]:[];
  return {...base,ok:true,type:input.type,serviceId,quote:{...parsed,totalPrice},durationMinutes:d,
   semanticDraft:{elapsedSeconds:d*60,resourceDeltas,survival:{defaultActivity:"sleep"},restEvents:rest}
  };
 }
 if(input.type==="buy"){
  return {...base,ok:true,type:input.type,serviceId,quote:{...parsed,totalPrice},durationMinutes,
   semanticDraft:{elapsedSeconds:durationMinutes*60,resourceDeltas,survival:{defaultActivity:"normal"},
    inventoryEvents:[{itemId:input.itemId,qtyDelta:quantity,templateId:input.templateId,item:input.item,unit:input.unit,
      location:input.inventoryLocation??"carried with Shura",custodian:"Shura",conditionNotes:input.conditionNotes,tags:input.tags,reason:"routine purchase"}]}
  };
 }
 return {...base,ok:true,type:input.type,serviceId,quote:{...parsed,totalPrice},durationMinutes,
  semanticDraft:{elapsedSeconds:durationMinutes*60,resourceDeltas,survival:{defaultActivity:"normal"}}
 };
}
