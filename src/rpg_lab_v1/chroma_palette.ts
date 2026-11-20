/** Chroma's persistent pigment physiology and material stains.
 * This is player-owned physical state, not an emotion detector, combat skill,
 * automatic NPC knowledge, or a substitute for the event journal.
 */
export type ChromaPaletteReaction={
 emotion:string;colors:string[];zones:string[];
 intensity:"mild"|"strong"|"overwhelming";
 control:"conscious"|"involuntary";
 startedAt:string;sourceRef:string;
};
export type ChromaPigmentStain={
 stainId:string;target:string;surface:"skin"|"fabric"|"object"|"other";
 color:string;description:string;
 durability:"ordinary"|"skin_week"|"fabric_decades"|"ancestral";
 createdAt:string;sourceRef:string;
};
export type ChromaPaletteState={
 baselineColors:string[];
 reaction:ChromaPaletteReaction|null;
 stains:Record<string,ChromaPigmentStain>;
};
export type ChromaPaletteChange={
 action:"manifest"|"settle";playerEmotionConfirmed:true;
 emotion?:string;colors?:string[];zones?:string[];
 intensity?:ChromaPaletteReaction["intensity"];
 control?:ChromaPaletteReaction["control"];
};
export type ChromaStainChange=
 |{action:"add";stainId:string;target:string;
   surface:ChromaPigmentStain["surface"];color:string;
   description:string;durability:ChromaPigmentStain["durability"];
   playerActionConfirmed?:true;confirmedPhysicalConsequence?:true}
 |{action:"remove";stainId:string;
   reason:string;confirmedRemoval:true};
const ident=(v:unknown)=>typeof v==="string"&&
 /^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(v);
const txt=(v:unknown,max:number)=>typeof v==="string"&&
 v.trim().length>0&&v.length<=max;
const strings=(a:unknown,max:number,length:number)=>
 Array.isArray(a)&&a.length>0&&a.length<=length&&a.every(v=>txt(v,max));
export const freshChromaPalette=():ChromaPaletteState=>({
 baselineColors:["бирюза","нежно-голубой"],
 reaction:null,stains:{}
});
export function validateChromaPalette(s:ChromaPaletteState):ChromaPaletteState{
 if(!s||!strings(s.baselineColors,40,6)||!s.stains||
   typeof s.stains!=="object"||Array.isArray(s.stains)||
   Object.keys(s.stains).length>64)throw Error("CHROMA_PALETTE_INVALID");
 const r=s.reaction;
 if(r!==null){
  if(!r||!txt(r.emotion,80)||!strings(r.colors,40,8)||
     !strings(r.zones,70,12)||
     !["mild","strong","overwhelming"].includes(r.intensity)||
     !["conscious","involuntary"].includes(r.control)||
     !txt(r.startedAt,100)||!ident(r.sourceRef))
   throw Error("CHROMA_REACTION_INVALID");
 }
 for(const [id,stain] of Object.entries(s.stains)){
  if(!ident(id)||!stain||stain.stainId!==id||
     !txt(stain.target,120)||!txt(stain.description,240)||
     !txt(stain.color,80)||!txt(stain.createdAt,100)||!ident(stain.sourceRef)||
     !["skin","fabric","object","other"].includes(stain.surface)||
     !["ordinary","skin_week","fabric_decades","ancestral"].includes(stain.durability))
    throw Error("CHROMA_STAIN_INVALID:"+id);
 }
 return s;
}
export function applyChromaPaletteChanges(
 previous:ChromaPaletteState,
 reaction:ChromaPaletteChange|undefined,
 stains:ChromaStainChange[]|undefined,
 sourceRef:string,time:string
):ChromaPaletteState{
 validateChromaPalette(previous);
 if(!ident(sourceRef)||!txt(time,100))throw Error("CHROMA_EVENT_SOURCE_INVALID");
 const next=structuredClone(previous);
 if(reaction!==undefined){
  if(reaction.playerEmotionConfirmed!==true||
     !["manifest","settle"].includes(reaction.action))
   throw Error("CHROMA_EMOTION_NOT_PLAYER_CONFIRMED");
  if(reaction.action==="settle"){
   if(next.reaction===null)throw Error("CHROMA_REACTION_NOT_ACTIVE");
   next.reaction=null;
  }else{
   if(!txt(reaction.emotion,80)||!strings(reaction.colors,40,8)||
      !strings(reaction.zones,70,12)||
      !["mild","strong","overwhelming"].includes(reaction.intensity??"")||
      !["conscious","involuntary"].includes(reaction.control??""))
    throw Error("CHROMA_REACTION_CHANGE_INVALID");
   next.reaction={
    emotion:reaction.emotion!,colors:[...reaction.colors!],zones:[...reaction.zones!],
    intensity:reaction.intensity!,control:reaction.control!,
    startedAt:time,sourceRef
   };
  }
 }
 if(stains!==undefined){
  if(!Array.isArray(stains)||stains.length>12||
     new Set(stains.map(s=>s.stainId)).size!==stains.length)
   throw Error("CHROMA_STAIN_BATCH_INVALID");
  for(const c of stains){
   if(!c||!ident(c.stainId))throw Error("CHROMA_STAIN_CHANGE_INVALID");
   if(c.action==="remove"){
    if(c.confirmedRemoval!==true||!txt(c.reason,180)||!next.stains[c.stainId])
     throw Error("CHROMA_STAIN_REMOVAL_UNVERIFIED");
    delete next.stains[c.stainId];
   }else if(c.action==="add"){
    if(!(c.playerActionConfirmed===true||
       (c.confirmedPhysicalConsequence===true&&reaction?.action==="manifest"&&
        reaction.playerEmotionConfirmed===true))||next.stains[c.stainId])
     throw Error("CHROMA_STAIN_ADDITION_UNVERIFIED");
    next.stains[c.stainId]={
     stainId:c.stainId,target:c.target,surface:c.surface,
     color:c.color,description:c.description,durability:c.durability,
     createdAt:time,sourceRef
    };
   }else throw Error("CHROMA_STAIN_ACTION_INVALID");
  }
 }
 return validateChromaPalette(next);
}
/** Read-only narrator anchor. No guessed emotions, no automatic decay.
 * Cleaning, skin renewal or damage require a new confirmed event.
 */
export function readChromaPaletteAnchor(s:ChromaPaletteState){
 validateChromaPalette(s);
 return {kind:"chroma_palette",baselineColors:[...s.baselineColors],
  activeReaction:s.reaction?structuredClone(s.reaction):null,
  physicalStains:Object.values(s.stains).map(x=>structuredClone(x)),
  noAutomaticEmotionInference:true,noSilentResetBetweenTurns:true,
  noNpcKnowledgeWithoutWitness:true,readOnly:true};
}
