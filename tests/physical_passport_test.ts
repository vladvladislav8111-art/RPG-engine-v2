import { permanentMaterialLocksInCanon, materialRefsInCanon, validateDimensionedTransformation,validatePhysicalPassport,type PhysicalPassport } from "../src/physical_passport.ts";

const canonRefs=new Set(["LIVE_CANON_INDEX:material.test.ironlike_v1"]);
const source:PhysicalPassport={
  itemId:"item.test.raw_billet",
  materialCanonRef:"LIVE_CANON_INDEX:material.test.ironlike_v1",
  originTxId:"tx.test.purchase_first",
  originInworldTime:"Day63 09:00",
  custodian:"Shura",location:"System Storage 500L",
  geometryKind:"RECTANGULAR_BAR",
  lengthM:0.5,widthM:0.02,thicknessM:0.01,
  measuredMassKg:0.8,densityKgM3:8000,
  cyclicStrainLimit:0.02,minBendRadiusM:1,
  dimensionsEvidence:"Maker measured the bar with calipers before trade, and noted three dimensions.",
  materialEvidence:"Registered stock certificate and weighing note exist before any prototype sale.",
};
Deno.test("registered billet properties align with physical volume and weight",()=>{
  const v=validatePhysicalPassport(source,canonRefs,new Map());
  if(Math.abs(v.impliedMassKg-0.8)>1e-10||v.minimumStrain!==0.005)
    throw new Error("volume/density/strain passport calculation wrong");
});
Deno.test("impossible measured mass cannot be repaired by inventing a material",()=>{
  let refused=false;
  try{validatePhysicalPassport({...source,measuredMassKg:1.4},canonRefs,new Map());}
  catch{refused=true;}
  if(!refused)throw new Error("mass was adjusted without evidence");
});
Deno.test("passport requires canonical material before instance generation",()=>{
  let refused=false;
  try{validatePhysicalPassport(source,new Set(),new Map());}catch{refused=true;}
  if(!refused)throw new Error("unregistered material spawned");
});
Deno.test("passport immutability survives alternate maker description",()=>{
  let refused=false;
  try{validatePhysicalPassport({...source,densityKgM3:6500},canonRefs,new Map([[source.itemId,source]]));}
  catch{refused=true;}
  if(!refused)throw new Error("material properties changed after purchase");
});
Deno.test("bend strain above established cyclic limit is rejected",()=>{
  let refused=false;
  try{validatePhysicalPassport({...source,minBendRadiusM:0.1},canonRefs,new Map());}
  catch{refused=true;}
  if(!refused)throw new Error("physically unsafe bend accepted");
});
Deno.test("elongation to thinner outputs conserves mass and offcuts",()=>{
  const part={...source,itemId:"item.test.processed_left",lengthM:0.4,widthM:0.01,
    thicknessM:0.01,measuredMassKg:0.32,minBendRadiusM:undefined};
  const part2={...part,itemId:"item.test.processed_right"};
  const x=validateDimensionedTransformation({
    source,outputs:[part,part2],availableOutputMassKg:0.64,wasteKg:0.16,
  });
  if(Math.abs(x.outputMass-0.64)>1e-12)throw new Error("wrong conversion");
  for(const p of [part,part2])validatePhysicalPassport(p,canonRefs,new Map());
});

Deno.test("canonical material registration is not backdated to Shura's earlier purchase",()=>{
  const line="[MATID:material.vein_metal.native_v1|LOCKED:Day63 18:21:00|DENSITY:6100|CYCLIC:0.0125]";
  const locks=permanentMaterialLocksInCanon(line);
  const refs=materialRefsInCanon(line);
  const prepared={...source,materialCanonRef:"material.vein_metal.native_v1",
    densityKgM3:6100,measuredMassKg:0.61,originInworldTime:"Day63 18:22:00",
    cyclicStrainLimit:0.0125, minBendRadiusM:undefined};
  const accepted=validatePhysicalPassport(prepared,refs,new Map(),0.03,locks);
  if(Math.abs(accepted.impliedMassKg-0.61)>1e-9)throw new Error("live material anchor failed");
  for(const candidate of [
    {...prepared,originInworldTime:"Day44 13:00:00"},
    {...prepared,densityKgM3:8000,measuredMassKg:0.8},
    {...prepared,cyclicStrainLimit:0.02},
  ]){
    let blocked=false;
    try{validatePhysicalPassport(candidate,refs,new Map(),0.03,locks);}catch{blocked=true;}
    if(!blocked)throw new Error("retrospective or stronger invented material accepted");
  }
});
