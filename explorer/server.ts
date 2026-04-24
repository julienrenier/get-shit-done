#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Disk persistence
// ─────────────────────────────────────────────────────────────────────────────
// On every state mutation, the server writes two artifacts under
// `${memory.paths.phase_dir}`:
//   1. `${padded_phase}-CONTEXT.md`          — canonical discuss-phase output
//   2. `${padded_phase}-EXPLORER-STATE.json` — raw state dump (memory+history+
//                                              advisor_queue+chat_sessions) so
//                                              the server can rehydrate after
//                                              a crash / `bun --watch` reload.
//
// To rehydrate at boot, set EXPLORER_RESUME_PATH to the JSON dump path, e.g.
//   EXPLORER_RESUME_PATH=.planning/phases/10-.../10-EXPLORER-STATE.json bun server.ts
// ─────────────────────────────────────────────────────────────────────────────

const grayAreaSchema = z.object({
  label: z.string().min(1),
  questions: z.array(z.string().min(1)).min(1).max(2),
  annotation: z.string().optional(),
});

const priorDecisionSchema = z.object({
  phase: z.string(),
  decision: z.string(),
});

const canonicalRefSchema = z.object({
  path: z.string(),
  note: z.string().optional(),
});

const specSchema = z.object({
  loaded: z.boolean(),
  locked_requirements: z
    .object({
      goal: z.string().optional(),
      boundaries: z.array(z.string()).optional(),
      constraints: z.array(z.string()).optional(),
      acceptance_criteria: z.array(z.string()).optional(),
    })
    .optional(),
});

const pathsSchema = z.object({
  phase_dir: z.string(),
  padded_phase: z.string(),
  phase_slug: z.string(),
});

const configSchema = z.object({
  research_before_questions: z.boolean().default(false),
  thinking_partner: z.boolean().default(false),
});

const modeSchema = z.enum(["advisor", "auto", "default"]);
const overlaySchema = z.enum(["text", "batch", "analyze"]);

const decisionSchema = z.object({
  area: z.string(),
  decision: z.string(),
  rationale: z.string().optional(),
});

const discussionLogEntrySchema = z.object({
  area: z.string(),
  question: z.string(),
  options: z.array(z.string()).default([]),
  selection: z.string(),
  notes: z.string().optional(),
});

const deferredIdeaSchema = z.object({
  idea: z.string(),
  origin_area: z.string().optional(),
});

const analysisOptionSchema = z.object({
  name: z.string(),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
});

const analysisSchema = z.object({
  area: z.string(),
  options: z.array(analysisOptionSchema).min(2).max(3),
  recommendation: z.object({
    option: z.string(),
    rationale: z.string(),
    cites: z.array(z.string()).default([]),
  }),
  generic: z.boolean().default(false),
});

const discussionRecordSchema = {
  phase: z.string().optional(),
  domain: z.string().optional(),
  paths: pathsSchema,
  mode: modeSchema.default("default"),
  overlays: z.array(overlaySchema).default([]),
  config: configSchema.default({
    research_before_questions: false,
    thinking_partner: false,
  }),
  spec: specSchema.default({ loaded: false }),

  gray_areas: z.array(grayAreaSchema).min(1).max(4),
  prior_decisions: z.array(priorDecisionSchema).default([]),
  codebase_context: z.string().optional(),

  decisions: z.array(decisionSchema).default([]),
  discussion_log: z.array(discussionLogEntrySchema).default([]),
  deferred_ideas: z.array(deferredIdeaSchema).default([]),
  canonical_refs: z.array(canonicalRefSchema).default([]),
  analysis: z.array(analysisSchema).default([]),
};

type DiscussionRecord = z.infer<z.ZodObject<typeof discussionRecordSchema>>;

let memory: DiscussionRecord | null = null;
const history: Array<{ at: string; record: DiscussionRecord }> = [];

type AdvisorRequest = {
  area: string;
  requested_at: string;
  status: "pending" | "running" | "done";
  completed_at?: string;
};
let advisor_queue: AdvisorRequest[] = [];

type ChatMessage = { role: "user" | "assistant"; content: string; at: string };
type ChatSession = {
  area: string;
  messages: ChatMessage[];
  status: "idle" | "thinking" | "waiting_user" | "done";
  started_at: string;
  last_activity: string;
};
const chat_sessions = new Map<string, ChatSession>();

// ─────────────────────────────────────────────────────────────────────────────
// json-render option menu (for user validation in the webview)
// ─────────────────────────────────────────────────────────────────────────────

type JsonRenderOption = {
  id: string;
  group: string;
  groupTitle: string;
  title: string;
  description: string;
  usage: string;
  cost: "S" | "M" | "L";
};

