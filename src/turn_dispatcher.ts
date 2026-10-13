/** Read-only mechanical routing and durable System reminders derived from live rows.
 * This NEVER invokes or authorizes semantic writes or makes choices for Shura.
 */
export type SourceRow = Record<string, unknown>;

const field = (r: SourceRow, key: string) => String(r[key] ?? "").trim();
const active = (r: SourceRow) => field(r, "Status").toUpperCase() === "ACTIVE";
const contactTags = new Set(["CHAT", "CONTACT", "CONTACTS", "MESSAGE", "MESSAGES", "USER_LINK", "COMMS"]);
const workTags = new Set(["WORK", "JOB", "BOARD", "ECONOMY", "CRAFT", "PROJECT", "TRADE"]);
const learningTags = new Set(["WORK", "STUDY", "TRAINING", "CRAFT", "RESEARCH", "COMBAT", "SURVIVAL", "MAGIC", "LANGUAGE", "SKILL", "ART", "DRAW", "DRAFT", "ENGINEERING", "BOWYER"]);
const worldTags = new Set(["WORLD", "REST", "TRAVEL", "WORK", "CRAFT", "WAIT", "NPC", "PROJECT", "ECONOMY"]);
const has = (tags: ReadonlySet<string>, candidates: ReadonlySet<string>) =>
  [...candidates].some((tag) => tags.has(tag));

export function contactActorIdsForRequest(
  tagsInput: readonly string[],
  contacts: readonly SourceRow[],
): string[] {
  const tags = new Set(tagsInput.map((t) => t.toUpperCase()));
  if (!has(tags, contactTags)) return [];
  return [...new Set(contacts
    .filter((r) => active(r) && field(r, "Consent").toUpperCase() === "TRUE" &&
      field(r, "Owner Actor ID") === "player.shura")
    .map((r) => field(r, "Peer Actor ID")).filter((id) => /^npc\.[a-z0-9_.-]+$/i.test(id)))];
}

