import {assertEquals,assertThrows} from "jsr:@std/assert";
import {validateMilestoneOptions,resolveMilestoneOption} from "../src/milestone_choices.ts";
const a={id:"milestone.crafting.a",name:"Точная сборка",type:"PASSIVE" as const,
 trigger:"Проверка реально видимой конструкции",effect:"Лучше замечает известные точки напряжения и сборочные зазоры",
 limits:"Не раскрывает неизвестные свойства металлов, не исправляет брак бесплатно",
 scalingState:"Зависит от доступных инструментов",sourceRef:"canon.current.rule.crafting.1",canonStatus:"CANON_ACTIVE" as const};
const b={...a,id:"milestone.crafting.b",name:"Последовательная сборка",sourceRef:"canon.current.rule.crafting.2"};
Deno.test("Canonical milestone options are published without selecting Shura's path",()=>{
 const choices=validateMilestoneOptions({
 choiceId:"choice.competence.crafting.practical_creation.lv3",
 parentId:"competence.crafting.practical_creation",options:[a,b],
 existingMilestoneIds:new Set<string>()});
 assertEquals(choices.length,2);
 assertThrows(()=>resolveMilestoneOption({status:"PENDING_GENERATION",optionsJson:"[]",
 selectedOption:a.id,parentId:"competence.crafting.practical_creation"}),Error,"MILESTONE_OPTIONS_NOT_GENERATED");
 const picked=resolveMilestoneOption({status:"AWAITING_CHOICE",optionsJson:JSON.stringify(choices),
 selectedOption:a.id,parentId:"competence.crafting.practical_creation"});
 assertEquals(picked.effect,a.effect);
 assertThrows(()=>resolveMilestoneOption({status:"AWAITING_CHOICE",optionsJson:JSON.stringify(choices),
 selectedOption:"milestone.crafting.forged",parentId:"competence.crafting.practical_creation"}),
 Error,"SELECTED_MILESTONE_NOT_IN_OPTIONS");
});
Deno.test("Draft milestone and duplicate-owned milestone cannot be promoted",()=>{
 assertThrows(()=>validateMilestoneOptions({
 choiceId:"choice.competence.crafting.practical_creation.lv3",
 parentId:"competence.crafting.practical_creation",
 options:[{...a,canonStatus:"DESIGN_CANDIDATE" as never},b],
 existingMilestoneIds:new Set<string>()}),Error,"MILESTONE_OPTION_NOT_CANON_VERIFIED");
 assertThrows(()=>validateMilestoneOptions({
 choiceId:"choice.competence.crafting.practical_creation.lv3",
 parentId:"competence.crafting.practical_creation",
 options:[a,b],existingMilestoneIds:new Set([a.id])}),Error,"MILESTONE_OPTION_NOT_CANON_VERIFIED");
});
