# POC Validation — Phase 4 Webview Infrastructure

**Status:** Awaiting human verification (Task 3 of Plan 04-05)
**POC scope (locked):** RENDERER-CONTRACT.md §8 — 1 screen "4 gray areas + snippet + toggle"
**Phase 4 goal-backward criterion:** Round-trip end-to-end works (browser submit → MCP `accept`).

***

## Automated Verification (already passing)

| Check | Source | Result |
|---|---|---|
| Catalog declares 36 shadcn + 6 GSD components | `src/components/components.test.tsx` | ✓ Plan 04-03 |
| Registry installs Button override routing props.action to host hooks | `src/components/components.test.tsx` (override unit test) | ✓ Plan 04-03 |
| 6 GSD components render correctly in isolation | `src/components/components.test.tsx` | ✓ Plan 04-03 |
| Adapter maps requested_schema → spec for 4 input shapes | `tests/gsd-bridge-spec-adapter.test.cjs` | ✓ Plan 04-04 |
| Sidecar HTTP server binds 127.0.0.1, single-shot POST /submit, body cap 1 MB | `tests/gsd-bridge-submit-server.test.cjs` | ✓ Plan 04-04 |
| Hook injects spec + __gsdSubmitUrl into per-session HTML | `tests/gsd-bridge-elicitation-injection.test.cjs` | ✓ Plan 04-04 |
| `</script>` escape prevents script-tag breakout | `tests/gsd-bridge-elicitation-injection.test.cjs` | ✓ Plan 04-04 |
| Path containment for per-session HTML | `tests/gsd-bridge-elicitation-injection.test.cjs` | ✓ Plan 04-04 |
| End-to-end round-trip: POST to sidecar → response.json → hook exits accept | `tests/gsd-bridge-elicitation-injection.test.cjs` | ✓ Plan 04-04 |
| POC spec structure (5 children, 4 cards, snippet, status, actions) | `src/poc/poc.test.tsx` | ✓ Plan 04-05 Task 1 |
| Spec-rendered Submit calls window.__gsdSubmit with structured payload | `src/poc/poc.test.tsx` | ✓ Plan 04-05 Task 1 |
| Spec-rendered Reset clears submitted marker via window.__gsdReset | `src/poc/poc.test.tsx` | ✓ Plan 04-05 Task 1 |
| PocScreen renders NO parallel HTML buttons (spec = single source of truth) | `src/poc/poc.test.tsx` | ✓ Plan 04-05 Task 1 |
| Build is single-file ≤ 1 MB | `wc -c dist/index.html` (605 kB observed) | ✓ Plan 04-05 Task 1 |

***

## Human Verification Steps (Task 3 checkpoint)

### Step 1 — Dev mode visual inspection

```bash
cd plugins/gsd-bridge/webview
npm run dev
# Open the URL printed by Vite (typically http://localhost:5173)
```

Visually confirm:

- [ ] **StageBanner** renders at top with `━━━...━━━` rule + `⚡ GSD ► PHASE 4 POC` + bottom rule, in `--gsd-accent` blue, monospace
- [ ] **4 GrayAreaCards** render in a horizontal row (Stack `direction: horizontal`), each with the correct title (`Gray Area 1: stack`, `Gray Area 2: catalog scope`, `Gray Area 3: build pipeline`, `Gray Area 4: adapter location`)
- [ ] Each card shows 2 options; the **selected** option (e.g. `json-render + shadcn`) is in `--gsd-accent` blue with a left border, the **unselected** option is in `--gsd-fg-muted` grey
- [ ] Card 2 shows the follow-up note "Final 6 GSD components selected in Plan 04-01."
- [ ] **SnippetToggle** is collapsed by default with a `json` label and an `expand` button; clicking expand reveals the JSON
- [ ] **StatusPill** shows `○ awaiting submit` in `--gsd-warning` (yellow background)
- [ ] **Submit** button is `--gsd-accent` blue background with white text, "submit" label, monospace (rendered FROM THE SPEC via the registry's GsdButtonOverride — no separate HTML button)
- [ ] **Reset** button is `--gsd-surface-variant` grey background with white text, "reset" label

### Step 2 — Submit round-trip in dev mode (without hook)

- [ ] Open browser DevTools console
- [ ] Click `submit`
- [ ] DevTools console shows the dev-fallback log line from the Button override (e.g. `[gsd] action submit fired (no host) {action: 'submit', selections: [...4 items], snippet_expanded: false, ts: '2026-...'}`)
- [ ] The `✓ submitted` marker appears below the spec-rendered area
- [ ] Click `reset` — the marker disappears (Button override called `window.__gsdReset` which PocScreen registered on mount)

### Step 3 — Built artefact serves locally via file://

```bash
cd plugins/gsd-bridge/webview
npm run build
open dist/index.html      # macOS — or xdg-open on Linux, start on Windows
```

- [ ] The page renders identically to dev mode (StageBanner, 4 cards, snippet, status pill, Submit + Reset buttons)
- [ ] DevTools shows no console errors (only the dev-fallback log line on submit, expected)
- [ ] No external network requests in the Network tab (single-file bundle, all assets inline)
- [ ] `wc -c dist/index.html` returns ≤ 1 048 576 (≤ 1 MB)

### Step 4 — Round-trip with the hook + sidecar HTTP server (REQUIRED for goal-backward criterion)

This step requires the Phase 1 MCP server + the Claude Code session loaded with the gsd-bridge plugin. It exercises the full chain: hook starts the sidecar HTTP server on `127.0.0.1:<random-port>` → injects `window.__gsdSubmitUrl` into the per-session HTML → user clicks the spec-rendered Submit button → GsdButtonOverride calls `window.__gsdSubmit(payload)` → fetch POST → sidecar writes `response.json` → hook polling picks it up → MCP receives `{action:'accept', content:<payload>}`.

```bash
# In a Claude Code session with the gsd-bridge plugin enabled, trigger an elicitation
# from the gsd-bridge MCP server (e.g., via `/mcp gsd-bridge:show_form` or a test command).
# The hook gsd-bridge-elicitation.cjs intercepts and:
#  1. Detects plugins/gsd-bridge/webview/dist/index.html exists
#  2. Calls adaptRequestedSchemaToSpec
#  3. Starts the sidecar HTTP server on 127.0.0.1 (random port)
#  4. Writes .planning/.bridge/<session>/index.html with spec + __gsdSubmitUrl injected
#  5. Writes pending.json with mode='url', file://..., submit_url=http://127.0.0.1:<port>/submit
```

- [ ] `cat .planning/.bridge/pending.json` shows `"mode": "url"`, `"rendered_via": "webview"`, AND `"submit_url": "http://127.0.0.1:<port>/submit"`
- [ ] The session HTML file exists at `.planning/.bridge/<session_id>/index.html` and contains `window.__gsdSubmitUrl = "http://127.0.0.1:<port>/submit"` (grep the file to confirm)
- [ ] Opening that file in a browser shows the rendered form (with the elicitation's actual `requested_schema` mapped to inputs, NOT the dev-mode POC fallback)
- [ ] Clicking the spec's Submit button in the browser causes the sidecar to receive a POST and atomically write `.planning/.bridge/response.json` with `{action: 'accept', content: ...}`
- [ ] The hook exits 0 with `{ hookSpecificOutput: { hookEventName: 'Elicitation', action: 'accept', content: ... } }` — Claude Code resumes with the user's response

> **If a Phase 1 session is unavailable**, mark this step Skipped — the goal-backward criterion is then proven by the automated end-to-end test in Plan 04-04 (`tests/gsd-bridge-elicitation-injection.test.cjs`) which exercises the same path in-process.

### Step 5 — Brand-fit cross-check against ui-brand.md

Open `get-shit-done/references/ui-brand.md` side-by-side with the rendered POC.

- [ ] Color palette matches (compare hex `#0b0d10` background, `#4a9eff` accent)
- [ ] Font stack matches (JetBrains Mono visible, fallback Menlo if not installed)
- [ ] Status symbols match (`○` pending; would show `✓` complete on accept)
- [ ] StageBanner ASCII rule width is 62 chars (count manually if needed)
- [ ] ASCII Progress (not in this POC but in catalog) matches the spec — defer to a later POC if not visible

***

## Observed Result

> **To be filled by the human verifier in Task 3.**

| Step | Result | Notes |
|---|---|---|
| 1 (Dev visual) | ☐ Pass / ☐ Fail | |
| 2 (Dev submit round-trip) | ☐ Pass / ☐ Fail | |
| 3 (Built file:// inspection) | ☐ Pass / ☐ Fail | |
| 4 (Hook + sidecar round-trip) | ☐ Pass / ☐ Fail / ☐ Skipped (no Phase 1 session available) | |
| 5 (Brand-fit cross-check) | ☐ Pass / ☐ Fail | |

**Verdict:** ☐ APPROVED / ☐ REJECTED — go/no-go for Phase 3 to consume the catalog + registry.

> Tick exactly one box:
>
> - ☐ **APPROVED** — POC validated end-to-end; Phase 4 ready for downstream consumers.
> - ☐ **REJECTED** — fails verification; specify what's broken in the Deviations section below; gap closure routed to a new plan.

**Deviations / known gaps:**
- (record any visual or functional gap; create a follow-up todo in `.planning/todos/pending/` if needed)

***

## Re-run

To re-validate after a change:

1. `cd plugins/gsd-bridge/webview && npm run typecheck && npm run test && npm run build`
2. Repeat Steps 1-5 above
3. Update the Observed Result table

***

*Plan 04-05 Task 2. Human verification gated by Task 3 (`checkpoint:human-verify`).*
