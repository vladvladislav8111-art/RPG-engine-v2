import { parseInworldMoment } from "./social_context.ts";

export type PhysicalPassport = {
  itemId: string;
  materialCanonRef: string;
  originTxId: string;
  originInworldTime: string;
  custodian: string;
  location: string;
  geometryKind: "RECTANGULAR_BAR" | "CYLINDER" | "MEASURED_VOLUME";
  lengthM?: number;
  widthM?: number;
  thicknessM?: number;
  radiusM?: number;
  measuredVolumeM3?: number;
  measuredMassKg: number;
  densityKgM3: number;
  cyclicStrainLimit?: number;
  minBendRadiusM?: number;
  dimensionsEvidence: string;
  materialEvidence: string;
};

export type MaterialGeometryResult = {
  itemId: string;
  volumeM3: number;
  impliedMassKg: number;
  measuredMassKg: number;
  relativeMassError: number;
  minimumStrain?: number;
};

const positive = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
const nonempty = (s: unknown) => typeof s === "string" && s.trim().length > 0;

/**
 * Immutable GM-level material/geometry truth is registered before sale or use.
 * Discovery by Shura is separate. The ref MUST point to a canonical established
 * material fact, not a retroactive post-failure guess.
 */
export function validatePhysicalPassport(
  passport: PhysicalPassport,
  canonRefs: ReadonlySet<string>,
  existing: ReadonlyMap<string, PhysicalPassport>,
  toleranceRatio = 0.03,
  materialLocks?: ReadonlyMap<string, { lockedAt: number; densityKgM3: number; maxCyclicStrain: number }>,
): MaterialGeometryResult {
  if (!passport.itemId.startsWith("item.") ||
      !nonempty(passport.originTxId) ||
      !nonempty(passport.originInworldTime) ||
      !nonempty(passport.location) || !nonempty(passport.custodian)) {
    throw new Error("physical passport missing durable instance and ownership provenance");
  }
  if (!canonRefs.has(passport.materialCanonRef)) {
    throw new Error("material fact not established in authoritative canon BEFORE this item");
  }
  if (materialLocks) {
    const registered = materialLocks.get(passport.materialCanonRef);
    if (!registered) throw new Error("physical material lacks a version-locked canonical property record");
    const origin = parseInworldMoment(passport.originInworldTime);
    if (origin == null || origin < registered.lockedAt) {
      throw new Error("material properties were not canonized before this item's original transaction");
    }
    if (Math.abs(passport.densityKgM3 - registered.densityKgM3) / registered.densityKgM3 > 0.03) {
      throw new Error("material density deviates from independently fixed permanent canon");
    }
    if (passport.cyclicStrainLimit != null &&
        (passport.cyclicStrainLimit > registered.maxCyclicStrain ||
          passport.cyclicStrainLimit < 0)) {
      throw new Error("material cyclic flex claim exceeds pre-established canonical material limit");
    }
  }
  if (existing.has(passport.itemId)) {
    throw new Error("physical instance passport already exists and is immutable; transform into new item ID");
  }
  if (passport.dimensionsEvidence.trim().length < 32 ||
      passport.materialEvidence.trim().length < 32) {
    throw new Error("material density/dimensions require dated observational or maker evidence");
  }
  if (!positive(passport.measuredMassKg) || !positive(passport.densityKgM3)) {
    throw new Error("physical mass and density must be measured and strictly positive");
  }
  let volume = 0;
  if (passport.geometryKind === "RECTANGULAR_BAR") {
    if (!positive(passport.lengthM) || !positive(passport.widthM) ||
        !positive(passport.thicknessM)) {
      throw new Error("rectangular stock needs all three established dimensions");
    }
    volume = passport.lengthM! * passport.widthM! * passport.thicknessM!;
  } else if (passport.geometryKind === "CYLINDER") {
    if (!positive(passport.lengthM) || !positive(passport.radiusM)) {
      throw new Error("cylinder stock needs established length and radius");
    }
    volume = Math.PI * passport.radiusM! ** 2 * passport.lengthM!;
  } else if (passport.geometryKind === "MEASURED_VOLUME") {
    if (!positive(passport.measuredVolumeM3)) {
      throw new Error("irregular form needs measured displaced/estimated volume");
    }
    volume = passport.measuredVolumeM3!;
  } else {
    throw new Error("unsupported physical geometry; unknown is not a new measurement");
  }
  const expectedMass = volume * passport.densityKgM3;
  const relativeError = Math.abs(expectedMass - passport.measuredMassKg) / passport.measuredMassKg;
  if (relativeError > toleranceRatio) {
    throw new Error("mass/density/geometry inconsistency; cannot retroactively alter material to fit");
  }
  let minimumStrain: number | undefined;
  if (passport.minBendRadiusM != null) {
    if (!positive(passport.minBendRadiusM) ||
        !positive(passport.thicknessM) ||
        !positive(passport.cyclicStrainLimit) ||
        passport.cyclicStrainLimit! > 1) {
      throw new Error("bend assessment requires actual thickness, radius and elastic cyclic limit");
    }
    minimumStrain = passport.thicknessM! / (2 * passport.minBendRadiusM!);
    if (minimumStrain > passport.cyclicStrainLimit!) {
      throw new Error("intended bending exceeds established reversible cyclic strain limit");
    }
  }
  return {
    itemId:passport.itemId,volumeM3:volume,impliedMassKg:expectedMass,
    measuredMassKg:passport.measuredMassKg,relativeMassError:relativeError,
    minimumStrain,
  };
}

