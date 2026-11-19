/** Self-describing RPG Runtime Bridge GM handbook.
 * Read-only guidance, not state, rules evidence, a hidden NPC action, or a
 * replacement for source-attested tool results.
 * This module and its new MCP route are development-branch features until deployed.
 */
export const RPG_BRIDGE_GM_GUIDE_VERSION="RPG_BRIDGE_GM_GUIDE_V1_2026-11-19";
export const RPG_LAB_SCENE_REMINDER=[
 "RPG Lab / GM-only: Read saved actor context BEFORE consequential NPC narration.",
 "Do not convert GM-private memories to player knowledge; only the witness or a source-backed relay knows.",
 "Check protagonist visibleFeatures for fresh NPC first sightings; another NPC's habituation is not transferable.",
 "Resolve mood, flaws, canon values, personal desires, grudges, promises and NPC-to-NPC plans before prose.",
 "A surprising technology needs evidence-scoped consequences: measured is not reported; avoid unsupported extrapolations.",
 "Advance due world projects only with an owner, resources, grounded blocker or confirmed result. No player-triggered-only freezing.",
 "Strict RPG Lab commits require narrationPlan for consequential NPC events and matching session CAS revision.",
 "A read-only preview is NEVER a committed outcome. No invented XP, money, loot, Falna, research progress or offscreen knowledge.",
 "Do not force praise, reconciliation, etiquette or NPC cooperation. Do not force vulgarity in every scene either.",
 "Narration text remains a creative GM task; deterministic checks verify tagged source consistency, NOT flawless canonical voice.",
] as const;
export function getRpgBridgeGmGuide(){
 return {
  schema:RPG_BRIDGE_GM_GUIDE_VERSION,
  audience:"GM_ONLY" as const,readOnly:true as const,
  committed:false as const,modifiesSave:false as const,
  guideIsNotCanon:true as const,
  modeSelection:{
   legacy:"Classic Shura/V2 save, controlled by current saveId. Use runtime_health/get_turn_context/prepare_turn/commit_turn; do not impersonate RPG Lab campaign.",
   rpgLab:"Separate projectId+sessionId+session revision. Use rpg_lab_read_session/rpg_lab_scene_context/rpg_lab_commit_event. Never use legacy saveId as lab revision.",
  },
  tools:[
   {name:"rpg_runtime_guide",kind:"READ",use:"This read-only handbook; use after a context reset"},
   {name:"runtime_health",kind:"READ",use:"Check active runtime/save and live availability"},
   {name:"get_turn_context",kind:"READ",use:"Read actual legacy campaign clock, source data, actor gate and blockers"},
   {name:"prepare_turn",kind:"PREVIEW",use:"Prepare legacy turn. Successful prepare does not commit"},
   {name:"commit_turn",kind:"WRITE",use:"Commit verified legacy turn, only when the story turn actually occurs"},
   {name:"simulate_world_v3",kind:"PREVIEW",use:"Read-only causal calculations (up to 12 jobs), never auto-commit NPC decisions or rewards"},
   {name:"rpg_lab_create_campaign",kind:"WRITE",use:"Create isolated RPG Lab campaign only upon explicit player request"},
   {name:"rpg_lab_read_session",kind:"READ",use:"Read saved RPG Lab clock, state and authoritative session revision"},
   {name:"rpg_lab_scene_context",kind:"READ",use:"Before NPC scenes: read per-actor canon, mood, familiarity, knowledge, decisions and open projects"},
   {name:"rpg_lab_review_narration",kind:"READ",use:"Evaluate structured draft beats against saved facts/claims; not a literary critic"},
   {name:"rpg_lab_commit_event",kind:"WRITE",use:"Commit one source-backed RPG Lab event with exact expectedRevision; strict NPC turns require narrationPlan"},
   {name:"rpg_lab_read_event",kind:"READ",use:"Recover confirmed event by exact sourceRef, even after active journal compaction"},
   {name:"render_current_hud",kind:"DISPLAY",use:"Show authoritative current legacy player HUD, not a guessed RPG Lab HUD"},
   {name:"render_system_event",kind:"DISPLAY",use:"Display confirmed or informational system event with correct source and receipts"},
  ],
  rpgLabQuickLoop:[
   "1. Identify the *real* projectId, sessionId, actor IDs and current revision. Do not guess IDs.",
   "2. Call rpg_lab_scene_context for all important scene actors. If time will pass, also read due projects with toMinute.",
   "3. Resolve each NPC's own intentions, sources of knowledge, mood, relationships and canon before drafting outcomes.",
   "4. For extraordinary claims, record worldEvidence kind/level/scope/method/witnesses; do not turn rumors into proof.",
   "5. For offscreen work, record worldProjectChanges owner/stage/review time, or a grounded refusal/blocker.",
   "6. In a strict campaign, supply event.narrationPlan{npcIds,beats}; each consequential actor has source-backed reaction/action.",
   "7. Commit once with rpg_lab_commit_event and matching expectedRevision; on failure, reload/reconcile. Never narrate a refused commit as completed.",
   "8. Optionally call rpg_lab_review_narration and use the result to check grounded scene beats; then render natural dialogue.",
  ],
  npcKnowledgeRule:"The world ledger may prove something; a given NPC knows only what they witnessed, inferred, or heard from a traced source.",
  exampleFacts:{
   daedalus:"The halo/clock-eye appearance persists globally; only characters who saw them have personal first-hand memory.",
   rifle:"A pierced plate is evidence of that plate's penetration, not measured bullet velocity or certainty against a high-level adventurer.",
   hephaestus:"Two tested 2mm strands may be established; a separate 10mm 25-tonne assertion remains unverified until a fitting test.",
  },
  autonomyAndCanon:[
   "NPCs have goals and interpersonal behavior offscreen; schedule and resource limits still apply.",
   "A canon flaw, crude joke, temporary resentment, jealousy or conflict is permitted when grounded; nothing auto-cleans the mood.",
   "Avoid both flattering the protagonist and artificially inserting hostility or lewdness in every turn.",
   "NPC profile data is a constraint and context, not a source of automatic friendship or skill.",
  ],
  guardrails:[
   "Never assume the tool has been deployed because its GitHub code exists.",
   "Do not share GM-only NPC thoughts, future project outcomes or hidden causal evidence with the player.",
   "Meta discussion has zero in-world time; do not commit invented game actions.",
   "Do not create/overwrite unrelated saves or transfer knowledge and statistics between campaigns.",
   "A model can still skip tool calls; this guide does not grant runtime enforcement beyond strict server-side commit checks.",
  ],
 };
}
