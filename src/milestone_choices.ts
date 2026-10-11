/** Canon-validated milestone options; no option is selected by generation. */
export type MilestoneChoiceOption = {
  id:string;name:string;type:"PASSIVE"|"ACTIVE";
  trigger:string;effect:string;limits:string;scalingState:string;
  sourceRef:string;canonStatus:"CANON_ACTIVE";
};
const meaningful=(s:string,min=10)=>typeof s==="string"&&s.trim().length>=min&&s.length<=1500;
export function validateMilestoneOptions(input:{choiceId:string;parentId:string;
  options:readonly MilestoneChoiceOption[];existingMilestoneIds:ReadonlySet<string>}) {
  if(!/^choice\.competence\.[a-z0-9_.-]+\.lv\d+$/i.test(input.choiceId)||
    !/^competence\.[a-z0-9_.-]+$/i.test(input.parentId)||
    !input.choiceId.includes(input.parentId)||input.options.length<2||input.options.length>4)
    throw Error("MILESTONE_CHOICE_SCOPE_INVALID");
  const ids=new Set<string>();
  for(const o of input.options){
    if(!/^milestone\.[a-z0-9_.-]+$/i.test(o.id)||ids.has(o.id)||
      input.existingMilestoneIds.has(o.id)||o.canonStatus!=="CANON_ACTIVE"||
      !["PASSIVE","ACTIVE"].includes(o.type)||!meaningful(o.name,3)||
      !meaningful(o.trigger)||!meaningful(o.effect)||
      !meaningful(o.limits)||!meaningful(o.scalingState,2)||
      !meaningful(o.sourceRef,8))throw Error("MILESTONE_OPTION_NOT_CANON_VERIFIED");
    ids.add(o.id);
  }
  return [...input.options];
}
export function resolveMilestoneOption(input:{
  status:string;optionsJson:string;selectedOption:string;parentId:string;
}):MilestoneChoiceOption {
  if(input.status!=="AWAITING_CHOICE")throw Error("MILESTONE_OPTIONS_NOT_GENERATED");
  let parsed:unknown;try{parsed=JSON.parse(input.optionsJson)}catch{throw Error("MILESTONE_OPTIONS_BAD_JSON")}
  if(!Array.isArray(parsed)||!parsed.length)throw Error("MILESTONE_OPTIONS_EMPTY");
  const selected=parsed.find((o:unknown)=>
    !!o&&typeof o==="object"&&"id" in o&&o.id===input.selectedOption);
  if(!selected)throw Error("SELECTED_MILESTONE_NOT_IN_OPTIONS");
  const obj=selected as MilestoneChoiceOption;
  if(obj.canonStatus!=="CANON_ACTIVE"||!meaningful(obj.sourceRef,8)||
    !meaningful(obj.effect)||!meaningful(obj.limits))throw Error("MILESTONE_CANDIDATE_NOT_ACTIVATED");
  return obj;
}
