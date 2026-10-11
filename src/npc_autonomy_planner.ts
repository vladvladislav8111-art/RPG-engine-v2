/** Bounded private GM planner from real NPC activity, relations and obligations.
 * No invented decisions, dialogue, locations, money or promotions.
 */
import {parseInworldMoment} from "./social_context.ts";
type Row=Record<string,unknown>;
const val=(r:Row|null,key:string)=>String(r?.[key]??"").trim();
const has=(row:Row,keys:readonly string[])=>keys.some(k=>val(row,k).length>0);
export function buildNpcAutonomyPlan(input:{
 actorId:string;worldDay:number;worldTime:string;
 current:Row|null;activityRule:Row|null;knownFacts:readonly Row[];
 directedRelationships:readonly Row[];socialMemory:readonly Row[];
 openThreads:readonly Row[];activeWorldClocks:readonly Row[];
}) {
 const npc=input.current;
 const tier=val(npc,"Importance").toUpperCase();
 const currentGoal=val(npc,"Current goal/activity");
 const rule=input.activityRule;
 const activeRule=val(rule,"State").toUpperCase()==="ACTIVE";
 const now=parseInworldMoment("Day"+input.worldDay+" "+input.worldTime);
 const dueThreads=input.openThreads.filter(t=>{
  const text=val(t,"Trigger/due");
  const due=parseInworldMoment(text);
  const state=val(t,"Status").toUpperCase();
  return text&&due!=null&&now!=null&&due<=now&&!["RESOLVED","CLOSED","EXPIRED"].includes(state);
 }).slice(0,8).map(t=>val(t,"Thread ID")).filter(Boolean);
 const outstandingObligations=input.openThreads.filter(t=>{
  const state=val(t,"Status").toUpperCase();
  return state!=="RESOLVED"&&state!=="CLOSED"&&state!=="EXPIRED"&&
    has(t,["Waiting on","Topic","Trigger/due"]);
 }).slice(0,8).map(t=>({threadId:val(t,"Thread ID"),
  waitingOn:val(t,"Waiting on"),trigger:val(t,"Trigger/due")}));
 const knownPeers=[...new Set(input.directedRelationships.map(r=>
  val(r,"Actor ID")===input.actorId?val(r,"Toward ID"):val(r,"Actor ID"))
  .filter(x=>x&&x!==input.actorId))].slice(0,16);
 const blockers:string[]=[];
 if(!npc)blockers.push("LIVE_NPC_MISSING");
 if(!val(npc,"Identity anchors"))blockers.push("DURABLE_IDENTITY_MISSING");
 if(!currentGoal)blockers.push("CURRENT_GOAL_MISSING");
 if(tier==="KEY"&&!activeRule)blockers.push("KEY_ACTIVITY_RULE_NOT_ACTIVE");
 if(now==null)blockers.push("CLOCK_UNKNOWN");
 return {
  schema:"NPC_AUTONOMY_SOURCE_PLAN_V1" as const,actorId:input.actorId,tier,
  privateToGM:true as const,realCurrentGoal:currentGoal||null,
  knownFactCount:input.knownFacts.length,
  rememberedSocialEvents:input.socialMemory.length,
  distinctKnownPeers:knownPeers,
  activeOpenCommitments:outstandingObligations,
  dueOpenThreadIds:dueThreads,
  linkedProcessIds:input.activeWorldClocks
    .map(x=>val(x,"Process ID")).filter(Boolean).slice(0,8),
  decisionChecks:[
   "NPC has its own priorities and can refuse without making a player choice",
   "Any personal change or relationship shift requires explicit sourced event",
   "No actor may respond to a message they did not receive or know hidden GM facts",
   "Professional work, rest, travel and other obligations consume finite time",
   ...(dueThreads.length?["Review an already-committed social deadline before advancing this actor"]:[]),
  ],
  independentDecisionRequired:dueThreads.length>0||tier==="KEY",
  reviewMode:tier==="KEY"?"DETAILED_LIFEV4":
    tier==="RECURRING"?"CAUSAL_RECURRING":"LIGHTWEIGHT",
  v3Operation:"npc_decision.lifeV4",
  readyForAutonomousProposal:blockers.length===0,
  missingLiveSources:blockers,
  guaranteedReply:false as const,
  committed:false as const,
 };
}
