/** Public read-only source build label. Not a save migration or live session.
 * Deno Deploy must serve this marker before a rollout is considered verified.
 */
export const ORARIO_PLAYER_RELEASE={
 version:"danmachi-solo-chroma-rpg-lab-v1-2026-11-20",
 branch:"main",
 features:["player_system","falna_buff","orario_combat","shadow_army",
  "system_instances","npc_suspicion","cas_save",
  "chroma_palette_persistence","chroma_orario_gate_start",
  "danmachi_deep_cores_70","npc_feature_habituation"] as const,
 noAutomaticCampaignCreation:true
} as const;
