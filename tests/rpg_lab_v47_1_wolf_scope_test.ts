import {isWolfSlayerBeast} from "../src/rpg_lab_v1/orario_player_combat.ts";
Deno.test("Wolf Slayer recognizes rabbits and existing beast identities, not chitin or humanoids",()=>{
 for(const id of ["needle_rabbit","metal_rabbit","almiraj","system.dungeon_wolf","system.razan","kobold","silverback","dungeon_lizard"])
  if(!isWolfSlayerBeast(id))throw Error("missing beast: "+id);
 for(const id of ["killer_ant","war_shadow","goblin","crystal_mantis","goliath_17"])
  if(isWolfSlayerBeast(id))throw Error("nonbeast incorrectly included: "+id);
});
