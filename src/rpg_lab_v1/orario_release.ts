/** Public read-only source build label. Not a save migration or live session.
 * Deno Deploy must serve this marker before a rollout is considered verified.
 */
export const ORARIO_PLAYER_RELEASE={
 version:"danmachi-solo-player-lab-v1-2026-11-20",
 branch:"main",
 features:["player_system","falna_buff","orario_combat","shadow_army",
  "system_instances","npc_suspicion","cas_save"] as const,
 noAutomaticCampaignCreation:true
} as const;
