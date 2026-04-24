<purpose>
Receive a set of gray areas (discuss-phase format) as input and emit a CONTEXT.md artifact ready for downstream consumption by research and planning agents.

This workflow is a minimal slice of `discuss-phase.md` — no user questioning, no scouting, no checkpointing. It assumes the caller has already produced the gray areas (e.g., via another workflow or the `explorer` MCP server) and only needs the output side: turning the record into a canonical CONTEXT.md on disk.
</purpose>

<activation>
Invoked via the `--explorer` flag on `/gsd:discuss-phase` (or directly by an upstream workflow that produced gray areas).

**`--explorer` is exclusive. No other flag is allowed.** If the caller stacks any other flag — `--analyze`, `--auto`, `--all`, `--batch`, `--text`, `--pro`, `--power`, `--advisor`, `--chain`, `--auto-pro`, etc. — abort at entry with a clear error:

```
[explorer] --explorer is exclusive. Got: --explorer --<other>. Re-run with --explorer alone.
```

Internally, `--explorer` runs with analyze semantics built in (per-area Option | Pros | Cons + project-tied recommendation, sourced from `codebase_context` + `prior_decisions` + `canonical_refs` — rules from `workflows/discuss-phase/modes/analyze.md`) during `write_context`. This is a hardcoded behavior of the workflow, NOT an `--analyze` overlay that can be stacked or disabled. Callers should pass `--explorer` alone.
</activation>

<required_reading>
@~/.claude/get-shit-done/workflows/discuss-phase/templates/context.md
</required_reading>

<downstream_awareness>
**CONTEXT.md feeds into:**

1. **gsd-phase-researcher** — Reads CONTEXT.md to know WHAT to research
2. **gsd-planner** — Reads CONTEXT.md to know WHAT decisions are locked

**Your job:** Persist the caller-supplied record verbatim into the canonical template. Do NOT add new gray areas, do NOT invent decisions, do NOT re-open the discussion.
</downstream_awareness>

<input_contract>
The caller MUST provide a JSON record with the following shape (mirrors the `submit_discussion` MCP tool in `explorer/server.ts`):

```json
{
  "phase": "04",
  "domain": "What this phase delivers (one line)",
  "paths": { "phase_dir": ".planning/phases/04-name", "padded_phase": "04", "phase_slug": "name" },
  "mode": "default",
  "overlays": [],
  "spec": { "loaded": false },
  "gray_areas":     [{ "label": "...", "questions": ["..."], "annotation": "..." }],
  "prior_decisions":[{ "phase": "03", "decision": "..." }],
  "decisions":      [{ "area": "...", "decision": "...", "rationale": "..." }],
  "discussion_log": [{ "area": "...", "question": "...", "options": ["..."], "selection": "...", "notes": "..." }],
  "deferred_ideas": [{ "idea": "...", "origin_area": "..." }],
  "canonical_refs": [{ "path": ".planning/...", "note": "..." }]
}
```

`paths` and `gray_areas` are required. Everything else has sensible empty defaults.
</input_contract>

<process>

<step name="receive_areas" priority="first">
Accept the input record from `$ARGUMENTS` (JSON string) or from the prior tool response in the conversation.

1. Parse the record. If parsing fails or required fields (`paths`, `gray_areas`) are missing → abort with a clear error message and do NOT touch disk.
2. Validate that `gray_areas.length` is between 1 and 4 (discuss-phase budget).
3. Normalize: fill defaults for optional arrays (`prior_decisions`, `decisions`, `discussion_log`, `deferred_ideas`, `canonical_refs` → `[]`), defaults for `spec` (`{ loaded: false }`), `mode` (`"default"`), `overlays` (`[]`).
4. Record the normalized record internally as `<discussion_record>` for the next step.

**Do NOT:** generate new gray areas, ask the user questions, spawn researcher/scout subagents, mutate `canonical_refs` beyond what the caller provided.
</step>

<step name="publish_to_explorer">
Hand the **input** of this workflow — the `gray_areas[]` plus the required `paths` — to the `explorer` Bun MCP server so the areas are cached in-process for subsequent tool calls in the same session.

**Tool call:** `mcp__explorer__submit_discussion`

**Payload:** only the input fields. The tool's Zod schema (`explorer/server.ts`) has defaults for every output field (`decisions`, `discussion_log`, `deferred_ideas`, `canonical_refs`, `prior_decisions` → `[]`; `mode` → `"default"`; `overlays` → `[]`; `spec` → `{ loaded: false }`; `config` → defaults). Do NOT forge output values — they don't exist yet at this point in the workflow.

