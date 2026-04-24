'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  adaptRequestedSchemaToSpec,
  POC_DEFAULT_SPEC,
  __test__,
} = require('../plugins/gsd-bridge/hooks/lib/spec-adapter.cjs');

test('null requested_schema returns the POC default spec (deep clone, not the frozen original)', () => {
  const spec = adaptRequestedSchemaToSpec(null, 'irrelevant');
  assert.equal(spec.root, 'page');
  assert.equal(spec.elements.banner.type, 'StageBanner');
  assert.equal(spec.elements.card1.type, 'GrayAreaCard');
  // Mutating the returned spec must not affect POC_DEFAULT_SPEC (clone)
  spec.elements.card1.props.title = 'mutated';
  assert.equal(POC_DEFAULT_SPEC.elements.card1.props.title, 'Gray Area 1');
});

test('undefined requested_schema also returns the POC default', () => {
  const spec = adaptRequestedSchemaToSpec(undefined, '');
  assert.equal(spec.elements.card4.type, 'GrayAreaCard');
});

test('object schema with one string property maps to Input + Submit + Cancel', () => {
  const spec = adaptRequestedSchemaToSpec(
    { type: 'object', properties: { name: { type: 'string', title: 'Name' } }, required: ['name'] },
    'Enter your name',
  );
  assert.equal(spec.root, 'page');
  assert.equal(spec.elements.page.type, 'Card');
  assert.equal(spec.elements.page.props.title, 'Enter your name');
  assert.deepEqual(spec.elements.fields.children, ['field_name']);
  assert.equal(spec.elements.field_name.type, 'Input');
  assert.equal(spec.elements.field_name.props.inputType, 'text');
  assert.equal(spec.elements.field_name.props.label, 'Name');
  assert.equal(spec.elements.submitBtn.props.action, 'submit');
  assert.equal(spec.elements.cancelBtn.props.action, 'cancel');
});

test('number type maps to Input with inputType=number', () => {
  const spec = adaptRequestedSchemaToSpec(
    { type: 'object', properties: { age: { type: 'number', title: 'Age' } } },
    'msg',
  );
  assert.equal(spec.elements.field_age.type, 'Input');
  assert.equal(spec.elements.field_age.props.inputType, 'number');
});

test('boolean type maps to Checkbox', () => {
  const spec = adaptRequestedSchemaToSpec(
    { type: 'object', properties: { active: { type: 'boolean', title: 'Active' } } },
    'msg',
  );
  assert.equal(spec.elements.field_active.type, 'Checkbox');
  assert.equal(spec.elements.field_active.props.label, 'Active');
});

test('string with enum maps to Select with options', () => {
  const spec = adaptRequestedSchemaToSpec(
    { type: 'object', properties: { color: { type: 'string', title: 'Color', enum: ['red', 'blue'] } } },
    'msg',
  );
  assert.equal(spec.elements.field_color.type, 'Select');
  assert.deepEqual(spec.elements.field_color.props.options, [
    { value: 'red', label: 'red' },
    { value: 'blue', label: 'blue' },
  ]);
});

test('legacy enum type alias also maps to Select', () => {
  const spec = adaptRequestedSchemaToSpec(
    { type: 'object', properties: { color: { type: 'enum', title: 'Color', enum: ['x', 'y'] } } },
    'msg',
  );
  assert.equal(spec.elements.field_color.type, 'Select');
});

test('unknown field type renders a read-only Text label, not crash', () => {
  const spec = adaptRequestedSchemaToSpec(
    { type: 'object', properties: { weird: { type: 'tuple', title: 'W' } } },
    'msg',
  );
  assert.equal(spec.elements.field_weird.type, 'Text');
});

test('non-object schema falls back to Card + Text(message) + Cancel', () => {
  const spec = adaptRequestedSchemaToSpec('garbage', 'fallback message');
  assert.equal(spec.root, 'page');
  assert.equal(spec.elements.page.type, 'Card');
  assert.equal(spec.elements.msg.props.children, 'fallback message');
  assert.equal(spec.elements.cancel.props.action, 'cancel');
});

test('object schema with empty properties also falls back', () => {
  const spec = adaptRequestedSchemaToSpec({ type: 'object' }, 'no props');
  assert.equal(spec.elements.page.type, 'Card');
  assert.equal(spec.elements.cancel.props.action, 'cancel');
});

test('object schema with non-string property keys are filtered (defensive)', () => {
  // Object.keys returns strings always but a property name could be a numeric string ("0")
  const spec = adaptRequestedSchemaToSpec(
    { type: 'object', properties: { '0': { type: 'string', title: 'Zero' } } },
    'msg',
  );
  // numeric-string key is allowed (length 1, alphanumeric), id becomes field_0
  assert.ok(spec.elements.field_0);
});

test('property key with shell-special chars sanitized in id (no dot/slash)', () => {
  const spec = adaptRequestedSchemaToSpec(
    { type: 'object', properties: { 'foo.bar': { type: 'string', title: 'FB' } } },
    'msg',
  );
  assert.ok(spec.elements.field_foo_bar);
  assert.ok(!spec.elements['field_foo.bar']);
});

test('does not throw on hostile input (5 fuzz cases)', () => {
  const cases = [
    { type: 'object', properties: null },
    { type: 'object', properties: { __proto__: { type: 'string' } } }, // proto pollution attempt
    { type: 'object', properties: { x: null } },
    Number.NaN,
    Symbol.iterator,
  ];
  for (const c of cases) {
    assert.doesNotThrow(() => adaptRequestedSchemaToSpec(c, 'fuzz'));
  }
});

test('sanitizeId helper truncates at 64 chars and replaces non-alphanum', () => {
  assert.equal(__test__.sanitizeId('hello.world-x!'), 'hello_world_x_');
  assert.equal(__test__.sanitizeId('a'.repeat(100)).length, 64);
});

test('returned spec is always a plain object with root + elements', () => {
  const inputs = [null, { type: 'object', properties: { x: { type: 'string', title: 'X' } } }, 'garbage'];
  for (const input of inputs) {
    const spec = adaptRequestedSchemaToSpec(input, 'm');
    assert.ok(typeof spec === 'object' && spec !== null);
    assert.ok(typeof spec.root === 'string');
    assert.ok(typeof spec.elements === 'object' && spec.elements !== null);
  }
});
