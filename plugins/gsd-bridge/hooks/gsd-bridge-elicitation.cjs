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

// Phase 4 — adapter for the React webview renderer + localhost sidecar HTTP server
// for the user-submit round-trip. Both are pure dep-free CJS (Node built-ins only).
const { adaptRequestedSchemaToSpec } = require('./lib/spec-adapter.cjs');
const { startSubmitServer } = require('./lib/submit-server.cjs');

const MAX_BRIDGE_BYTES = 256_000;           // JSON bomb guard (T-01-03-03)
const POLL_INTERVAL_MS = 250;
const TOTAL_TIMEOUT_MS = 120_000;           // 2 min, aligned with Plan 02 waitForResponse (T-01-03-04)
const STDIN_TIMEOUT_MS = 10_000;            // T-01-03-02

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), STDIN_TIMEOUT_MS);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
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

    // === Phase 4 webview branch ===
    // If the host repo has built the React webview bundle, transform the
    // requested_schema into a json-render spec, start the localhost sidecar
    // HTTP server (RENDERER-CONTRACT §3.1), inject spec + __gsdSubmitUrl into
    // a per-session HTML file, and rewrite pending.json with mode='url' so the
    // host opens the browser at the bundled UI instead of the default form dialog.
    let sidecarHandle = null;
    const bundlePath = locateWebviewBundle(resolvedCwd);
    if (bundlePath && payload.mode === 'form') {
      try {
        const sessionDir = path.join(bridgeDir, sessionId);
        if (!sessionDir.startsWith(resolvedCwd + path.sep)) throw new Error('session dir escape');
        try { fs.mkdirSync(sessionDir, { recursive: true }); } catch {}

        const spec = adaptRequestedSchemaToSpec(payload.requested_schema, payload.message);
        const specJson = JSON.stringify(spec);
        if (specJson.length > MAX_BRIDGE_BYTES) throw new Error('spec too large'); // contract I-4

        // Start sidecar BEFORE injecting URL into the page (port must be known).
        sidecarHandle = startSubmitServer({
          bridgeDir,
          sessionId,
          timeoutMs: TOTAL_TIMEOUT_MS,
        });
        if (!sidecarHandle) throw new Error('sidecar bind failed');
        // server.listen is async; await the bind via the handle's whenReady
        // promise (resolves on the 'listening' event). The outer 'end' handler
        // is async, so awaiting here is safe; the response.json polling loop
        // stays sync (Atomics.wait) once we resume below.
        const port = await Promise.race([
          sidecarHandle.whenReady,
          new Promise((resolve) => setTimeout(() => resolve(0), 1000)),
        ]);
        if (!port) throw new Error('sidecar port unbound');
        const submitUrl = 'http://127.0.0.1:' + port + '/submit';

        const bundleText = fs.readFileSync(bundlePath, 'utf8');
        const injected = injectSpec(bundleText, spec, sessionId, submitUrl);
        const sessionHtml = path.join(sessionDir, 'index.html');
        const tmpHtml = sessionHtml + '.tmp.' + process.pid;
        fs.writeFileSync(tmpHtml, injected);
        fs.renameSync(tmpHtml, sessionHtml);

        // Rewrite pending.json with mode='url' pointing at the per-session bundle.
        const urlPayload = Object.assign({}, payload, {
          mode: 'url',
          url: 'file://' + sessionHtml,
          rendered_via: 'webview',
          submit_url: submitUrl,
        });
        const tmp2 = pendingPath + '.tmp.' + process.pid;
        fs.writeFileSync(tmp2, JSON.stringify(urlPayload, null, 2));
        fs.renameSync(tmp2, pendingPath);
      } catch {
        // Silent fall-through: close any partial sidecar, keep the existing form path.
        if (sidecarHandle) { try { sidecarHandle.close(); } catch {} sidecarHandle = null; }
      }
    }

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
      // Async sleep — yields the event loop so the sidecar HTTP server (when
      // active in the Phase 4 webview branch) can accept POST /submit and
      // write response.json. The legacy form/url branch tolerates the same
      // sleep semantics; only the implementation primitive changed.
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (!response) {
      if (sidecarHandle) { try { sidecarHandle.close(); } catch {} }
      process.exit(0);  // timeout: fall through to default dialog
    }

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

    if (sidecarHandle) { try { sidecarHandle.close(); } catch {} }
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

// Phase 4 helper — locate the bundled webview HTML if it exists, else null.
// Path is relative to cwd (containment guarded by caller).
function locateWebviewBundle(resolvedCwd) {
  const candidate = path.join(resolvedCwd, 'plugins', 'gsd-bridge', 'webview', 'dist', 'index.html');
  // Containment re-check: candidate MUST stay under resolvedCwd
  if (!candidate.startsWith(resolvedCwd + path.sep)) return null;
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) return null;
    if (stat.size > 5_000_000) return null; // sanity cap (5 MB) — UI-SPEC says ~300-500 KB target
    return candidate;
  } catch {
    return null;
  }
}

// Phase 4 helper — inject the spec + sidecar URL into the bundle as the FIRST <script> in <head>.
// Escapes </script> in the JSON to defeat script-tag breakout (XSS defense, contract I-1).
function injectSpec(htmlText, spec, sessionId, submitUrl) {
  const safeJson = JSON.stringify(spec).replace(/<\/script/gi, '<\\/script');
  const safeSession = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeUrl = String(submitUrl).replace(/[^a-zA-Z0-9:/._-]/g, '');
  const inlineScript =
    '<script>' +
    'window.__gsdSpec = JSON.parse(' + JSON.stringify(safeJson) + ');' +
    'window.__gsdSessionId = ' + JSON.stringify(safeSession) + ';' +
    'window.__gsdSubmitUrl = ' + JSON.stringify(safeUrl) + ';' +
    'window.__gsdSubmit = function (response) {' +
    '  return fetch(window.__gsdSubmitUrl, {' +
    '    method: "POST",' +
    '    headers: { "Content-Type": "application/json" },' +
    '    body: JSON.stringify({ session_id: window.__gsdSessionId, response: response })' +
    '  });' +
    '};' +
    '</script>';
  // Insert immediately after <head> if present; otherwise at the very top.
  const headOpenMatch = htmlText.match(/<head[^>]*>/i);
  if (headOpenMatch) {
    const idx = headOpenMatch.index + headOpenMatch[0].length;
    return htmlText.slice(0, idx) + inlineScript + htmlText.slice(idx);
  }
  return inlineScript + htmlText;
}
