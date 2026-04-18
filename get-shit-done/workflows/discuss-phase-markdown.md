<purpose>
Markdown mode for discuss-phase. Generates a **recursive tree of markdown question files** (one `.md` per question, organized as a DAG of dependencies) plus an `INDEX.md` dashboard. The user answers at their own pace in their editor — per-question conversation threads, checkbox finalization, and on-demand or auto split into child sub-questions. When the user signals readiness, all locked answers are synthesized into CONTEXT.md.

**When to use:** Large phases with many gray areas, or when users prefer editor-based workflows (vim, VSCode) over browser UIs; particularly valuable when questions are too large to answer in one shot and benefit from being split into smaller child questions.
</purpose>

<trigger>
This workflow executes when `--markdown` flag is present in ARGUMENTS to `/gsd-discuss-phase`.

The caller (discuss-phase.md) has already:
- Validated the phase exists
- Provided init context: `phase_dir`, `padded_phase`, `phase_number`, `phase_name`, `phase_slug`

Begin at **Step 1** immediately.
</trigger>

<step name="analyze">
Run the same gray area identification as standard discuss-phase mode.

1. Load prior context (PROJECT.md, REQUIREMENTS.md, STATE.md, prior CONTEXT.md files)
2. Scout codebase for reusable assets and patterns relevant to this phase
3. Read the phase goal from ROADMAP.md
4. Identify ALL gray areas — specific implementation decisions the user should weigh in on
5. For each gray area, generate 2–4 concrete options with tradeoff descriptions

Do NOT ask the user anything at this stage. Capture everything internally, then proceed to generate.
</step>

<step name="generate_tree">
Write the markdown question tree to `{phase_dir}/{padded_phase}-questions/` — per D-02 (frontmatter YAML in each .md), D-03 (blocked/ subfolder), D-06 (INBOX.md permanent).

**Directory layout:**

```
{phase_dir}/{padded_phase}-questions/
  INDEX.md                    # dashboard (see below)
  INBOX.md                    # permanent empty (D-06)
  Q-01.md                     # per-question file with YAML frontmatter (D-02)
  Q-02.md
  blocked/                    # questions with status: blocked (D-03)
    Q-03.md
  answered/                   # questions with status: answered (moved after lock)
    Q-04.md
```

**Per-question .md template** (each `Q-XX.md` — D-02):

```
---
id: {node_id}
title: {node_title}
status: {status}            # leaf | blocked | answered | split
parent: {parent or null}
children: []
dependencies: {deps_yaml_array}  # e.g. [] or [Q-03]
answer: null
conversation_length: 0
---

# {node_id} — {node_title}

**Context:** {context one-liner from analyze}

**Dependencies:** {human-readable deps description or 'none'}

**Options** (tick exactly one box to finalize):
- [ ] (a) {option A}
- [ ] (b) {option B}
- [ ] (c) {option C}
- [ ] (d) Custom — write value in Discussion

**Discussion:**

> Claude: {opening rationale}

<!-- Write your message below as:  > User: your text -->
<!-- Save the file — the auto-refresh hook will pick it up, or type "refresh" manually. -->
```

**Placement rule (D-03):** If the question's initial `status` is `blocked`, write it under `{padded_phase}-questions/blocked/{node_id}.md`. Otherwise, write it at the root of `{padded_phase}-questions/`. Never place a blocked question at the root.

**INBOX.md creation (D-06):** Always create `{padded_phase}-questions/INBOX.md` with initial content:

```
<!-- INBOX.md — écrivez librement (texte, URLs, idées). Au prochain refresh, le contenu est archivé et des questions sont extraites dans l'arbre. -->
```

If INBOX.md already exists (resumed session), do NOT overwrite it.

**INDEX.md structure** (dashboard — reads frontmatters instead of JSON):
Group questions by status:
- **Ready** — `status: leaf` at root of {padded_phase}-questions/
- **Blocked** — `status: blocked` under blocked/ subfolder
- **Answered** — `status: answered`
- **Split** — `status: split` (with children expanded)

**NO `QUESTIONS.json` file is written — D-02 removes it entirely.**

**Auto-split during generation:** When a question hits any of these heuristics, create it as a split parent with N child nodes instead of a leaf:
- More than 4 distinct options
- Mixes 2+ orthogonal axes of decision (e.g., layout + density + colors)
- Context paragraph exceeds ~150 words
- Options require prerequisite sub-decisions

