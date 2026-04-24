# --pro mode — progressive question generation with conditional follow-ups

> **Lazy-loaded overlay.** Read this file from `workflows/discuss-phase.md`
> before `<step name="discuss_areas">` when `--pro` is present in
> `$ARGUMENTS`. This overlay **replaces** `discuss_areas` and `write_context`
> via step-hooks; all pre-steps (`check_*`, `load_*`, `scout_codebase`,
> `analyze_phase`) of the dispatcher run normally before this overlay
> activates. Combinable with `--chain`.

<purpose>
Overlay `--pro` — **step-hook mode** (same family as `--batch`, `--analyze`, `--all`).

**How it activates** (step-hook, not exit-standard-flow):
- The dispatcher's pre-steps run normally: `check_blocking_antipatterns` →
  `check_spec` → `check_existing` → `load_prior_context` →
  `cross_reference_todos` → `scout_codebase` → `analyze_phase`.
- When the dispatcher reaches `<step name="discuss_areas">`, it Reads this
  file first, which declares two `_override` steps that substitute:
  - `<step name="discuss_areas_override">` replaces `discuss_areas`
  - `<step name="write_context_override">` replaces `write_context`
- All other dispatcher steps (`confirm_creation`, `git_commit`, `update_state`,
  `auto_advance`) run unchanged.

**What `--pro` provides over the default `discuss_areas`:**
- Bulk-JSON generation (writes `{padded_phase}-PRO-QUESTIONS.json` with all
  gray areas upfront + conditional follow-ups)
- File-based wait loop (user edits JSON out-of-band, then triggers `refresh`
  or `finalize`)
- Strict finalize-abort gate (aborts if any `criticality: required` question
  is unanswered — D-13)
- Transparent exhaustive context per question (D-NEW-19)

**What `--pro` does NOT do:**
- Analyze the phase (delegated to `analyze_phase` of dispatcher — consumes
  its output `gray_areas` + `canonical_refs`)
- Scout the codebase (delegated to `scout_codebase`)
- Load prior context (delegated to `load_prior_context`)
- Render HTML (Phase 3 concern)
</purpose>

<required_reading>
@get-shit-done/workflows/discuss-phase/templates/pro-questions-schema.json
@get-shit-done/workflows/discuss-phase/templates/context.md
@get-shit-done/workflows/browser-bridge.md
</required_reading>

<step name="discuss_areas_override">
**Replaces:** `<step name="discuss_areas">` of the dispatcher.

**Inputs (already computed by prior dispatcher steps):**
- `gray_areas` — from `<step name="analyze_phase">` (phase analysis output)
- `canonical_refs` accumulator — from `analyze_phase` (initial refs)
- `codebase_context` — from `scout_codebase` (exhaustive context per D-NEW-19)
- `prior_decisions` — from `load_prior_context`
- `folded_todos` / `reviewed_todos` — from `cross_reference_todos`
- `phase_dir`, `padded_phase`, `phase_number`, `phase_name`, `phase_slug` — from `initialize`

**Sub-step 1 — generate_json:**

Write `{phase_dir}/{padded_phase}-PRO-QUESTIONS.json` conforming to
`pro-questions-schema.json`. Rules:
- Filename MUST be `{padded_phase}-PRO-QUESTIONS.json` (D-06 — avoids collision
  with `--power` which uses `{padded_phase}-QUESTIONS.json`).
- For each gray area from `analyze_phase`, emit one section (`{ id, title, questions[] }`).
- Each question:
  - `criticality: "required"` by default (D-13 — unless analysis explicitly flags
    an area as optional).
  - `follow_up: null` by default. When a gray area has a conditional sub-decision,
    emit `follow_up: { "trigger": "<option_id_or_conditional>", "question": { ...nested question shape... } }`
    (D-08, D-NEW-18).
  - `context` field is **exhaustive** per D-NEW-19: inline codebase annotations
    from `codebase_context`, referenced ADRs/specs from `canonical_refs`, prior
    decisions from `prior_decisions`, and raw code snippets when relevant.
  - This schema omits the freeform-UI field present in `--power` (D-16).
