#!/usr/bin/env node
// gsd-hook-version: 0.1.0
// gsd-bridge Elicitation hook — intercepts notifications/elicit from the
// gsd-bridge MCP server and routes to the browser via bridge files under
// .planning/.bridge/ instead of showing a terminal dialog.
//
// Triggers on: Elicitation hook event, matcher "gsd-bridge".
// Action: Writes the requested_schema to .planning/.bridge/pending.json for
//         the browser to pick up, polls .planning/.bridge/response.json for
//         the user reply, and returns { action, content } via
//         hookSpecificOutput.
//
// Silent-exit: Any read/parse failure returns control to Claude Code's
//              default behavior (terminal dialog). Never blocks.

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_BRIDGE_BYTES = 256_000;           // JSON bomb guard (T-01-03-03)
const POLL_INTERVAL_MS = 250;
const TOTAL_TIMEOUT_MS = 120_000;           // 2 min, aligned with Plan 02 waitForResponse (T-01-03-04)
const STDIN_TIMEOUT_MS = 10_000;            // T-01-03-02

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), STDIN_TIMEOUT_MS);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);

    // Defensive matcher: hooks.json filters by mcp_server_name already,
    // but we re-verify here to avoid firing on unrelated events.
    if (data.hook_event_name !== 'Elicitation') process.exit(0);
    if (data.mcp_server_name !== 'gsd-bridge') process.exit(0);

    // Session-id traversal guard (T-01-03-01)
    const sessionId = data.session_id;
    if (typeof sessionId !== 'string' || !sessionId || /[/\\]|\.\./.test(sessionId)) {
      process.exit(0);
    }

    // cwd traversal guard (T-01-03-01)
    const cwd = data.cwd;
    if (typeof cwd !== 'string' || !cwd || !path.isAbsolute(cwd) || cwd.includes('..')) {
      process.exit(0);
    }

    const resolvedCwd = path.resolve(cwd);
    const bridgeDir = path.resolve(resolvedCwd, '.planning', '.bridge');
    if (!bridgeDir.startsWith(resolvedCwd + path.sep)) process.exit(0);

    try { fs.mkdirSync(bridgeDir, { recursive: true }); } catch { process.exit(0); }

    const pendingPath = path.join(bridgeDir, 'pending.json');
    const responsePath = path.join(bridgeDir, 'response.json');

    // Atomic write of pending.json (write-to-tmp then rename)
    const payload = {
      kind: 'elicit',
      session_id: sessionId,
      message: typeof data.message === 'string' ? data.message : '',
      mode: data.mode === 'url' ? 'url' : 'form',
      url: typeof data.url === 'string' ? data.url : undefined,
      requested_schema: data.requested_schema ?? null,
      ts: new Date().toISOString(),
    };
    const tmp = pendingPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, pendingPath);

    // Poll response.json (sync loop; hook is a short-lived process)
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;
    let response = null;
    while (Date.now() < deadline) {
      if (fs.existsSync(responsePath)) {
        try {
          const stat = fs.statSync(responsePath);
          if (stat.size > MAX_BRIDGE_BYTES) break;  // JSON bomb guard (T-01-03-03)
          const raw = fs.readFileSync(responsePath, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            response = parsed;
            break;
          }
        } catch {
          // half-written / invalid: keep polling
        }
      }
      // Sync sleep via Atomics.wait (Node built-in, no external dep).
      // SharedArrayBuffer + Int32Array give a sync wait without spawning a subprocess.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_INTERVAL_MS);
    }

    if (!response) process.exit(0);  // timeout: fall through to default dialog

    // Validate action
    const action = response.action;
    if (action !== 'accept' && action !== 'decline' && action !== 'cancel') {
      process.exit(0);
    }

    // Sanitize content (T-01-03-05, T-01-03-10: strip functions/Buffers/prototype pollution)
    let content;
    if (action === 'accept' && response.content && typeof response.content === 'object') {
      content = sanitizeContent(response.content);
    }

    // Consume response.json so the next elicitation starts clean
    try { fs.unlinkSync(responsePath); } catch {}

    const output = {
      hookSpecificOutput: {
        hookEventName: 'Elicitation',
        action,
      },
    };
    if (content !== undefined) output.hookSpecificOutput.content = content;

    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch {
    // Silent fail — never block (PATTERNS.md silent-failure contract)
    process.exit(0);
  }
});

// Recursively strip non-plain values (functions, Buffer, Symbols, prototype chains).
// Rebuilds objects via `const out = {}` + Object.keys so `__proto__`/`constructor`
// keys become direct properties, never prototype mutations (T-01-03-10).
// Caps depth at 8 to prevent unbounded recursion.
function sanitizeContent(value, depth = 0) {
  if (depth > 8) return undefined;
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeContent(v, depth + 1)).filter((v) => v !== undefined);
  }
  if (t === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      if (typeof k !== 'string' || k.length > 256) continue;
      const v = sanitizeContent(value[k], depth + 1);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return undefined;
}