Claude generates as many children as needed — **no fixed N**. The only requirement is logical coherence.

**Dependency computation (logical-independence rule):** For every pair (A, B) of sibling leaves, mark `B.dependencies` to include `A` **if and only if at least one valid answer to A would empty or materially alter B's option space**. If no answer to A can invalidate B's options, they are independent and both appear in the same wave.
</step>

<step name="notify_user">
After writing the tree and INDEX.md, print this message to the user:

```
Questions ready for Phase {N}: {phase_name}

  Dashboard:  {phase_dir}/{padded_phase}-questions/INDEX.md
  Tree:       {phase_dir}/{padded_phase}-questions/
    - INDEX.md — dashboard des questions actives
    - INBOX.md — écrivez librement (texte, URLs, idées). Sauvegardez — le hook auto-refresh (si opt-in) détecte la modification.
    - Q-XX.md — une question par fichier, répondez en cochant [x] ou en éditant la Discussion.
    - blocked/ — questions bloquées sur des dépendances, remontées automatiquement dès que leurs deps sont résolues.

  {total} questions in the tree. {open} active in the current wave.

Open INDEX.md in your editor to pick a question. Each question has its own .md
file with a conversation thread. Tick one checkbox to finalize your answer.

Pour déclencher un refresh :
  - Automatique : activez `hooks.questions_autorefresh: true` dans `.planning/config.json`
  - Manuel : tapez `refresh` dans la conversation avec Claude

When ready, tell me:
  "refresh"                — scan the tree, reply to new comments, unlock deps
  "refresh Q-01.a"         — same but focused on one question
  "split Q-01 en 3"        — break a big question into 3 child questions
  "finalize"               — generate CONTEXT.md from all locked answers
  "exit markdown mode"     — fall back to standard one-by-one discussion
```
</step>

<step name="wait_loop">
Wait for one of these triggers:
1. User types `refresh` in the conversation
2. Hook `gsd-questions-refresh.js` injects `additionalContext: "{file} modified in {NN}-questions/ — refresh pending."` (D-04)
3. Hook injects `additionalContext: "INBOX.md modified in {NN}-questions/ — process inbox content on next refresh."` (D-06)
4. User types `done` / `finalize` to synthesize CONTEXT.md

**On refresh trigger — execute in this order:**

**Phase 1 — Process INBOX.md (D-06):**
1. Check if `{phase_dir}/{padded_phase}-questions/INBOX.md` is non-empty (size > ~200 bytes, ignoring the instructive HTML comment).
2. If non-empty:
   - Read INBOX.md content.
   - Extract new question candidates from the content (user prose, URLs, ideas).
   - Archive: `mv INBOX.md INBOX-$(date -u +%Y%m%dT%H%M%SZ).md`
   - Recreate empty INBOX.md with the instructive comment (same as generate_tree).
   - For each extracted question: generate a new Q-XX.md with frontmatter (reuse generate_tree template) under the root or blocked/ per initial status.
3. If empty: skip Phase 1.

**Phase 2 — Refresh modified questions:**
For EACH `{padded_phase}-questions/*.md` (or `blocked/*.md`) that was modified since last refresh (or all active leaves if user typed `refresh` without hook signal), spawn a Task() **per Plan 05's contract**:

```
Task(
  prompt="Read the question file at {absolute_file_path}.
          Parse its YAML frontmatter (id, status, dependencies, answer, conversation_length).
          Read the Discussion thread below the frontmatter.
          Process new > User: messages, detect [x] checkbox locks, handle Split markers.
          Write replies (> Claude: ...) and update frontmatter in-place.
          Return: { id, newStatus, answerLocked, conversationAdded }",
  subagent_type="general-purpose",
  description="Refresh: {node_id}"
)
```

