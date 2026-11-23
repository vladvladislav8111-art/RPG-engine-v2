/** Physical DanMachi material search, separate from XP, runes and stone sale. */
import catalog from "../data/bestiary_v2.json" with {type:"json"};
import {getV4MonsterCard} from "./live_monster_profile.ts";
import {boundedChildRef} from "./event_child_refs.ts";
import type {JinwooState} from "./shadow_monarch_rules.ts";
const cards=new Map(catalog.cards.map(x=>[x.id,x]));
export function recoverChromaCatalogMaterial(s:JinwooState,e:{sourceRef:string;monsterId:string;monsterRef:string}){
 const card=cards.get(e.monsterId),combat=getV4MonsterCard(e.monsterId);
 if(!card||!combat||combat.origin!=="DanMachi"||!s.chromaV4Meta||
    s.defeatEvidence?.[e.monsterRef]?.monsterId!==e.monsterId)
  throw Error("CHROMA_MATERIAL_DEFEAT_PROOF_REQUIRED");
 const meta=s.chromaV4Meta;
 if(meta.physicalLoot.recoveredTargetRefs.includes(e.monsterRef))throw Error("CHROMA_MATERIAL_ALREADY_RECOVERED");
 let h=2166136261>>>0;
 for(const c of "material|"+e.monsterRef+"|"+e.monsterId){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
 const roll=(h>>>0)%10000+1;
 const chance=card["шанс_материала_%"];
 if(typeof chance!=="number"||chance<0||chance>100)throw Error("CHROMA_MATERIAL_CATALOG_INVALID");
 const itemId=card["материал"]&&roll<=chance*100?boundedChildRef(e.monsterId,"material.",""):null;
 const n=structuredClone(s),m=n.chromaV4Meta!;
 m.physicalLoot.recoveredTargetRefs.push(e.monsterRef);m.physicalLoot.recoveryRefs.push(e.sourceRef);
 if(itemId){n.inventory[itemId]=(n.inventory[itemId]??0)+1;
  m.recoveredMaterials.push({targetRef:e.monsterRef,monsterId:e.monsterId,itemId,sourceRef:e.sourceRef});}
 n.systemDropRefs=[...(n.systemDropRefs??[]),e.monsterRef];n.appliedRewardRefs.push(e.sourceRef);
 return {next:n,itemId,roll};
}
