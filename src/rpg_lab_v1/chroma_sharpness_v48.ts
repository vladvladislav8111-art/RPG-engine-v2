/** Chroma v4.8 guarded sharpness model. Values are campaign estimates, not canon.
 * Null denotes non-edged damage. Kasaka Fang = 100. Legacy saves are unchanged
 * unless the explicit Chroma-only rules flag is enabled by a verified migration.
 */
export const SHARPNESS_RULE_FLAG="chroma_rules_v48";
export function usesSharpnessRules(flags:readonly string[]):boolean{
 return flags.includes("chroma_crossover_v4")&&flags.includes(SHARPNESS_RULE_FLAG);
}
export const WEAPON_SHARPNESS:Readonly<Record<string,number|null>>={
 blade_training:null,steel_dagger:50,blade_steel:55,sword_iron:45,
 spear_steel:55,shortbow:50,daggers_throwing:50,dagger_hardened:70,
 kasaka_fang:100,sword_obsidian:115,dagger_shadowbound:150,knight_killer:120,
};
export function weaponSharpness(id:string|undefined):number|null{
 return id===undefined?null:WEAPON_SHARPNESS[id]??null;
}
export function armorAbsorption(armor:number,sharpness:number|null|undefined):number{
 if(!Number.isFinite(armor)||armor<0)throw Error("SHARPNESS_ARMOR_INVALID");
 if(sharpness==null)return armor*1.6;
 if(!Number.isFinite(sharpness)||sharpness<=0)throw Error("SHARPNESS_VALUE_INVALID");
 return armor*1.6*Math.max(.5,Math.min(2,100/sharpness));
}
