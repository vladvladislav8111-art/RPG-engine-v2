import {
  probeCurrentEconomicGoogleSources,
  type EconomicGoogleReadBatch,
} from "../src/economic_google_source_probe.ts";

const sourceId="fixture.not.production.spreadsheet";
const ranges={
  "CONTROL!B2":[["V2-S-TEST"]],
  "PLAYER_RESOURCES!A1:D100":[
    ["Entity ID","Name","Resource","Current"],
    ["player.shura","Шура","HP","56"],
    ["player.shura","Шура","Money","677"],
    ["player.shura","Шура","Stamina","54,64"],
  ],
  "INVENTORY_CURRENT!A1:M500":[
    ["Item ID","Item","Qty","Unit","Mass kg override","Volume L override",
     "Location/container","Custodian","Condition/known notes","Version","Tags",
     "Last updated","Template ID"],
    ["item.fixture.player_book","Book","1","pcs","","",
     "loc.fixture.bag","Shura","","1","inventory","","objtpl.fixture.book"],
    ["item.fixture.merchant_crate","Crate","4","pcs","","",
     "loc.fixture.shop","npc.fixture.merchant","","2","inventory","","objtpl.fixture.crate"],
  ],
};
const read: EconomicGoogleReadBatch=async(_id,requests)=>
  Object.fromEntries(requests.map(x=>[x,structuredClone(ranges[x as keyof typeof ranges])]));
const probe=(rd=read)=>probeCurrentEconomicGoogleSources({
  spreadsheetId:sourceId,expectedCommittedSaveId:"V2-S-TEST",readBatch:rd,
});
async function rejected(fn:()=>Promise<unknown>,label:string){
  let failed=false;try{await fn()}catch{failed=true}
  if(!failed)throw Error("Google source probe improperly accepted: "+label);
}
Deno.test("double-read source probe captures actual Shura cash and all unique physical custody without minting NPC funds",async()=>{
  const x=await probe();
  if(x.state!=="OBSERVED_NOT_MIGRATED" || x.committedSaveId!=="V2-S-TEST"||
    x.money.length!==1 || x.money[0].sourceEntityId!=="player.shura"||
    x.money[0].currentCopper!==677 || x.items.length!==2 ||
    x.items[1].custodian!=="npc.fixture.merchant" ||
    x.unknownNpcMoneyCount!=="NOT_OBSERVABLE_FROM_THIS_SCHEMA" ||
    x.originalSheetsWritersFrozen!==false ||
    x.observationsAreIndependentProof!==false || !x.observationFingerprint){
    throw Error("Source read was mistaken for authoritative migration");
  }
});
Deno.test("same-save out-of-band economic edit invalidates double read",async()=>{
  let calls=0;
  const drifting:EconomicGoogleReadBatch=async(_,requests)=>{
    calls++;
    const copy=Object.fromEntries(requests.map(x=>[
      x,structuredClone(ranges[x as keyof typeof ranges])
    ]));
    if(calls>1)(copy["PLAYER_RESOURCES!A1:D100"] as string[][])[2][3]="678";
    return copy;
  };
  await rejected(()=>probe(drifting),"Shura's money changed while save ID stayed same");
});
Deno.test("duplicate physical ID or negative cash prevents transfer audit",async()=>{
  const dupe:EconomicGoogleReadBatch=async(_,requests)=>{
    const copy=Object.fromEntries(requests.map(x=>[
      x,structuredClone(ranges[x as keyof typeof ranges])
    ]));
    (copy["INVENTORY_CURRENT!A1:M500"] as string[][]).push(
      [...(copy["INVENTORY_CURRENT!A1:M500"] as string[][])[1]]);
    return copy;
  };
  await rejected(()=>probe(dupe),"same item appeared in two rows");
  const counterfeit:EconomicGoogleReadBatch=async(_,requests)=>{
    const copy=Object.fromEntries(requests.map(x=>[
      x,structuredClone(ranges[x as keyof typeof ranges])
    ]));
    (copy["PLAYER_RESOURCES!A1:D100"] as string[][])[2][3]="-500";
    return copy;
  };
  await rejected(()=>probe(counterfeit),"unlawful negative copper source");
});
Deno.test("snapshot must match exact requested committed save",async()=>{
  await rejected(()=>probeCurrentEconomicGoogleSources({
    spreadsheetId:sourceId,expectedCommittedSaveId:"V2-S-OLDER",readBatch:read,
  }),"save drift");
});
