/** One-time, source-attested repair for Chroma after the v1 deployment gap.
 * This is NOT a generic XP grant or a repeatable monster spawn.
 * The old live Player state must be exactly the known pre-gap snapshot, and
 * every step must exist in the immutable RPG Lab event history first.
 */
import type {LabSession} from "./session.ts";
import type {JinwooState,JinwooMagicStone} from "./shadow_monarch_rules.ts";
import {CHROMA_BALANCE_FLAG,effectiveJinwooMaxHp,effectiveJinwooMaxMp,
 xpToNextLevel} from "./shadow_monarch_rules.ts";

export const CHROMA_FULL_REPAIR_REF="chroma.repair.d3_to_instant_wolf02.511";
export const CHROMA_REPAIR_EVIDENCE=[
 "chroma.d3_f5_shadow06_stone_collect.489",
 "chroma.d3_f5_hunt_ant_a_provisional.491",
 "chroma.d3_f5_hunt_ant_b_provisional.492",
 "chroma.d3_f6_hunt_shadow_to_f7_provisional.493",
 "chroma.d3_f7_snack_retrieve_stones.494",
 "chroma.d3_f7_shadow07_provisional_victory.495",
 "chroma.d3_f7_ant08_provisional_victory.496",
 "chroma.d3_f7_ant09_provisional_victory.497",
 "chroma.d3_f7_shadow10_provisional_victory.498",
 "chroma.d3_f7_marathon_01_07_narrative.499",
 "chroma.d3_f7_marathon_08_12_narrative.500",
 "chroma.d3_f7_marathon_13_19_narrative.501",
 "chroma.d3_f7_marathon_20_25_narrative.502",
 "chroma.d3_f7_marathon_26_34_to_1700.503",
 "chroma.d3_f7_marathon_accounting.504",
 "chroma.d3_f7_quicksilver_evolution.505",
 "chroma.d3_f7_first_instant_key_used.506",
 "chroma.d3_instant_first_corridor_observe.507",
 "chroma.d3_instant_first_wolf01_quicksilver.508",
 "chroma.d3_instant_first_wolf02_exchange1.509",
 "chroma.d3_instant_first_wolf02_finish.510"
] as const;

