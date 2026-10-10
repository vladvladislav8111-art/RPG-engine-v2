import { buildNpcBehavioralContext } from "../src/npc_behavior.ts";

Deno.test("NPC behavioral frame keeps personal agenda and sourced memories", () => {
  const a=buildNpcBehavioralContext({
    actorId:"npc.selarin.pool_2003",
    current:{
      "NPC ID":"npc.selarin.pool_2003",
      "Identity anchors":"lively; curious; independent book seller",
      "Competence anchors":"book sorting, public retail trade",
      "Current goal/activity":"Serve remaining visitors before closing her market stall",
      "Current/last-known location":"loc.ilyrian.selarin.copy_market",
    },
    knowledge:[
      {"NPC ID":"npc.selarin.pool_2003","Fact ID":"fact.bow_seen","Knowledge/belief":"Shura said it works but needs one part","Confidence/status":"DIRECT HEARD","Active":"TRUE"},
      {"NPC ID":"npc.other","Fact ID":"secret","Knowledge/belief":"hidden plot","Confidence/status":"GM"},
    ],
    relationships:[{"Actor ID":"npc.selarin.pool_2003","Toward ID":"player.shura","Warmth":"warm","Trust":"cautious"}],
    memories:[{"Memory ID":"memory.vesha_shura_book_portrait","Participants":"npc.selarin.pool_2003;player.shura","Meaning":"He gifted an original portrait","Importance":"IMPORTANT"}],
    openThreads:[{"Thread ID":"thread.reply.bow","Participants":"npc.selarin.pool_2003;player.shura","Summary":"Vesha asked whether Shura likes that the bow works","Waiting on":"player.shura","Trigger/due":"next reply"}],
    recentChat:[],
    activeWorldClocks:[],
  });
  if(!a.ready||a.knownFacts?.length!==1||a.memoryAnchors?.length!==1||
     a.commitments?.length!==1||a.independentGoal!== "Serve remaining visitors before closing her market stall") {
    throw new Error("NPC personal memory, agenda or known-source filtering failed");
  }
  if(a.knownFacts?.some(x=>x.factId==="secret"))throw new Error("NPC was granted another actor's hidden truth");
});
Deno.test("missing current NPC blocks invented response frame",()=>{
  const a=buildNpcBehavioralContext({
    actorId:"npc.other",current:null,knowledge:[],relationships:[],memories:[],
    openThreads:[],recentChat:[],activeWorldClocks:[],
  });
  if(a.ready||!a.missing?.includes("npc_current"))throw new Error("missing NPC got an invented identity");
});
