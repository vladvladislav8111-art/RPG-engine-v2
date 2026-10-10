type Cell = unknown;
type Rows = Cell[][];

function valueFor(rows: Rows, key: string): string {
  const row = rows.find((r) => String(r[0] ?? "").trim() === key);
  return String(row?.[1] ?? "").trim();
}

/** ACTIVE_CONTEXT is a derived routing hint, never an independent scene truth. */
export function resolveSceneActorIds(controlRows: Rows, activeRows: Rows): string[] {
  const currentScene = valueFor(controlRows, "current_scene_id");
  const currentLocation = valueFor(controlRows, "current_location_id");
  const cacheScene = valueFor(activeRows, "scene");
  const cacheLocation = valueFor(activeRows, "location");
  if (!currentScene || !currentLocation || cacheScene !== currentScene ||
      cacheLocation !== currentLocation) return [];
  return [...new Set(valueFor(activeRows, "participating_npc")
    .split(/[;,]/)
    .map((id) => id.trim())
    .filter((id) => /^npc\.[a-z0-9_.-]+$/i.test(id)))];
}