export function validateDimensionedTransformation(input: {
  source: PhysicalPassport;
  outputs: PhysicalPassport[];
  availableOutputMassKg: number;
  wasteKg: number;
  toleranceKg?: number;
}) {
  const {source, outputs} = input;
  if(!outputs.length || new Set(outputs.map(p=>p.itemId)).size !== outputs.length ||
     outputs.some(p=>p.itemId===source.itemId)) throw new Error("dimensioned outputs need distinct item identities");
  if (!Number.isFinite(input.wasteKg) || input.wasteKg<0) throw new Error("invalid processing waste");
  const outputMass=outputs.reduce((a,p)=>a+p.measuredMassKg,0);
  const tolerance=input.toleranceKg??Math.max(0.001,source.measuredMassKg*0.002);
  if(Math.abs(outputMass + input.wasteKg - source.measuredMassKg)>tolerance ||
      Math.abs(outputMass-input.availableOutputMassKg)>tolerance) {
    throw new Error("dimensioned transformation does not conserve source mass and accounted waste");
  }
  return {sourceItemId:source.itemId,products:outputs.map(p=>p.itemId),outputMass,wasteKg:input.wasteKg};
}

export const PHYSICAL_PASSPORT_HEADERS = [
  "Item ID", "Material canon ref", "Origin TX", "Origin inworld time",
  "Geometry kind", "Length m", "Width m", "Thickness m", "Radius m",
  "Measured volume m3", "Measured mass kg", "Density kg/m3",
  "Cyclic strain limit", "Minimum bend radius m", "Dimensions evidence",
  "Material evidence", "First custodian", "First location", "Status",
  "Last verified TX", "Notes",
];

export function permanentMaterialLocksInCanon(text: string): ReadonlyMap<string, {lockedAt:number;densityKgM3:number;maxCyclicStrain:number}> {
  const result=new Map<string,{lockedAt:number;densityKgM3:number;maxCyclicStrain:number}>();
  const pattern=/\[MATID:(material\.[a-z0-9_.-]+)\|LOCKED:(Day\d+ \d{2}:\d{2}(?::\d{2})?)\|DENSITY:(\d+(?:\.\d+)?)\|CYCLIC:(\d+(?:\.\d+)?)\]/gi;
  for(const match of text.matchAll(pattern)){
    const lockedAt=parseInworldMoment(match[2]);
    const densityKgM3=Number(match[3]),maxCyclicStrain=Number(match[4]);
    if(lockedAt==null||densityKgM3<=0||maxCyclicStrain<0||maxCyclicStrain>1)continue;
    if(result.has(match[1]))throw new Error("conflicting duplicate material canonical registry ID");
    result.set(match[1],{lockedAt,densityKgM3,maxCyclicStrain});
  }
  return result;
}
export function materialRefsInCanon(text: string): ReadonlySet<string> {
  return new Set(permanentMaterialLocksInCanon(text).keys());
}

export function passportToSheetRecord(
  p: PhysicalPassport, latestTx: string, comment = "",
): Record<string, string | number> {
  return {
    "Item ID": p.itemId,
    "Material canon ref": p.materialCanonRef,
    "Origin TX": p.originTxId,
    "Origin inworld time": p.originInworldTime,
    "Geometry kind": p.geometryKind,
    "Length m": p.lengthM ?? "",
    "Width m": p.widthM ?? "",
    "Thickness m": p.thicknessM ?? "",
    "Radius m": p.radiusM ?? "",
    "Measured volume m3": p.measuredVolumeM3 ?? "",
    "Measured mass kg": p.measuredMassKg,
    "Density kg/m3": p.densityKgM3,
    "Cyclic strain limit": p.cyclicStrainLimit ?? "",
    "Minimum bend radius m": p.minBendRadiusM ?? "",
    "Dimensions evidence": p.dimensionsEvidence,
    "Material evidence": p.materialEvidence,
    "First custodian": p.custodian,
    "First location": p.location,
    "Status": "LOCKED/IMMUTABLE",
    "Last verified TX": latestTx,
    "Notes": comment,
  };
}
