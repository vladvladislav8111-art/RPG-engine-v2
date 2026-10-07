export const TABLES = {
  CONTROL: { range: "CONTROL!A1:D100", keyHeader: "Key" },
  PLAYER_RESOURCES: { range: "PLAYER_RESOURCES!A1:D100", keyHeader: "Resource" },
  CHARACTERISTICS: { range: "CHARACTERISTICS!A1:H100", keyHeader: "Characteristic" },
  CHARACTERISTIC_ADAPTATION: { range: "CHARACTERISTIC_ADAPTATION!A1:L100", keyHeader: "Characteristic" },
  PLAYER_CONDITIONS: { range: "PLAYER_CONDITIONS!A1:F100", keyHeader: "Condition ID" },
  SYSTEM_MODULES_CURRENT: { range: "SYSTEM_MODULES_CURRENT!A1:G200", keyHeader: "Module ID" },
  COMPETENCES: { range: "COMPETENCES!A1:L100", keyHeader: "Competence ID" },
  SPECIALIZATIONS: { range: "SPECIALIZATIONS!A1:I200", keyHeader: "Specialization" },
  MILESTONES: { range: "MILESTONES!A1:K100", keyHeader: "Milestone ID" },
  PENDING_CHOICES: { range: "PENDING_CHOICES!A1:L300", keyHeader: "Choice ID" },
  INVENTORY_CURRENT: { range: "INVENTORY_CURRENT!A1:M500", keyHeader: "Item ID" },
  OPPORTUNITIES_CURRENT: { range: "OPPORTUNITIES_CURRENT!A1:N500", keyHeader: "Offer ID" },
  PROJECTS_CURRENT: { range: "PROJECTS_CURRENT!A1:N500", keyHeader: "Project ID" },
  NPC_CURRENT: { range: "NPC_CURRENT!A1:N500", keyHeader: "NPC ID" },
  NPC_KNOWLEDGE: { range: "NPC_KNOWLEDGE!A1:J2000", keyHeader: "Fact ID" },
  SOCIAL_MEMORY_CURRENT: { range: "SOCIAL_MEMORY_CURRENT!A1:M500", keyHeader: "Memory ID" },
  OPEN_THREADS_CURRENT: { range: "OPEN_THREADS_CURRENT!A1:N300", keyHeader: "Thread ID" },
  PLAYER_LANGUAGE: { range: "PLAYER_LANGUAGE!A1:L100", keyHeader: "Language ID" },
  PLAYER_LEXICON: { range: "PLAYER_LEXICON!A1:L1000", keyHeader: "Entry ID" },
  PLAYER_GRAMMAR: { range: "PLAYER_GRAMMAR!A1:K300", keyHeader: "Grammar ID" },
  PROGRESSION_EVENTS: { range: "PROGRESSION_EVENTS!A1:N2000", keyHeader: "TX ID" },
  SESSION_LOG: { range: "SESSION_LOG!A1:P5000", keyHeader: "Turn ID" },
  SYSTEM_CHAT_LOG: { range: "SYSTEM_CHAT_LOG!A1:J5000", keyHeader: "Message ID" },
  SERVICES_CURRENT: { range: "SERVICES_CURRENT!A1:L500", keyHeader: "Service ID" },
  MAP_KNOWLEDGE_CURRENT: { range: "MAP_KNOWLEDGE_CURRENT!A1:J1500", keyHeader: "Marker ID" },
  ENTITY_INDEX: { range: "ENTITY_INDEX!A1:L1000", keyHeader: "Entity ID" },
  WORLD_CLOCKS: { range: "WORLD_CLOCKS!A1:H200", keyHeader: "Process ID" },
  WEATHER_CURRENT: { range: "WEATHER_CURRENT!A1:J100", keyHeader: "Weather ID" },
  BODY_INJURIES_CURRENT: { range: "BODY_INJURIES_CURRENT!A1:P500", keyHeader: "Injury ID" },
  ACTIVE_CONTEXT: { range: "ACTIVE_CONTEXT!A1:H50", keyHeader: "Slot" },
} as const;

export type RuntimeTableName = keyof typeof TABLES;

export const PREGEN_TABLES = {
  RULES_COMPILED: "RULES_COMPILED!A1:L500",
  TAREN_LANGUAGE_META: "TAREN_LANGUAGE_META!A1:J200",
  TAREN_PHONOLOGY: "TAREN_PHONOLOGY!A1:L300",
  TAREN_ORTHOGRAPHY: "TAREN_ORTHOGRAPHY!A1:L300",
  TAREN_GRAMMAR: "TAREN_GRAMMAR!A1:N500",
  TAREN_DERIVATION: "TAREN_DERIVATION!A1:N500",
  TAREN_LEXICON: "TAREN_LEXICON!A1:N3000",
  TAREN_DOMAIN_LEXICON: "TAREN_DOMAIN_LEXICON!A1:L1500",
  DISTRICT_PACKS: "DISTRICT_PACKS!A1:N500",
  SERVICE_DIRECTORY: "SERVICE_DIRECTORY!A1:N1500",
  ENTITY_BLUEPRINTS: "ENTITY_BLUEPRINTS!A1:N1000",
  COMMON_OBJECT_TEMPLATES: "COMMON_OBJECT_TEMPLATES!A1:N1000",
  ACTION_STAMINA_PROFILES: "ACTION_STAMINA_PROFILES!A1:P500",
  REST_PROFILES: "REST_PROFILES!A1:P500",
  INJURY_SEVERITY: "INJURY_SEVERITY!A1:P500",
  HIT_LOCATION_PROFILES: "HIT_LOCATION_PROFILES!A1:P500",
  TOXIN_PROFILES: "TOXIN_PROFILES!A1:P500",
} as const;

export function columnLetter(indexZeroBased: number): string {
  let n = indexZeroBased + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function rowRange(sheet: string, rowOneBased: number, width: number): string {
  return `${sheet}!A${rowOneBased}:${columnLetter(width - 1)}${rowOneBased}`;
}

export function sheetNameFromRange(range: string): string {
  return range.split("!")[0];
}

export function headers(rows: unknown[][]): string[] {
  return (rows[0] ?? []).map((v) => String(v ?? ""));
}

export function headerIndex(rows: unknown[][], name: string): number {
  const i = headers(rows).indexOf(name);
  if (i < 0) throw new Error(`Missing header '${name}'`);
  return i;
}

export function findDataRow(rows: unknown[][], header: string, key: unknown): number {
  if (!rows.length) return -1;
  const i = headerIndex(rows, header);
  return rows.slice(1).findIndex((r) => String(r[i] ?? "") === String(key));
}

export function cloneRow(rows: unknown[][], dataIndex: number): unknown[] {
  const width = headers(rows).length;
  if (dataIndex < 0) return Array(width).fill("");
  return Array.from({ length: width }, (_, i) => rows[dataIndex + 1]?.[i] ?? "");
}

export function setByHeader(rows: unknown[][], row: unknown[], header: string, value: unknown): void {
  row[headerIndex(rows, header)] = value;
}
