/**
 * GSD Tools Tests - discuss-phase --pro mode
 *
 * Validates that the --pro flag workflow documentation is present and
 * correctly describes the step-hook overlay pattern with conditional
 * follow-ups and strict completeness gating (D-02 révisé 2026-04-24).
 *
 * Closes: #2555
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('discuss-phase --pro mode (#2555)', () => {
  const commandPath = path.join(__dirname, '..', 'commands', 'gsd', 'discuss-phase.md');
  const workflowPath = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'discuss-phase.md');
  const proModePath = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'discuss-phase', 'modes', 'pro.md');
  const proSchemaPath = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'discuss-phase', 'templates', 'pro-questions-schema.json');
  const fixturesDir = path.join(__dirname, 'fixtures', 'discuss-pro');

  // --- Artefact existence ---

  test('modes/pro.md exists', () => {
    assert.ok(fs.existsSync(proModePath), 'modes/pro.md must exist');
  });

  test('pro-questions-schema.json exists', () => {
    assert.ok(fs.existsSync(proSchemaPath), 'pro-questions-schema.json must exist');
  });

  // --- Slash command frontmatter ---

  test('commands/gsd/discuss-phase.md mentions --pro in argument-hint', () => {
    const content = fs.readFileSync(commandPath, 'utf8');
    const frontmatter = content.split('---')[1] || '';
    assert.ok(frontmatter.includes('--pro'), 'argument-hint must include --pro');
  });

  test('commands/gsd/discuss-phase.md does NOT add modes/pro.md to execution_context', () => {
    const content = fs.readFileSync(commandPath, 'utf8');
    assert.ok(!content.includes('modes/pro.md'), 'commands file must not reference modes/pro.md (progressive disclosure)');
  });

  // --- Dispatcher routing ---

  test('workflows/discuss-phase.md routes --pro to modes/pro.md', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    const matches = content.match(/modes\/pro\.md/g) || [];
    assert.ok(matches.length >= 2, 'dispatcher must reference modes/pro.md at least twice (routing table + initialize)');
  });

  test('workflows/discuss-phase.md describes --pro as step-hook (not exit-standard)', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes('step-hook before'), 'dispatcher must describe --pro with the "step-hook before" wording (D-02 revised)');
    // The combination "modes/pro.md" + "exit standard flow" on any single line would indicate the --power pattern was incorrectly applied to --pro.
    const badCombo = content.split('\n').some(line => line.includes('modes/pro.md') && line.includes('exit standard flow'));
    assert.ok(!badCombo, 'dispatcher must NOT describe --pro with "exit standard flow" — that is --power pattern');
  });

  test('workflows/discuss-phase.md stays under 500 lines', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    // Count non-empty trailing newline: split('\n') on a newline-terminated file yields length+1 due to trailing empty element.
    // Canonical line count = content.split('\n').filter(Boolean).length or trim first.
    const lines = content.trimEnd().split('\n').length;
    assert.ok(lines < 500, `dispatcher must be < 500 lines, got ${lines}`);
  });

  // --- Overlay structure (step-hook pattern, D-02 révisé) ---

  test('modes/pro.md declares the 2 required _override steps', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    for (const stepName of ['discuss_areas_override', 'write_context_override']) {
      assert.ok(content.includes(stepName), `modes/pro.md must declare step "${stepName}" (step-hook pattern)`);
    }
  });

  test('modes/pro.md contains wait_loop sub-step', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    assert.ok(content.includes('wait_loop'), 'modes/pro.md must contain the wait_loop sub-step logic');
  });

  test('modes/pro.md does NOT declare steps delegated to dispatcher pre-steps', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    // These steps are owned by the dispatcher. A step-hook overlay MUST NOT declare them as top-level
    // <step name="..."> blocks on their own line (i.e., the tag must not start a line as a declaration).
    // Note: <step name="analyze_phase"> may appear in prose/references inside the overlay — that is fine.
    // We test for standalone opening tags on their own line (pattern: line starts with '<step name=').
    const lines = content.split('\n');
    const forbiddenStepNames = [
      'analyze',
      'scout_codebase',
      'load_prior_context',
      'check_spec',
      'check_existing',
      'analyze_phase',
    ];
    const declaredSteps = lines
      .map(l => l.trim())
      .filter(l => l.startsWith('<step name='))
      .map(l => {
        const m = l.match(/^<step name="([^"]+)"/);
        return m ? m[1] : null;
      })
      .filter(Boolean);
    for (const forbidden of forbiddenStepNames) {
      assert.ok(
        !declaredSteps.includes(forbidden),
        `modes/pro.md must not declare <step name="${forbidden}"> — that step is a dispatcher pre-step, not overridden by --pro`
      );
    }
  });

  test('modes/pro.md does NOT contain generate_html step (deferred to Phase 3)', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    assert.ok(!content.includes('generate_html'), 'modes/pro.md must not contain generate_html (HTML is Phase 3)');
  });

  test('modes/pro.md does NOT contain chat_more field (diverges from --power)', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    assert.ok(!content.includes('chat_more'), 'modes/pro.md must not contain chat_more (diverges from --power per D-16)');
  });

  test('modes/pro.md does NOT use "exit standard flow" wording (that is --power pattern)', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    assert.ok(!content.includes('exit standard flow'), 'modes/pro.md must not use "exit standard flow" wording — --pro is step-hook, not exit-standard (D-02 revised)');
  });

  test('modes/pro.md identifies itself as a lazy-loaded overlay', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    assert.ok(content.includes('Lazy-loaded overlay'), 'modes/pro.md must declare itself as a "Lazy-loaded overlay" in the banner (step-hook pattern)');
  });

  test('modes/pro.md references PRO-QUESTIONS.json filename (avoids --power collision)', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    assert.ok(content.includes('PRO-QUESTIONS.json'), 'modes/pro.md must reference {padded}-PRO-QUESTIONS.json per D-06');
  });

  test('modes/pro.md mentions criticality and follow_up (semantic divergences)', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    assert.ok(content.includes('criticality'), 'modes/pro.md must mention criticality (D-13)');
    assert.ok(content.includes('follow_up'), 'modes/pro.md must mention follow_up (D-08)');
  });

  test('modes/pro.md stays within step-hook overlay budget (<= 200 lines per D-NEW-22)', () => {
    const content = fs.readFileSync(proModePath, 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines <= 200, `modes/pro.md must be <= 200 lines (D-NEW-22 step-hook overlay budget), got ${lines}`);
    assert.ok(lines >= 80, `modes/pro.md must be >= 80 lines (minimum for step-hook with 2 override declarations), got ${lines}`);
  });

  // --- Schema validity ---

  test('pro-questions-schema.json is valid JSON with required shape', () => {
    const raw = fs.readFileSync(proSchemaPath, 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw));
    const parsed = JSON.parse(raw);
    for (const key of ['phase', 'generated_at', 'stats', 'sections']) {
      assert.ok(key in parsed, `schema missing required top-level field "${key}"`);
    }
    assert.ok('required_unanswered' in parsed.stats, 'schema.stats must include required_unanswered (D-13)');
    assert.ok(!('chat_more' in parsed.stats), 'schema.stats must NOT include chat_more (diverges from --power, D-16)');
    const firstQ = parsed.sections[0].questions[0];
    assert.ok('criticality' in firstQ, 'schema questions must include criticality field (D-13)');
    assert.ok('follow_up' in firstQ, 'schema questions must include follow_up field (D-08)');
  });

  // --- Fixture assertions ---

  describe('pro mode fixtures', () => {
    test('complete fixture has all required questions answered', () => {
      const f = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'complete.json'), 'utf8'));
      const required = f.sections.flatMap(s => s.questions).filter(q => q.criticality === 'required');
      const unanswered = required.filter(q => q.status !== 'answered');
      assert.strictEqual(unanswered.length, 0, 'complete fixture must have zero unanswered required questions');
      assert.strictEqual(f.stats.required_unanswered, 0, 'complete fixture stats.required_unanswered must be 0');
    });

    test('incomplete fixture has at least 1 unanswered required question (finalize gate target)', () => {
      const f = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'incomplete.json'), 'utf8'));
      const unanswered = f.sections.flatMap(s => s.questions).filter(q => q.criticality === 'required' && q.status !== 'answered');
      assert.ok(unanswered.length >= 1, 'incomplete fixture must trigger the abort path');
      assert.ok(f.stats.required_unanswered >= 1, 'incomplete fixture stats.required_unanswered must be >= 1');
    });

    test('with-follow-ups fixture has a question whose answer triggers follow_up', () => {
      const f = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'with-follow-ups.json'), 'utf8'));
      const triggered = f.sections.flatMap(s => s.questions).filter(q => q.follow_up && q.answer === q.follow_up.trigger);
      assert.ok(triggered.length >= 1, 'with-follow-ups fixture must have at least one answered trigger');
    });
  });
});
