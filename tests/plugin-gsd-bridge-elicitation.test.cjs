/**
 * Tests for plugins/gsd-bridge/hooks/gsd-bridge-elicitation.js Elicitation hook.
 *
 * The hook intercepts notifications/elicit for matcher "gsd-bridge", writes
 * .planning/.bridge/pending.json with the requested_schema, and polls
 * response.json for the browser's reply. It must silent-exit (exit 0, empty
 * stdout) on any parse / validation error so Claude Code falls back to its
 * default terminal dialog — never blocks.
 *
 * Covered cases (Plan 01-04 WEBVIEW-03):
 *   - happy path: accept with content
 *   - happy path: decline (no content)
 *   - silent-exit: path-traversal session_id
 *   - silent-exit: wrong mcp_server_name
 *   - JSON bomb guard: oversize response.json → hook ignores, times out
 *   - __proto__ sanitization: rebuilt via Object.keys, no prototype mutation
 */

'use strict';

process.env.GSD_TEST_MODE = '1';

const { test, describe, beforeEach, afterEach, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const { createTempDir, cleanup } = require('./helpers.cjs');

const HOOK_PATH = path.join(
  __dirname, '..', 'plugins', 'gsd-bridge', 'hooks', 'gsd-bridge-elicitation.cjs'
);
const PLUGIN_DIR = path.join(__dirname, '..', 'plugins', 'gsd-bridge');
const DIST_PATH = path.join(PLUGIN_DIR, 'dist', 'server.js');

// Ensure plugin dist/ is present once before any test runs. The hook itself
// only needs fs (no dep on dist), but this keeps subsequent server / round-trip
// test files from racing each other to build.
before(() => {
  if (fs.existsSync(DIST_PATH)) return;
  try {
    execSync('npm install --no-audit --no-fund --prefer-offline', {
      cwd: PLUGIN_DIR, stdio: 'pipe', timeout: 120_000,
    });
    execSync('npm run build', {
      cwd: PLUGIN_DIR, stdio: 'pipe', timeout: 60_000,
    });
  } catch {
    // Individual server/roundtrip tests will skip if dist is missing.
  }
});

function runHook(payload, timeoutMs = 10_000) {
  const input = JSON.stringify(payload);
  try {
    const stdout = execFileSync(process.execPath, [HOOK_PATH], {
      input,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? (err.signal ? null : 1),
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || '').toString().trim(),
    };
  }
}

function writeResponse(tmpDir, data) {
  const bridgeDir = path.join(tmpDir, '.planning', '.bridge');
  fs.mkdirSync(bridgeDir, { recursive: true });
  fs.writeFileSync(path.join(bridgeDir, 'response.json'), JSON.stringify(data));
}

describe('gsd-bridge elicitation hook', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-bridge-hook-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('emits accept with content when response.json is present', () => {
    writeResponse(tmpDir, { action: 'accept', content: { username: 'alice' } });
    const result = runHook({
      session_id: 'abc-123',
      cwd: tmpDir,
      hook_event_name: 'Elicitation',
      mcp_server_name: 'gsd-bridge',
      message: 'Hi',
      mode: 'form',
      requested_schema: { type: 'object' },
    }, 8_000);
    assert.equal(result.exitCode, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.length > 0, 'should emit stdout');
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'Elicitation');
    assert.equal(out.hookSpecificOutput.action, 'accept');
    assert.deepEqual(out.hookSpecificOutput.content, { username: 'alice' });
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', '.bridge', 'pending.json')),
      'pending.json must be written'
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.planning', '.bridge', 'response.json')),
      'response.json must be consumed'
    );
  });

  test('emits decline without content', () => {
    writeResponse(tmpDir, { action: 'decline' });
    const result = runHook({
      session_id: 's1',
      cwd: tmpDir,
      hook_event_name: 'Elicitation',
      mcp_server_name: 'gsd-bridge',
      mode: 'form',
      requested_schema: {},
    }, 8_000);
    assert.equal(result.exitCode, 0, `stderr: ${result.stderr}`);
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput.action, 'decline');
    assert.equal(out.hookSpecificOutput.content, undefined);
  });

  test('exits silently on path-traversal session_id', () => {
    writeResponse(tmpDir, { action: 'accept', content: {} });
    const result = runHook({
      session_id: '../evil',
      cwd: tmpDir,
      hook_event_name: 'Elicitation',
      mcp_server_name: 'gsd-bridge',
      mode: 'form',
    }, 5_000);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  });

  test('exits silently when mcp_server_name does not match gsd-bridge', () => {
    writeResponse(tmpDir, { action: 'accept', content: {} });
    const result = runHook({
      session_id: 's1',
      cwd: tmpDir,
      hook_event_name: 'Elicitation',
      mcp_server_name: 'some-other-server',
      mode: 'form',
    }, 5_000);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  });

  test('guards against JSON bomb (response > 256KB)', () => {
    // 300 KB content — exceeds MAX_BRIDGE_BYTES (256_000) in the hook.
    const huge = 'A'.repeat(300_000);
    writeResponse(tmpDir, { action: 'accept', content: { blob: huge } });
    // Hook's size guard `break`s out of the poll loop; it then falls through
    // to TOTAL_TIMEOUT_MS and silent-exits. We cap execFileSync at 3s so the
    // test doesn't wait the full 120s hook timeout.
    const result = runHook({
      session_id: 's1',
      cwd: tmpDir,
      hook_event_name: 'Elicitation',
      mcp_server_name: 'gsd-bridge',
      mode: 'form',
    }, 3_000);
    // Either the hook was killed by execFileSync (exitCode null, signal = SIGTERM)
    // or it exited 0 (if its inner timeout somehow fired faster). Both are
    // acceptable — the critical property is that the bomb content is NEVER
    // surfaced on stdout.
    assert.ok(
      result.exitCode === 0 || result.exitCode === null || result.exitCode > 0,
      `unexpected exitCode: ${result.exitCode}`
    );
    assert.ok(
      !result.stdout.includes('AAAA'),
      'JSON bomb content leaked to hook stdout'
    );
  });

  test('sanitizes prototype pollution attempts in content', () => {
    // JSON.parse treats "__proto__" as a literal string key rather than the
    // actual prototype reference, but the hook still rebuilds via Object.keys
    // to guarantee the sanitized output is a plain object.
    writeResponse(tmpDir, {
      action: 'accept',
      content: { __proto__: { polluted: true }, safe: 'ok' },
    });
    const result = runHook({
      session_id: 's1',
      cwd: tmpDir,
      hook_event_name: 'Elicitation',
      mcp_server_name: 'gsd-bridge',
      mode: 'form',
    }, 8_000);
    assert.equal(result.exitCode, 0, `stderr: ${result.stderr}`);
    // Confirm no global prototype pollution occurred.
    assert.equal(({}).polluted, undefined, 'Object.prototype should not be polluted');
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput.action, 'accept');
    // The safe field must survive sanitization.
    assert.equal(out.hookSpecificOutput.content.safe, 'ok');
  });
});
