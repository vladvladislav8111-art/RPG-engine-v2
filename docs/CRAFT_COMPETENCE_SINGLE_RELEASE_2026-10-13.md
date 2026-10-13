# RPG V2 — competency and craft single-release contract

One engine release; existing Deno backend, Site, MCP tool identities, Bearer authentication, Google workbook and semantic writer unchanged.

Task specializations are distinct:
- Сборка и подгонка: fitting an already designed kit, no bow-making transfer.
- Лукоделие: bow design feedback, limbs, construction and tuning, distinct from combat Bow.
- Ножеделие: blade production, not a kit assembly synonym.
- Рисование: pictorial art, not dimensioned mechanical plans.
- Техническое черчение: measured engineering documentation and model consistency, not a guarantee that a mechanism is safe.
- Cooking, record audits and trade negotiations keep separate established paths.

Two optional new competence roots, Art and Engineering, can first appear only via evidenced player-directed ongoing practice. They are not automatically owned by Shura. New specializations require UNLOCKABLE_CANON entries in the existing GM PREGEN registry before the semantic writer can unlock them.

Capability calculations use only bounded live TEMP_RUNTIME COMPETENCES, SPECIALIZATIONS, CHARACTERISTICS. The new capability_check operation and craft_advance enrichment are READ_ONLY_PROPOSALS; profile-specific difficulty is an unverified GM input. Result quality, raw materials, travel, NPC work and custody are never granted by this calculator. Source-bound stamina and material conservation remain in the existing pipelines. No automatic retroactive award, free star, objective, SUP, cash or player decision.

Release gates: Deno check + all tests + existing KV CI; no tests against live save; no production deployment without fully passing checks. Preserve all prior semantic writer invariants and no duplicate sourceRef reward.
