'use strict';

// Localhost sidecar HTTP server for the Phase 4 webview round-trip.
// RENDERER-CONTRACT.md §3.1 — bound to 127.0.0.1 only, ephemeral port via
// listen(0), single-shot POST /submit, body ≤ 1 MB, Content-Type
// application/json, atomic write to response.json (Phase 1 file-based bridge
// pattern), then close.
//
// Hook lib helpers stay dep-free (Node built-ins only).

const http = require('http');
const fs = require('fs');
const path = require('path');

const MAX_BODY_BYTES = 1_000_000; // 1 MB cap (I-6, T-04-04-13)
const BIND_HOST = '127.0.0.1';     // T-04-04-11 — loopback only, never any-interface

function startSubmitServer(opts) {
  const bridgeDir = opts && opts.bridgeDir;
  const sessionId = opts && opts.sessionId;
  const timeoutMs = (opts && opts.timeoutMs) || 120_000;
  const onResponse = (opts && opts.onResponse) || (() => {});

  if (typeof bridgeDir !== 'string' || typeof sessionId !== 'string' || !sessionId) {
    return null;
  }

  let closed = false;
  let timer = null;

  function close() {
    if (closed) return;
    closed = true;
    try { server.close(); } catch {}
    if (timer) { clearTimeout(timer); timer = null; }
  }

  const server = http.createServer((req, res) => {
    if (closed) {
      res.statusCode = 503;
      return res.end();
    }
    if (req.url !== '/submit') {
      res.statusCode = 404;
      return res.end();
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      return res.end();
    }
    const ctype = String(req.headers['content-type'] || '').toLowerCase();
    if (!ctype.includes('application/json')) {
      res.statusCode = 415;
      return res.end();
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      res.statusCode = 413;
      return res.end();
    }

    let received = 0;
    const chunks = [];
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        aborted = true;
        res.statusCode = 413;
        try { res.end(); } catch {}
        try { req.destroy(); } catch {}
        return;
      }
      chunks.push(chunk);
    });
    req.on('aborted', () => { aborted = true; });
    req.on('end', () => {
      if (aborted) return;
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.statusCode = 400;
        return res.end();
      }
      if (!parsed || typeof parsed !== 'object' || parsed.session_id !== sessionId) {
        res.statusCode = 400;
        return res.end();
      }
      const payload = {
        action: 'accept',
        content: parsed.response,
        session_id: sessionId,
        ts: new Date().toISOString(),
      };
      const responsePath = path.join(bridgeDir, 'response.json');
      const tmp = responsePath + '.tmp.' + process.pid;
      try {
        fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
        fs.renameSync(tmp, responsePath);
      } catch {
        res.statusCode = 500;
        return res.end();
      }
      res.statusCode = 204;
      res.end();
      try { onResponse(payload); } catch {}
      // Single-shot: close after first valid POST.
      close();
    });
  });

  timer = setTimeout(close, timeoutMs);
  // Allow process to exit even if timer is pending.
  if (typeof timer.unref === 'function') timer.unref();

  let listened = false;
  try {
    server.listen(0, BIND_HOST, () => { listened = true; });
  } catch {
    if (timer) { clearTimeout(timer); timer = null; }
    return null;
  }

  // server.listen is async; expose a whenReady promise for tests / callers
  // that need the bound port deterministically. The synchronous `port` getter
  // returns 0 until the OS-level bind completes.
  const whenReady = new Promise((resolve) => {
    if (listened) {
      const addr = server.address();
      return resolve(addr && typeof addr === 'object' ? addr.port : 0);
    }
    server.once('listening', () => {
      const addr = server.address();
      resolve(addr && typeof addr === 'object' ? addr.port : 0);
    });
  });

  return {
    get port() {
      const addr = server.address();
      return addr && typeof addr === 'object' ? addr.port : 0;
    },
    whenReady,
    close,
  };
}

module.exports = { startSubmitServer, MAX_BODY_BYTES, BIND_HOST };
