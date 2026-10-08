import { sheetsBatchGet } from "./google.ts";

export type BoundedActorTable =
  | "NPC_CURRENT"
  | "NPC_KNOWLEDGE"
  | "NPC_RELATIONSHIPS_CURRENT"
  | "SOCIAL_MEMORY_CURRENT"
  | "OPEN_THREADS_CURRENT"
  | "SYSTEM_CHAT_LOG"
  | "NPC_ACTIVITY_RULES";

type ScanSpec = {
  table: BoundedActorTable;
  scanRange: string;
  headerRange: string;
  lastColumn: string;
};

const SPECS: ScanSpec[] = [
  { table: "NPC_CURRENT", scanRange: "NPC_CURRENT!A1:B500", headerRange: "NPC_CURRENT!A1:N1", lastColumn: "N" },
  { table: "NPC_KNOWLEDGE", scanRange: "NPC_KNOWLEDGE!A1:A2000", headerRange: "NPC_KNOWLEDGE!A1:J1", lastColumn: "J" },
  { table: "NPC_RELATIONSHIPS_CURRENT", scanRange: "NPC_RELATIONSHIPS_CURRENT!B1:C500", headerRange: "NPC_RELATIONSHIPS_CURRENT!A1:Q1", lastColumn: "Q" },
  { table: "SOCIAL_MEMORY_CURRENT", scanRange: "SOCIAL_MEMORY_CURRENT!B1:B500", headerRange: "SOCIAL_MEMORY_CURRENT!A1:M1", lastColumn: "M" },
  { table: "OPEN_THREADS_CURRENT", scanRange: "OPEN_THREADS_CURRENT!B1:B300", headerRange: "OPEN_THREADS_CURRENT!A1:N1", lastColumn: "N" },
  { table: "SYSTEM_CHAT_LOG", scanRange: "SYSTEM_CHAT_LOG!D1:E5000", headerRange: "SYSTEM_CHAT_LOG!A1:J1", lastColumn: "J" },
  { table: "NPC_ACTIVITY_RULES", scanRange: "NPC_ACTIVITY_RULES!A1:A200", headerRange: "NPC_ACTIVITY_RULES!A1:L1", lastColumn: "L" },
];

export type ActorIndexScan = {
  npcReferenceRows: unknown[][];
  scanRows: Record<BoundedActorTable, unknown[][]>;
  headerRows: Record<BoundedActorTable, unknown[][]>;
  readPlan: string[];
  approxCellsRead: number;
};

