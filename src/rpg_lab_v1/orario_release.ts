/** Public read-only source build label. Not a save migration or live session.
 * Deno Deploy must serve this marker before a rollout is considered verified.
 */
export const ORARIO_PLAYER_RELEASE={
 version:"danmachi-solo-chroma-rpg-lab-v4.7-2026-11-24",
 branch:"main",
 features:["player_system","falna_buff","orario_combat","shadow_army",
  "system_instances","npc_suspicion","cas_save",
  "chroma_palette_persistence","chroma_orario_gate_start",
  "danmachi_deep_cores_70","npc_feature_habituation",
  "chroma_threat_tiers","chroma_sprint_mastery","chroma_post_cadence_5",
  "chroma_personal_memory_cues","chroma_d3_xp_repair",
  "chroma_d3_full_510_reconcile","chroma_higher_threat_xp_bonus",
  "quicksilver_evolution_reaction","chroma_skill_training",
  "canon_dagger_technique_damage_and_speed","canon_critical_throw_skill_gates",
  "hapjeong_three_canon_stages","briga_razan_encounters",
  "proof_backed_wolf_slayer","earned_return_crystal_retreat",
  "razan_briga_xp_balance_and_proven_correction",
  "kasaka_two_canon_rewards_and_earned_fang",
  "kasaka_venom_permanent_tradeoff","guild_verified_bulk_stone_sale",
  "chroma_steel_dagger_equipment_swap",
  "preexisting_kandiaru_poison_protection",
  "chroma_proven_venom_debuff_correction"] as const,
 noAutomaticCampaignCreation:true
} as const;
