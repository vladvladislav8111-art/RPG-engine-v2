import { auditMaterialTransformation } from "../src/physical_integrity.ts";

const before = [
  {
    "Item ID":"item.shura.raw_coupon",
    "Qty":"1",
    "Custodian":"Shura",
    "Template ID":"tpl.raw",
    "Mass kg override":"0.44",
  },
];
const templates=[
  {"Template ID":"tpl.raw","Mass kg":"0.44"},
  {"Template ID":"tpl.coupon","Mass kg":"0.18"},
];
const events=[
  {"itemId":"item.shura.raw_coupon","qtyDelta":-1},
  {"itemId":"item.shura.coupon_left","qtyDelta":1,"templateId":"tpl.coupon","custodian":"Shura","location":"System Storage"},
  {"itemId":"item.shura.coupon_right","qtyDelta":1,"templateId":"tpl.coupon","custodian":"Shura","location":"System Storage"},
];
const transformation={
  sourceItemIds:["item.shura.raw_coupon"],
  productItemIds:["item.shura.coupon_left","item.shura.coupon_right"],
  processEvidence:"At Brassa's actual anvil, one owner-supplied coupon was drawn, thinned and physically divided into two retained short trial pieces.",
  wasteDisposition:"Approximately eighty grams of scale, sawing dust and trimmed offcut material remain accounted as shop waste.",
};
Deno.test("a source bar may produce two lighter coupons plus visible waste",()=>{
  const r=auditMaterialTransformation({
    transformation,inventoryBefore:before,objectTemplates:templates,events,
  });
  if (Math.abs(r.consumedKg-0.44)>1e-9 ||
      Math.abs(r.outputKg-0.36)>1e-9 ||
      Math.abs(r.untrackedWasteKg-0.08)>1e-9) {
    throw new Error("mass balance wrong");
  }
});
Deno.test("physical material cannot gain phantom mass",()=>{
  let blocked=false;
  try{auditMaterialTransformation({
    transformation,inventoryBefore:before,objectTemplates:templates,
    events:[events[0],{...events[1],massKgOverride:0.30},events[2]],
  });}catch{blocked=true;}
  if(!blocked)throw new Error("conservation failure was accepted");
});
Deno.test("physical material without mass source is never guessed",()=>{
  let blocked=false;
  try{auditMaterialTransformation({
    transformation,
    inventoryBefore:[{...before[0],"Mass kg override":""}],
    objectTemplates:[{...templates[0],"Mass kg":""},templates[1]],
    events,
  });}catch{blocked=true;}
  if(!blocked)throw new Error("unknown source mass was fabricated");
});
Deno.test("physical outputs cannot silently switch custodians",()=>{
  let blocked=false;
  try{auditMaterialTransformation({
    transformation,inventoryBefore:before,objectTemplates:templates,
    events:[events[0],{...events[1],custodian:"stranger"},events[2]],
  });}catch{blocked=true;}
  if(!blocked)throw new Error("custodian silently changed");
});
Deno.test("same physical source cannot be used twice inside one audit",()=>{
  let blocked=false;
  try{auditMaterialTransformation({
    transformation:{...transformation,sourceItemIds:["item.shura.raw_coupon","item.shura.raw_coupon"]},
    inventoryBefore:before,objectTemplates:templates,events,
  });}catch{blocked=true;}
  if(!blocked)throw new Error("source duplication was accepted");
});
