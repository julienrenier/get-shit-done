/**
 * Tests for plugins/gsd-bridge/dist/server.js — the gsd-bridge MCP server.
 *
 * Spawns the built server as a child process on stdio and exchanges
 * JSON-RPC messages to validate:
 *   - tools/list returns the 3 expected tools (show_playground, show_form, reply)
 *   - tools/call 'reply' writes .planning/.bridge/pending.json and resolves ok
 *
 * Build gate: if plugins/gsd-bridge/dist/server.js is missing, the suite
 * is skipped gracefully so the rest of the test run still passes.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { createTempDir, cleanup } = require('./helpers.cjs');

const DIST_PATH = path.join(
  __dirname, '..', 'plugins', 'gsd-bridge', 'dist', 'server.js'
);
const distAvailable = fs.existsSync(DIST_PATH);

function startServer(cwd) {
  return spawn(process.execPath, [DIST_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GSD_TEST_MODE: '1', GSD_BRIDGE_CWD: cwd },
  });
}

function writeRpc(child, obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}

// Minimal line-delimited JSON-RPC reader. Resolves with the first message
// whose `id` matches `expectedId`. Ignores notifications/other ids.
function readOneRpc(child, expectedId, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === expectedId) {
            child.stdout.off('data', onData);
            clearTimeout(timer);
            resolve(msg);
            return;
          }
        } catch {
          // partial/non-JSON line — ignore
        }
      }
    };
    const timer = setTimeout(() => {
      child.stdout.off('data', onData);
      reject(new Error(`JSON-RPC read timeout for id=${expectedId}`));
    }, timeoutMs);
    child.stdout.on('data', onData);
  });
}

describe(
  'gsd-bridge MCP server (stdio)',
  { skip: !distAvailable ? 'plugin dist/ not built' : false },
  () => {
    let tmpDir;
    let child;

    beforeEach(() => {
      tmpDir = createTempDir('gsd-bridge-server-');
    });

    afterEach(() => {
      if (child) {
        try { child.kill('SIGTERM'); } catch { /* already gone */ }
      }
      cleanup(tmpDir);
    });

    test('tools/list returns show_playground, show_form, reply', async () => {
      child = startServer(tmpDir);

      // MCP protocol requires initialize first.
      writeRpc(child, {
        jsonrpc: '2.0', id: 0, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      });
      await readOneRpc(child, 0, 5_000);

      writeRpc(child, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const resp = await readOneRpc(child, 1, 5_000);
      assert.ok(resp.result, 'tools/list must have result');
      const names = resp.result.tools.map((t) => t.name);
      assert.ok(names.includes('show_playground'), `missing show_playground: ${names.join(',')}`);
      assert.ok(names.includes('show_form'), `missing show_form: ${names.join(',')}`);
      assert.ok(names.includes('reply'), `missing reply: ${names.join(',')}`);
    });

    test('tools/call reply writes pending.json and returns ok', async () => {
      child = startServer(tmpDir);

      writeRpc(child, {
        jsonrpc: '2.0', id: 0, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      });
      await readOneRpc(child, 0, 5_000);

      writeRpc(child, {
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'reply', arguments: { text: 'hello browser' } },
      });
      const resp = await readOneRpc(child, 2, 5_000);
      assert.ok(resp.result, 'tools/call should succeed');
      assert.ok(!resp.result.isError, 'reply should not be error');

      const pendingPath = path.join(tmpDir, '.planning', '.bridge', 'pending.json');
      assert.ok(fs.existsSync(pendingPath), 'pending.json must exist');
      const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
      assert.equal(pending.kind, 'reply');
      assert.equal(pending.text, 'hello browser');
    });
  },
);
