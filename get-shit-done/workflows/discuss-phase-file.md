<purpose>
Markdown mode for discuss-phase. One `.md` per question (DAG of dependencies) + `INDEX.md` dashboard. User answers in editor; locked answers synthesize into CONTEXT.md.
</purpose>

<trigger>
Executes when `--markdown` flag is passed to `/gsd-discuss-phase`.

Caller provides: `phase_dir`, `padded_phase`, `phase_number`, `phase_name`, `phase_slug`. Begin at Step 1 immediately.
</trigger>

<step name="analyze">
1. Load PROJECT.md, REQUIREMENTS.md, STATE.md, prior CONTEXT.md files
2. Scout codebase for reusable assets relevant to this phase
3. Read phase goal from ROADMAP.md
4. Identify all gray areas; generate 2–4 concrete options with tradeoffs for each

Do not ask the user anything. Proceed directly to generate_tree.
</step>

<step name="generate_tree">
Write to `{phase_dir}/questions/`:

```
questions/
  INDEX.md
  INBOX.md
  Q-01.md
  Q-02.md
  blocked/
    Q-03.md
```

**Per-question template** (all levels — recursive):

```
---
id: {node_id}
title: {node_title}
status: leaf | blocked | answered | split
parent: {parent or null}
children: []
dependencies: []   # e.g. [Q-03]
answer: null
conversation_length: 0
---

# {node_id} — {node_title}

**Context:** {context}

**Dependencies:** {none | waiting for {ids}}

**Options** (tick exactly one box to finalize):
- [ ] (a) {label} — {description}
- [ ] (b) {label} — {description}
- [ ] (c) {label} — {description}
- [ ] (d) Custom — write value in Discussion

**Discussion:**

> Claude: {opening nudge — first generation only}

<!-- > User: your text -->

**Split:** no
```

**Placement:** `status: blocked` → write under `blocked/`. Otherwise write at root. Never mix.

**Split parent:** write `.md` with `**Status:** split into {children}` instead of options.

**INBOX.md:** Always create with:
```
<!-- INBOX.md — écrivez librement (texte, URLs, idées). Au prochain refresh, le contenu est archivé et des questions sont extraites dans l'arbre. -->
```
Do not overwrite if already exists (resumed session).

**INDEX.md** (reads frontmatters — no JSON):

```markdown
# Phase {N} — {phase_name} — Questions ({answered}/{total} answered)

## Ready
- [ ] [Q-01 — {title}](Q-01.md)

## Blocked
- Q-03 — waits on: Q-02

## Answered
- [x] Q-04

## Notes
Tick one checkbox to finalize. Say "refresh" to Claude.
```

Only leaves appear (`leaf`, `blocked`, `answered`). `split` parents are hidden until all children are answered, then resurrected with synthesized answer.

**Auto-split heuristics** — create as split parent instead of leaf when:
- More than 4 options
- Mixes 2+ orthogonal decision axes
- Context exceeds ~150 words
- Options require prerequisite sub-decisions

**Dependency rule:** Mark `B.dependencies = [A]` only if a valid answer to A would empty or materially alter B's option space. Independent siblings appear in the same wave.
</step>

<step name="notify_user">
```
Questions ready for Phase {N}: {phase_name}

  {phase_dir}/questions/
    INDEX.md  — questions actives
    INBOX.md  — écrivez librement, refresh extrait les questions
    Q-XX.md   — cochez [x] pour finaliser
    blocked/  — remontées auto dès que leurs deps sont résolues

  {total} questions. {open} actives dans la vague courante.

Commands: "refresh" · "refresh Q-XX" · "split Q-XX en N" · "finalize" · "exit markdown mode"
```
</step>

<step name="wait_loop">
**"refresh"** (aliases: "process answers", "update", "re-read"; optionally scoped to "refresh Q-XX"):

1. **INBOX** — if `INBOX.md` has content (> ~200 bytes ignoring the comment): read, extract questions as new Q-XX.md files, archive to `INBOX-{timestamp}.md`, recreate empty INBOX.md.
2. **Questions** — for each in-scope leaf: invoke @$HOME/.claude/get-shit-done/workflows/discuss-question-markdown.md with node id + file path. After all return: re-evaluate DAG (unblock satisfied deps, regenerate invalidated options, resurrect fully-answered split parents).
3. **Physical moves** — `mv` (not copy+delete): `leaf → blocked` → move to `blocked/`; `blocked → leaf` → move to root. `answered`/`split` stay in place.
4. **INDEX** — rebuild from frontmatter scan of all `*.md` in `questions/` and `questions/blocked/`.

```
Refreshed.
  Answered: {answered}/{total} · Ready: {open} ({ready_ids}) · Blocked: {blocked}
  INDEX.md updated: {phase_dir}/questions/INDEX.md
```

---

**"split Q-XX en N"** (aliases: "break Q-XX into N", "decompose Q-XX"):

1. Read Q-XX.md frontmatter
2. Decompose into N children (N is a hint — use as many as logically needed)
3. Apply dependency rule between children
4. Update frontmatter: `status: split`, `children: [...]`, remove options
5. Write child files under `questions/Q-XX/` with full frontmatter
6. Rebuild INDEX.md

---

**"finalize"** (aliases: "done", "generate context", "write context") → go to finalize step.

---

**"exit markdown mode"** (alias: "switch to interactive"):
Scan frontmatters; collect `status: answered` questions; feed into discuss-phase.md accumulator; continue standard flow for remaining questions.

---

**Any other message:** reply, then remind: `(Markdown mode — "refresh" · "refresh Q-XX" · "split Q-XX en N" · "finalize" · "exit markdown mode")`
</step>

<step name="finalize">
1. Scan `questions/*.md` and `questions/blocked/*.md`. For each file: parse frontmatter; collect if `status == answered`. Skip `INBOX*.md` and `INDEX.md`.
2. Walk answered nodes depth-first. Per node: Decision = selected option label or custom text; Rationale = option description + `> User:` context; Subtree = children's decisions if split.
3. Write `{phase_dir}/{padded_phase}-CONTEXT.md`:
   - `<decisions>` — answered top-level questions
   - `<deferred_ideas>` — unanswered leaves
   - `<specifics>` — conversation thread nuance
   - `<code_context>` — reusable assets from analyze
   - `<canonical_refs>` — MANDATORY paths to relevant specs/docs
4. If < 50% answered: warn and list deferred.

```
CONTEXT.md written: {phase_dir}/{padded_phase}-CONTEXT.md
  Decisions: {answered} · Deferred: {open + blocked}

Next: /gsd-plan-phase {N}
```
</step>

<success_criteria>
- `questions/` folder (no padded_phase prefix); blocked questions under `questions/blocked/`
- Each Q-XX.md has YAML frontmatter as single source of truth — no QUESTIONS.json
- INBOX.md created at root; not overwritten on resume
- INDEX.md rebuilt from frontmatter scan after every refresh
- Physical `mv` for blocked ↔ leaf transitions
- Auto-split on heuristics; on-demand split via "split Q-XX en N"
- CONTEXT.md from frontmatter scan; `canonical_refs` section mandatory
</success_criteria>