type KillRecord={
 ref:string;monsterId:"killer_ant"|"war_shadow"|"system.dungeon_wolf";
 proof:string;floor:number;
};
const oldHunt:KillRecord[]=[
 {ref:"chroma.d3.ant.a",monsterId:"killer_ant",proof:CHROMA_REPAIR_EVIDENCE[1],floor:5},
 {ref:"chroma.d3.ant.b",monsterId:"killer_ant",proof:CHROMA_REPAIR_EVIDENCE[2],floor:5},
 {ref:"chroma.d3.shadow.c",monsterId:"war_shadow",proof:CHROMA_REPAIR_EVIDENCE[3],floor:6},
 {ref:"chroma.d3.shadow.07",monsterId:"war_shadow",proof:CHROMA_REPAIR_EVIDENCE[5],floor:7},
 {ref:"chroma.d3.ant.08",monsterId:"killer_ant",proof:CHROMA_REPAIR_EVIDENCE[6],floor:7},
 {ref:"chroma.d3.ant.09",monsterId:"killer_ant",proof:CHROMA_REPAIR_EVIDENCE[7],floor:7},
 {ref:"chroma.d3.shadow.10",monsterId:"war_shadow",proof:CHROMA_REPAIR_EVIDENCE[8],floor:7}
];
const marathonPattern="a s a a s s a s a s a a s a s s a a s a s a s a a s s a s a a s a s".split(" ");
function marathonProof(i:number):string{
 return i<7?CHROMA_REPAIR_EVIDENCE[9]:
  i<12?CHROMA_REPAIR_EVIDENCE[10]:
  i<19?CHROMA_REPAIR_EVIDENCE[11]:
  i<25?CHROMA_REPAIR_EVIDENCE[12]:CHROMA_REPAIR_EVIDENCE[13];
}
export const CHROMA_RECOVERED_KILLS:readonly KillRecord[]=[
 ...oldHunt,
 ...marathonPattern.map((m,i)=>({
  ref:"chroma.d3.marathon."+String(i+1).padStart(2,"0"),
  monsterId:(m==="a"?"killer_ant":"war_shadow") as KillRecord["monsterId"],
  proof:marathonProof(i),floor:7
 })),
 {ref:"chroma.instant.wolf.01",monsterId:"system.dungeon_wolf",
  proof:CHROMA_REPAIR_EVIDENCE[18],floor:7},
 {ref:"chroma.instant.wolf.02",monsterId:"system.dungeon_wolf",
  proof:CHROMA_REPAIR_EVIDENCE[20],floor:7}
];
const unique=<T>(values:T[]):T[]=>[...new Set(values)];
const validEvidence=(s:LabSession):boolean=>{
 const refs=new Set(s.events.map(e=>e.sourceRef));
 return CHROMA_REPAIR_EVIDENCE.every(ref=>refs.has(ref));
};
export function reconcileChromaD3ThroughWolf02(s:LabSession,e:{
 sourceRef:string;eventTime:string;playerApproved:boolean;
 confirmLedgerThrough510:boolean;
}):JinwooState{
 const old=s.player.jinwoo;
 if(!old||s.projectId!=="chroma_orario_main_20261120"||
    s.sessionId!=="chroma_day0_20261120"||
    s.player.hero?.id!=="hero.chroma"||
    e.sourceRef!==CHROMA_FULL_REPAIR_REF||
    e.eventTime!=="D3 17:12"||
    !e.playerApproved||!e.confirmLedgerThrough510||
    old.appliedRewardRefs.includes(e.sourceRef)||
    old.systemLevel!==2||old.xp!==150||
    !old.storyFlags.includes(CHROMA_BALANCE_FLAG)||
    old.falna.godId!=="npc.loki"||!old.falna.blessed||
    Object.values(old.magicStones).filter(st=>st.state==="held").length!==6||
    !validEvidence(s))
  throw Error("CHROMA_FULL_REPAIR_SOURCE_OR_BASE_INVALID");
 const n=structuredClone(old);
 const recovered=CHROMA_RECOVERED_KILLS;
 if(recovered.length!==43||recovered.filter(k=>k.monsterId!=="system.dungeon_wolf").length!==41)
  throw Error("CHROMA_FULL_REPAIR_LEDGER_INVALID");
 const addedIds:string[]=[];
 n.defeatEvidence={...(n.defeatEvidence??{})};
 for(const [i,k] of recovered.entries()){
  if(n.defeatedTargetRefs.includes(k.ref))
   throw Error("CHROMA_FULL_REPAIR_TARGET_ALREADY_PAID");
  const originalRef=k.proof;
  if(!n.appliedRewardRefs.includes(originalRef))
   n.appliedRewardRefs.push(originalRef);
  n.defeatedTargetRefs.push(k.ref);
  n.defeatEvidence[k.ref]={monsterId:k.monsterId,sourceRef:originalRef,floor:k.floor};
  if(k.monsterId==="system.dungeon_wolf")continue;
  const stoneId="stone.chroma.reconciled."+String(i+1).padStart(2,"0");
  if(n.magicStones[stoneId])throw Error("CHROMA_FULL_REPAIR_STONE_DUPLICATE");
  const ant=k.monsterId==="killer_ant";
  const stone:JinwooMagicStone={
   id:stoneId,monsterRef:k.ref,
   monsterName:ant?"Муравей-убийца":"Военная тень",
   kind:"monster",powerRating:ant?8:7,powerTier:"common",
   guildValueValis:ant?130:100,corruptedMana:false,
   intact:true,state:"held",collectedRef:
    i<3?CHROMA_REPAIR_EVIDENCE[4]:k.proof
  };
  n.magicStones[stoneId]=stone;addedIds.push(stoneId);
 }
 if(addedIds.length!==41||
    Object.values(n.magicStones).filter(st=>st.state==="held").length!==47)
  throw Error("CHROMA_FULL_REPAIR_STONE_COUNT_MISMATCH");
 // All 6 old kills are already paid. The missing +196 XP and the subsequent
 // +405, +503, +3947 and +66 were accounted for in chronological level-ups
 // with documented automatic refills. Never append these sums to current XP.
 n.systemLevel=7;n.xp=1075;
 if(n.xp>=xpToNextLevel(n.systemLevel))
  throw Error("CHROMA_FULL_REPAIR_LEVEL_THRESHOLD_INVALID");
 n.stats={strength:20,stamina:20,agility:22,perception:16,intelligence:16};
 n.freeStatPoints=25; // Previous ten + three level-ups (5 each).
 n.hp=effectiveJinwooMaxHp(n);
 n.mp=87;n.fatigue=32.3;
 n.unlockedSkills=unique([...n.unlockedSkills,"sprint","quicksilver","dagger_mastery"]);
 const practiceTargets=recovered.map(x=>x.ref);
 n.skillMastery={...(n.skillMastery??{}),
  sprint:{level:5,xp:0,uses:44,
   trainedEnemyRefs:practiceTargets.slice(0,41),
   lastPracticeRef:CHROMA_REPAIR_EVIDENCE[13]},
  quicksilver:{level:1,xp:46,uses:2,
   trainedEnemyRefs:["chroma.instant.wolf.01","chroma.instant.wolf.02"],
   lastPracticeRef:CHROMA_REPAIR_EVIDENCE[20]}
 };
 n.combatTraining={
  dagger:{uses:43,enemyRefs:practiceTargets,
   lastPracticeRef:CHROMA_REPAIR_EVIDENCE[20]},
  weakpoint:{uses:10,enemyRefs:practiceTargets.slice(0,10),
   lastPracticeRef:CHROMA_REPAIR_EVIDENCE[13]},
  evasion:{uses:6,enemyRefs:practiceTargets.slice(0,6),
   lastPracticeRef:CHROMA_REPAIR_EVIDENCE[13]}
 };
 // Quicksilver cast 17:12; initial 7 MP already reflected in n.mp.
 // Sprint Lv5 history remains for the audit, but the old skill cannot stack.
 n.activeSkills=[{
  id:"quicksilver",startedRef:CHROMA_REPAIR_EVIDENCE[18],
  expiresMinute:3*1440+17*60+13,agilityBonus:24,
  positionBonus:0,mpSpent:7,speedMultiplier:1.7,reactionMultiplier:1.2
 }];
 n.dungeonKeys["instant.first"]={
  id:"instant.first",issuedRef:CHROMA_REPAIR_EVIDENCE[16],
  state:"entered",entryLocationRef:CHROMA_REPAIR_EVIDENCE[16]
 };
 delete n.inventory.system_instant_dungeon_key; // Was spent exactly once on 7F.
 n.storyFlags=unique([...n.storyFlags,
  "quest.reward.instant_key_from_box","chroma.dual_daggers.verified",
  "chroma.d3.instant_first.entered","chroma.d3.full_repair_510"]);
 n.appliedRewardRefs.push(e.sourceRef);
 return n;
}
