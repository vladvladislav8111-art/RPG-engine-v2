import { hash32 } from "./rng.ts";

export type TarenLexeme = {
  id: string;
  form: string;
  meaning: string;
  pos: string;
  domain: string;
  conceptKey: string;
  playerKnown: boolean;
};

function idx(headers: string[], name: string): number {
  return headers.indexOf(name);
}

export function parseTarenLexicon(rows: unknown[][]): TarenLexeme[] {
  if (!rows.length) return [];
  const h = rows[0].map((x) => String(x ?? ""));
  return rows.slice(1).filter((r) => String(r[idx(h, "Lexeme ID")] ?? "") !== "").map((r) => ({
    id: String(r[idx(h, "Lexeme ID")] ?? ""),
    form: String(r[idx(h, "Form")] ?? ""),
    meaning: String(r[idx(h, "Canonical meaning")] ?? ""),
    pos: String(r[idx(h, "POS")] ?? ""),
    domain: String(r[idx(h, "Domain")] ?? ""),
    conceptKey: String(r[idx(h, "Concept key")] ?? ""),
    playerKnown: String(r[idx(h, "Player known by T0275")] ?? "").toUpperCase() === "TRUE",
  }));
}

export function findTarenLexeme(lexicon: TarenLexeme[], conceptOrForm: string): TarenLexeme | null {
  const q = conceptOrForm.trim().toLocaleLowerCase();
  return lexicon.find((x) =>
    x.conceptKey.toLocaleLowerCase() === q ||
    x.form.toLocaleLowerCase() === q ||
    x.meaning.toLocaleLowerCase() === q
  ) ?? null;
}

const ONSETS = ["", "п", "б", "т", "д", "к", "г", "ф", "в", "с", "з", "ш", "ж", "х", "м", "н", "р", "л"];
const VOWELS = ["а", "е", "э", "и", "о", "у"];
const CODAS = ["", "", "", "н", "р", "л", "м", "с", "ш", "к", "т", "в"];

function accentFirst(form: string): string {
  const map: Record<string, string> = { а: "а́", е: "е́", э: "э́", и: "и́", о: "о́", у: "у́" };
  return form.replace(/[аеэиоу]/, (m) => map[m] ?? m);
}

function generatedRoot(conceptKey: string, salt: number): string {
  const h = hash32(`taren|${conceptKey}|${salt}`);
  const syllables = 1 + ((h >>> 3) % 2);
  let x = h;
  let out = "";
  for (let i = 0; i < syllables; i++) {
    out += ONSETS[x % ONSETS.length];
    x = Math.imul(x ^ 0x9e3779b9, 2654435761) >>> 0;
    out += VOWELS[x % VOWELS.length];
    x = Math.imul(x ^ 0x85ebca6b, 2246822519) >>> 0;
    if (i === syllables - 1 || ((x >>> 5) & 1)) out += CODAS[x % CODAS.length];
    x = Math.imul(x ^ 0xc2b2ae35, 3266489917) >>> 0;
  }
  return out || "ан";
}

export function proposeTarenLexeme(lexicon: TarenLexeme[], conceptKey: string): {
  status: "CANON" | "PROPOSED";
  lexeme: TarenLexeme;
} {
  const existing = findTarenLexeme(lexicon, conceptKey);
  if (existing) return { status: "CANON", lexeme: existing };
  const used = new Set(lexicon.map((x) => x.form.replace(/[́]/g, "")));
  let root = "";
  let salt = 0;
  do root = generatedRoot(conceptKey, salt++); while (used.has(root) && salt < 100);
  const form = accentFirst(root);
  const hex = hash32(`taren-concept|${conceptKey}`).toString(16).padStart(8, "0");
  return {
    status: "PROPOSED",
    lexeme: {
      id: `lang.taren.generated.${hex}`,
      form,
      meaning: conceptKey,
      pos: "unassigned",
      domain: "unassigned",
      conceptKey,
      playerKnown: false,
    },
  };
}
