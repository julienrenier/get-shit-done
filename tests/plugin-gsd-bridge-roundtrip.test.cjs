/**
 * Round-trip E2E test for the gsd-bridge MCP server.
 *
 * Validates the native MCP elicitation path (D-04 + D-06):
 *   tools/call show_form → server emits elicitation/create → test plays
 *   the MCP client and answers with {action, content} → server returns the
 *   serialized elicit result as the tools/call response.
 *
 * Two cases: accept with content, decline without content. No filesystem
 * coordination — the native MCP stdio reverse-request drives the round
 * trip end-to-end. The Elicitation hook (Plan 03) is NOT in the loop here
 * because the test process is itself the client; the hook only intercepts
 * when Claude Code is the client. What this test validates is that the
 * server half of the contract (show_form → elicitInput → serialized
 * response) stays stable for Plan 03 / Plan 05 consumers.
 *
 * Build gate: skipped gracefully if plugins/gsd-bridge/dist/server.js is
 * missing.
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

// Rolling line-delimited JSON-RPC reader over a child's stdout.
// Buffers complete lines, yields parsed objects on `next(timeoutMs)`.
function createJsonLineReader(child) {
  let buf = '';
  const queue = [];
  let waiters = [];
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (waiters.length > 0) {
          const w = waiters.shift();
          w(msg);
        } else {
          queue.push(msg);
        }
      } catch {
        // partial frame or non-JSON — skip
      }
    }
  });
  return {
    next(timeoutMs = 5_000) {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const onMsg = (msg) => {
          clearTimeout(timer);
          resolve(msg);
        };
        const timer = setTimeout(() => {
          waiters = waiters.filter((w) => w !== onMsg);
          reject(new Error('JSON-RPC read timeout after ' + timeoutMs + 'ms'));
        }, timeoutMs);
        waiters.push(onMsg);
      });
    },
  };
}

function sendRpc(child, payload) {
  child.stdin.write(JSON.stringify(payload) + '\n');
}

// Wait for a response/request with matching id or method. Messages that
// don't match are requeued so the caller can pick them up later if needed.
async function waitFor(reader, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(50, deadline - Date.now());
    const msg = await reader.next(remaining);
    if (predicate(msg)) return msg;
    // non-matching — ignore; we do not care about unrelated notifications
  }
  throw new Error('waitFor: predicate never matched');
}

describe(
  'gsd-bridge round-trip (show_form ↔ elicitation/create)',
  { skip: !distAvailable ? 'plugin dist/ not built' : false },
  () => {
    let tmpDir;
    let child;

    beforeEach(() => {
      tmpDir = createTempDir('gsd-bridge-rt-');
    });

    afterEach(() => {
      if (child) {
        try { child.kill('SIGTERM'); } catch { /* already gone */ }
      }
      cleanup(tmpDir);
    });

    test('show_form emits elicitation/create, resolves with accept content', async () => {
      child = spawn(process.execPath, [DIST_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GSD_TEST_MODE: '1', GSD_BRIDGE_CWD: tmpDir },
      });
      const reader = createJsonLineReader(child);

      // Initialize — advertise elicitation capability so the server will
      // actually issue elicitation/create reverse requests.
      sendRpc(child, {
        jsonrpc: '2.0', id: 0, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { elicitation: {} },
          clientInfo: { name: 'test-client', version: '0' },
        },
      });
      const initResp = await waitFor(reader, (m) => m.id === 0, 5_000);
      assert.equal(initResp.id, 0, 'initialize response should have id 0');

      // Fire show_form. Server will call elicitInput() internally, which
      // emits an elicitation/create reverse RPC to us.
      sendRpc(child, {
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: {
          name: 'show_form',
          arguments: {
            title: 'Login',
            message: 'Enter your username',
            fields: { username: { type: 'string', title: 'User', required: true } },
          },
        },
      });

      // Expect elicitation/create as a reverse-direction request (has method).
      const elicitReq = await waitFor(
        reader,
        (m) => m.method === 'elicitation/create',
        5_000,
      );
      assert.ok(elicitReq.params, 'elicitation/create must carry params');
      assert.ok(
        elicitReq.params.requestedSchema,
        'elicitation/create params must include requestedSchema',
      );
      assert.equal(elicitReq.params.requestedSchema.type, 'object');
      assert.ok(
        elicitReq.params.requestedSchema.properties.username,
        'schema must include username field',
      );
      assert.ok(typeof elicitReq.id !== 'undefined', 'request must have id for response routing');

      // Respond as the client — mimic what the hook (Plan 03) returns.
      sendRpc(child, {
        jsonrpc: '2.0', id: elicitReq.id,
        result: { action: 'accept', content: { username: 'alice' } },
      });

      // tools/call should resolve now with serialized elicit result.
      const toolResp = await waitFor(reader, (m) => m.id === 1, 5_000);
      assert.ok(toolResp.result, 'tools/call must resolve after elicitation accept');
      assert.ok(!toolResp.result.isError, 'tool result should not be an error');
      const content = JSON.parse(toolResp.result.content[0].text);
      assert.equal(content.action, 'accept');
      assert.deepEqual(content.content, { username: 'alice' });
    });

    test('show_form propagates decline action without error', async () => {
      child = spawn(process.execPath, [DIST_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GSD_TEST_MODE: '1', GSD_BRIDGE_CWD: tmpDir },
      });
      const reader = createJsonLineReader(child);

      sendRpc(child, {
        jsonrpc: '2.0', id: 0, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { elicitation: {} },
          clientInfo: { name: 'test-client', version: '0' },
        },
      });
      await waitFor(reader, (m) => m.id === 0, 5_000);

      sendRpc(child, {
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {
          name: 'show_form',
          arguments: {
            title: 'X',
            message: 'X',
            fields: { a: { type: 'string', title: 'A' } },
          },
        },
      });

      const elicitReq = await waitFor(
        reader,
        (m) => m.method === 'elicitation/create',
        5_000,
      );
      sendRpc(child, {
        jsonrpc: '2.0', id: elicitReq.id,
        result: { action: 'decline' },
      });

      const toolResp = await waitFor(reader, (m) => m.id === 2, 5_000);
      assert.ok(toolResp.result, 'tools/call must resolve after decline');
      assert.ok(!toolResp.result.isError, 'decline should not surface as error');
      const content = JSON.parse(toolResp.result.content[0].text);
      assert.equal(content.action, 'decline');
    });
  },
);
