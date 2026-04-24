# Renderer Contract — Phase 4 Webview Infrastructure

**Status:** LOCKED (Plan 04-01)
**Consumed by:** Phase 1 Elicitation hook, Phase 3 discuss-webview UI, future Phase 6 dashboards
**Source artefacts:** `04-CONTEXT.md` (D-01..D-11), `04-UI-SPEC.md`, `04-PATTERNS.md`

***

## 1. Spec Format

The renderer consumes a **flat json-render spec** of shape:

```typescript
interface JsonRenderSpec {
  root: string;                            // id of the root element
  elements: Record<string, ElementSpec>;
}

interface ElementSpec {
  type: string;                            // catalog component name
  props: Record<string, unknown>;          // Zod-validated by catalog schema
  children?: string[];                     // ids of child elements
}
```

This is **NOT** JSON Schema Draft 7 — it is the json-render-native flat-id format
(see `refs/readme.md` §React (UI), lines 159-180). Adapter from MCP `requested_schema`
to this spec lives in the hook (see §4 below).

Example (POC screen — Plan 04-05):

```json
{
  "root": "page",
  "elements": {
    "page":      { "type": "Stack",        "props": { "direction": "vertical", "gap": 6 },     "children": ["grid", "snippet", "actions"] },
    "grid":      { "type": "Stack",        "props": { "direction": "horizontal", "gap": 4 },   "children": ["card1", "card2", "card3", "card4"] },
    "card1":     { "type": "GrayAreaCard", "props": { "title": "Gray Area 1", "options": [], "follow_up": null } },
    "card2":     { "type": "GrayAreaCard", "props": { "title": "Gray Area 2", "options": [], "follow_up": null } },
    "card3":     { "type": "GrayAreaCard", "props": { "title": "Gray Area 3", "options": [], "follow_up": null } },
    "card4":     { "type": "GrayAreaCard", "props": { "title": "Gray Area 4", "options": [], "follow_up": null } },
    "snippet":   { "type": "SnippetToggle","props": { "language": "json", "code": "{}", "collapsible": true } },
    "actions":   { "type": "Stack",        "props": { "direction": "horizontal", "gap": 2 },   "children": ["submitBtn", "resetBtn"] },
    "submitBtn": { "type": "Button",       "props": { "label": "submit", "variant": "primary", "action": "submit" } },
    "resetBtn":  { "type": "Button",       "props": { "label": "reset",  "variant": "secondary", "action": "reset" } }
  }
}
```

***

## 2. Catalog Scope (LOCKED — Discretion Item #1)

The catalog (`plugins/gsd-bridge/webview/src/catalog.ts`) exports **42 components total**:

- **36 stock shadcn components** spread from `@json-render/shadcn`'s `shadcnComponentDefinitions` (per D-08 — full set, no reduction)
- **6 custom GSD components** (full subset locked — covers all Phase 3 needs per cross-reference with `.planning/phases/03-discuss-webview-integration/03-CONTEXT.md`):

  | Component | Purpose | Phase 3 consumer |
  |---|---|---|
  | `GrayAreaCard` | discuss-phase decision card | 03-CONTEXT 4 gray areas |
  | `SnippetToggle` | collapsible code block | 03-CONTEXT artifact viewer |
  | `ASCIIProgress` | ████░░ progress bar | execute-phase progress |
  | `StageBanner` | ━━━ STAGE ━━━ workflow banner | discuss/plan/execute transitions |
  | `StatusPill` | ✓✗◆○ status chip | checkpoint state visualisation |
  | `CommandBlock` | `/gsd:...` terminal command | copy-to-clipboard CLI invocation |

