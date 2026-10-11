/** Engine-level signals on when the GM needs quick memory or source-deep memory.
 * Router never elevates archives, logs or GM PREGEN above the committed runtime.
 */
export type MemoryDepth="FAST"|"TARGETED_DEEP";
export function chooseMemoryRoute(input:{
 turnClass:string;tags:readonly string[];
 actorIds?:readonly string[];actorRefs?:readonly string[];
 docQueriesCount?:number;lookupsCount?:number;
}) {
 const tags=new Set(input.tags.map(x=>x.toUpperCase()));
 const any=(values:readonly string[])=>values.some(x=>tags.has(x));
 const actors=(input.actorIds?.length??0)+(input.actorRefs?.length??0);
 const highStakes=input.turnClass==="COMPLEX"||input.turnClass==="HIGH_STAKES";
 const npc=actors>0||any(["NPC","SOCIAL","CHAT","CONTACT","CONTACTS","MESSAGE","COMMS","RELATIONSHIP","NPC_LIFE"]);
 const history=any(["LOG","LOGS","HISTORY","JOURNAL","RECAP","PAST","RETCON","CONTINUITY_AUDIT"]);
 const canon=any(["CANON","LAW","RULES","GEOGRAPHY","SPECIES","TITLE","MILESTONE","LORE","ARCHIVE"]);
 const finance=any(["EC06","ECONOMY_AUDIT","PAYMENT","TRADE","CONTRACT","PURCHASE","SALE"]);
 const risk=any(["COMBAT","INJURY","CRIME","POLITICS","DIVINE","MAGIC","HIGH_STAKES"]);
 const requested: Array<{id:string;reason:string;lookup:string;requiredBefore:string}>=[];
 if(npc)requested.push({id:"NPC_CONTEXT",reason:"A person is an independent source with bounded lived history",
 lookup:"authoritative actor state, knowledge, relationships, memories, threads, recent messages, lifeV4",
 requiredBefore:"SUBSTANTIVE_NPC_REPLY"});
 if(history)requested.push({id:"HISTORY_TRACE",reason:"Past facts require a specific committed-log lookup",
 lookup:"SESSION_LOG and cited permanent canon/journal bounded by topic or TX",
 requiredBefore:"CLAIM_ABOUT_PAST_EVENTS"});
 if(canon)requested.push({id:"CANON_SOURCE",reason:"Permanent rules and geography must come from active canon",
 lookup:"specific canonical doc or compact relevant GM_PREGEN registry",
 requiredBefore:"CANON_RULE_ASSERTION"});
 if(finance)requested.push({id:"MONEY_CUSTODY",reason:"Employer funds and goods need source-revision proof",
 lookup:"active source ledger, inventory custody and unique transaction receipt",
 requiredBefore:"CONTRACT_PAYMENT_OR_TRANSFER"});
 if(risk)requested.push({id:"CONSEQUENTIAL_CAUSALITY",reason:"High-impact scenes require actual witness knowledge and mechanics",
 lookup:"live actor/physical evidence, relevant world/medical/skill canon",
 requiredBefore:"HIGH_STAKES_RESOLUTION"});
 const missing:string[]=[];
 if(history&&(input.docQueriesCount??0)+(input.lookupsCount??0)===0)
   missing.push("Provide narrow log/canon query for the actual disputed event; no full archive load");
 if(npc&&!actors)
   missing.push("Explicit actor IDs or resolvable scene participants required for substantive NPC dialogue");
 if(finance)missing.push("EC-06 ledger attestation required before any paid offer or transfer");
 const depth:MemoryDepth=requested.length||highStakes?"TARGETED_DEEP":"FAST";
 return {
  schema:"GM_MEMORY_ROUTE_V1",depth,quickAlways:true,deepRequired:depth==="TARGETED_DEEP",
  reasons:requested,missingSources:missing,
  notifications:[
   depth==="TARGETED_DEEP"
    ?"ДВИЖОК → МАСТЕРУ: требуется точечная глубокая память для указанных источников"
    :"ДВИЖОК → МАСТЕРУ: достаточно быстрой оперативной памяти",
   ...(missing.length?["ДВИЖОК → МАСТЕРУ: для утверждения фактов запроси недостающие источники"]:[]),
  ],
  memoryAuthority:["committed TEMP runtime","current active canon","event journals","GM PREGEN as index only"],
  doNotLoadFullArchive:true,gameTimeSeconds:0,
 };
}
