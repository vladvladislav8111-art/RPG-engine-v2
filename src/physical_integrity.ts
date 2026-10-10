export type PhysicalRecord = Record<string, unknown>;
export type PhysicalInventoryDelta = {
  itemId: string;
  qtyDelta?: number;
  qtySet?: number;
  templateId?: string;
  massKgOverride?: number | null;
  custodian?: string;
  location?: string;
  reason?: string;
};
export type MaterialTransformation = {
  sourceItemIds: string[];
  productItemIds: string[];
  processEvidence: string;
  wasteDisposition: string;
  transferEvidence?: string;
};

const str = (x: unknown) => String(x ?? "").trim();
const num = (x: unknown): number | null => {
  if (x == null || str(x) === "") return null;
  const n = Number(str(x).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Audit net physical material mass from authoritative quantity and template
 * data. Unknown density/mass is NEVER guessed. Waste remains an explicit
 * explanation, not a free new inventory item.
 */
export function auditMaterialTransformation(input: {
  transformation: MaterialTransformation;
  inventoryBefore: PhysicalRecord[];
  objectTemplates: PhysicalRecord[];
  events: PhysicalInventoryDelta[];
}) {
  const { transformation: t, inventoryBefore: before, objectTemplates: templates, events } = input;
  const sources = new Set(t.sourceItemIds);
  const products = new Set(t.productItemIds);
  if (!sources.size || !products.size ||
      sources.size !== t.sourceItemIds.length ||
      products.size !== t.productItemIds.length ||
      [...sources].some((id) => products.has(id))) {
    throw new Error("material source/product item IDs must be nonempty, distinct and unique");
  }
  if (t.processEvidence.trim().length < 55) throw new Error("material process needs real operations and source provenance");
  const inventory = new Map(before.map((row) => [str(row["Item ID"]), row]));
  const ev = new Map(events.map((row) => [row.itemId, row]));
  if (ev.size !== events.length) throw new Error("material audit does not support duplicate item delta events");
  const unitMass = (itemId: string): number => {
    const original = inventory.get(itemId);
    const itemEvent = ev.get(itemId);
    const templateId = str(itemEvent?.templateId ?? original?.["Template ID"]);
    const tpl = templates.find((row) => str(row["Template ID"]) === templateId);
    if (!tpl) throw new Error("unknown mass template: " + templateId);
    const mass = itemEvent?.massKgOverride ?? num(original?.["Mass kg override"]) ?? num(tpl["Mass kg"]);
    if (mass == null || !Number.isFinite(mass) || mass <= 0) {
      throw new Error("material mass unknown or invalid: " + itemId);
    }
    return mass;
  };
  const change = (itemId: string): number => {
    const itemEvent = ev.get(itemId);
    if (!itemEvent) throw new Error("material change is missing real inventory delta: " + itemId);
    const original = inventory.get(itemId);
    const oldQty = num(original?.Qty) ?? 0;
    if (itemEvent.qtyDelta != null && itemEvent.qtySet != null) throw new Error("ambiguous material delta");
    return itemEvent.qtyDelta ?? (itemEvent.qtySet == null ? 0 : itemEvent.qtySet - oldQty);
  };
  let consumedKg = 0;
  let outputKg = 0;
  const custodianSet = new Set<string>();
  for (const itemId of sources) {
    const record = inventory.get(itemId);
    if (!record) throw new Error("unowned or nonexistent material source: " + itemId);
    const d = change(itemId);
    const oldQty = num(record["Qty"]) ?? 0;
    if (d >= 0 || oldQty + d < 0) throw new Error("source material must be consumed exactly once");
    custodianSet.add(str(record["Custodian"]));
    consumedKg += -d * unitMass(itemId);
  }
  for (const itemId of products) {
    const d = change(itemId);
    if (d <= 0) throw new Error("product must be positively created or added");
    outputKg += d * unitMass(itemId);
    const owner = str(ev.get(itemId)?.custodian ?? inventory.get(itemId)?.["Custodian"]);
    if (!owner) throw new Error("new product needs named physical custodian");
    if (!custodianSet.has(owner) && !str(t.transferEvidence)) {
      throw new Error("different output custodian needs explicit ownership/transfer evidence");
    }
  }
  const uncertaintyKg = Math.max(0.005, consumedKg * 0.002);
  if (outputKg > consumedKg + uncertaintyKg) {
    throw new Error("material products exceed source mass: conservation violation");
  }
  const untrackedWasteKg = Math.max(0, consumedKg - outputKg);
  if (untrackedWasteKg > uncertaintyKg && t.wasteDisposition.trim().length < 25) {
    throw new Error("material loss requires explicit actual waste/scale/offcut disposition");
  }
  return {
    consumedKg, outputKg, untrackedWasteKg, uncertaintyKg,
    sourceItemIds: [...sources], productItemIds: [...products],
    wasteDisposition: t.wasteDisposition,
    processEvidence: t.processEvidence,
  };
}