- `stats`: `{ total, answered: 0, remaining: <total>, required_unanswered: <count of required> }`.
- `generated_at`: current ISO-8601 timestamp.

Write the file with a single Write tool call. If
`{phase_dir}/{padded_phase}-PRO-QUESTIONS.json` already exists from a prior
invocation (e.g., resumed phase, `refresh` loop re-entry, or recovery), the
dispatcher MUST `Read` it BEFORE calling `Write` — the Claude Code subagent
runtime enforces Read-before-Write above the permission layer (see CLAUDE.md
§"Subagent Quirk (Claude Code)"), and skipping the Read blocks the Write
without a permission prompt. The pristine-invocation path (no pre-existing
file) needs no Read.

**Sub-step 2 — notify_user:**

Print to the user (CLI only — no HTML companion, that is Phase 3):

```
Generated {padded_phase}-PRO-QUESTIONS.json at {phase_dir}/ with {total} questions
({required_count} required, {optional_count} optional).

Open the file and fill in the `answer` field for each question. Then reply with:
- `refresh`    — re-read the file, apply triggered follow-ups, show updated stats.
- `finalize`   — validate all required questions are answered, then write CONTEXT.md.
- `explain Q-N`— print the exhaustive `context` for question Q-N.
```

**Sub-step 3 — show_playground_optional:**

Fire-and-forget: invoke `show_playground` via the `gsd-bridge` plugin so the user
sees the 8-step diagram while filling `{padded_phase}-PRO-QUESTIONS.json` out-of-band.

**URL contract (per `get-shit-done/workflows/browser-bridge.md` Sub-step
`invoke_show_playground`, lines 51-55):** `show_playground` accepts a `url` string
in either `file://<absolute-path>` or `http://localhost:PORT` form. The `url`
parameter is forwarded verbatim by the plugin (see
`plugins/gsd-bridge/src/tools.ts:143-147` — no `bridgeDir` traversal guard is
applied to `url`, so `browser-bridge.md` critical rule 2 does not apply here;
rule 2 targets filesystem-path arguments resolved under cwd, not URL arguments
forwarded to the browser).

**Resolution:** `{phase_dir}` is project-relative (e.g.,
`.planning/phases/03-discuss-webview-integration`). The dispatcher MUST
resolve it to an absolute path before building the URL (e.g., via
`path.resolve(phase_dir)` in the SDK, or the equivalent cwd-join in the
runtime). The placeholder `{phase_dir_abs}` in the example below stands for
this resolved absolute path. Do NOT emit `file://{phase_dir}/...` with a
relative `phase_dir` — `file://.planning/...` parses `.planning` as the URL
host and never resolves to a local file.

    Tool: show_playground
    Args: {
      "url": "file://{phase_dir_abs}/discuss-playground.html"
    }

**Fallback:** if the plugin is absent, the file does not exist, the URL is
malformed for any reason, or the tool returns `isError: true`, log
`[bridge] <error>` to the terminal and proceed to Sub-step 4. No retry —
per `browser-bridge.md` critical rule 3, two consecutive timeouts mean the
browser is not connected; do not block the workflow.

**Sub-step 4 — wait_loop:**

Enter a loop. On each user message:

1. Parse the user's reply (case-insensitive). Match against `refresh`, `finalize`,
   or `explain Q-N`.
2. If `refresh`:
   - Re-read the JSON file (wrap JSON.parse in try/catch per T-02-04-01; if parse
     fails, print error and stay in loop).
   - For each question where `answer !== null` AND `follow_up !== null` AND
     `answer === follow_up.trigger` AND the follow-up `id` is not already in
     the parent section's `questions[]`, APPEND `follow_up.question` to that
     section (D-08, D-NEW-18).
   - Recompute `stats`: update `answered`, `remaining`, `required_unanswered`.
   - Write the updated JSON back to disk.
   - Print: "N answered / M total, K required remaining." Return to top of loop.
