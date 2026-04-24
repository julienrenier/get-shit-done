'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync, spawn } = require('node:child_process');
const { createTempProject, cleanup } = require('./helpers.cjs');

const HOOK_PATH = path.resolve(__dirname, '..', 'plugins', 'gsd-bridge', 'hooks', 'gsd-bridge-elicitation.cjs');

function buildEvent(cwd, overrides) {
  return Object.assign(
    {
      hook_event_name: 'Elicitation',
      mcp_server_name: 'gsd-bridge',
      session_id: 'sess123',
      cwd,
      message: 'Choose a color',
      mode: 'form',
      requested_schema: {
        type: 'object',
        properties: { color: { type: 'string', title: 'Color', enum: ['red', 'blue'] } },
        required: ['color'],
      },
    },
    overrides,
  );
}

function writeBundle(cwd, html) {
  const dir = path.join(cwd, 'plugins', 'gsd-bridge', 'webview', 'dist');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

function runHookSync(stdinJson, env) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: stdinJson,
    encoding: 'utf8',
    env: Object.assign({}, process.env, env || {}),
    timeout: 8_000,
  });
}

function postJsonHttp(host, port, pathStr, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, method: 'POST', path: pathStr, headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      },
    );
    req.on('error', reject);
    req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function waitForFile(p, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (fs.existsSync(p)) return resolve();
      if (Date.now() > deadline) return reject(new Error('timeout waiting for ' + p));
      setTimeout(tick, 50);
    };
    tick();
  });
}

test('webview branch — injects spec + __gsdSubmitUrl when dist/index.html exists', (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  writeBundle(project, '<!DOCTYPE html><html><head><title>X</title></head><body><div id="root"></div></body></html>');
  const event = buildEvent(project);
  runHookSync(JSON.stringify(event));

  const sessionHtml = path.join(project, '.planning', '.bridge', 'sess123', 'index.html');
  assert.ok(fs.existsSync(sessionHtml), 'per-session HTML should be written');
  const html = fs.readFileSync(sessionHtml, 'utf8');
  assert.match(html, /window\.__gsdSpec/);
  assert.match(html, /window\.__gsdSessionId/);
  assert.match(html, /window\.__gsdSubmitUrl/);
  assert.match(html, /window\.__gsdSubmit/);
  assert.match(html, /"sess123"/);
  assert.match(html, /http:\/\/127\.0\.0\.1:\d+\/submit/);
});

