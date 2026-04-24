'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createTempDir, cleanup } = require('./helpers.cjs');
const {
  startSubmitServer,
  MAX_BODY_BYTES,
  BIND_HOST,
} = require('../plugins/gsd-bridge/hooks/lib/submit-server.cjs');

function postJson(port, pathStr, body, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: pathStr,
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    if (typeof body === 'string') req.write(body);
    else if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

function getRequest(port, pathStr) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: 'GET', path: pathStr },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('binds to 127.0.0.1 (not 0.0.0.0) on an ephemeral port', async (t) => {
  const dir = createTempDir('gsd-submit-test-');
  t.after(() => cleanup(dir));
  const handle = startSubmitServer({ bridgeDir: dir, sessionId: 'sid-1', timeoutMs: 5000 });
  assert.ok(handle);
  const port = await handle.whenReady;
  assert.ok(port > 0, 'ephemeral port should be > 0');
  const res = await getRequest(port, '/');
  assert.equal(res.status, 404);
  handle.close();
});

test('valid POST /submit with matching session_id atomically writes response.json and replies 204', async (t) => {
  const dir = createTempDir('gsd-submit-test-');
  t.after(() => cleanup(dir));
  let cbPayload = null;
  const handle = startSubmitServer({
    bridgeDir: dir,
    sessionId: 'sid-2',
    timeoutMs: 5000,
    onResponse: (p) => { cbPayload = p; },
  });
  const port = await handle.whenReady;
  const res = await postJson(port, '/submit', { session_id: 'sid-2', response: { color: 'red' } });
  assert.equal(res.status, 204);

  const responsePath = path.join(dir, 'response.json');
  assert.ok(fs.existsSync(responsePath));
  const written = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
  assert.equal(written.action, 'accept');
  assert.deepEqual(written.content, { color: 'red' });
  assert.equal(written.session_id, 'sid-2');

  assert.ok(cbPayload, 'onResponse callback fired');
  assert.equal(cbPayload.action, 'accept');

  // Server should be closed after single-shot accept; next request must fail
  await new Promise((r) => setTimeout(r, 50));
  let connRefused = false;
  try {
    await getRequest(port, '/submit');
  } catch (e) {
    connRefused = e.code === 'ECONNREFUSED';
  }
  assert.equal(connRefused, true, 'server should be closed after first valid POST (single-shot)');
});

test('POST /submit with mismatched session_id returns 400 and does NOT write response.json', async (t) => {
  const dir = createTempDir('gsd-submit-test-');
  t.after(() => cleanup(dir));
  const handle = startSubmitServer({ bridgeDir: dir, sessionId: 'sid-real', timeoutMs: 5000 });
  const port = await handle.whenReady;
  const res = await postJson(port, '/submit', { session_id: 'sid-fake', response: { x: 1 } });
  assert.equal(res.status, 400);
  assert.equal(fs.existsSync(path.join(dir, 'response.json')), false);
  handle.close();
});

test('POST /submit with wrong Content-Type returns 415', async (t) => {
  const dir = createTempDir('gsd-submit-test-');
  t.after(() => cleanup(dir));
  const handle = startSubmitServer({ bridgeDir: dir, sessionId: 'sid-3', timeoutMs: 5000 });
  const port = await handle.whenReady;
  const res = await postJson(port, '/submit', '{}', { 'Content-Type': 'text/plain' });
  assert.equal(res.status, 415);
  handle.close();
});

test('GET /submit returns 405 with Allow: POST header', async (t) => {
  const dir = createTempDir('gsd-submit-test-');
  t.after(() => cleanup(dir));
  const handle = startSubmitServer({ bridgeDir: dir, sessionId: 'sid-4', timeoutMs: 5000 });
  const port = await handle.whenReady;
  const res = await getRequest(port, '/submit');
  assert.equal(res.status, 405);
  assert.equal(String(res.headers.allow || '').toUpperCase(), 'POST');
  handle.close();
});

test('Unknown path returns 404', async (t) => {
  const dir = createTempDir('gsd-submit-test-');
  t.after(() => cleanup(dir));
  const handle = startSubmitServer({ bridgeDir: dir, sessionId: 'sid-5', timeoutMs: 5000 });
  const port = await handle.whenReady;
  const res = await postJson(port, '/elsewhere', {});
  assert.equal(res.status, 404);
  handle.close();
});

test('Body > 1 MB is rejected with 413 (Content-Length declared)', async (t) => {
  const dir = createTempDir('gsd-submit-test-');
  t.after(() => cleanup(dir));
  const handle = startSubmitServer({ bridgeDir: dir, sessionId: 'sid-6', timeoutMs: 5000 });
  const port = await handle.whenReady;
  const big = 'x'.repeat(MAX_BODY_BYTES + 1024);
  const body = JSON.stringify({ session_id: 'sid-6', response: big });
  const res = await postJson(port, '/submit', body);
  assert.equal(res.status, 413);
  handle.close();
});

test('server.close() after timeoutMs (whichever comes first)', async (t) => {
  const dir = createTempDir('gsd-submit-test-');
  t.after(() => cleanup(dir));
  const handle = startSubmitServer({ bridgeDir: dir, sessionId: 'sid-7', timeoutMs: 200 });
  const port = await handle.whenReady;
  await new Promise((r) => setTimeout(r, 350));
  let connRefused = false;
  try {
    await getRequest(port, '/submit');
  } catch (e) {
    connRefused = e.code === 'ECONNREFUSED';
  }
  assert.equal(connRefused, true, 'server should be closed after timeoutMs');
});

test('close() is idempotent', async (t) => {
  const dir = createTempDir('gsd-submit-test-');
  t.after(() => cleanup(dir));
  const handle = startSubmitServer({ bridgeDir: dir, sessionId: 'sid-8', timeoutMs: 5000 });
  await handle.whenReady;
  handle.close();
  assert.doesNotThrow(() => handle.close());
});

test('exports BIND_HOST = 127.0.0.1 (no 0.0.0.0)', () => {
  assert.equal(BIND_HOST, '127.0.0.1');
});