export function buildTurnBrief(input: {
  turnClass: string;
  tags: readonly string[];
  contacts: readonly SourceRow[];
  pendingChoices: readonly SourceRow[];
  recentChatByActor?: Readonly<Record<string, readonly SourceRow[]>>;
  actorIdsLoaded?: readonly string[];
  sourceOnlyOfferBoard?: unknown;
  worldAgenda?: readonly {processId?:string;nextReviewAt?:string|null;reviewStatus?:string}[];
}) {
  const tags = new Set(input.tags.map((t) => t.toUpperCase()));
  const messageActors = new Set(input.actorIdsLoaded ?? []);
  const messages = input.recentChatByActor ?? {};
  const contacts = input.contacts
    .filter((r) => active(r) && field(r, "Owner Actor ID") === "player.shura" &&
      field(r, "Consent").toUpperCase() === "TRUE")
    .map((r) => {
      const peerActorId = field(r, "Peer Actor ID");
      const chat = messageActors.has(peerActorId) ? messages[peerActorId] ?? [] : [];
      const last = chat.length ? chat[chat.length - 1] : null;
      const cachedAt = field(r, "Last message at") || null;
      const lastActualAt = last ? field(last, "Timestamp") || null : null;
      return {
        contactId: field(r, "Contact ID"),
        peerActorId,
        name: field(r, "Peer display"),
        channelActive: true,
        historyLoaded: messageActors.has(peerActorId),
        lastLoggedMessageAt: lastActualAt,
        lastLoggedMessageId: last ? field(last, "Message ID") : null,
        lastCachedAt: cachedAt,
        cacheMayBeStale: lastActualAt != null && cachedAt !== lastActualAt,
        lastMessageDirection: last ? field(last, "Direction") : null,
        lastMessageDelivery: last ? field(last, "Delivery") : null,
        unansweredOutgoing: !!last && field(last, "Direction") === "OUT",
        replyGuaranteed: false,
        // No claimed incoming messages, read receipts or replies when history wasn't loaded.
      };
    });
  const pendingChoices = input.pendingChoices
    .filter((r) => {
      const status = field(r, "Status").toUpperCase();
      return status.startsWith("PENDING") || status === "OPEN" || status === "AWAITING_CHOICE";
    })
    .map((r) => ({
      choiceId: field(r, "Choice ID"),
      parentId: field(r, "Parent ID"),
      status: field(r, "Status"),
      optionsGenerated: (() => {
        try {
          const options: unknown = JSON.parse(field(r, "Options JSON") || "[]");
          return Array.isArray(options) && options.length > 0;
        } catch { return false; }
      })(),
      requiresPlayerChoice: true,
    }));
  const checks = [
    {id:"causality",mandatory:true,note:"Validate physical and NPC evidence; V3 proposals are not authority"},
    {id:"xp_review",mandatory:true,note:"Document eligible learning/general XP or a source-based zero; do not farm repetition"},
    {id:"live_clock",mandatory:true,note:"Advance only elapsed in-world time; meta work costs zero"},
    {id:"custody_and_money",mandatory:true,note:"Single item custody, bounded source budgets, exactly-once debits/receipts"},
    {id:"player_choice",mandatory:true,note:"Never auto-select milestones, paths, contacts, contracts or SUP spending"},
    {id:"commit_gate",mandatory:true,note:"Prepare complex events, semantic commit only; render after success"},
  ];
  const modules = [
    "progression_review",
    "world_continuity",
    ...(has(tags, learningTags) ? ["competence_learning", "specializations"] : []),
    ...(has(tags, workTags) ? ["live_offer_discovery", "finite_funding_preflight", "staffed_orders"] : []),
    ...(has(tags, worldTags) ? ["npc_life_v4", "active_world_processes", "survival_time"] : []),
    ...(has(tags, contactTags) ? ["system_contact_messages", "npc_knowledge_gate"] : []),
  ];
  return {
    schema:"GM_TURN_BRIEF_V1",
    mode:"READ_ONLY_PLAN",
    commitAuthorized:false,
    autoExecutedOperations:input.sourceOnlyOfferBoard != null ? ["offer_board.CURRENT_SOURCE_ONLY"] : [],
    sourceOnlyOfferBoard:input.sourceOnlyOfferBoard ?? null,
    gameTimeAdvancedSeconds:0,
    turnClass:input.turnClass,
    modules:[...new Set(modules)],
    checks,
    systemInbox:{contacts,pendingChoices},
    reminders:[
      ...(input.worldAgenda ?? []).filter((process) =>
        ["DUE", "OVERDUE"].includes(String(process.reviewStatus ?? "").toUpperCase())
      ).map((process) => ({
        id:"reminder." + process.processId,
        kind:"WORLD_PROCESS_REVIEW",
        status:process.reviewStatus ?? "DUE",
        nextReviewAt:process.nextReviewAt ?? null,
        note:"Review causal owner actions and staffed work; a due clock does not prove a completed event.",
      })),
      ...pendingChoices.map((c) => ({
        id:"reminder."+c.choiceId,
        kind:"PLAYER_MILESTONE_CHOICE",
        status:c.optionsGenerated ? "AWAITING_PLAYER_CHOICE" : "NEEDS_CANONICAL_OPTIONS",
        note:c.optionsGenerated
          ? "Offer the committed canonical options without selecting one."
          : "Generate and validate real canonical options before asking player to choose. Never invent a selected option.",
      })),
    ],
    limitations:[
      "This packet is a checklist, not evidence of simulation, an NPC action, a payment or a player choice.",
      "Committed level changes must be rendered from commit outcomes; proposals are never notifications.",
      "System Link contacts are private one-to-one; offscreen NPCs do not automatically answer.",
      "EC-06 finance stays behind the atomic ledger, source-funding and writer-quiescence gates.",
      "Offer-board preview is READ_ONLY and does not prove funding or authorize a work contract.",
    ],
  };
}
