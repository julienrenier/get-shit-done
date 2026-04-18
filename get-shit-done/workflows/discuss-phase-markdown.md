<purpose>
Markdown mode for discuss-phase. Generates a **recursive tree of markdown question files** (one `.md` per question, organized as a DAG of dependencies) plus a canonical JSON state file and an `INDEX.md` dashboard. The user answers at their own pace in their editor — per-question conversation threads, checkbox finalization, and on-demand or auto split into child sub-questions. When the user signals readiness, all locked answers are synthesized into CONTEXT.md.

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
After writing the JSON, the tree, and INDEX.md, print this message to the user:

```
Questions ready for Phase {N}: {phase_name}

  Dashboard:  {phase_dir}/{padded_phase}-questions/INDEX.md
  State:      {phase_dir}/{padded_phase}-QUESTIONS.json

  {total} questions in the tree. {open} active in the current wave.

Open INDEX.md in your editor to pick a question. Each question has its own .md
file with a conversation thread. Tick one checkbox to finalize your answer.

When ready, tell me:
  "refresh"                — scan the tree, reply to new comments, unlock deps
  "refresh Q-01.a"         — same but focused on one question
  "split Q-01 en 3"        — break a big question into 3 child questions
  "finalize"               — generate CONTEXT.md from all locked answers
  "exit markdown mode"     — fall back to standard one-by-one discussion
```
</step>

<step name="wait_loop">
Enter wait mode. Claude listens for user commands and handles each:

---

**"refresh"** (or "refresh Q-XX" to scope to a single question; also "process answers", "update", "re-read"):

1. Determine scope: all active leaves, or the single specified question.
2. For each in-scope leaf file `{id}.md`:
   - Invoke the per-question workflow @$HOME/.claude/get-shit-done/workflows/discuss-question-markdown.md with node id + file path
   - That sub-workflow handles: reading new `> User:` messages, replying inline, detecting checkbox locks, detecting `**Split:** yes N` markers, cascading state updates
3. After all per-question invocations:
   - Recompute stats in the JSON (answered / open / blocked / split)
   - Re-evaluate the DAG: for every blocked node whose dependencies are now satisfied, re-check that its option space is still non-empty given the new locks; if an answer to a dependency invalidated options, regenerate those options and re-write the .md
   - For every split parent whose children are ALL answered, resurrect the parent as a leaf with synthesized answer
   - Rewrite INDEX.md
4. Report to the user:

```
Refreshed.
  Answered:  {answered} / {total}
  Ready:     {open} (current wave: {ready_ids})
  Blocked:   {blocked}
  Split:     {split} (hidden)

  INDEX.md updated: {phase_dir}/{padded_phase}-questions/INDEX.md
```

---

**"split Q-XX en N"** (or "break Q-XX into N", "decompose Q-XX"):

1. Load node `Q-XX` from JSON
2. Decompose its decision space into N (or as many as makes sense — N is a hint, not a hard cap) child sub-questions with coherent options each
3. Compute pair-wise dependencies between the new children using the logical-independence rule
4. Set `Q-XX.status = "split"`, `Q-XX.children = [child ids]`, remove its options
5. Create the child .md files under `{padded_phase}-questions/Q-XX/`
6. Rewrite INDEX.md (parent disappears, new children appear in Ready or Blocked)
7. Report the split

---

**"finalize"** (or "done", "generate context", "write context"):

Proceed to the **finalize** step.

---

**"exit markdown mode"** (or "switch to interactive"):

1. Load all currently answered questions from the JSON
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
Process all answered questions from the JSON state and generate CONTEXT.md.

1. Read `{phase_dir}/{padded_phase}-QUESTIONS.json`
2. Walk the tree depth-first; collect nodes with `status: "answered"` whose parent is either null or also answered (synthesized)
3. Format each as a decision entry:
   - Decision: the selected option label (or custom text)
   - Rationale: the option description plus any `> User:` context from the conversation thread
   - Subtree: if this node was split and later synthesized, include a compact summary of its children's decisions
4. Write CONTEXT.md using the standard context template:
   - `<decisions>` section with all answered top-level questions
   - `<deferred_ideas>` section for any unanswered leaf
   - `<specifics>` section for nuance captured in conversation threads
   - `<code_context>` section with reusable assets found during analysis
   - `<canonical_refs>` section (MANDATORY — paths to relevant specs/docs)
5. If fewer than 50% of leaves are answered, warn:

```
Warning: Only {answered}/{total} questions answered ({pct}%).
CONTEXT.md generated with available decisions. Unanswered leaves listed as deferred.
Consider running /gsd-discuss-phase {N} --markdown again to refine before planning.
```

6. Print completion:

```
CONTEXT.md written: {phase_dir}/{padded_phase}-CONTEXT.md

  Decisions captured: {answered}
  Deferred:           {open + blocked}

Next step: /gsd-plan-phase {N}
```
</step>

<success_criteria>
- DAG of questions written to JSON with nodes, children, dependencies, and parent links
- One .md file per leaf question, identically formatted at all depths (recursive tree)
- INDEX.md shows only active leaves; split parents are hidden until synthesized
- Siblings with no logical-independence violations appear as a parallel wave
- Siblings with dependencies appear as Blocked until their predecessors lock
- Checkbox-based finalization: exactly one `- [x]` ticks the answer; two ticks = ambiguous
- Auto-split triggers on complex questions; on-demand split available via `split Q-XX en N`
- Per-question conversation thread persists across refreshes
- CONTEXT.md generated in the standard format from locked answers
- `canonical_refs` section always present in CONTEXT.md (MANDATORY)
</success_criteria>
