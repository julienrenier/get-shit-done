---
name: gsd:fetch-phase-docs
description: Fetch docs from URL, GitHub folder, or pasted text into a phase's refs/ folder via an interactive loop
argument-hint: "[phase_number]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
  - WebFetch
---

<objective>
Ingest reference documentation into `.planning/phases/<NN>-<slug>/refs/` via an interactive loop. Each iteration the user picks a source type — URL (WebFetch), GitHub folder (`gh api`), or pasted text — and the fetched content is written as a `.md` file inside the phase's `refs/` directory. Designed to feed the `gsd-phase-researcher` agent with external docs before `/gsd:research-phase` or `/gsd:plan-phase`.

Routes to the fetch-phase-docs workflow which handles:
- Phase resolution (from argument or interactive list)
- `refs/` directory creation
- Interactive loop with 4 options (URL / GitHub / Text / Done)
- Per-source validation and sanitization
- Summary of added files with next-step hints
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/fetch-phase-docs.md
</execution_context>

<context>
Arguments: $ARGUMENTS (optional phase number like `1` or `2.1`)

If the phase number is provided, the workflow resolves the phase directory immediately. Otherwise it lists phases from ROADMAP.md and prompts for selection.
</context>

<process>
**Follow the fetch-phase-docs workflow** from `@~/.claude/get-shit-done/workflows/fetch-phase-docs.md`.

The workflow handles all logic including:
1. Phase resolution (argument or interactive list from ROADMAP.md)
2. `refs/` directory creation
3. Interactive ingest loop:
   - URL via WebFetch
   - GitHub folder via `gh api` (recursive walk, base64 decode)
   - Pasted text with filename prompt
4. Per-source validation (filename regex, size limit, path traversal rejection)
5. Summary with next-step commands
</process>
