import { compressRowRanges } from "../src/bounded_context.ts";

Deno.test("bounded context compresses adjacent rows into exact ranges", () => {
  const ranges = compressRowRanges("NPC_KNOWLEDGE", "J", [2, 3, 4, 8, 10, 11]);
  const expected = [
    "NPC_KNOWLEDGE!A2:J4",
    "NPC_KNOWLEDGE!A8:J8",
    "NPC_KNOWLEDGE!A10:J11",
  ];
  if (JSON.stringify(ranges) !== JSON.stringify(expected)) {
    throw new Error(`unexpected ranges: ${JSON.stringify(ranges)}`);
  }
});
