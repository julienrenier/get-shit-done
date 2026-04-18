/**
 * GSD Tools Tests - discuss-phase markdown mode (file-based recursive question tree)
 *
 * Validates the --markdown flag workflow: generates a per-question markdown tree
 * (one .md per question) with recursive split children, DAG dependencies between
 * siblings, checkbox-based finalize, and an INDEX.md dashboard.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('discuss-phase markdown mode (file-based recursive)', () => {
  const commandPath = path.join(__dirname, '..', 'commands', 'gsd', 'discuss-phase.md');
  const workflowPath = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'discuss-phase.md');
  const fileWorkflowPath = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'discuss-phase-file.md');
  const questionWorkflowPath = path.join(__dirname, '..', 'get-shit-done', 'workflows', 'discuss-question-markdown.md');

  describe('command file (discuss-phase.md)', () => {
    test('mentions --markdown flag in argument-hint or description', () => {
      const content = fs.readFileSync(commandPath, 'utf8');
      assert.ok(
        content.includes('--markdown'),
        'commands/gsd/discuss-phase.md should document the --markdown flag'
      );
    });

    test('references the file workflow', () => {
      const content = fs.readFileSync(commandPath, 'utf8');
      assert.ok(
        content.includes('discuss-phase-file'),
        'command file should reference discuss-phase-file workflow'
      );
    });
  });

  describe('main workflow file (discuss-phase.md)', () => {
    test('has markdown_mode section or references discuss-phase-file.md', () => {
      const content = fs.readFileSync(workflowPath, 'utf8');
      const hasSection = content.includes('markdown_mode') || content.includes('markdown mode');
      const hasReference = content.includes('discuss-phase-file');
      assert.ok(
        hasSection || hasReference,
        'discuss-phase.md should have markdown_mode section or reference discuss-phase-file.md'
      );
    });

    test('describes --markdown flag routing', () => {
      const content = fs.readFileSync(workflowPath, 'utf8');
      assert.ok(
        content.includes('--markdown'),
        'discuss-phase.md should describe --markdown flag handling'
      );
    });
  });

  describe('orchestrator workflow file (discuss-phase-file.md)', () => {
    test('file exists', () => {
      assert.ok(
        fs.existsSync(fileWorkflowPath),
        'get-shit-done/workflows/discuss-phase-file.md should exist'
      );
    });

    test('describes the generate step', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(
        content.includes('generate') || content.includes('Generate'),
        'file workflow should describe generating questions'
      );
    });

    test('describes the wait/notify step', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      const hasWait = content.includes('wait') || content.includes('Wait');
      const hasNotify = content.includes('notify') || content.includes('Notify') || content.includes('notif');
      assert.ok(
        hasWait || hasNotify,
        'file workflow should describe the wait/notify step after generating the tree'
      );
    });

    test('describes the refresh step', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(
        content.includes('refresh') || content.includes('Refresh'),
        'file workflow should describe the refresh step for processing answers'
      );
    });

    test('describes the finalize step', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(
        content.includes('finalize') || content.includes('Finalize'),
        'file workflow should describe the finalize step for generating CONTEXT.md'
      );
    });

    test('QUESTIONS.json structure has required fields', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(content.includes('QUESTIONS.json'), 'should mention QUESTIONS.json file');
      assert.ok(content.includes('"phase"'), 'JSON structure should include phase field');
      assert.ok(content.includes('"stats"'), 'JSON structure should include stats field');
      assert.ok(content.includes('"nodes"'), 'JSON structure should use a nodes map (DAG)');
      assert.ok(
        content.includes('"id"') && content.includes('"title"'),
        'JSON structure should include question id and title fields'
      );
      assert.ok(
        content.includes('"options"'),
        'JSON structure should include options array'
      );
      assert.ok(
        content.includes('"answer"'),
        'JSON structure should include answer field'
      );
      assert.ok(
        content.includes('"status"'),
        'JSON structure should include status field'
      );
      assert.ok(
        content.includes('"children"'),
        'JSON structure should include children field (recursive tree)'
      );
      assert.ok(
        content.includes('"dependencies"'),
        'JSON structure should include dependencies field (DAG edges)'
      );
      assert.ok(
        content.includes('"parent"'),
        'JSON structure should include parent field'
      );
    });

    test('describes Markdown tree generation', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(
        content.includes('INDEX.md'),
        'file workflow should describe the INDEX.md dashboard file'
      );
      assert.ok(
        /one .md per question|per-question markdown|one markdown file per question|\.md per question/i.test(content),
        'file workflow should describe one .md file per question'
      );
      assert.ok(
        content.includes('markdown') || content.includes('Markdown'),
        'file workflow should mention markdown output'
      );
    });

    test('describes checkbox-based finalization', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(
        /\[ \]|\[x\]|checkbox|check a box|cocher/i.test(content),
        'file workflow should describe checkbox-based answer finalization'
      );
    });

    test('describes logical-independence dependency rule', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(
        /logical independence|logique.*ind[ée]pend|independence rule|invalidat|empty.*option|vide.*option/i.test(content),
        'file workflow should describe the logical-independence rule that determines sibling dependencies'
      );
    });

    test('describes split mechanism (auto and on-demand)', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(
        content.toLowerCase().includes('split'),
        'file workflow should describe the split mechanism'
      );
      assert.ok(
        /auto.*split|auto-split|automatic.*split|auto split/i.test(content),
        'file workflow should describe auto-split for complex questions'
      );
    });

    test('describes hiding split parents in INDEX.md', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(
        /hide|hidden|mask|cach[ée]|only.*leaf|feuilles? actives/i.test(content),
        'file workflow should describe that split parents are hidden / only leaves shown in INDEX.md'
      );
    });

    test('file naming uses padded phase number', () => {
      const content = fs.readFileSync(fileWorkflowPath, 'utf8');
      assert.ok(
        content.includes('padded_phase') || content.includes('{padded_phase}'),
        'file workflow should describe file naming with padded phase number'
      );
    });
  });

  describe('recursive question workflow file (discuss-question-markdown.md)', () => {
    test('file exists', () => {
      assert.ok(
        fs.existsSync(questionWorkflowPath),
        'get-shit-done/workflows/discuss-question-markdown.md should exist'
      );
    });

    test('is recursive (can spawn children of same workflow)', () => {
      const content = fs.readFileSync(questionWorkflowPath, 'utf8');
      assert.ok(
        /recurs|children|child.*question|self-invoke|same workflow/i.test(content),
        'question workflow should describe its recursive nature (children invoke the same workflow)'
      );
    });

    test('describes reading, reply, split, lock, and propagate actions', () => {
      const content = fs.readFileSync(questionWorkflowPath, 'utf8');
      assert.ok(/read|Read/.test(content), 'should describe reading the question file');
      assert.ok(/reply|response|respond|répond/i.test(content), 'should describe replying to user comments');
      assert.ok(/split|Split/.test(content), 'should describe handling split requests');
      assert.ok(/lock|finalize|answered|check/i.test(content), 'should describe locking an answer');
      assert.ok(/propagate|synth|parent.*update|bubble/i.test(content), 'should describe propagating child answers back to parent');
    });

    test('describes conversation thread in markdown', () => {
      const content = fs.readFileSync(questionWorkflowPath, 'utf8');
      assert.ok(
        /> User|> Claude|conversation|discussion thread|dialogue/i.test(content),
        'question workflow should describe the conversation thread format'
      );
    });
  });
});