test('webview branch — pending.json rewritten with mode=url, file:// URL, and submit_url 127.0.0.1', (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  writeBundle(project, '<!DOCTYPE html><html><head></head><body></body></html>');
  runHookSync(JSON.stringify(buildEvent(project)));

  const pendingPath = path.join(project, '.planning', '.bridge', 'pending.json');
  assert.ok(fs.existsSync(pendingPath));
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  assert.equal(pending.mode, 'url');
  assert.equal(pending.rendered_via, 'webview');
  assert.match(pending.url, /^file:\/\//);
  assert.ok(pending.url.endsWith('/.planning/.bridge/sess123/index.html'));
  assert.match(pending.submit_url, /^http:\/\/127\.0\.0\.1:\d+\/submit$/);
});

test('fallback — no bundle, hook leaves pending.json mode=form unchanged (no submit_url)', (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  runHookSync(JSON.stringify(buildEvent(project)));

  const pendingPath = path.join(project, '.planning', '.bridge', 'pending.json');
  assert.ok(fs.existsSync(pendingPath));
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  assert.equal(pending.mode, 'form');
  assert.equal(pending.rendered_via, undefined);
  assert.equal(pending.submit_url, undefined);
});

test('security — </script> in spec property value is escaped (no script-tag breakout)', (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  writeBundle(project, '<!DOCTYPE html><html><head></head><body></body></html>');
  const event = buildEvent(project, {
    message: 'fine',
    requested_schema: {
      type: 'object',
      properties: { x: { type: 'string', title: '</script><script>alert(1)</script>' } },
    },
  });
  runHookSync(JSON.stringify(event));

  const sessionHtml = path.join(project, '.planning', '.bridge', 'sess123', 'index.html');
  const html = fs.readFileSync(sessionHtml, 'utf8');
  // Count literal </script> closures: should be EXACTLY 1 (the inline injection's own closer).
  // If the escape failed, we'd see >= 2 (one in the malicious title + one from the script close).
  const closures = (html.match(/<\/script>/gi) || []).length;
  assert.equal(closures, 1, `expected exactly 1 </script> closure, got ${closures}`);
  // The escaped form should appear in the JSON literal. injectSpec replaces
  // </script with <\/script in the spec JSON, then JSON.stringify wraps that
  // string for the inline JS literal — escaping the backslash again — so the
  // sequence in the rendered HTML is `<\\/script`.
  assert.match(html, /<\\\\\/script/);
});

test('security — session_id with traversal chars triggers silent-exit (no files written)', (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  writeBundle(project, '<!DOCTYPE html><html><head></head><body></body></html>');
  runHookSync(JSON.stringify(buildEvent(project, { session_id: '../escape' })));

  const bridgeDir = path.join(project, '.planning', '.bridge');
  // Hook silent-exits BEFORE creating .planning/.bridge — directory should not exist
  assert.equal(fs.existsSync(bridgeDir), false);
});

test('security — relative cwd triggers silent-exit', (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  runHookSync(JSON.stringify(buildEvent('relative/path')));
  const bridgeDir = path.join(project, '.planning', '.bridge');
  assert.equal(fs.existsSync(bridgeDir), false);
});

test('security — session HTML is contained under .planning/.bridge/ (no escape via spec content)', (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  writeBundle(project, '<!DOCTYPE html><html><head></head><body></body></html>');
  runHookSync(JSON.stringify(buildEvent(project)));

  const sessionHtml = path.join(project, '.planning', '.bridge', 'sess123', 'index.html');
  assert.ok(fs.existsSync(sessionHtml));
  const real = fs.realpathSync(sessionHtml);
  const bridgeReal = fs.realpathSync(path.join(project, '.planning', '.bridge'));
  assert.ok(real.startsWith(bridgeReal + path.sep), `session HTML escaped: ${real}`);
});

test('graceful — bundle exists but mode != form, fallback path is taken', (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  writeBundle(project, '<!DOCTYPE html><html><head></head><body></body></html>');
  runHookSync(JSON.stringify(buildEvent(project, { mode: 'url', url: 'https://example.com' })));

  const pendingPath = path.join(project, '.planning', '.bridge', 'pending.json');
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  assert.equal(pending.mode, 'url');
  assert.equal(pending.url, 'https://example.com');
  assert.equal(pending.rendered_via, undefined);
  assert.equal(pending.submit_url, undefined);
});

test('graceful — bundle is too large (>5 MB), fallback path is taken', (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  const big = '<!DOCTYPE html><html><head></head><body>' + 'x'.repeat(6 * 1024 * 1024) + '</body></html>';
  writeBundle(project, big);
  runHookSync(JSON.stringify(buildEvent(project)));

  const pendingPath = path.join(project, '.planning', '.bridge', 'pending.json');
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  assert.equal(pending.rendered_via, undefined, 'should not have rendered via webview when bundle exceeds 5 MB cap');
});

test('end-to-end round-trip — POST to sidecar /submit triggers hook to exit with hookSpecificOutput.action=accept', async (t) => {
  const project = createTempProject();
  t.after(() => cleanup(project));
  writeBundle(project, '<!DOCTYPE html><html><head></head><body></body></html>');
  const event = buildEvent(project);

  // Spawn the hook async (do NOT use spawnSync — we need to POST while it's running)
  const child = spawn(process.execPath, [HOOK_PATH], {
    env: Object.assign({}, process.env),
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  child.stdin.write(JSON.stringify(event));
  child.stdin.end();

  // Wait for pending.json with submit_url to materialize (sidecar bound)
  const pendingPath = path.join(project, '.planning', '.bridge', 'pending.json');
  await waitForFile(pendingPath, 5000);

  // The hook writes pending.json TWICE: first with mode=form, then with mode=url.
  // Poll until the rewrite contains submit_url.
  let pending = null;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
      if (pending.submit_url) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(pending && pending.submit_url, 'pending.json should eventually carry submit_url');
  assert.match(pending.submit_url, /^http:\/\/127\.0\.0\.1:\d+\/submit$/);
  const port = Number(pending.submit_url.match(/:(\d+)\//)[1]);

  // POST to the sidecar
  const res = await postJsonHttp('127.0.0.1', port, '/submit', { session_id: 'sess123', response: { color: 'red' } });
  assert.equal(res.status, 204);

  // Wait for hook to exit
  const exitCode = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(exitCode, 0, `hook should exit 0; stderr=${stderr}`);

  // Validate hookSpecificOutput
  assert.ok(stdout.length > 0, 'hook should have written hookSpecificOutput to stdout');
  const out = JSON.parse(stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'Elicitation');
  assert.equal(out.hookSpecificOutput.action, 'accept');
  assert.deepEqual(out.hookSpecificOutput.content, { color: 'red' });
});
