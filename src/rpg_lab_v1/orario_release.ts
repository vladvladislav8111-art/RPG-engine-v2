/** Public read-only source build label. Not a save migration or live session.
 * Deno Deploy must serve this marker before a rollout is considered verified.
 */
export const ORARIO_PLAYER_RELEASE={
 version:"danmachi-solo-chroma-rpg-lab-v3.1-2026-11-23",
 branch:"main",
 features:["player_system","falna_buff","orario_combat","shadow_army",
  "system_instances","npc_suspicion","cas_save",
  "chroma_palette_persistence","chroma_orario_gate_start",
  "danmachi_deep_cores_70","npc_feature_habituation",
  "chroma_threat_tiers","chroma_sprint_mastery","chroma_post_cadence_5",
  "chroma_personal_memory_cues","chroma_d3_xp_repair",
  "chroma_d3_full_510_reconcile","chroma_higher_threat_xp_bonus",
  "quicksilver_evolution_reaction","chroma_skill_training",
  "canon_dagger_technique_damage_and_speed","canon_critical_throw_skill_gates"] as const,
 noAutomaticCampaignCreation:true
} as const;
