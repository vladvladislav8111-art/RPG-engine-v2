export function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (const ch of input) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function seededRandom(seedText: string): () => number {
  let x = hash32(seedText) || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export function intBetween(seedText: string, min: number, max: number): number {
  const r = seededRandom(seedText)();
  return min + Math.floor(r * (max - min + 1));
}
