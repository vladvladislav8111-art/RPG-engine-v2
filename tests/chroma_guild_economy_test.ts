import {
 CHROMA_LINOS_STONE_BASE_VALIS,quoteChromaLinosMagicStone
} from "../src/rpg_lab_v1/chroma_guild_economy.ts";

const eq=(actual:unknown,expected:unknown)=>{
 if(actual!==expected)throw Error("Expected "+String(expected)+", got "+String(actual));
};
Deno.test("Chroma Linos transfer uses verified baseline species prices",()=>{
 eq(CHROMA_LINOS_STONE_BASE_VALIS.goblin,180);
 eq(CHROMA_LINOS_STONE_BASE_VALIS.kobold,220);
 eq(CHROMA_LINOS_STONE_BASE_VALIS.dungeon_lizard,350);
 eq(CHROMA_LINOS_STONE_BASE_VALIS.war_shadow,1350);
 eq(CHROMA_LINOS_STONE_BASE_VALIS.killer_ant,1200);
 eq(quoteChromaLinosMagicStone({
  monsterId:"killer_ant",sizePct:100,saturationPct:100,integrityPct:100
 }).valis,1200);
});
Deno.test("size, saturation and integrity are applied exactly once",()=>{
 eq(quoteChromaLinosMagicStone({
  monsterId:"goblin",sizePct:120,saturationPct:110,integrityPct:85
 }).valis,193);
 eq(quoteChromaLinosMagicStone({
  monsterId:"kobold",sizePct:70,saturationPct:65,integrityPct:50
 }).valis,42);
});
Deno.test("no phantom default quality for a Chroma stone",()=>{
 for(const args of [
  {monsterId:"goblin",sizePct:undefined,saturationPct:100,integrityPct:100},
  {monsterId:"goblin",sizePct:100,saturationPct:undefined,integrityPct:100},
  {monsterId:"goblin",sizePct:100,saturationPct:100,integrityPct:undefined},
  {monsterId:"unknown",sizePct:100,saturationPct:100,integrityPct:100},
 ]){
  let threw=false;
  try{
   quoteChromaLinosMagicStone(
    args as Parameters<typeof quoteChromaLinosMagicStone>[0]
   );
  }catch{threw=true;}
  eq(threw,true);
 }
});
Deno.test("a destroyed stone evaluates to zero, never a payout",()=>{
 eq(quoteChromaLinosMagicStone({
  monsterId:"war_shadow",sizePct:100,saturationPct:100,integrityPct:0
 }).valis,0);
});
