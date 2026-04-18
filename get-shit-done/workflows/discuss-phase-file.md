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
Create the per-question markdown tree under:

```
{phase_dir}/questions/
  INDEX.md                    # dashboard
  INBOX.md                    # permanent empty (D-06)
  Q-01.md                     # per-question file with YAML frontmatter
  Q-02.md
  blocked/                    # questions with status: blocked
    Q-03.md
```

### Per-question file template (identical at all levels — recursive)

Write each non-split node to its file with this exact template:

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

**Context:** {context}

**Dependencies:** {none | waiting for {comma-list of ids}}

**Options** (tick exactly one box to finalize):
- [ ] (a) {label} — {description}
- [ ] (b) {label} — {description}
- [ ] (c) {label} — {description}
- [ ] (d) Custom — write value in Discussion

**Discussion:**

> Claude: {optional opening nudge — only for the first generation}

<!-- Write your message below as:  > User: your text -->
<!-- Save the file — type "refresh" or wait for auto-refresh hook. -->

**Split:** no
```

**Placement rule (D-03):** If the question's initial `status` is `blocked`, write it under `{phase_dir}/questions/blocked/{node_id}.md`. Otherwise, write it at the root of `{phase_dir}/questions/`. Never place a blocked question at the root.

**INBOX.md creation (D-06):** Always create `{phase_dir}/questions/INBOX.md` with initial content:

```
<!-- INBOX.md — écrivez librement (texte, URLs, idées). Au prochain refresh, le contenu est archivé et des questions sont extraites dans l'arbre. -->
```

If INBOX.md already exists (resumed session), do NOT overwrite it.

For split parents, write a `.md` with `**Status:** split into {children}` instead of options, pointing the user at the children's file paths.

### INDEX.md dashboard

Write `{phase_dir}/questions/INDEX.md` grouping questions by status (reads frontmatters — NO JSON):
- **Ready** — `status: leaf` at root of questions/
- **Blocked** — `status: blocked` under blocked/ subfolder
- **Answered** — `status: answered`
- **Split** — `status: split` (with children expanded)

```markdown
# Phase {N} — {phase_name} — Questions ({answered}/{total} answered)

## Ready (current wave)
- [ ] [Q-01 — {title}](Q-01.md)
- [ ] [Q-02 — {title}](Q-02.md)

## Blocked (waiting on dependencies)
- Q-03 — waits on: Q-02

## Answered
- [x] Q-04, Q-05

## Notes
Edit a question file, tick one checkbox to finalize, then say "refresh" to Claude.
Say "split Q-0X en N" to break a big question into N child questions.
```

**Visibility rule:** Only leaves (status `leaf`, `blocked`, `answered`) appear in INDEX.md. Parents with `status: split` are **hidden** — the user only sees the child questions. When all children of a split parent reach `answered`, the parent is resurrected as a leaf with a synthesized answer pre-filled.

**Siblings shown flat when independent:** If children of a parent have no mutual dependencies, they all appear in the Ready wave simultaneously. If dependencies exist, successors start in Blocked and move to Ready only when their predecessors lock.

**NO `QUESTIONS.json` file is written — frontmatter is the single source of truth.**

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

  Dashboard:  {phase_dir}/questions/INDEX.md
  Tree:       {phase_dir}/questions/
    - INDEX.md  — dashboard des questions actives
    - INBOX.md  — écrivez librement (texte, URLs, idées). Sauvegardez — le hook auto-refresh détecte la modification.
    - Q-XX.md   — une question par fichier, répondez en cochant [x] ou en éditant la Discussion.
    - blocked/  — questions bloquées sur des dépendances, remontées automatiquement dès que leurs deps sont résolues.

  {total} questions in the tree. {open} active in the current wave.

Open INDEX.md in your editor to pick a question. Each question has its own .md
file with a conversation thread. Tick one checkbox to finalize your answer.

When ready, tell me:
  "refresh"                — scan the tree, reply to new comments, unlock deps
  "refresh Q-01"           — same but focused on one question
  "split Q-01 en 3"        — break a big question into 3 child questions
  "finalize"               — generate CONTEXT.md from all locked answers
  "exit markdown mode"     — fall back to standard one-by-one discussion
```
</step>

<step name="wait_loop">
Enter wait mode. Claude listens for user commands and handles each:

---

**"refresh"** (or "refresh Q-XX" to scope to a single question; also "process answers", "update", "re-read"):

