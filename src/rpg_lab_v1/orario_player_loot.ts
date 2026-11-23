/** Optional System bonus loot after a verified monster defeat.
 * The ordinary magic stone is a SEPARATE recoverable item (and can become
 * a shadow). No duplicate rewards from one defeated monster.
 * All chances and contents are deliberate crossover house rules.
 */
import type {JinwooState} from "./shadow_monarch_rules.ts";
import {ORARIO_MONSTER_BY_ID} from "./danmachi_player_balance.ts";
export const SYSTEM_MONSTER_DROPS={
 goblin:[{id:"wound_dressing",weight:7},{id:"rusty_dagger_drop",weight:3}],
 kobold:[{id:"potion_fatigue",weight:5},{id:"daggers_throwing",weight:2}],
 dungeon_lizard:[{id:"potion_hp_small",weight:4},{id:"lizard_scale",weight:6}],
 war_shadow:[{id:"potion_mp_small",weight:8},{id:"rune_stealth",weight:1}],
 killer_ant:[{id:"ant_chitin",weight:8},{id:"potion_antidote_greater",weight:2}],
 silverback:[{id:"potion_hp_medium",weight:15},{id:"reinforced_hide",weight:6}],
 infant_dragon:[{id:"dragon_fang",weight:10},{id:"potion_fire_resistance",weight:10}],
 minotaur:[{id:"minotaur_horn",weight:12},{id:"potion_hp_large",weight:12}],
 goliath_17:[{id:"goliath_shard",weight:25},{id:"potion_hp_supreme",weight:20}],
 // Boss keepsakes are earned only after a confirmed System-instance victory.
 // Exact item stats remain GM-only adaptation, not a promised canon drop.
 "system.dungeon_wolf":[{id:"wolf_fang",weight:15},
  {id:"instant_return_crystal",weight:2}],
 "system.razan":[{id:"razan_shadow_fur",weight:12}],
 "system.briga":[{id:"briga_razor_claw",weight:12}],
 "system.kasaka":[{id:"kasaka_fang",weight:100}],
 "system.knight_guard":[{id:"knight_shard",weight:15}],
 "system.igris":[{id:"igris_crest",weight:100}],
 "system.demon_guard":[{id:"demon_ember",weight:20}],
 "system.demon_king":[{id:"demon_king_heart",weight:100}],
 "system.architect_trial":[{id:"architect_remnant",weight:100}]
} as const;
const valid=(s:string)=>/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(s);
function draw(seed:string){let h=2166136261>>>0;
 for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
 return(h>>>0)%100+1;
}
export function recordConfirmedMonsterDrop(s:JinwooState,e:{
 sourceRef:string;monsterId:string;monsterRef:string;
 confirmedDefeat:true;confirmedSearch:true;
}):{next:JinwooState;itemId:string|null;roll:number}{
 if(s.awaitingActivation||!e.confirmedDefeat||!e.confirmedSearch||
  !valid(e.sourceRef)||!valid(e.monsterRef)||
  s.appliedRewardRefs.includes(e.sourceRef)||
  !s.defeatedTargetRefs.includes(e.monsterRef)||
  (s.systemDropRefs??[]).includes(e.monsterRef)||
  !Object.hasOwn(SYSTEM_MONSTER_DROPS,e.monsterId))
  throw Error("PLAYER_MONSTER_DROP_NOT_EARNED");
 const table=SYSTEM_MONSTER_DROPS[e.monsterId as keyof typeof SYSTEM_MONSTER_DROPS];
 const roll=draw(e.monsterRef+"|"+e.monsterId);
 let remaining=roll,itemId:string|null=null;
 for(const row of table){remaining-=row.weight;if(remaining<=0){
  itemId=row.id;break;
 }}
 const n=structuredClone(s);
 n.systemDropRefs=[...(n.systemDropRefs??[]),e.monsterRef];
 if(itemId)n.inventory[itemId]=(n.inventory[itemId]??0)+1;
 n.appliedRewardRefs.push(e.sourceRef);
 return {next:n,itemId,roll};
}
