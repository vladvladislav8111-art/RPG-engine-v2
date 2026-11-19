/** Source-backed equipment effectiveness, using the existing Player shop.
 * Physical items must be present in the Player inventory before combat stats
 * can be derived; no free +200 weapon from a client-entered number.
 * Item armor, weapon bonuses and set slots are CROSSOVER house rules.
 */
import {JINWOO_STORE,type JinwooState} from "./shadow_monarch_rules.ts";
import {previewCombatExchange,ORARIO_MONSTER_BY_ID,
 type CombatMove} from "./danmachi_player_balance.ts";
type Slot="weapon"|"body"|"shield"|"feet"|"hands"|"cloak"|"neck";
type Effect={slot:Slot;attack:number;armor:number;speedPenalty:number;
 armorPiercing?:number;skillGate?:string};
export const SYSTEM_EQUIPMENT_EFFECTS:Readonly<Record<string,Effect>>={
 blade_training:{slot:"weapon",attack:0,armor:0,speedPenalty:0},
 blade_steel:{slot:"weapon",attack:4,armor:0,speedPenalty:0},
 sword_iron:{slot:"weapon",attack:5,armor:0,speedPenalty:0},
 spear_steel:{slot:"weapon",attack:7,armor:0,speedPenalty:1},
 shortbow:{slot:"weapon",attack:4,armor:0,speedPenalty:0},
 arrow_bundle:{slot:"weapon",attack:0,armor:0,speedPenalty:0},
 daggers_throwing:{slot:"weapon",attack:3,armor:0,speedPenalty:0},
 dagger_hardened:{slot:"weapon",attack:7,armor:0,speedPenalty:0},
 sword_obsidian:{slot:"weapon",attack:11,armor:0,speedPenalty:0},
 dagger_shadowbound:{slot:"weapon",attack:14,armor:0,
  speedPenalty:0,skillGate:"shadow_extraction"},
 knight_killer:{slot:"weapon",attack:9,armor:0,
  speedPenalty:0,armorPiercing:7},
 leather_armor:{slot:"body",attack:0,armor:2,speedPenalty:0},
 chainmail_armor:{slot:"body",attack:0,armor:6,speedPenalty:4},
 steel_shield:{slot:"shield",attack:0,armor:4,speedPenalty:2},
 boots_quiet:{slot:"feet",attack:0,armor:1,speedPenalty:0},
 gloves_grip:{slot:"hands",attack:0,armor:0,speedPenalty:0},
 cloak_dark:{slot:"cloak",attack:0,armor:1,speedPenalty:0},
 cloak_ember:{slot:"cloak",attack:0,armor:2,speedPenalty:0},
 necklace_ward:{slot:"neck",attack:0,armor:1,speedPenalty:0},
};
export type Loadout={weaponId?:string;armorIds?:string[]};
const catalog=Object.fromEntries(JINWOO_STORE.map(x=>[x.id,x]));
export function previewVerifiedLoadout(s:JinwooState,e:Loadout){
 const ids=[...(e.weaponId?[e.weaponId]:[]),...(e.armorIds??[])];
 if(s.awaitingActivation||ids.length>8||new Set(ids).size!==ids.length)
  throw Error("PLAYER_EQUIPMENT_LOADOUT_INVALID");
 const slots=new Set<Slot>();
 let attack=0,armor=0,speedPenalty=0,pierce=0;
 for(const id of ids){
  const m=SYSTEM_EQUIPMENT_EFFECTS[id],entry=catalog[id];
  if(!m||!entry||(s.inventory[id]??0)<1)
   throw Error("PLAYER_EQUIPMENT_NOT_OWNED_OR_UNSUPPORTED");
  if(m.skillGate&&!s.unlockedSkills.includes(m.skillGate))
   throw Error("PLAYER_EQUIPMENT_SKILL_LOCKED");
  if(slots.has(m.slot))throw Error("PLAYER_EQUIPMENT_SLOT_COLLISION");
  if((id===e.weaponId&&m.slot!=="weapon")||
   (id!==e.weaponId&&m.slot==="weapon"))
   throw Error("PLAYER_EQUIPMENT_WRONG_SLOT");
  slots.add(m.slot);
  attack+=m.attack;armor+=m.armor;speedPenalty+=m.speedPenalty;
  pierce+=m.armorPiercing??0;
 }
 const result={attack,armor,speedPenalty,armorPiercing:pierce,
  verifiedItemIds:ids,readOnly:true,
  withoutInventoryNoEquipmentBonus:true};
 return result;
}
export function previewOwnedEquipmentEncounter(s:JinwooState,e:{
 monsterId:string;floor:number;loadout:Loadout;
 move:CombatMove;positionBonus?:number;proficiencyBonus?:number;
 spellMpCost?:number;confirmedIrregularRef?:string;
}){
 const gear=previewVerifiedLoadout(s,e.loadout);
 const mob=ORARIO_MONSTER_BY_ID[e.monsterId];
 if(!mob)throw Error("PLAYER_EQUIPMENT_MONSTER_UNKNOWN");
 const piercing=gear.armorPiercing>0&&mob.armor>=5?
  Math.min(gear.armorPiercing,mob.armor):0;
 // A simple verified armor-penetration bonus, not absolute immunity bypass.
 const exchange=previewCombatExchange(s,{
  monsterId:e.monsterId,floor:e.floor,move:e.move,
  weaponPower:gear.attack+piercing,armorPower:gear.armor,
  positionBonus:(e.positionBonus??0)-gear.speedPenalty,
  proficiencyBonus:e.proficiencyBonus,
  spellMpCost:e.spellMpCost,confirmedIrregularRef:e.confirmedIrregularRef
 });
 return {gear,exchange,readOnly:true,requiresPlayerConfirmedEquipAction:true,
  noFreeWeaponAndNoAutoBattleOutcome:true};
}