const json_render_options: JsonRenderOption[] = [
  // A — Data-binding dynamique & réactivité
  { id: "A1", group: "A", groupTitle: "Data-binding dynamique & réactivité", title: "$state / $bindState", description: "Lier un prop à un chemin du StateStore.", usage: "Label du bouton advisor devient { $bindState: '/queue/.../status' } — pas de rebuild sur poll.", cost: "S" },
  { id: "A2", group: "A", groupTitle: "Data-binding dynamique & réactivité", title: "$template", description: "Interpolation inline 'Area ${/selected} — ${/score}/100'.", usage: "Header dynamique sans JSX custom.", cost: "S" },
  { id: "A3", group: "A", groupTitle: "Data-binding dynamique & réactivité", title: "$cond / $then / $else", description: "Prop conditionnel évalué par expression.", usage: "variant: { $cond: {$state:'/queue/X/status', eq:'running'}, $then:'secondary', $else:'primary' }.", cost: "S" },
  { id: "A4", group: "A", groupTitle: "Data-binding dynamique & réactivité", title: "$computed", description: "Appel d'une fonction custom enregistrée dans registry.", usage: "text: { $computed: 'formatMessageCount', args: { chat: {$state:'/chats/X'} } }.", cost: "M" },
  { id: "A5", group: "A", groupTitle: "Data-binding dynamique & réactivité", title: "Visibility conditions", description: "Montrer/cacher un widget selon state.", usage: "Cacher advisor-trigger si status=done, montrer decision-picker uniquement si analysis non-vide.", cost: "S" },
  { id: "A6", group: "A", groupTitle: "Data-binding dynamique & réactivité", title: "State watchers (watch field)", description: "Déclencher une action quand un path change.", usage: "Quand /selected change → action loadChatContext qui fetch /chat/:area.", cost: "M" },

  // B — Validation
  { id: "B1", group: "B", groupTitle: "Validation", title: "check.required/email/url/pattern", description: "Validation de champ form via helpers TS.", usage: "Input chat : required('message vide interdit').", cost: "S" },
  { id: "B2", group: "B", groupTitle: "Validation", title: "check.matches / check.requiredIf", description: "Validation croisée entre champs.", usage: "Si user pick 'Other' → requiredIf sur le champ rationale.", cost: "M" },
  { id: "B3", group: "B", groupTitle: "Validation", title: "validateOn: change | blur | submit", description: "Quand déclencher la validation d'un field.", usage: "submit sur form 'lock decision', blur sur chat input.", cost: "S" },
  { id: "B4", group: "B", groupTitle: "Validation", title: "validateForm builtin action", description: "Valide tous les fields d'un form et écrit {valid, errors} dans le state.", usage: "Form 'lock decision' → validateForm → si valid, submit_decision.", cost: "M" },

  // C — Génération AI du spec
  { id: "C1", group: "C", groupTitle: "Génération AI du spec", title: "buildUserPrompt", description: "Construit un prompt structuré (catalog + rules + user prompt).", usage: "Bouton 'générer cette area avec l'IA' → Claude retourne un spec valide.", cost: "M" },
  { id: "C2", group: "C", groupTitle: "Génération AI du spec", title: "Edit modes patch / merge / diff", description: "Raffinement d'un spec existant via 3 formats d'edit.", usage: "Chat user : 'simplifie la table trade-off' → LLM retourne JSON Patch → appliqué.", cost: "M" },
  { id: "C3", group: "C", groupTitle: "Génération AI du spec", title: "deepMergeSpec (RFC 7396)", description: "Merge de patches partiels.", usage: "Appliquer les edits partiels du LLM sans écraser le spec entier.", cost: "S" },
  { id: "C4", group: "C", groupTitle: "Génération AI du spec", title: "diffToPatches", description: "Générer RFC 6902 patches depuis un diff d'objets.", usage: "Audit trail avant → après d'une area.", cost: "S" },

  // D — Streaming AI
  { id: "D1", group: "D", groupTitle: "Streaming AI", title: "createSpecStreamCompiler", description: "Applique progressivement des patches JSONL depuis un stream.", usage: "Chat assistant streame sa réponse, la table trade-off se remplit option-par-option en direct.", cost: "M" },
  { id: "D2", group: "D", groupTitle: "Streaming AI", title: "createJsonRenderTransform", description: "TransformStream séparant texte de JSONL dans un flux mixte.", usage: "Claude répond mi-texte, mi-spec — on affiche les deux sans parser à la main.", cost: "M" },
  { id: "D3", group: "D", groupTitle: "Streaming AI", title: "useUIStream / useChatUI", description: "Hooks React pour consommer le stream et rendre progressivement.", usage: "Remplace notre polling chat par streaming natif (SSE ou fetch reader).", cost: "M" },
  { id: "D4", group: "D", groupTitle: "Streaming AI", title: "tapJsonRenderStream / tapYamlStream", description: "Alimente l'event store devtools depuis le flux.", usage: "Tab 'Stream' des devtools affiche chaque patch en temps réel.", cost: "S" },

  // E — YAML wire format
  { id: "E1", group: "E", groupTitle: "Format wire YAML", title: "yaml-spec / yaml-edit fences", description: "Format YAML optimisé pour génération LLM (moins de tokens que JSON).", usage: "Claude génère ```yaml-spec ...``` → parser stream → compile en spec.", cost: "M" },
  { id: "E2", group: "E", groupTitle: "Format wire YAML", title: "Streaming YAML parser", description: "Parser partiel tolérant aux fences non fermées.", usage: "Progressivement afficher l'area pendant que Claude écrit.", cost: "M" },
  { id: "E3", group: "E", groupTitle: "Format wire YAML", title: "AI SDK transform", description: "Intégration Vercel AI SDK avec streamText transform.", usage: "Utile si on passe sur AI SDK pour l'advisor.", cost: "M" },

  // F — MCP Apps
  { id: "F1", group: "F", groupTitle: "MCP Apps", title: "useJsonRenderApp", description: "Affiche le webview directement dans Claude Code comme widget inline.", usage: "Plus besoin d'ouvrir le browser sur 4300 — la Card area apparaît dans la conv Claude.", cost: "L" },
  { id: "F2", group: "F", groupTitle: "MCP Apps", title: "Widget renvoyé en réponse de tool call", description: "submit_discussion retourne une MCP UI resource que Claude affiche inline.", usage: "Workflow : user tape /explorer phase 10 → Claude affiche la Card interactive.", cost: "L" },

  // G — Code generation
  { id: "G1", group: "G", groupTitle: "Code generation", title: "Exporter spec en JSX/TSX", description: "Génère un composant React autonome depuis le spec.", usage: "Export 'freeze' — l'area devient un .tsx versionnable.", cost: "M" },
  { id: "G2", group: "G", groupTitle: "Code generation", title: "Exporter en HTML statique", description: "Via custom exporter codegen.", usage: "Alternative à CONTEXT.md : HTML snapshot au moment du locking.", cost: "M" },
  { id: "G3", group: "G", groupTitle: "Code generation", title: "Traverser le spec", description: "traverseSpec pour analyse/transform.", usage: "Linter custom : warning si widget trade-off a des pros vides.", cost: "S" },

  // H — Custom schema + renderer
  { id: "H1", group: "H", groupTitle: "Custom schema + renderer", title: "Utiliser areaSchema (déjà créé)", description: "Le spec flat-widget-list de webview/area-schema.ts.", usage: "Le webview accepte ce format ou le built-in selon la source.", cost: "M" },
  { id: "H2", group: "H", groupTitle: "Custom schema + renderer", title: "Custom renderer pour areaSchema", description: "Écrire un renderer qui consomme AreaSpec sans traduction.", usage: "Peut cibler Vue, Slack blocks, PDF, email HTML — multi-cible.", cost: "L" },
  { id: "H3", group: "H", groupTitle: "Custom schema + renderer", title: "Prompt template dans defineSchema", description: "AI connaît la grammaire custom via un promptTemplate fourni à defineSchema.", usage: "L'AI génère directement des AreaSpec valides.", cost: "M" },

  // I — Actions builtin & advanced
  { id: "I1", group: "I", groupTitle: "Actions builtin & advanced", title: "Builtin setState/pushState/removeState/validateForm", description: "Actions natives gérées par ActionProvider.", usage: "Déjà utilisées pour Dialog open/close. Extension possible sur decision-picker.", cost: "S" },
  { id: "I2", group: "I", groupTitle: "Actions builtin & advanced", title: "registerActionObserver", description: "Hook sur chaque dispatch d'action (pré/post).", usage: "Audit log complet des actions dans les devtools.", cost: "S" },
  { id: "I3", group: "I", groupTitle: "Actions builtin & advanced", title: "Action preventDefault", description: "Field déclaré dans l'ActionBinding.", usage: "Sur 'lock decision' submit button pour éviter form submission natif.", cost: "S" },

  // J — Devtools étendus
  { id: "J1", group: "J", groupTitle: "Devtools étendus", title: "Panel (déjà câblé)", description: "6 tabs Spec/State/Catalog/Stream/Actions/Picker.", usage: "Déjà disponible via ⌘+Shift+J.", cost: "S" },
  { id: "J2", group: "J", groupTitle: "Devtools étendus", title: "recordEvent / recordUsage", description: "Alimenter l'event log avec des events custom.", usage: "Tab 'Actions' montre le flow complet (advisor spawn, chat reply, etc.).", cost: "S" },
  { id: "J3", group: "J", groupTitle: "Devtools étendus", title: "highlightElement / setHoverHighlight", description: "Picker DOM qui highlight l'element spec correspondant.", usage: "Click sur un widget → highlight sur canvas dans le webview.", cost: "S" },
];