All Task() calls spawn in parallel (nesting level 2 — safe per #686).

**Phase 3 — Physical status moves (D-03):**
After all Task() return, for each question whose status changed:
- `leaf → blocked`: move file from root to `blocked/` subfolder.
- `blocked → leaf`: move file from `blocked/` to root.
- `* → answered`: move file to `answered/` subfolder.
- `* → split`: stay in current location (no move required).

Use actual `mv` (Bash) — do NOT write a new file and leave the old one behind.

**Phase 4 — Rebuild INDEX.md:**
Scan all `*.md` files in `{padded_phase}-questions/` and `blocked/`. Parse each file's frontmatter. Regenerate INDEX.md grouping by status. This is the only write to INDEX.md — do not persist JSON state.

Report to the user:

```
Refreshed.
  Answered:  {answered} / {total}
  Ready:     {open} (current wave: {ready_ids})
  Blocked:   {blocked}
  Split:     {split} (hidden)

  INDEX.md updated: {phase_dir}/{padded_phase}-questions/INDEX.md
```

Return to wait state.

---

**"split Q-XX en N"** (or "break Q-XX into N", "decompose Q-XX"):

1. Read `Q-XX.md` frontmatter to get current state
2. Decompose its decision space into N (or as many as makes sense — N is a hint, not a hard cap) child sub-questions with coherent options each
3. Compute pair-wise dependencies between the new children using the logical-independence rule
4. Set `Q-XX.status = "split"`, `Q-XX.children = [child ids]` in frontmatter, remove its options
5. Create the child .md files under `{padded_phase}-questions/Q-XX/` with full frontmatter
6. Rebuild INDEX.md (parent disappears, new children appear in Ready or Blocked)
7. Report the split

---

**"finalize"** (or "done", "generate context", "write context"):

Proceed to the **finalize** step.

---

**"exit markdown mode"** (or "switch to interactive"):

1. Scan all Q-XX.md frontmatters; collect questions with `status: answered`
2. Feed them into the internal accumulator as if answered interactively
3. Continue with the standard `discuss_areas` step from discuss-phase.md for any remaining unanswered questions
4. Generate CONTEXT.md as normal

---

**Any other message:**
Reply helpfully, then remind the user of available commands:
```
(Markdown mode active — say "refresh", "refresh Q-XX", "split Q-XX en N", "finalize", or "exit markdown mode")
```
</step>

<step name="finalize">
Process all answered questions from the frontmatter state and generate CONTEXT.md.

1. Collect answered nodes by scanning `{padded_phase}-questions/answered/*.md` (primary) and `{padded_phase}-questions/*.md` (fallback for in-progress). For each file:
   - Parse YAML frontmatter at top of file.
   - If `status == 'answered'`: collect `id`, `title`, `answer`, and the Discussion body for CONTEXT.md synthesis.
   - Skip files whose basename matches `INBOX.md` or `INBOX-*.md` (inbox is not a question).
   - Skip INDEX.md (dashboard only).

   The frontmatter is the single source of truth — there is NO JSON to read.

2. Walk the collected answered nodes depth-first; format each as a decision entry:
   - Decision: the selected option label (or custom text from `answer` field)
   - Rationale: the option description plus any `> User:` context from the Discussion thread
   - Subtree: if this node was split and later synthesized, include a compact summary of its children's decisions
3. Write CONTEXT.md using the standard context template:
   - `<decisions>` section with all answered top-level questions
   - `<deferred_ideas>` section for any unanswered leaf
   - `<specifics>` section for nuance captured in conversation threads
   - `<code_context>` section with reusable assets found during analysis
   - `<canonical_refs>` section (MANDATORY — paths to relevant specs/docs)
4. If fewer than 50% of leaves are answered, warn:

```
Warning: Only {answered}/{total} questions answered ({pct}%).
CONTEXT.md generated with available decisions. Unanswered leaves listed as deferred.
Consider running /gsd-discuss-phase {N} --markdown again to refine before planning.
```

5. Print completion:

```
CONTEXT.md written: {phase_dir}/{padded_phase}-CONTEXT.md

  Decisions captured: {answered}
  Deferred:           {open + blocked}

Next step: /gsd-plan-phase {N}
```
</step>

<success_criteria>
- One .md file per question with YAML frontmatter (id, title, status, parent, children, dependencies, answer, conversation_length) — frontmatter is the single source of truth
- Questions with initial status `blocked` are written under `blocked/` subfolder (D-03)
- INBOX.md always created at root of questions folder (D-06)
- INDEX.md shows questions grouped by status, reading from frontmatters (not JSON)
- No QUESTIONS.json file is generated or read at any point
- On refresh: INBOX.md processed first (archive + extract questions), then Task() per question in parallel
- Physical status moves: `mv` for blocked ↔ leaf transitions and answered → `answered/` subfolder
- INDEX.md rebuilt after every refresh from frontmatter scan (D-04)
- CONTEXT.md generated from frontmatter scan of `answered/` subfolder (not from JSON)
- `canonical_refs` section always present in CONTEXT.md (MANDATORY)
</success_criteria>