3. If `finalize`: proceed to `<step name="write_context_override">`. Do NOT
   re-enter this loop unless write_context_override aborts.
4. If `explain Q-N`: look up question `Q-N` in JSON; print its `context` field
   verbatim (exhaustive per D-NEW-19). Return to top of loop.
5. Otherwise (freeform message): reprint the 3 commands and return to loop.

No AskUserQuestion in this step — interaction is file-based + freeform CLI.
</step>

<step name="write_context_override">
**Replaces:** `<step name="write_context">` of the dispatcher.

**Finalize-abort-strict gate (D-13):**

1. Re-read `{phase_dir}/{padded_phase}-PRO-QUESTIONS.json` (try/catch JSON.parse
   per T-02-04-01).
2. Scan `sections[].questions[]` recursively (including appended follow-ups).
3. Collect all questions where `q.criticality === "required"` AND
   `q.status !== "answered"`.
4. **If the list is non-empty:** ABORT. Print:

```
Cannot finalize: {N} required questions remain unanswered.

Unanswered Q-IDs: [Q-XX, Q-YY, ...]

Edit {padded_phase}-PRO-QUESTIONS.json to fill in `answer` and set
`status: "answered"` for each, then re-run `finalize`.
```

   Return to `wait_loop` in `discuss_areas_override`. Do NOT write CONTEXT.md.

5. **If the list is empty:** Proceed to write CONTEXT.md:
   - Read `workflows/discuss-phase/templates/context.md` (lazy-loaded).
   - Map each JSON section to a `<decisions>` subsection, each answered question
     to a decision line. Preserve `canonical_refs` from `analyze_phase`.
     Preserve `folded_todos` / `reviewed_todos` if present.
   - Write to `{phase_dir}/{padded_phase}-CONTEXT.md` in standard format
     (D-12 — downstream researcher/planner see no difference).

After CONTEXT.md is written, control returns to the dispatcher's
`<step name="confirm_creation">`, then `git_commit`, `update_state`, and
`auto_advance` (which handles `--chain` via `modes/chain.md`).
</step>

## Combination rules

- `--pro --auto`: pro wins. Pro mode is incompatible with autonomous selection —
  its purpose is transparent expert review that requires user input.
- `--pro --chain`: after `write_context_override` writes CONTEXT.md, the
  dispatcher's `auto_advance` step runs normally (per `modes/chain.md`).
- `--pro --all`: pro wins over `--all` (pro already covers every gray area in bulk).
- `--pro --batch` / `--pro --analyze`: pro replaces `discuss_areas` entirely, so
  `--batch` / `--analyze` overlays of that step become no-ops. No conflict.
- `--pro --text`: pro does not use AskUserQuestion in its override (file-based +
  freeform CLI), so `--text` is a no-op for the override steps.

## References

- Schema template: `get-shit-done/workflows/discuss-phase/templates/pro-questions-schema.json`
- Step-hook pattern analogs: `get-shit-done/workflows/discuss-phase/modes/batch.md`,
  `get-shit-done/workflows/discuss-phase/modes/analyze.md`
- File-state pattern (refresh/finalize loop inspiration): `get-shit-done/workflows/discuss-phase-power.md`
- Deferred coherence validation (D-07): todo `validation-cross-questions-pro`
- CONTEXT.md template: `get-shit-done/workflows/discuss-phase/templates/context.md`
- Browser bridge invocation pattern: `get-shit-done/workflows/browser-bridge.md`
- Phase 3 playground artefact: `.planning/phases/{padded_phase}-discuss-webview-integration/discuss-playground.html`
- gsd-bridge plugin docs: `plugins/gsd-bridge/README.md`
