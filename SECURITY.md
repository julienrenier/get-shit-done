# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@gsd.build** (or DM @glittercowboy on Discord/Twitter if email bounces)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity, but we aim for:
  - Critical: 24-48 hours
  - High: 1 week
  - Medium/Low: Next release

## Scope

Security issues in the GSD codebase that could:
- Execute arbitrary code on user machines
- Expose sensitive data (API keys, credentials)
- Compromise the integrity of generated plans/code

## Recognition

We appreciate responsible disclosure and will credit reporters in release notes (unless you prefer to remain anonymous).

---

## Phase Audit Log

### Phase 03 — discuss-webview-integration (Plans 01-04)

**Audit Date:** 2026-04-24
**ASVS Level:** L1
**Auditor:** gsd-security-auditor
**Block-on:** critical_high

**Note on scope:** Plan 05 (gap-closure) is declared but NOT executed (no 03-05-SUMMARY.md exists). Its 3 threats (T-03-05-01, T-03-05-02, T-03-05-03) are deferred to post-execution audit per audit constraints.

#### Threat Verification Results

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-03-01-01 | Tampering | mitigate | CLOSED | No `innerHTML` or `eval` call found anywhere in discuss-playground.html (grep exit 0). JSON payload parsed via `JSON.parse(document.getElementById('steps-data').textContent)` at line 366. |
| T-03-01-02 | Info Disclosure | accept | CLOSED | See accepted risks log below. |
| T-03-01-03 | Elevation of Privilege | mitigate | CLOSED | No `<link rel="stylesheet">`, `<script src=`, `src="https?://`, `href="https?://"`, `@import`, or `url(http` in discuss-playground.html (grep exit 0). |
| T-03-01-04 | DoS | mitigate | CLOSED | File is 38,448 bytes — within the 60 KB (61,440 byte) budget. |
| T-03-01-05 | Spoofing | accept | CLOSED | See accepted risks log below. |
| T-03-02-01 | Tampering/Injection | mitigate | CLOSED | No `.innerHTML` assignment anywhere in discuss-playground.html (grep exit 0). All DOM writes use `.textContent` (lines 446, 449, 452, 456, 477, 502, 519, 520, 542, 545) or `setAttribute`. |
| T-03-02-02 | Elevation of Privilege | mitigate | CLOSED | `buildCommand(st)` at line 397 returns `/gsd-discuss-phase {n}` + optional ` --{preset}` from a 3-token domain. `navigator.clipboard.writeText(buildCommand(state))` at line 671 — no user input interpolated. |
| T-03-02-03 | Info Disclosure | accept | CLOSED | See accepted risks log below. |
| T-03-02-04 | DoS | mitigate | CLOSED | `catch` branch (lines 675-680) sets `copyStatus='error'` and calls `render()` once — no loop, no retry. `setTimeout(..., 3000)` at line 674 is single-shot on the success path only; catch branch does not schedule it. |
| T-03-02-05 | Repudiation | accept | CLOSED | See accepted risks log below. |
| T-03-03-01 | Tampering | mitigate | OPEN | See open threats section below. |
| T-03-03-02 | DoS | mitigate | CLOSED | pro.md line 108-110: "if the plugin is absent, the file does not exist, or the tool returns `isError: true`, log `[bridge] <error>` to the terminal and proceed to sub-step 4. No retry — per browser-bridge.md critical rule 3...". Fire-and-forget confirmed: `show_playground` writes `pending.json` and returns immediately (tools.ts:146-147). |
| T-03-03-03 | Info Disclosure | accept | CLOSED | See accepted risks log below. |
| T-03-03-04 | Spoofing | accept | CLOSED | See accepted risks log below. |
| T-03-03-05 | Elevation of Privilege | mitigate | CLOSED | `git status --porcelain .claude/ .cursor/ .github/` returns empty (verified). pro.md only touches `get-shit-done/workflows/discuss-phase/modes/pro.md` (canonical). |
| T-03-04-01 | Elevation of Privilege | mitigate | CLOSED | `new Function(param, innerBody)` at tests/discuss-playground-smoke.test.cjs:89 — body extracted from repo-tracked file via narrow regex pattern. Not a privileged boundary. |
| T-03-04-02 | Tampering | accept | CLOSED | See accepted risks log below. |
| T-03-04-03 | DoS | mitigate | CLOSED | Smoke test uses only `fs.readFileSync` + regex. No `spawn`, `exec`, `fetch`, `setTimeout`, `setInterval`, or network call in the test file (grep exit 0). |
| T-03-04-04 | Info Disclosure | accept | CLOSED | See accepted risks log below. |
| T-03-05-01 | Tampering | accept | DEFERRED | Plan 05 not executed — defer to post-execution audit. |
| T-03-05-02 | Info Disclosure | mitigate | DEFERRED | Plan 05 not executed — defer to post-execution audit. |
| T-03-05-03 | Elevation of Privilege | accept | DEFERRED | Plan 05 not executed — defer to post-execution audit. |