**Phase 1 — Process INBOX.md (D-06):**
1. Check if `{phase_dir}/questions/INBOX.md` is non-empty (size > ~200 bytes, ignoring the instructive HTML comment).
2. If non-empty:
   - Read INBOX.md content.
   - Extract new question candidates from the content (user prose, URLs, ideas).
   - Archive: `mv INBOX.md INBOX-$(date -u +%Y%m%dT%H%M%SZ).md`
   - Recreate empty INBOX.md with the instructive comment (same as generate_tree).
   - For each extracted question: generate a new Q-XX.md with frontmatter (reuse generate_tree template) under root or `blocked/` per initial status.
3. If empty: skip Phase 1.

**Phase 2 — Refresh modified questions:**
1. Determine scope: all active leaves, or the single specified question.
2. For each in-scope leaf file `{id}.md`:
   - Invoke the per-question workflow @$HOME/.claude/get-shit-done/workflows/discuss-question-markdown.md with node id + file path
   - That sub-workflow handles: reading new `> User:` messages, replying inline, detecting checkbox locks, detecting `**Split:** yes N` markers, cascading frontmatter updates
3. After all per-question invocations:
   - Re-evaluate the DAG: for every blocked node whose dependencies are now satisfied, re-check that its option space is still non-empty given the new locks; if an answer to a dependency invalidated options, regenerate those options and re-write the .md
   - For every split parent whose children are ALL answered, resurrect the parent as a leaf with synthesized answer

**Phase 3 — Physical status moves (D-03):**
After all updates, for each question whose status changed:
- `leaf → blocked`: move file from root to `blocked/` subfolder.
- `blocked → leaf`: move file from `blocked/` to root.
- `* → answered` or `* → split`: stay in current location (no move required).

Use actual `mv` (Bash) — do NOT write a new file and leave the old one behind.

**Phase 4 — Rebuild INDEX.md:**
Scan all `*.md` files in `{phase_dir}/questions/` and `{phase_dir}/questions/blocked/`. Parse each file's frontmatter. Regenerate INDEX.md grouping by status. This is the only write to INDEX.md — do not persist JSON state.

Report to the user:

```
Refreshed.
  Answered:  {answered} / {total}
  Ready:     {open} (current wave: {ready_ids})
  Blocked:   {blocked}
  Split:     {split} (hidden)

  INDEX.md updated: {phase_dir}/questions/INDEX.md
```

---

**"split Q-XX en N"** (or "break Q-XX into N", "decompose Q-XX"):

1. Read `Q-XX.md` frontmatter to get current state
2. Decompose its decision space into N (or as many as makes sense — N is a hint, not a hard cap) child sub-questions with coherent options each
3. Compute pair-wise dependencies between the new children using the logical-independence rule
4. Set `Q-XX.status = "split"`, `Q-XX.children = [child ids]` in frontmatter, remove its options
5. Create the child .md files under `{phase_dir}/questions/Q-XX/` with full frontmatter
6. Rebuild INDEX.md (parent disappears, new children appear in Ready or Blocked)
7. Report the split

---

**"finalize"** (or "done", "generate context", "write context"):

Proceed to the **finalize** step.

---

**"exit markdown mode"** (or "switch to interactive"):

1. Scan all `{phase_dir}/questions/*.md` frontmatters; collect questions with `status: answered`
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

1. Collect answered nodes by scanning all `{phase_dir}/questions/*.md` and `{phase_dir}/questions/blocked/*.md` files. For each file:
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
- Questions folder at `{phase_dir}/questions/` — no padded_phase prefix in folder name
- Questions with initial status `blocked` are written under `questions/blocked/` subfolder (D-03)
- INBOX.md always created at root of questions folder (D-06)
- INDEX.md shows questions grouped by status, reading from frontmatters (not JSON)
- No QUESTIONS.json file is generated or read at any point
- On refresh: INBOX.md processed first (archive + extract questions), then per-question sub-workflow invoked
- Physical status moves: `mv` used for blocked ↔ leaf transitions (D-03)
- INDEX.md rebuilt after every refresh from frontmatter scan
- Siblings with no logical-independence violations appear as a parallel wave
- Siblings with dependencies appear as Blocked until their predecessors lock
- Checkbox-based finalization: exactly one `- [x]` ticks the answer; two ticks = ambiguous
- Auto-split triggers on complex questions; on-demand split available via `split Q-XX en N`
- Per-question conversation thread persists across refreshes
- CONTEXT.md generated from frontmatter scan of all Q-XX.md files (not from JSON)
- `canonical_refs` section always present in CONTEXT.md (MANDATORY)
</success_criteria>
