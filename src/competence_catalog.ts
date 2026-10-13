/** Genuine new broad disciplines require real practice and are never retroactive auto-grants. */
export type EmergentCompetence={id:string;pillar:string;display:string;meaning:string;minimumMinutes:number};
export const EMERGENT_COMPETENCES:readonly EmergentCompetence[]=[
 {id:"competence.art.visual_expression",pillar:"Art",display:"Изобразительное искусство",meaning:"Pictorial creation and color; not measured mechanical design.",minimumMinutes:15},
 {id:"competence.engineering.design",pillar:"Engineering",display:"Инженерное проектирование",meaning:"Mechanical technical drafting, design and dimensional verification; not tested manufacture.",minimumMinutes:15}
];
export type CompetenceDiscovery={competenceId:string;playerIntent:string;practiceEvidence:string;sourceRef:string};
export function validateCompetenceDiscovery(input:{proposal:CompetenceDiscovery;learningEvents:readonly {competenceId:string;productiveMinutes:number;sourceRef?:string}[];elapsedSeconds:number;ownedIds:ReadonlySet<string>}):EmergentCompetence{
 const p=input.proposal,entry=EMERGENT_COMPETENCES.find(e=>e.id===p.competenceId);
 if(!entry)throw Error("COMPETENCE_NOT_CANONICAL");
 if(input.ownedIds.has(entry.id))throw Error("COMPETENCE_ALREADY_OWNED");
 if(p.playerIntent.trim().length<8||p.practiceEvidence.trim().length<35||!/^[a-zA-Z0-9._:-]{8,180}$/.test(p.sourceRef))throw Error("COMPETENCE_NO_EVIDENCE");
 const matches=input.learningEvents.filter(x=>x.competenceId===entry.id&&x.sourceRef===p.sourceRef);
 if(matches.length!==1||matches[0].productiveMinutes<entry.minimumMinutes||input.elapsedSeconds<matches[0].productiveMinutes*60)throw Error("COMPETENCE_REQUIRES_CURRENT_PRACTICE");
 return entry;
}