function participants(value: unknown): string[] {
  return String(value ?? "")
    .split(/[;,|]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function compressRowRanges(
  sheet: string,
  lastColumn: string,
  rows: number[],
): string[] {
  const sorted = uniqueSorted(rows.filter((n) => Number.isInteger(n) && n >= 2));
  if (!sorted.length) return [];
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const row of sorted.slice(1)) {
    if (row === previous + 1) {
      previous = row;
      continue;
    }
    ranges.push(`${sheet}!A${start}:${lastColumn}${previous}`);
    start = previous = row;
  }
  ranges.push(`${sheet}!A${start}:${lastColumn}${previous}`);
  return ranges;
}

function rowNumbersForActor(
  table: BoundedActorTable,
  scanRows: unknown[][],
  actorIds: Set<string>,
  recentChatLimit: number,
): number[] {
  if (!scanRows.length || !actorIds.size) return [];

  if (table === "SYSTEM_CHAT_LOG") {
    const perActor = new Map<string, number[]>();
    for (const id of actorIds) perActor.set(id, []);
    for (let i = 1; i < scanRows.length; i++) {
      const sender = String(scanRows[i]?.[0] ?? "");
      const receiver = String(scanRows[i]?.[1] ?? "");
      const rowNo = i + 1;
      if (actorIds.has(sender)) perActor.get(sender)?.push(rowNo);
      if (actorIds.has(receiver)) perActor.get(receiver)?.push(rowNo);
    }
    return uniqueSorted(
      [...perActor.values()].flatMap((rows) => rows.slice(-Math.max(0, recentChatLimit))),
    );
  }

  const out: number[] = [];
  for (let i = 1; i < scanRows.length; i++) {
    const rowNo = i + 1;
    if (table === "NPC_RELATIONSHIPS_CURRENT") {
      const actor = String(scanRows[i]?.[0] ?? "");
      const toward = String(scanRows[i]?.[1] ?? "");
      if (actorIds.has(actor) || actorIds.has(toward)) out.push(rowNo);
      continue;
    }
    if (table === "SOCIAL_MEMORY_CURRENT" || table === "OPEN_THREADS_CURRENT") {
      if (participants(scanRows[i]?.[0]).some((id) => actorIds.has(id))) out.push(rowNo);
      continue;
    }
    const id = String(scanRows[i]?.[0] ?? "");
    if (actorIds.has(id)) out.push(rowNo);
  }
  return uniqueSorted(out);
}

export async function scanActorContextIndex(spreadsheetId: string): Promise<ActorIndexScan> {
  const ranges = SPECS.flatMap((spec) => [spec.scanRange, spec.headerRange]);
  const data = await sheetsBatchGet(spreadsheetId, ranges);
  const scanRows = {} as Record<BoundedActorTable, unknown[][]>;
  const headerRows = {} as Record<BoundedActorTable, unknown[][]>;
  let approxCellsRead = 0;

  for (const spec of SPECS) {
    scanRows[spec.table] = data[spec.scanRange] ?? [];
    headerRows[spec.table] = data[spec.headerRange] ?? [];
    approxCellsRead += scanRows[spec.table].reduce((n, row) => n + row.length, 0);
    approxCellsRead += headerRows[spec.table].reduce((n, row) => n + row.length, 0);
  }
  return {
    npcReferenceRows: scanRows.NPC_CURRENT,
    scanRows,
    headerRows,
    readPlan: ["TEMP:ACTOR_INDEX_SCAN"],
    approxCellsRead,
  };
}

export async function loadBoundedActorTables(
  spreadsheetId: string,
  scan: ActorIndexScan,
  actorIds: string[],
  recentChatLimit: number,
): Promise<{
  tables: Partial<Record<BoundedActorTable, unknown[][]>>;
  readPlan: string[];
  exactRangeCount: number;
  approxCellsRead: number;
}> {
  const wanted = new Set(actorIds);
  const requests: Array<{ table: BoundedActorTable; range: string }> = [];

  for (const spec of SPECS) {
    const rows = rowNumbersForActor(spec.table, scan.scanRows[spec.table], wanted, recentChatLimit);
    for (const range of compressRowRanges(spec.table, spec.lastColumn, rows)) {
      requests.push({ table: spec.table, range });
    }
  }

  const data = await sheetsBatchGet(spreadsheetId, requests.map((r) => r.range));
  const tables: Partial<Record<BoundedActorTable, unknown[][]>> = {};
  let approxCellsRead = 0;

  for (const spec of SPECS) {
    const header = scan.headerRows[spec.table]?.[0] ?? [];
    const rows = requests
      .filter((r) => r.table === spec.table)
      .flatMap((r) => data[r.range] ?? []);
    tables[spec.table] = header.length ? [header, ...rows] : rows;
    approxCellsRead += rows.reduce((n, row) => n + row.length, 0);
  }

  return {
    tables,
    readPlan: requests.map((r) => `TEMP:${r.table}:BOUNDED`),
    exactRangeCount: requests.length,
    approxCellsRead,
  };
}

export async function loadBoundedArchiveRows(
  spreadsheetId: string,
  sheet: string,
  actorIds: string[],
): Promise<{
  rows: unknown[][];
  readPlan: string[];
  exactRangeCount: number;
}> {
  const scanRange = `${sheet}!A1:A1000`;
  const headerRange = `${sheet}!A1:L1`;
  const scan = await sheetsBatchGet(spreadsheetId, [scanRange, headerRange]);
  const ids = new Set(actorIds);
  const indexRows = scan[scanRange] ?? [];
  const rowNumbers: number[] = [];
  for (let i = 1; i < indexRows.length; i++) {
    if (ids.has(String(indexRows[i]?.[0] ?? ""))) rowNumbers.push(i + 1);
  }
  const ranges = compressRowRanges(sheet, "L", rowNumbers);
  const exact = await sheetsBatchGet(spreadsheetId, ranges);
  const header = scan[headerRange]?.[0] ?? [];
  return {
    rows: header.length ? [header, ...ranges.flatMap((r) => exact[r] ?? [])] : [],
    readPlan: [
      `ARCHIVE:${sheet}:INDEX_SCAN`,
      ...ranges.map(() => `ARCHIVE:${sheet}:BOUNDED`),
    ],
    exactRangeCount: ranges.length,
  };
}
