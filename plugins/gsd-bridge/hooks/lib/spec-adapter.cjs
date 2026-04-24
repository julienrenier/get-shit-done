'use strict';

// Pure function mapping MCP `requested_schema` → json-render spec.
// Spec format documented in plugins/gsd-bridge/webview/RENDERER-CONTRACT.md §1+§4.
//
// CONSTRAINTS (apply to this file):
// - Hook lib helpers stay dep-free (Node built-ins only — and this module uses no external loads).
// - Tests use node:test (see tests/gsd-bridge-spec-adapter.test.cjs).
// - Pure function — no I/O, no globals, no time, deterministic.
// - Never throws on bad input — falls back to a degraded Card+Cancel spec.

const POC_DEFAULT_SPEC = Object.freeze({
  root: 'page',
  elements: {
    page:      { type: 'Stack',        props: { direction: 'vertical', gap: 6 },     children: ['banner', 'grid', 'actions'] },
    banner:    { type: 'StageBanner',  props: { stage: 'WEBVIEW POC', icon: '⚡' } },
    grid:      { type: 'Stack',        props: { direction: 'horizontal', gap: 4 },   children: ['card1', 'card2', 'card3', 'card4'] },
    card1:     { type: 'GrayAreaCard', props: { title: 'Gray Area 1', options: [], follow_up: null } },
    card2:     { type: 'GrayAreaCard', props: { title: 'Gray Area 2', options: [], follow_up: null } },
    card3:     { type: 'GrayAreaCard', props: { title: 'Gray Area 3', options: [], follow_up: null } },
    card4:     { type: 'GrayAreaCard', props: { title: 'Gray Area 4', options: [], follow_up: null } },
    actions:   { type: 'Stack',        props: { direction: 'horizontal', gap: 2 },   children: ['submitBtn'] },
    submitBtn: { type: 'Button',       props: { label: 'submit', variant: 'primary', action: 'submit' } },
  },
});

function fallbackSpec(message) {
  const safeMessage = typeof message === 'string' && message.length > 0 && message.length <= 1000
    ? message
    : 'No spec available.';
  return {
    root: 'page',
    elements: {
      page:    { type: 'Card',   props: { title: 'Elicitation' },                     children: ['msg', 'cancel'] },
      msg:     { type: 'Text',   props: { children: safeMessage } },
      cancel:  { type: 'Button', props: { label: 'cancel', variant: 'secondary', action: 'cancel' } },
    },
  };
}

function mapField(id, field) {
  const title = (field && typeof field.title === 'string') ? field.title : id;
  const type = field && field.type;
  const enumValues = Array.isArray(field && field.enum)
    ? field.enum.filter((v) => typeof v === 'string').slice(0, 64)
    : null;

  if (type === 'string' && enumValues && enumValues.length > 0) {
    return {
      type: 'Select',
      props: { id, label: title, options: enumValues.map((v) => ({ value: v, label: v })) },
    };
  }
  if (type === 'enum' && enumValues && enumValues.length > 0) {
    // Legacy 'enum' alias from plugins/gsd-bridge/src/schemas.ts
    return {
      type: 'Select',
      props: { id, label: title, options: enumValues.map((v) => ({ value: v, label: v })) },
    };
  }
  if (type === 'string') {
    return { type: 'Input', props: { id, label: title, inputType: 'text' } };
  }
  if (type === 'number') {
    return { type: 'Input', props: { id, label: title, inputType: 'number' } };
  }
  if (type === 'boolean') {
    return { type: 'Checkbox', props: { id, label: title } };
  }
  // Unknown field type -> render a read-only Text label so the form is not silently dropped
  return { type: 'Text', props: { children: '(unsupported field: ' + id + ')' } };
}

function sanitizeId(key) {
  // Keep alphanumeric + _; replace others with _ (predictable element ids).
  return String(key).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
}

function clone(value) {
  // structuredClone is stable in Node >=17 (we run >=22).
  return structuredClone(value);
}

function adaptRequestedSchemaToSpec(requested_schema, message) {
  try {
    if (requested_schema === null || requested_schema === undefined) {
      return clone(POC_DEFAULT_SPEC);
    }
    if (typeof requested_schema !== 'object' || Array.isArray(requested_schema)) {
      return fallbackSpec(message);
    }
    if (requested_schema.type !== 'object') {
      return fallbackSpec(message);
    }
    const properties = requested_schema.properties;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
      return fallbackSpec(message);
    }
    const propertyKeys = Object.keys(properties).filter(
      (k) => typeof k === 'string' && k.length > 0 && k.length <= 64,
    );
    if (propertyKeys.length === 0) {
      return fallbackSpec(message);
    }

    const elements = {};
    const fieldChildren = [];
    for (const key of propertyKeys) {
      const field = properties[key];
      const id = 'field_' + sanitizeId(key);
      elements[id] = mapField(key, field);
      fieldChildren.push(id);
    }

    elements.fields = {
      type: 'Stack',
      props: { direction: 'vertical', gap: 4 },
      children: fieldChildren,
    };
    elements.actions = {
      type: 'Stack',
      props: { direction: 'horizontal', gap: 2 },
      children: ['submitBtn', 'cancelBtn'],
    };
    elements.submitBtn = {
      type: 'Button',
      props: { label: 'submit', variant: 'primary', action: 'submit' },
    };
    elements.cancelBtn = {
      type: 'Button',
      props: { label: 'cancel', variant: 'secondary', action: 'cancel' },
    };
    elements.page = {
      type: 'Card',
      props: { title: typeof message === 'string' && message ? message : 'Form' },
      children: ['fields', 'actions'],
    };

    return { root: 'page', elements };
  } catch {
    return fallbackSpec(message);
  }
}

module.exports = {
  adaptRequestedSchemaToSpec,
  POC_DEFAULT_SPEC,
  // exported for tests only
  __test__: { mapField, fallbackSpec, sanitizeId },
};
