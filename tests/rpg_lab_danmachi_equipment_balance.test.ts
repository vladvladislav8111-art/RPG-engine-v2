import test from "node:test";
import assert from "node:assert/strict";
import {newJinwooPreparation,purchaseJinwooItem} from
 "../src/rpg_lab_v1/shadow_monarch_rules.ts";
import {previewVerifiedLoadout,previewOwnedEquipmentEncounter,
 SYSTEM_EQUIPMENT_EFFECTS} from "../src/rpg_lab_v1/danmachi_player_equipment.ts";
function purse(){const s=newJinwooPreparation();s.gold=50000;return s;}
test("unowned inventory items cannot be equipped or used to fabricate battle damage",()=>{
 const s=newJinwooPreparation();
 assert.throws(()=>previewVerifiedLoadout(s,{weaponId:"sword_obsidian"}),
  /NOT_OWNED/);
 assert.throws(()=>previewVerifiedLoadout(s,{weaponId:"potion_hp_small"}),
  /NOT_OWNED/);
 assert.deepEqual(previewVerifiedLoadout(s,{}).verifiedItemIds,[]);
 assert.ok(Object.keys(SYSTEM_EQUIPMENT_EFFECTS).length>10);
});
test("owned shop weapon truly improves damage but doesn't auto-hit or win",()=>{
 let s=purse();
 s=purchaseJinwooItem(s,{sourceRef:"buy.sword",itemId:"sword_iron",quantity:1});
 const bare=previewOwnedEquipmentEncounter(s,{monsterId:"goblin",floor:1,
  loadout:{},move:"strike"});
 const sword=previewOwnedEquipmentEncounter(s,{monsterId:"goblin",floor:1,
  loadout:{weaponId:"sword_iron"},move:"strike"});
 assert.ok(sword.exchange.damageIfHit>bare.exchange.damageIfHit);
 assert.equal(sword.exchange.noCommittedAttack,true);
 assert.equal(sword.requiresPlayerConfirmedEquipAction,true);
 assert.equal(s.inventory.sword_iron,1);
 assert.equal(sword.gear.verifiedItemIds[0],"sword_iron");
});
test("armor reduces damage but chainmail and shield can hurt combat mobility",()=>{
 let s=purse();s.systemLevel=20;
 s=purchaseJinwooItem(s,{sourceRef:"buy.mail",itemId:"chainmail_armor",quantity:1});
 s=purchaseJinwooItem(s,{sourceRef:"buy.shield",itemId:"steel_shield",quantity:1});
 const bare=previewOwnedEquipmentEncounter(s,{monsterId:"war_shadow",floor:5,
  loadout:{},move:"strike"});
 const guarded=previewOwnedEquipmentEncounter(s,{monsterId:"war_shadow",floor:5,
  loadout:{armorIds:["chainmail_armor","steel_shield"]},move:"strike"});
 assert.ok(guarded.exchange.counterDamageIfHit<bare.exchange.counterDamageIfHit);
 assert.ok(guarded.exchange.hitChancePercent<bare.exchange.hitChancePercent);
 assert.ok(guarded.gear.armor>0);
 assert.throws(()=>previewVerifiedLoadout(s,{
  armorIds:["chainmail_armor","chainmail_armor"]}),/LOADOUT_INVALID/);
});
test("only one piece of body armor and one combat weapon can be equipped at once",()=>{
 let s=purse();s.systemLevel=20;
 for(const [id,k] of [["leather_armor","armor"],
 ["chainmail_armor","armor"],["sword_iron","weapon"],
 ["blade_steel","weapon"]] as const)
  s=purchaseJinwooItem(s,{sourceRef:"buy."+id,itemId:id,quantity:1});
 assert.throws(()=>previewVerifiedLoadout(s,{
  armorIds:["leather_armor","chainmail_armor"]}),/SLOT_COLLISION/);
 assert.throws(()=>previewVerifiedLoadout(s,{
  weaponId:"sword_iron",armorIds:["blade_steel"]}),/WRONG_SLOT|SLOT_COLLISION/);
});
test("bow requires arrows and a melee sword cannot amplify a verified magic skill",()=>{
 let s=purse();
 s=purchaseJinwooItem(s,{sourceRef:"buy.bow",itemId:"shortbow",quantity:1});
 assert.throws(()=>previewOwnedEquipmentEncounter(s,{monsterId:"goblin",
  floor:1,move:"strike",loadout:{weaponId:"shortbow"}}),/AMMUNITION_REQUIRED/);
 s=purchaseJinwooItem(s,{sourceRef:"buy.arrows",itemId:"arrow_bundle",quantity:1});
 assert.ok(previewOwnedEquipmentEncounter(s,{monsterId:"goblin",floor:1,
  move:"strike",loadout:{weaponId:"shortbow"}}).exchange.damageIfHit>0);
 s=purchaseJinwooItem(s,{sourceRef:"buy.iron",itemId:"sword_iron",quantity:1});
 s.falna.blessed=true;s.falna.godId="npc.hestia";
 s.falna.skills.push("firebolt");
 const bare=previewOwnedEquipmentEncounter(s,{monsterId:"goblin",floor:1,
  move:"magic",loadout:{},spellMpCost:15,spellId:"firebolt"});
 const sword=previewOwnedEquipmentEncounter(s,{monsterId:"goblin",floor:1,
  move:"magic",loadout:{weaponId:"sword_iron"},spellMpCost:15,spellId:"firebolt"});
 assert.equal(bare.exchange.damageIfHit,sword.exchange.damageIfHit);
 assert.throws(()=>previewOwnedEquipmentEncounter(s,{
  monsterId:"goblin",floor:1,move:"magic",loadout:{},
  spellMpCost:15,spellId:"nonexistent_spell"
 }),/MAGIC_NOT_AVAILABLE/);
});
test("Knight Killer's effect only helps against armor, never universal armor negation",()=>{
 let s=purse();s.systemLevel=40;
 s=purchaseJinwooItem(s,{sourceRef:"buy.knight",itemId:"knight_killer",quantity:1});
 const against=previewOwnedEquipmentEncounter(s,{monsterId:"killer_ant",floor:7,
  move:"strike",loadout:{weaponId:"knight_killer"}});
 const low=previewOwnedEquipmentEncounter(s,{monsterId:"goblin",floor:1,
  move:"strike",loadout:{weaponId:"knight_killer"}});
 assert.ok(against.gear.armorPiercing>0);
 assert.equal(low.gear.armorPiercing,against.gear.armorPiercing);
 assert.equal(against.readOnly,true);
});

test("v4.8 Knight Killer restores attack and scoped armor damage without legacy changes",()=>{
 let s=purse();s.systemLevel=40;s.storyFlags.push("chroma_crossover_v4","chroma_rules_v48");
 s=purchaseJinwooItem(s,{sourceRef:"buy.knight.v48",itemId:"knight_killer",quantity:1});
 assert.equal(s.gold,40500);
 const gear=previewVerifiedLoadout(s,{weaponId:"knight_killer"});
 assert.equal(gear.attack,75);assert.equal(gear.armorPiercing,0);assert.equal(gear.sharpness,120);
 const armored=previewOwnedEquipmentEncounter(s,{monsterId:"killer_ant",floor:7,move:"strike",loadout:{weaponId:"knight_killer"}});
 const beast=previewOwnedEquipmentEncounter(s,{monsterId:"minotaur",floor:16,move:"strike",loadout:{weaponId:"knight_killer"}});
 assert.equal(armored.armoredTargetMultiplier,1.25);assert.equal(beast.armoredTargetMultiplier,1);
});