type Vote = "approved" | "rejected" | "undecided";
const option_votes = new Map<string, Vote>();

function getOrCreateChat(area: string): ChatSession {
  const existing = chat_sessions.get(area);
  if (existing) return existing;
  const now = new Date().toISOString();
  const s: ChatSession = {
    area,
    messages: [],
    status: "idle",
    started_at: now,
    last_activity: now,
  };
  chat_sessions.set(area, s);
  return s;
}

function snapshot(r: DiscussionRecord) {
  return {
    at: new Date().toISOString(),
    record: JSON.parse(JSON.stringify(r)) as DiscussionRecord,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT.md rendering + disk persistence
// ─────────────────────────────────────────────────────────────────────────────

function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((s) => s.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function renderContextMd(m: DiscussionRecord): string {
  const phaseNum = m.phase ?? m.paths.padded_phase;
  const phaseName = titleCaseFromSlug(m.paths.phase_slug);
  const date = new Date().toISOString().slice(0, 10);
  const paddedPhase = m.paths.padded_phase;

  const lines: string[] = [];
  lines.push(`# Phase ${phaseNum}: ${phaseName} - Context`);
  lines.push("");
  lines.push(`**Gathered:** ${date}`);
  lines.push(`**Status:** Ready for planning`);
  lines.push("");

  // <domain>
  lines.push(`<domain>`);
  lines.push(`## Phase Boundary`);
  lines.push("");
  lines.push(m.domain && m.domain.trim().length > 0 ? m.domain : "_(domain not provided)_");
  lines.push("");
  lines.push(`</domain>`);
  lines.push("");

  // <spec_lock>
  if (m.spec?.loaded) {
    const lr = m.spec.locked_requirements ?? {};
    const boundaries = lr.boundaries ?? [];
    const constraints = lr.constraints ?? [];
    const acceptance = lr.acceptance_criteria ?? [];
    const nReqs = boundaries.length + constraints.length + acceptance.length;
    lines.push(`<spec_lock>`);
    lines.push(`## Requirements (locked via SPEC.md)`);
    lines.push("");
    lines.push(
      `**${nReqs} requirements are locked.** See \`${paddedPhase}-SPEC.md\` for full requirements, boundaries, and acceptance criteria.`,
    );
    lines.push("");
    lines.push(
      `Downstream agents MUST read \`${paddedPhase}-SPEC.md\` before planning or implementing. Requirements are not duplicated here.`,
    );
    lines.push("");
    if (boundaries.length > 0) {
      lines.push(`**In scope / Boundaries (from SPEC.md):**`);
      for (const b of boundaries) lines.push(`- ${b}`);
      lines.push("");
    }
    if (constraints.length > 0) {
      lines.push(`**Constraints (from SPEC.md):**`);
      for (const c of constraints) lines.push(`- ${c}`);
      lines.push("");
    }
    lines.push(`</spec_lock>`);
    lines.push("");
  }

  // <decisions>
  lines.push(`<decisions>`);
  lines.push(`## Implementation Decisions`);
  lines.push("");

  // Group decisions by area, number D-NN across the whole section
  let decisionCounter = 0;
  const nextD = () => {
    decisionCounter += 1;
    return `D-${String(decisionCounter).padStart(2, "0")}`;
  };

  for (const area of m.gray_areas) {
    lines.push(`### ${area.label}`);
    lines.push("");

    const areaDecisions = m.decisions.filter((d) => d.area === area.label);
    const areaAnalysis = m.analysis.find((a) => a.area === area.label);

    if (areaDecisions.length > 0) {
      for (const d of areaDecisions) {
        const tag = nextD();
        const rationale = d.rationale ? ` — ${d.rationale}` : "";
        lines.push(`- **${tag}:** ${d.decision}${rationale}`);
      }
      lines.push("");
    } else if (areaAnalysis?.recommendation) {
      const tag = nextD();
      lines.push(
        `- **${tag}:** ${areaAnalysis.recommendation.option} — ${areaAnalysis.recommendation.rationale} _(recommandation advisor)_`,
      );
      lines.push("");
    } else {
      lines.push(`_No decision captured yet for this area._`);
      lines.push("");
    }

    // Questions reference block (annotation + questions)
    if (area.annotation || area.questions.length > 0) {
      lines.push(`**Questions explored:**`);
      if (area.annotation) lines.push(`- _${area.annotation}_`);
      for (const q of area.questions) lines.push(`- ${q}`);
      lines.push("");
    }

    // Trade-off analysis
    if (areaAnalysis && areaAnalysis.options.length > 0) {
      const genericTag = areaAnalysis.generic ? " _(generic — pre-scout)_" : "";
      lines.push(`#### Trade-off analysis${genericTag}`);
      lines.push("");
      lines.push(`| Option | Pour | Contre |`);
      lines.push(`| --- | --- | --- |`);
      for (const opt of areaAnalysis.options) {
        const pros = opt.pros.length > 0 ? opt.pros.map(escapePipes).join("<br>") : "—";
        const cons = opt.cons.length > 0 ? opt.cons.map(escapePipes).join("<br>") : "—";
        lines.push(`| ${escapePipes(opt.name)} | ${pros} | ${cons} |`);
      }
      lines.push("");
      const cites = areaAnalysis.recommendation.cites ?? [];
      const citeSuffix =
        cites.length > 0 ? ` (refs: ${cites.map((c) => `\`${c}\``).join(", ")})` : "";
      lines.push(
        `💡 Recommandation: **${areaAnalysis.recommendation.option}** — ${areaAnalysis.recommendation.rationale}${citeSuffix}`,
      );
      lines.push("");
    }

    // Chat log
    const chat = chat_sessions.get(area.label);
    if (chat && chat.messages.length > 0) {
      lines.push(`#### Chat log`);
      lines.push("");
      for (const msg of chat.messages) {
        const who = msg.role === "user" ? "**User**" : "**Assistant**";
        lines.push(`- ${who} _(${msg.at})_: ${msg.content}`);
      }
      lines.push("");
    }
  }

  // Carrying forward from earlier phases
  if (m.prior_decisions.length > 0) {
    lines.push(`### Carrying forward from earlier phases`);
    lines.push("");
    for (const pd of m.prior_decisions) {
      lines.push(`- _(phase ${pd.phase})_ ${pd.decision}`);
    }
    lines.push("");
  }

  lines.push(`</decisions>`);
  lines.push("");

  // <canonical_refs>
  lines.push(`<canonical_refs>`);
  lines.push(`## Canonical References`);
  lines.push("");
  lines.push(`**Downstream agents MUST read these before planning or implementing.**`);
  lines.push("");
  if (m.canonical_refs.length === 0) {
    lines.push(`No external specs — requirements fully captured in decisions above`);
    lines.push("");
  } else {
    for (const ref of m.canonical_refs) {
      const note = ref.note ? ` — ${ref.note}` : "";
      lines.push(`- \`${ref.path}\`${note}`);
    }
    lines.push("");
  }
  lines.push(`</canonical_refs>`);
  lines.push("");

  // <code_context>
  if (m.codebase_context && m.codebase_context.trim().length > 0) {
    lines.push(`<code_context>`);
    lines.push(`## Existing Code Insights`);
    lines.push("");
    lines.push(m.codebase_context.trim());
    lines.push("");
    lines.push(`</code_context>`);
    lines.push("");
  }

  // <deferred>
  if (m.deferred_ideas.length > 0) {
    lines.push(`<deferred>`);
    lines.push(`## Deferred Ideas`);
    lines.push("");
    for (const d of m.deferred_ideas) {
      const origin = d.origin_area ? ` _(from: ${d.origin_area})_` : "";
      lines.push(`- ${d.idea}${origin}`);
    }
    lines.push("");
    lines.push(`</deferred>`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push("");
  lines.push(`*Phase: ${phaseNum}-${m.paths.phase_slug}*`);
  lines.push(`*Context gathered: ${date}*`);
  lines.push("");

  return lines.join("\n");
}

function serializeState() {
  return {
    memory,
    history,
    advisor_queue,
    chat_sessions: Object.fromEntries(chat_sessions),
  };
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

function persistContext(): void {
  if (!memory || !memory.paths) return;
  const { phase_dir, padded_phase } = memory.paths;
  const mdPath = `${phase_dir}/${padded_phase}-CONTEXT.md`;
  const jsonPath = `${phase_dir}/${padded_phase}-EXPLORER-STATE.json`;
  const md = renderContextMd(memory);
  const state = JSON.stringify(serializeState(), null, 2);

  ensureDir(mdPath)
    .then(() => Bun.write(mdPath, md))
    .catch((err) => console.error(`[explorer] persist CONTEXT.md failed: ${err}`));
  ensureDir(jsonPath)
    .then(() => Bun.write(jsonPath, state))
    .catch((err) => console.error(`[explorer] persist STATE.json failed: ${err}`));
}

async function tryRehydrate(): Promise<void> {
  const resumePath = process.env.EXPLORER_RESUME_PATH;
  if (!resumePath) return;
  try {
    const file = Bun.file(resumePath);
    if (!(await file.exists())) {
      console.error(`[explorer] EXPLORER_RESUME_PATH set but file missing: ${resumePath}`);
      return;
    }
    const data = (await file.json()) as {
      memory: DiscussionRecord | null;
      history: Array<{ at: string; record: DiscussionRecord }>;
      advisor_queue: AdvisorRequest[];
      chat_sessions: Record<string, ChatSession>;
    };
    memory = data.memory ?? null;
    history.length = 0;
    if (Array.isArray(data.history)) history.push(...data.history);
    advisor_queue = Array.isArray(data.advisor_queue) ? data.advisor_queue : [];
    chat_sessions.clear();
    if (data.chat_sessions && typeof data.chat_sessions === "object") {
      for (const [area, session] of Object.entries(data.chat_sessions)) {
        chat_sessions.set(area, session);
      }
    }
    console.error(
      `[explorer] rehydrated from ${resumePath} (memory=${memory ? "yes" : "no"}, history=${history.length}, advisor=${advisor_queue.length}, chats=${chat_sessions.size})`,
    );
  } catch (err) {
    console.error(`[explorer] rehydrate failed: ${err}`);
  }
}

type Verdict = "continue" | "undecided" | "ready";
type Score = {
  score: number;
  verdict: Verdict;
  signals: {
    decisions_last_round: number;
    refs_last_round: number;
    deferred_last_round: number;
    areas_without_decision: number;
    deferred_ratio_last_round: number | null;
    rounds: number;
  };
  suggestion: string;
};

function computeScore(): Score | null {
  if (!memory) return null;
  const prev = history.length >= 2 ? history[history.length - 2].record : null;

  const decisions_last_round =
    memory.decisions.length - (prev?.decisions.length ?? 0);
  const refs_last_round =
    memory.canonical_refs.length - (prev?.canonical_refs.length ?? 0);
  const deferred_last_round =
    memory.deferred_ideas.length - (prev?.deferred_ideas.length ?? 0);

  const decidedAreas = new Set(memory.decisions.map((d) => d.area));
  const areas_without_decision = memory.gray_areas.filter(
    (a) => !decidedAreas.has(a.label),
  ).length;

  const deferred_ratio_last_round =
    decisions_last_round > 0 ? deferred_last_round / decisions_last_round : null;

  let score = 50;
  if (history.length >= 2) {
    if (decisions_last_round === 0) score -= 30;
    if (refs_last_round === 0) score -= 15;
    if (deferred_ratio_last_round !== null && deferred_ratio_last_round > 1)
      score -= 20;
    if (decisions_last_round >= 2) score += 20;
    if (refs_last_round >= 1) score += 10;
  }
  if (areas_without_decision > 0) score += 25;
  score = Math.max(0, Math.min(100, score));

  const verdict: Verdict = score <= 35 ? "ready" : score >= 70 ? "continue" : "undecided";

  let suggestion = "";
  if (history.length < 2) {
    suggestion = `Premier tour enregistré (${memory.gray_areas.length} zones, ${memory.decisions.length} décisions). Le verdict se calcule à partir du 2e tour.`;
  } else if (verdict === "ready") {
    suggestion = `Plateau détecté — ${decisions_last_round} nouvelle(s) décision(s), ${refs_last_round} nouvelle(s) ref(s) ce tour. Écrire CONTEXT.md et passer à plan-phase.`;
  } else if (verdict === "continue") {
    const parts: string[] = [];
    if (areas_without_decision > 0)
      parts.push(`${areas_without_decision} area(s) sans décision`);
    if (decisions_last_round >= 2)
      parts.push(`${decisions_last_round} décisions ajoutées ce tour`);
    if (refs_last_round >= 1)
      parts.push(`${refs_last_round} ref(s) ajoutée(s)`);
    suggestion = `Ça avance — ${parts.join(", ")}. Continue.`;
  } else {
    suggestion = `À ton appel — ${decisions_last_round} décision(s) ce tour, ${areas_without_decision} area(s) ouverte(s).`;
  }

  return {
    score,
    verdict,
    signals: {
      decisions_last_round,
      refs_last_round,
      deferred_last_round,
      areas_without_decision,
      deferred_ratio_last_round,
      rounds: history.length,
    },
    suggestion,
  };
}

const server = new McpServer({ name: "explorer", version: "0.1.0" });

server.registerTool(
  "list_chat_pending",
  {
    title: "List chat sessions awaiting assistant reply",
    description:
      "Returns chat sessions with status=thinking. For each, call gsd-advisor-researcher (or general-purpose) Task with the area's gray_area + messages history, then submit_chat_reply.",
    inputSchema: {},
  },
  async () => {
    const pending = Array.from(chat_sessions.values()).filter((s) => s.status === "thinking");
    return { content: [{ type: "text", text: JSON.stringify(pending, null, 2) }] };
  },
);

server.registerTool(
  "submit_chat_reply",
  {
    title: "Submit assistant reply to a chat session",
    description:
      "Appends an assistant message to the session and flips status to waiting_user. Use after running the Task subagent for a pending chat.",
    inputSchema: {
      area: z.string(),
      content: z.string().min(1),
    },
  },
  async (input) => {
    const s = chat_sessions.get(input.area);
    if (!s) return { content: [{ type: "text", text: `no chat session for "${input.area}"` }] };
    const now = new Date().toISOString();
    s.messages.push({ role: "assistant", content: input.content, at: now });
    s.status = "waiting_user";
    s.last_activity = now;
    persistContext();
    return { content: [{ type: "text", text: `Reply appended to "${input.area}" (${s.messages.length} messages).` }] };
  },
);

server.registerTool(
  "list_advisor_requests",
  {
    title: "List advisor requests",
    description:
      "Returns the advisor queue. Call before running gsd-advisor-researcher — consume pending entries, run the Task subagent per area, then submit_advisor_result.",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(advisor_queue, null, 2) }],
  }),
);

