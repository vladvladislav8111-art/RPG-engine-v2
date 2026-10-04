import { RULESET_VERSION } from "./rules.ts";

function enc(input: string): string {
  return btoa(unescape(encodeURIComponent(input))).replace(/=+$/g, "");
}

export function makeTurnToken(input: {
  saveId: string;
  worldDay: unknown;
  worldTime: unknown;
  locationId: unknown;
  sceneId: unknown;
}): string {
  const raw = [
    input.saveId,
    String(input.worldDay ?? ""),
    String(input.worldTime ?? ""),
    String(input.locationId ?? ""),
    String(input.sceneId ?? ""),
    RULESET_VERSION,
  ].join("|");
  return `v2.2:${enc(raw)}`;
}
