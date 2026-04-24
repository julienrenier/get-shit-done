# gsd-bridge — browser ↔ Claude via MCP Elicitation

GSD plugin packaging a local MCP server and an Elicitation hook. Claude Code surfaces structured forms to a browser instead of the terminal dialog, routes the user's response back, and resolves the tool call.

## What

- MCP server (`dist/server.js`) exposing three tools: `show_playground`, `show_form`, `reply`. Uses the MCP elicitation primitive for the round-trip path.
- Elicitation hook (`hooks/gsd-bridge-elicitation.cjs`) intercepts `Elicitation` events for this server's name (`gsd-bridge`) and coordinates with the browser via bridge files under `.planning/.bridge/`.
- Shared schemas (`src/schemas.ts`) for `RequestedSchema` (form or URL mode) and `ElicitResponse` (`{action, content}`).

Stack: TypeScript ESM (NodeNext, strict) for the server, CJS Node built-ins for the hook, `@modelcontextprotocol/sdk` as the only external dependency (plugin-local, not in the root `package.json`).

## Install

From a repo that declares this plugin in a local marketplace:

    /plugin install gsd-bridge@gsd-local

Claude Code loads the manifest (`.claude-plugin/plugin.json`), starts the MCP server via `.mcp.json`, and registers the Elicitation hook via `hooks/hooks.json`. The `${CLAUDE_PLUGIN_ROOT}` placeholder resolves to the plugin install path; no absolute paths are baked in.

Build locally before install (the plugin ships TS source):

    cd plugins/gsd-bridge
    npm install
    npm run build

## Tools exposed

| Tool              | Input                                                     | Behavior                                                                                                                  |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `show_playground` | `{ url: string }`                                         | Writes `{kind: 'show_playground', url}` to `.planning/.bridge/pending.json` so the browser UI opens the URL.              |
| `show_form`       | `{ title: string, message: string, fields: Record<string, FieldSchema> }` | Calls `server.elicitInput` with a `requested_schema` derived from `fields`. The hook intercepts, routes to the browser, blocks up to 120 s, and returns `{action, content}` as the tool result. |
| `reply`           | `{ text: string }`                                        | Queues a Claude → browser text message in `pending.json` (no wait).                                                       |

`FieldSchema` (TypeScript shape): `{ type: 'string' | 'number' | 'boolean' | 'enum', title: string, description?: string, required?: boolean, enum?: readonly string[] }`. `type: 'enum'` maps to MCP's string-with-enum primitive (`{ type: 'string', enum: [...] }`) because the MCP `PrimitiveSchemaDefinition` does not define a discrete `enum` type.

## Minimal example

An agent calls `show_form`:

    {
      "name": "show_form",
      "arguments": {
        "title": "Login",
        "message": "Please sign in to continue",
        "fields": {
          "username": { "type": "string", "title": "User" }
        }
      }
    }

1. `tools.ts` invokes `server.elicitInput({ message, requestedSchema })`.
2. Claude Code's MCP layer emits an `Elicitation` event to `gsd-bridge`; the hook intercepts it.
3. The hook writes `.planning/.bridge/pending.json` with the `requested_schema`. The browser UI (Phase 2.1) polls and renders the form.
4. On submit the browser writes `.planning/.bridge/response.json = {action:'accept', content:{username:'alice'}}`.
5. The hook reads the response, unlinks `response.json`, and emits `hookSpecificOutput = {hookEventName:'Elicitation', action, content}` — short-circuiting Claude Code's terminal dialog.
6. The SDK resolves `elicitInput()` with the hook's output; `handleToolCall` returns the content as the `tools/call` result.

For the direct Claude → browser paths (`show_playground`, `reply`) the server writes `pending.json` and returns immediately — no hook, no block.

## Architecture

Full decision rationale: `.planning/phases/01-webview-bidirectionel/` — see `01-CONTEXT.md` (D-03..D-09), `01-PATTERNS.md`, and the refs under `refs/claude-code-{plugins-reference,mcp,hooks}.md`.

Event sequence (D-04 native path):

    Claude → tools/call show_form
           → handleToolCall → server.elicitInput({ message, requestedSchema })
           → MCP SDK emits notifications/elicit to gsd-bridge
           → Elicitation hook intercepts (matcher: "gsd-bridge")
           → hook writes .planning/.bridge/pending.json
           → browser polls pending.json, renders form, user submits
           → browser writes .planning/.bridge/response.json
           → hook reads response, emits hookSpecificOutput.{action, content}
           → SDK resolves elicitInput()
           → handleToolCall returns JSON { action, content } as tool result

Bridge files live under `{cwd}/.planning/.bridge/`:

- `pending.json` — server/hook writes, browser reads.
- `response.json` — browser writes, hook reads and unlinks.

Both sides use atomic `write tmp + renameSync` so readers never see half-written payloads.

Consumers: Phase 2.1 (UI playground) and Phase 3 (`discuss-workflow-mode --pro`) call the plugin as-is via the `get-shit-done/workflows/browser-bridge.md` workflow.

## Security & limitations

- **Local trust model.** `.planning/.bridge/` is readable by any local process. Do not use for credentials over shared filesystems.
- **Prompt injection.** Content from the browser is injected into the tool result; treat it with the same trust as a chat paste. Downstream workflows prefix echoed values with `[browser]`.
- **Path traversal.** Both server (`bridge-fs.ts`) and hook validate `cwd` and `session_id` (no `..`, strict prefix check). Any mismatch → silent exit.
- **JSON bomb.** `response.json` > 256 KB is rejected at read time (both server `readResponse` and hook stat-guard).
- **Timeouts.** Server `waitForResponse` = 120 s, hook poll loop = 120 s, hook stdin guard = 10 s, `hooks.json` outer timeout = 130 s. Timeouts fall back silently to Claude Code's default dialog.
- **Prototype pollution.** Hook `sanitizeContent` rebuilds objects via `const out = {}` + `Object.keys`, making `__proto__` / `constructor` own properties instead of prototype mutations.
- **Auth.** Elicitation works with API key, OAuth, and claude.ai login — no auth-mode restriction (D-08).

## Troubleshooting

- **Plugin not listed after install.** Rerun `/plugin list`. If absent, the marketplace did not resolve; confirm the local marketplace declares `gsd-bridge` and rerun `/plugin install gsd-bridge@gsd-local`.
- **`show_form` returns `isError: true` with a timeout.** The browser did not write `response.json` within 120 s. Confirm the browser UI is open and polling `{cwd}/.planning/.bridge/pending.json`. Two consecutive timeouts mean the UI is disconnected — fall back to the terminal dialog.
- **Hook never fires.** Verify `hooks.json` has matcher `gsd-bridge`; verify `plugin.json.hooks === "./hooks/hooks.json"`; the hook silent-exits on any validation failure so check `.planning/.bridge/pending.json` for a freshly-written file.
- **`dist/server.js` missing.** Run `cd plugins/gsd-bridge && npm install && npm run build`. The plugin ships TS sources; the build is consumer-side.
