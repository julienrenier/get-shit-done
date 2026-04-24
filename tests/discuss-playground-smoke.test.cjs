/**
 * GSD Tools Tests — discuss-phase playground smoke test
 *
 * Validates structural and semantic invariants of the discuss-playground.html
 * artefact delivered by Phase 03 Plans 01-03. Uses only node built-ins.
 *
 * Closes: INTEG-06 (4 gray areas audited by locked invariants)
 *
 * Fresh-clone-safe: the playground HTML lives under `.planning/` (gitignored
 * per CLAUDE.md line 4). When absent, HTML-dependent tests are reported as
 * skipped and the suite exits 0. The two pro.md tests always run.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', '.planning', 'phases', '03-discuss-webview-integration', 'discuss-playground.html');
const PRO_PATH  = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'discuss-phase', 'modes', 'pro.md');

const HTML_EXISTS = fs.existsSync(HTML_PATH);

// The 8 step IDs visualized by the playground's educational diagram.
// This is deliberately a SUBSET of the dispatcher's full step list
// (see get-shit-done/workflows/discuss-phase.md — which additionally
// contains check_blocking_antipatterns, check_existing,
// cross_reference_todos, confirm_creation, git_commit, update_state,
// auto_advance). Locked by Plan 03-01 + D-03 in 03-CONTEXT.md.
// See UI-SPEC §Timeline Strip.
const PLAYGROUND_DIAGRAM_STEPS = [
  'initialize',
  'check_spec',
  'load_prior_context',
  'scout_codebase',
  'analyze_phase',
  'present_gray_areas',
  'discuss_areas',
  'write_context',
];

const LOCKED_PRESETS = ['default', 'auto', 'advisor', 'pro'];

// ---------------------------------------------------------------------------

test('playground artefact exists and is under size budget', { skip: !HTML_EXISTS && 'playground not present (gitignored .planning/ artefact)' }, () => {
  const { size } = fs.statSync(HTML_PATH);
  assert.ok(size < 61440, `playground size ${size} bytes >= 61440 bytes (60 KB budget)`);
});

// ---------------------------------------------------------------------------

test('playground declares the 8 locked discuss-phase step IDs in the locked order', { skip: !HTML_EXISTS && 'playground not present (gitignored .planning/ artefact)' }, () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  // SVG data-step-id attributes
  const stepIdRe = /data-step-id="([^"]+)"/g;
  const ids = [...html.matchAll(stepIdRe)].map(m => m[1]);
  assert.deepEqual(ids, PLAYGROUND_DIAGRAM_STEPS, 'data-step-id attributes must match locked order');

  // Cross-check the embedded JSON payload
  const jsonMatch = html.match(/<script type="application\/json" id="steps-data">([\s\S]*?)<\/script>/);
  assert.ok(jsonMatch, 'steps-data payload missing');
  const steps = JSON.parse(jsonMatch[1]);
  assert.equal(steps.length, 8, 'steps-data must have exactly 8 entries');
  assert.deepEqual(steps.map(s => s.id), ids, 'steps-data ids must match SVG data-step-id order');
});

// ---------------------------------------------------------------------------

test('playground declares the 4 locked preset data-preset attributes', { skip: !HTML_EXISTS && 'playground not present (gitignored .planning/ artefact)' }, () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const presetRe = /data-preset="([^"]+)"/g;
  const presets = [...html.matchAll(presetRe)].map(m => m[1]);
  assert.equal(presets.length, 4, `expected 4 data-preset attributes, found ${presets.length}`);
  for (const p of LOCKED_PRESETS) {
    assert.ok(presets.includes(p), `missing data-preset="${p}"`);
  }
});

// ---------------------------------------------------------------------------

test('buildCommand pure function produces the 4 locked CLI strings', { skip: !HTML_EXISTS && 'playground not present (gitignored .planning/ artefact)' }, () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  // Bracket-balanced extraction — survives reformatting (WR-01 fix).
  const signatureMatch = html.match(/function\s+buildCommand\s*\(\s*(\w+)\s*\)\s*\{/);
  assert.ok(signatureMatch, 'buildCommand function signature not found in playground');
  const param = signatureMatch[1];
  const bodyStart = signatureMatch.index + signatureMatch[0].length;
  let depth = 1;
  let cursor = bodyStart;
  while (cursor < html.length && depth > 0) {
    const ch = html[cursor];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    cursor += 1;
  }
  assert.equal(depth, 0, 'buildCommand body braces unbalanced');
  const innerBody = html.slice(bodyStart, cursor - 1);
  const buildCommand = new Function(param, innerBody); // eslint-disable-line no-new-func

  assert.equal(buildCommand({ preset: 'default',  phaseNumber: 1 }), '/gsd-discuss-phase 1');
  assert.equal(buildCommand({ preset: 'auto',     phaseNumber: 1 }), '/gsd-discuss-phase 1 --auto');
  assert.equal(buildCommand({ preset: 'advisor',  phaseNumber: 1 }), '/gsd-discuss-phase 1 --advisor');
  assert.equal(buildCommand({ preset: 'pro',      phaseNumber: 1 }), '/gsd-discuss-phase 1 --pro');
});

// ---------------------------------------------------------------------------

test('playground has no external resource references', { skip: !HTML_EXISTS && 'playground not present (gitignored .planning/ artefact)' }, () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const forbidden = [
    /src="https?:\/\//,
    /href="https?:\/\//,
    /@import/,
    /<script\s+src=/,
  ];
  for (const re of forbidden) {
    assert.ok(!re.test(html), `forbidden external reference matched: ${re}`);
  }
});

// ---------------------------------------------------------------------------

test('playground uses textContent not innerHTML', { skip: !HTML_EXISTS && 'playground not present (gitignored .planning/ artefact)' }, () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  // Assignment-pattern targeted check (WR-02 fix): matches `.innerHTML =` or
  // `.innerHTML=`, not bare substring — comments/docs mentioning innerHTML are OK.
  const innerHtmlAssignment = /\.innerHTML\s*=/;
  assert.ok(!innerHtmlAssignment.test(html), 'playground must not assign to innerHTML (textContent required; comments/docs mentioning innerHTML are acceptable)');
});

// ---------------------------------------------------------------------------

test('pro.md references browser-bridge.md and show_playground', () => {
  assert.ok(fs.existsSync(PRO_PATH), `pro.md not found at ${PRO_PATH}`);
  const content = fs.readFileSync(PRO_PATH, 'utf8');
  assert.ok(content.includes('browser-bridge.md'), 'pro.md must reference browser-bridge.md (Plan 03 wiring)');
  assert.ok(content.includes('show_playground'), 'pro.md must reference show_playground (Plan 03 bridge invocation)');
});

// ---------------------------------------------------------------------------

test('pro.md stays inside the DEFAULT workflow budget (< 1000 L)', () => {
  assert.ok(fs.existsSync(PRO_PATH), `pro.md not found at ${PRO_PATH}`);
  const content = fs.readFileSync(PRO_PATH, 'utf8');
  const lineCount = content.trimEnd().split('\n').length;
  assert.ok(lineCount < 1000, `pro.md must be < 1000 lines (DEFAULT budget), got ${lineCount}`);
});