```
mcp__explorer__submit_discussion({
  gray_areas,        // required — from receive_areas
  paths,             // required — { phase_dir, padded_phase, phase_slug }
  phase,             // optional — pass through if provided
  domain,            // optional — pass through if provided
})
```

**Connectivity check:** if the `mcp__explorer__submit_discussion` tool is not available in the session (server not started, not registered via `claude mcp add`, or crashed):
1. Log a single warning line: `[explorer] MCP tool unavailable — skipping publish, continuing to write_context.`
2. Do NOT abort — the workflow's primary output is CONTEXT.md on disk; the MCP cache is a side channel.

**On success:** read back the tool's text response (it echoes the stored counts) and carry forward to `write_context`. Do NOT mutate `gray_areas` or `paths` between this step and `write_context` — the disk artifact MUST reflect the same areas that were published.
</step>

<step name="write_context">
Render CONTEXT.md from the normalized `<discussion_record>`.

**File location:** `${paths.phase_dir}/${paths.padded_phase}-CONTEXT.md`

Read the canonical template once (lazy-loaded):
```
Read(~/.claude/get-shit-done/workflows/discuss-phase/templates/context.md)
```

Substitute live values from `<discussion_record>`:
- `[X]` → `${phase}` (fallback: `paths.padded_phase`)
- `[Name]` → derive from `paths.phase_slug` (title-case, dashes → spaces)
- `[date]` → today, ISO format (`YYYY-MM-DD`)
- `${padded_phase}` → `paths.padded_phase`
- Domain → `domain` field (one-line, as provided)
- Gray areas list → render each `{label, questions[], annotation}` in the template's area block
- Decisions → one bullet per `decisions[]` entry, grouped under the matching `area`
- Prior decisions → render under "Carrying forward from earlier phases" when non-empty
- Deferred ideas → render under "Noted for Later" when non-empty
- Canonical refs → render with full relative paths; if empty, write "No external docs referenced."
- **Trade-off analysis (built into `--explorer`):** for each gray area, synthesize and render one Option | Pros | Cons markdown table followed by `💡 Recommended: <option> — <rationale>`. Sourcing rules live in `workflows/discuss-phase/modes/analyze.md` (pros/cons from `codebase_context` + `prior_decisions`, recommendation tied to a concrete project hook from `canonical_refs` or `codebase_context`). Pure in-context synthesis — no `Task()`, no Context7, no web search. If `codebase_context` is empty, emit the table anyway and tag the section `(generic — pre-scout)` so downstream agents know to re-evaluate.

**SPEC.md integration** — when `spec.loaded === true`:
- Include the `<spec_lock>` section immediately after `<domain>`
- Add `.planning/SPEC.md` to canonical refs with note "Locked requirements — MUST read before planning" (only if not already present)
- Do NOT duplicate requirement text into `<decisions>`

**Skip conditional sections** — when their source arrays are empty:
- "Folded Todos" / "Reviewed Todos" → omit entirely (this workflow never touches todos)
- "Noted for Later" → omit when `deferred_ideas` is empty
- "Carrying forward…" → omit when `prior_decisions` is empty

Write the file. If `paths.phase_dir` does not exist yet:
```bash
mkdir -p "${paths.phase_dir}"
```

Confirm with a single line: `Wrote ${paths.phase_dir}/${paths.padded_phase}-CONTEXT.md (N gray areas, M decisions).`
</step>

<step name="confirm_creation">
Present a short summary so the caller can verify:

```
Created: ${paths.phase_dir}/${paths.padded_phase}-CONTEXT.md

## Summary
- Gray areas:      {N}
- Decisions:       {M}
- Prior decisions: {K}
- Deferred ideas:  {D}
- Canonical refs:  {R}

## Next
The record is on disk in the canonical template. Downstream agents
(gsd-phase-researcher, gsd-planner) can consume it directly.
```

Do NOT auto-advance to planning. This workflow's scope ends at CONTEXT.md emission.
</step>

</process>

<out_of_scope>
This workflow intentionally omits what `discuss-phase.md` does around it:
- `scout_codebase`, `analyze_phase`, `present_gray_areas`, `discuss_areas` (input-side steps)
- `git_commit`, `update_state`, `auto_advance` (bookkeeping steps)
- Mode overlays (`--auto`, `--advisor`, `--text`, `--batch`, `--analyze`, `--pro`, `--power`, `--all`, `--chain`)
- Checkpoint writing / session resume
- DISCUSSION-LOG.md generation

If any of these are needed, use the full `discuss-phase.md` workflow instead.
</out_of_scope>
