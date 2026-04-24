---
phase: 03-discuss-webview-integration
plan: "03"
subsystem: discuss-phase-pro
tags: [workflow, discuss-phase, pro, bridge, show_playground, phase3, INTEG-05]
dependency_graph:
  requires: [03-01, 02-05]
  provides: [INTEG-05]
  affects: [get-shit-done/workflows/discuss-phase/modes/pro.md]
tech_stack:
  added: []
  patterns: [fire-and-forget show_playground, isError fallback, step-hook overlay]
key_files:
  created: []
  modified:
    - get-shit-done/workflows/discuss-phase/modes/pro.md
decisions:
  - "show_playground invoked fire-and-forget between notify_user and wait_loop; no retry on isError per browser-bridge.md critical rule 3"
  - "Sub-step kept to 15 lines to stay within D-NEW-22 budget (<= 200 lines); plan's ~203 target adjusted down"
  - "No dispatcher edit — existing --pro step-hook mapping routes automatically via modes/pro.md"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-24T04:37:07Z"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 03 Plan 03: Wire show_playground into --pro overlay Summary

## One-liner

Fire-and-forget `show_playground` injection into `--pro` overlay connecting Phase 1 bridge to Phase 3 playground via a new Sub-step 3 with silent `isError` fallback to existing CLI flow.

## What Was Built

Modified `get-shit-done/workflows/discuss-phase/modes/pro.md` (174 → 195 lines) with three surgical edits:

1. **`<required_reading>` extended** — added `@get-shit-done/workflows/browser-bridge.md` so downstream changes to bridge protocol are picked up without re-editing pro.md.

2. **New Sub-step 3 — `show_playground_optional`** inserted between `notify_user` (sub-step 2) and the renamed `wait_loop` (sub-step 4). The sub-step invokes `show_playground` with `file://{phase_dir}/discuss-playground.html`. Fallback on absent plugin, missing file, or `isError: true` logs `[bridge] <error>` and falls through — no retry, no blocking.

3. **`## References` extended** — added bullets for browser-bridge.md, Phase 3 playground artefact, and gsd-bridge plugin docs.

## Output Spec Verification

- **Final pro.md line count:** 195 (range [190, 250] — PASS; D-NEW-22 <= 200 — PASS)
- **`git diff --stat` output:** `1 file changed, 23 insertions(+), 1 deletion(-)`
- **`tests/discuss-phase-pro.test.cjs` result:** `pass 21 / fail 0` — all 21 tests pass
- **`get-shit-done/workflows/discuss-phase.md` modified:** NO (dispatcher unchanged, 499 lines)

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update pro.md with show_playground sub-step + browser-bridge @-import | 0655a15 | get-shit-done/workflows/discuss-phase/modes/pro.md |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Budget Constraint] Shortened show_playground_optional sub-step to 15 lines**
- **Found during:** Task 1 execution
- **Issue:** The plan's provided replacement text for Edit 2 was ~31 lines; adding it plus edits 1 and 3 would bring pro.md to ~207 lines, exceeding the `tests/discuss-phase-pro.test.cjs` hard assertion of `<= 200 lines` (D-NEW-22). The plan's "target ~203" conflicts with the test constraint.
- **Fix:** Condensed the sub-step description from ~31 lines to 15 lines while preserving all semantically required content: `show_playground` invocation block, `{phase_dir}` resolution note, fallback condition covering absent plugin / missing file / `isError: true`, and `[bridge]` log prefix.
- **Files modified:** get-shit-done/workflows/discuss-phase/modes/pro.md
- **Commit:** 0655a15

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The `file://` URL is composed from SDK-resolved `{phase_dir}` with fixed basename; no user input interpolated. Threat register items T-03-03-01 through T-03-03-05 are addressed inline in the sub-step copy (bridgeDir guard, no retry on timeout, local-only artefact).

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `get-shit-done/workflows/discuss-phase/modes/pro.md` | FOUND |
| `.planning/phases/03-discuss-webview-integration/03-03-SUMMARY.md` | FOUND |
| Commit 0655a15 | FOUND |