server.registerTool(
  "submit_advisor_result",
  {
    title: "Submit advisor research result",
    description:
      "Called after running gsd-advisor-researcher Task on a queued area. Merges the research-backed options + recommendation into memory.analysis[] and marks the queue entry done.",
    inputSchema: {
      area: z.string(),
      options: z.array(analysisOptionSchema).min(2).max(3),
      recommendation: z.object({
        option: z.string(),
        rationale: z.string(),
        cites: z.array(z.string()).default([]),
      }),
    },
  },
  async (input) => {
    if (!memory) {
      return { content: [{ type: "text", text: "no memory loaded — submit_discussion first" }] };
    }
    const idx = memory.analysis.findIndex((a) => a.area === input.area);
    const entry = { ...input, generic: false };
    if (idx >= 0) memory.analysis[idx] = entry;
    else memory.analysis.push(entry);
    advisor_queue = advisor_queue.map((r) =>
      r.area === input.area && r.status !== "done"
        ? { ...r, status: "done" as const, completed_at: new Date().toISOString() }
        : r,
    );
    persistContext();
    return {
      content: [
        { type: "text", text: `Enriched analysis for "${input.area}" (${input.options.length} options).` },
      ],
    };
  },
);

server.registerTool(
  "submit_discussion",
  {
    title: "Submit discussion record",
    description:
      "Ingest the full discuss-phase record (inputs + accumulated outputs) captured at the end of discuss_areas, before write_context runs. Held in memory for downstream inspection.",
    inputSchema: discussionRecordSchema,
  },
  async (input) => {
    memory = input;
    history.push(snapshot(input));
    for (const d of input.decisions) {
      const s = chat_sessions.get(d.area);
      if (s && s.status !== "done") {
        s.status = "done";
        s.last_activity = new Date().toISOString();
      }
    }
    persistContext();
    return {
      content: [
        {
          type: "text",
          text: `Stored discussion for ${input.paths.padded_phase}: ${input.gray_areas.length} area(s), ${input.decisions.length} decision(s), ${input.discussion_log.length} log entr(ies), ${input.deferred_ideas.length} deferred, ${input.canonical_refs.length} ref(s). [round ${history.length}]`,
        },
      ],
    };
  },
);

