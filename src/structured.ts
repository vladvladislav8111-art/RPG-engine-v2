export type Scalar = string | number | boolean | null;

export type StructuredSheet =
  | "INVENTORY_CURRENT"
  | "OPPORTUNITIES_CURRENT"
  | "PROJECTS_CURRENT"
  | "NPC_CURRENT"
  | "NPC_KNOWLEDGE"
  | "PLAYER_LANGUAGE"
  | "PLAYER_LEXICON"
  | "PLAYER_GRAMMAR"
  | "SERVICES_CURRENT"
  | "MAP_KNOWLEDGE_CURRENT"
  | "PENDING_CHOICES"
  | "ENTITY_INDEX";

export const TABLE_SPECS: Record<StructuredSheet, { keyHeaders: string[]; maxRows: number }> = {
  INVENTORY_CURRENT: { keyHeaders: ["Item ID"], maxRows: 500 },
  OPPORTUNITIES_CURRENT: { keyHeaders: ["Offer ID"], maxRows: 500 },
  PROJECTS_CURRENT: { keyHeaders: ["Project ID"], maxRows: 500 },
  NPC_CURRENT: { keyHeaders: ["NPC ID"], maxRows: 500 },
  NPC_KNOWLEDGE: { keyHeaders: ["NPC ID", "Fact ID"], maxRows: 2000 },
  PLAYER_LANGUAGE: { keyHeaders: ["Language ID"], maxRows: 100 },
  PLAYER_LEXICON: { keyHeaders: ["Entry ID"], maxRows: 1000 },
  PLAYER_GRAMMAR: { keyHeaders: ["Grammar ID"], maxRows: 300 },
  SERVICES_CURRENT: { keyHeaders: ["Service ID"], maxRows: 500 },
  MAP_KNOWLEDGE_CURRENT: { keyHeaders: ["Marker ID"], maxRows: 1500 },
  PENDING_CHOICES: { keyHeaders: ["Choice ID"], maxRows: 300 },
  ENTITY_INDEX: { keyHeaders: ["Entity ID"], maxRows: 1000 },
};

export function columnLetter(index0: number): string {
  let n = index0 + 1;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export function rowsToRecords(rows: unknown[][]): Array<Record<string, Scalar>> {
  if (!rows.length) return [];
  const headers = rows[0].map((x) => String(x ?? ""));
  return rows.slice(1).filter((row) => row.some((x) => String(x ?? "") !== "")).map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, (row[i] ?? null) as Scalar]))
  );
}

export function findRowIndex(rows: unknown[][], keyHeaders: string[], key: string): number {
  if (!rows.length) return -1;
  const headers = rows[0].map((x) => String(x ?? ""));
  const indexes = keyHeaders.map((h) => headers.indexOf(h));
  if (indexes.some((i) => i < 0)) return -1;
  const wanted = key.split("||");
  for (let i = 1; i < rows.length; i++) {
    const got = indexes.map((ix) => String(rows[i]?.[ix] ?? ""));
    if (got.every((v, j) => v === String(wanted[j] ?? ""))) return i;
  }
  return -1;
}

export function recordFromRow(rows: unknown[][], rowIndex: number): Record<string, Scalar> {
  const headers = rows[0].map((x) => String(x ?? ""));
  const row = rows[rowIndex] ?? [];
  return Object.fromEntries(headers.map((h, i) => [h, (row[i] ?? null) as Scalar]));
}

export function rowFromRecord(headers: string[], record: Record<string, Scalar>): Scalar[] {
  return headers.map((h) => record[h] ?? null);
}

export function firstEmptyDataRow(rows: unknown[][], keyColumn = 0): number {
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i]?.[keyColumn] ?? "") === "") return i;
  }
  return Math.max(1, rows.length);
}

export function tableRange(sheet: StructuredSheet): string {
  const spec = TABLE_SPECS[sheet];
  return `${sheet}!A1:Z${spec.maxRows}`;
}