Single catalog exported once from `plugins/gsd-bridge/webview/src/catalog.ts` (not per-screen — Discretion Item #5 LOCKED).

### 2.1 Button Override (action wiring — locked)

The registry MUST install a thin Button wrapper that intercepts `props.action` and forwards
to host hooks BEFORE delegating render to `@json-render/shadcn`'s stock Button. This
preserves spec-as-single-source-of-truth (no parallel HTML buttons in screens):

| `props.action` | Behaviour |
|---|---|
| `'submit'` | Call `window.__gsdSubmit(payload)` if defined; in dev mode, `console.log` the payload |
| `'reset'`  | Reset the closest enclosing form / call `window.__gsdReset?.()` if defined |
| `'cancel'` | Call `window.__gsdCancel?.()` if defined; in dev mode, `console.log` |
| absent / other | Pass-through to stock shadcn Button (ordinary onClick handlers still work) |

Implementation lives in `plugins/gsd-bridge/webview/src/registry.ts` as a `Button:`
override entry in the `defineRegistry` `components` map (~15 LOC). PocScreen MUST NOT
render parallel HTML `<button>` elements outside the spec — the spec is authoritative.

***

## 3. Browser Injection Contract

The hook injects the spec + a round-trip endpoint into the browser via four `window` properties:

| Direction | Symbol | Type | Purpose |
|---|---|---|---|
| Hook → Renderer | `window.__gsdSpec` | `JsonRenderSpec` | Initial spec to render |
| Hook → Renderer | `window.__gsdSessionId` | `string` | Session id for response routing |
| Hook → Renderer | `window.__gsdSubmitUrl` | `string` | Localhost sidecar URL (e.g. `http://127.0.0.1:54321/submit`) |
| Renderer → Hook | `window.__gsdSubmit(response)` | `(response: unknown) => Promise<void>` | `fetch(__gsdSubmitUrl, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ session_id, response }) })` |

Injection MUST happen via the host's HTML rewrite (NOT runtime fetch). The hook reads
`plugins/gsd-bridge/webview/dist/index.html`, prepends an inline `<script>` block of shape:

```html
<script>
  window.__gsdSpec = JSON.parse(/* JSON-encoded spec, with </script> sequence escaped to <\/script> */);
  window.__gsdSessionId = "<session-id>";
  window.__gsdSubmitUrl = "http://127.0.0.1:<random-port>/submit";
  window.__gsdSubmit = function (response) {
    return fetch(window.__gsdSubmitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: window.__gsdSessionId, response: response })
    });
  };
</script>
```

then writes the modified HTML to a `${cwd}/.planning/.bridge/${session_id}/index.html`
served via a `file://` URL (browser opens it). The path containment guard from the
existing hook (`bridgeDir.startsWith(resolvedCwd + path.sep)`) MUST be reused.

### 3.1 Round-trip mechanism (sidecar HTTP server — locked)

`window.parent.postMessage` does NOT work when the per-session HTML is opened as a
top-level `file://` navigation (`window.parent === window`, no parent frame). To
genuinely round-trip the user submit back to the hook (and then to MCP), the Phase 1
hook starts a localhost-only HTTP sidecar server before opening the browser:

- `http.createServer` bound to `127.0.0.1` only (NOT `0.0.0.0`)
- Random port via `server.listen(0)` — port communicated to the webview via
  `window.__gsdSubmitUrl` injection
- Single-shot accept: server accepts ONE valid `POST /submit` with JSON body, validates
  `Content-Type: application/json` and body size ≤ 1 MB, then writes the response to
  the existing `${cwd}/.planning/.bridge/response.json` (atomic tmp+rename per Phase 1
  pattern), responds `204 No Content`, and closes
- Hook polling on `response.json` is preserved as-is — server-side write triggers the
  existing wakeup path
- Server self-closes on hook timeout (120s) regardless of whether a POST arrived
- All other paths/methods return `404`/`405`; CORS not enabled (same-origin
  unnecessary, `file://` cannot make cross-origin to `127.0.0.1` without explicit
  `fetch` from the page itself)

**Security invariants preserved:**

- I-1 — `JSON.stringify(spec)` never via string concatenation; `</script>` sequence escaped
  to prevent script-tag breakout (XSS defense for spec-side data).
- I-2 — Spec parsing in browser uses `JSON.parse`, never `eval` (proto-pollution defense).
- I-3 — Path containment for the per-session HTML file (re-uses Phase 1 guard at lines 42-54
  of `gsd-bridge-elicitation.cjs`).
- I-4 — 256 KB cap on spec size mirroring `MAX_BRIDGE_BYTES` (T-01-03-03 — JSON bomb).
- I-5 — `__gsdSubmit` payload sanitised via the existing `sanitizeContent` recursive
  function before going back to MCP `{action, content}` (T-01-03-05/10 — proto pollution).
- I-6 — Sidecar HTTP server bound to `127.0.0.1` only, ephemeral random port, single-shot
  POST, 1 MB body cap, `Content-Type: application/json` validated, server closed after
  first valid POST or hook timeout.

***

## 4. Adapter Location (D-06 LOCKED — Discretion Item #2)

**The adapter lives in the hook**: `plugins/gsd-bridge/hooks/gsd-bridge-elicitation.cjs`.

Rationale:
- Preserves Phase 1 LOCKED scope (no MCP server changes required — `src/server.ts` and
  `src/tools.ts` untouched).
- Keeps the renderer pure (consumes plain json-render spec, no MCP knowledge).
- Co-locates injection + adapter + path containment in a single hardened CJS file.

Adapter signature (Plan 04-04 will implement):

```typescript
function adaptRequestedSchemaToSpec(
  requested_schema: unknown,   // shape per MCP elicitation: { type: 'object', properties: {...}, required: [...] } or null
  message: string
): JsonRenderSpec
```

Mapping rules (Plan 04-04 expands; documented here as the contract):

- `requested_schema === null` → spec is the POC default (4 GrayAreaCards + Submit) for smoke testing.
- `requested_schema.type === 'object'` with primitive `properties` → maps each property to one of:
  - `string` + no `enum` → `Input` component
  - `string` + `enum` → `Select` component (with `enum` as `options`)
  - `boolean` → `Checkbox`
  - `number` → `Input` with `type=number`
- Top-level wrapper is always `Card` containing a `Stack` of mapped fields + `Button { action: 'submit' }`.
- Unknown / unsupported schema shape → fall back to a `Card` with a `Text` component
  rendering the raw `message` and a single `Button { action: 'cancel' }` (degraded but
  still routable).

The full mapper unit-tested in Plan 04-04 (`tests/gsd-bridge-spec-adapter.test.cjs`).

***

## 5. Build & Serve

```bash
cd plugins/gsd-bridge/webview
npm run build                                # Vite + vite-plugin-singlefile
# → dist/index.html (~300-500 KB, self-contained)
```

The hook reads `plugins/gsd-bridge/webview/dist/index.html`, applies the §3 `<script>`
prepend, writes per-session HTML, opens the browser. No web server, no postinstall, no
runtime npm.

***

## 6. Pinned Dependency Versions

| Package | Version | Strategy |
|---|---|---|
| `@json-render/core` | `0.18.0` | **EXACT pin** (no `^`) — Discretion Item #4 |
| `@json-render/react` | `0.18.0` | **EXACT pin** |
| `@json-render/shadcn` | `0.18.0` | **EXACT pin** |
| `vite-plugin-singlefile` | `2.3.3` | **EXACT pin** |
| `react` | `^19.2.5` | caret (mainstream) |
| `react-dom` | `^19.2.5` | caret |
| `zod` | `^4.3.6` | caret |
| `vite` | `^8.0.10` | caret |
| `tailwindcss` | `^3.4.19` | caret on v3 line (v4 OUT OF SCOPE) |
| `@vitejs/plugin-react` | `^6.0.1` | caret |
| `postcss` | `^8.5.10` | caret |
| `autoprefixer` | `^10.5.0` | caret |
| `vitest` | `^4.1.5` | caret (dev only) |
| `@testing-library/react` | `^16.3.2` | caret (dev only) |
| `jsdom` | `^29.0.2` | caret (dev only) |

`@json-render/mcp` MUST NOT appear in `package.json` (D-04).

***

## 7. Test Strategy (Discretion Item #3 LOCKED)

- **`vitest`** for the React side (catalog, registry, components, POC screen) — runs from
  `plugins/gsd-bridge/webview/` with its own `vitest.config.ts` and `jsdom` env. Scope-isolated
  to the webview sub-tree; idiomatic React tooling.
- **`node:test`** for the hook adapter (`tests/gsd-bridge-spec-adapter.test.cjs`) per
  hard rule #4 — adapter is CJS in the hook, unit-tested with the existing
  `tests/helpers.cjs` pattern.
- **No SDK handler added** in Phase 4 (D-05 — renderer is browser-only). Therefore no
  `sdk/src/golden/` row required.

***

## 8. POC Scope (Discretion Item #6 LOCKED)

- **Plan 04-05 ships the minimum viable**: 1 screen "4 gray areas + snippet + toggle"
  proving end-to-end round-trip via the sidecar HTTP server (§3.1).
- Stretch follow-up screen exercising `pushState` / `validateForm` built-in actions is
  **deferred** to a post-v1.0 phase (re-evaluate after Phase 3 consumes the catalog).

***

## 9. Cross-Phase Integration

- **Phase 1 (`hooks/gsd-bridge-elicitation.cjs`)** — owns the adapter (§4), the
  injection (§3), and the sidecar HTTP server (§3.1). Plan 04-04 implements.
- **Phase 2 (`*-PRO-QUESTIONS.json`)** — adapter consumes via the same `requested_schema`
  path; PRO-QUESTIONS already aligns with MCP elicitation shape (D-09).
- **Phase 3 (discuss-webview UI)** — imports `catalog` and `registry` from
  `plugins/gsd-bridge/webview/src/{catalog,registry}.ts`. Writes its own specs.

***

*Locked: Plan 04-01. Re-open this contract if any of the 6 Discretion items needs revisiting.*