#### Open Threats

**T-03-03-01 — OPEN (BLOCKER)**

- **Category:** Tampering
- **Mitigation Claimed:** URL composed from SDK-resolved `phase_dir` + fixed basename; plugin `bridgeDir` traversal guard is defense in depth.
- **Evidence of Gap:** pro.md line 101 constructs `"url": "file://{phase_dir}/discuss-playground.html"`. Per 03-VERIFICATION.md CR-02 and confirmed by reading `plugins/gsd-bridge/src/tools.ts:143-147`, the `url` parameter is forwarded **verbatim** to `pending.json` with no `bridgeDir` traversal check applied — `bridgeDir()` only guards the write location (`.planning/.bridge/`), not the `url` value. The declared "defense in depth" via the traversal guard does not apply to this argument. Furthermore, `file://{phase_dir}/discuss-playground.html` with a project-relative `phase_dir` (e.g., `.planning/phases/03-...`) produces `file://.planning/phases/03-...` which parses `.planning` as the URI host — a malformed URL that never resolves locally. The mitigation as declared is absent in the implementation: the URL construction is neither validated nor guarded. This was flagged as CR-02 by the phase verifier (03-VERIFICATION.md line 140) and was to be fixed by Plan 05, which has not been executed.
- **Files Searched:** `get-shit-done/workflows/discuss-phase/modes/pro.md:101`, `plugins/gsd-bridge/src/tools.ts:143-147`, `plugins/gsd-bridge/src/bridge-fs.ts:bridgeDir()`
- **Next Step:** Execute Plan 05 (03-05-PLAN.md) to fix the URL construction per Option A (bare relative path) or Option B (absolute `file:///` URL), then re-run this audit.

#### Unregistered Flags

The 03-03-SUMMARY.md `## Threat Flags` section states: "None — no new network endpoints, auth paths, or trust boundaries introduced." No unregistered threat flags from the summaries.

The 03-VERIFICATION.md CR-01 gap (smoke test hard-fails on fresh clone because `assert.ok(fs.existsSync(HTML_PATH))` at tests/discuss-playground-smoke.test.cjs:36 has no skip condition) is a functional regression risk, not a security threat. It is informational only.

#### Accepted Risks Log

| Threat ID | Justification | Implementation Consistent? |
|-----------|---------------|---------------------------|
| T-03-01-02 | File path references in definition strings (e.g., `{padded}-CONTEXT.md`) are public repository conventions from `get-shit-done/workflows/discuss-phase/`. No secrets, no absolute paths, no tokens. | Yes — paths use `{padded}` placeholder convention; all strings authored by plan, no user input. |
| T-03-01-05 | Mockup filenames use `{padded}` placeholder convention (braces unambiguous). Page header labels the page as "Playground". | Yes — `{padded}-CONTEXT.md` visible in steps-data JSON; meta line reads "Playground". |
| T-03-02-03 | `window.__GSD_PLAYGROUND_STATE__` exposes preset name, step ID, boolean toggle, copyStatus — values the user already chose in the UI. No secrets. Exposed intentionally for Plan 04 smoke tests. | Yes — state shape matches only UI-interaction values at lines 384-390; no filesystem paths, no credentials. |
| T-03-02-05 | Local learning tool; no audit requirement; no logging or telemetry in the implementation. | Yes — no `console.log`, no analytics calls found in the state machine. |
| T-03-03-03 | Playground is a local-only `file://` artefact. browser-bridge.md confirms single-user local tool model. | Yes — no server, no network call. |
| T-03-03-04 | `.planning/` is local-only; attacker with write access to `.planning/` already has full project write capability. | Yes — playground is not a privileged boundary. |
| T-03-04-02 | Plans 01+02 author the HTML and have no incentive to evade their own test. Substring regex is acceptable for a smoke test. | Yes — HTML is repo-controlled; the test tests what it claims. |
| T-03-04-04 | `tests/` is already public. `window.__GSD_PLAYGROUND_STATE__` is intentionally exposed. | Yes — no private state leaked beyond what is already in source. |