import indexHtml from "./webview/index.html";

// Rehydrate state from disk if EXPLORER_RESUME_PATH is set (no-op otherwise).
await tryRehydrate();

const PORT = Number(process.env.EXPLORER_PORT ?? 4300);
try {
Bun.serve({
  port: PORT,
  development: true,
  routes: {
    "/": indexHtml,
    "/state": () => Response.json(memory ?? null),
    "/options": () =>
      Response.json(
        json_render_options.map((o) => ({
          ...o,
          vote: option_votes.get(o.id) ?? "undecided",
        })),
      ),
    "/options/vote": async (req) => {
      if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
      try {
        const body = (await req.json()) as { id?: string; vote?: Vote };
        if (!body.id || !body.vote) {
          return Response.json({ ok: false, error: "missing id or vote" }, { status: 400 });
        }
        if (!json_render_options.find((o) => o.id === body.id)) {
          return Response.json({ ok: false, error: "unknown id" }, { status: 404 });
        }
        if (!["approved", "rejected", "undecided"].includes(body.vote)) {
          return Response.json({ ok: false, error: "invalid vote" }, { status: 400 });
        }
        option_votes.set(body.id, body.vote);
        return Response.json({ ok: true });
      } catch (err) {
        return Response.json(
          { ok: false, error: err instanceof Error ? err.message : String(err) },
          { status: 400 },
        );
      }
    },
    "/score": () => Response.json(computeScore()),
    "/advisor-queue": () => Response.json(advisor_queue),
    "/chats": () => Response.json(Array.from(chat_sessions.values())),
    "/chat/:area": (req) => {
      const area = decodeURIComponent(
        new URL(req.url).pathname.replace(/^\/chat\//, "").replace(/\/.*$/, ""),
      );
      const s = chat_sessions.get(area);
      return Response.json(s ?? null);
    },
    "/chat/:area/message": async (req) => {
      if (req.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
      }
      const area = decodeURIComponent(
        new URL(req.url).pathname.replace(/^\/chat\//, "").replace(/\/message$/, ""),
      );
      try {
        const { content } = (await req.json()) as { content?: string };
        if (!content || typeof content !== "string" || !content.trim()) {
          return Response.json({ ok: false, error: "empty content" }, { status: 400 });
        }
        if (!memory?.gray_areas.find((a) => a.label === area)) {
          return Response.json({ ok: false, error: "unknown area" }, { status: 404 });
        }
        const s = getOrCreateChat(area);
        if (s.status === "done") {
          return Response.json({ ok: false, error: "session is done" }, { status: 409 });
        }
        const now = new Date().toISOString();
        s.messages.push({ role: "user", content: content.trim(), at: now });
        s.status = "thinking";
        s.last_activity = now;
        persistContext();
        return Response.json({ ok: true, messages: s.messages.length });
      } catch (err) {
        return Response.json(
          { ok: false, error: err instanceof Error ? err.message : String(err) },
          { status: 400 },
        );
      }
    },
    "/chat/:area/done": async (req) => {
      if (req.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
      }
      const area = decodeURIComponent(
        new URL(req.url).pathname.replace(/^\/chat\//, "").replace(/\/done$/, ""),
      );
      const s = chat_sessions.get(area);
      if (!s) return Response.json({ ok: false, error: "no session" }, { status: 404 });
      s.status = "done";
      s.last_activity = new Date().toISOString();
      persistContext();
      return Response.json({ ok: true });
    },
    "/advisor-request": async (req) => {
      if (req.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
      }
      try {
        const { area } = (await req.json()) as { area?: string };
        if (!area || typeof area !== "string") {
          return Response.json({ ok: false, error: "missing area" }, { status: 400 });
        }
        if (!memory || !memory.gray_areas.find((a) => a.label === area)) {
          return Response.json({ ok: false, error: "unknown area" }, { status: 404 });
        }
        const already = advisor_queue.find((r) => r.area === area && r.status !== "done");
        if (!already) {
          advisor_queue.push({
            area,
            requested_at: new Date().toISOString(),
            status: "pending",
          });
        }
        persistContext();
        return Response.json({ ok: true, queued: !already });
      } catch (err) {
        return Response.json(
          { ok: false, error: err instanceof Error ? err.message : String(err) },
          { status: 400 },
        );
      }
    },
    "/submit": async (req) => {
      if (req.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
      }
      try {
        const body = await req.json();
        const parsed = z.object(discussionRecordSchema).parse(body);
        memory = parsed;
        history.push(snapshot(parsed));
        for (const d of parsed.decisions) {
          const s = chat_sessions.get(d.area);
          if (s && s.status !== "done") {
            s.status = "done";
            s.last_activity = new Date().toISOString();
          }
        }
        persistContext();
        return Response.json({
          ok: true,
          stored: parsed.gray_areas.length,
          round: history.length,
        });
      } catch (err) {
        return Response.json(
          { ok: false, error: err instanceof Error ? err.message : String(err) },
          { status: 400 },
        );
      }
    },
  },
});
console.error(`[explorer] http listening on http://127.0.0.1:${PORT}`);
} catch (err: any) {
  console.error(
    `[explorer] http disabled (${err?.code ?? err?.message ?? err}) — stdio only`,
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
