// POC spec per RENDERER-CONTRACT.md §1 + §8 (Plan 04-05).
//
// Encodes the locked POC layout: 4 GrayAreaCards in a horizontal grid +
// 1 SnippetToggle + StatusPill + Submit/Reset Buttons. Buttons are part of
// the SPEC (no parallel HTML buttons in PocScreen) — they route via the
// GsdButtonOverride registered in registry.ts (Plan 04-03).
//
// `Object.freeze` makes mutation in tests obvious (mitigates T-04-05-01).

/**
 * Local structural type mirroring the json-render flat spec shape
 * (RENDERER-CONTRACT.md §1). `@json-render/core` does not currently export
 * a public name for this; declaring it locally keeps poc-spec.ts standalone
 * and lets the Renderer accept it via its own structural typing.
 */
export interface JsonRenderSpec {
  root: string;
  elements: Record<string, { type: string; props: Record<string, unknown>; children?: string[] }>;
}

export const POC_SPEC = Object.freeze({
  root: 'page',
  elements: {
    page: {
      type: 'Stack',
      props: { direction: 'vertical', gap: 6 },
      children: ['banner', 'grid', 'snippet', 'status', 'actions'],
    },
    banner: {
      type: 'StageBanner',
      props: { stage: 'PHASE 4 POC', icon: '⚡' },
    },
    grid: {
      type: 'Stack',
      props: { direction: 'horizontal', gap: 4 },
      children: ['card1', 'card2', 'card3', 'card4'],
    },
    card1: {
      type: 'GrayAreaCard',
      props: {
        title: 'Gray Area 1: stack',
        options: [
          { label: 'json-render + shadcn', selected: true, notes: 'locked Pivot #2' },
          { label: 'vanilla CJS', selected: false, notes: 'archived' },
        ],
        follow_up: null,
      },
    },
    card2: {
      type: 'GrayAreaCard',
      props: {
        title: 'Gray Area 2: catalog scope',
        options: [
          { label: '36 shadcn + 6 GSD custom', selected: true, notes: null },
          { label: 'shadcn only', selected: false, notes: null },
        ],
        follow_up: 'Final 6 GSD components selected in Plan 04-01.',
      },
    },
    card3: {
      type: 'GrayAreaCard',
      props: {
        title: 'Gray Area 3: build pipeline',
        options: [
          { label: 'Vite + vite-plugin-singlefile', selected: true, notes: 'D-10 lock' },
          { label: 'esbuild custom', selected: false, notes: null },
        ],
        follow_up: null,
      },
    },
    card4: {
      type: 'GrayAreaCard',
      props: {
        title: 'Gray Area 4: adapter location',
        options: [
          { label: 'in hook (gsd-bridge-elicitation.cjs)', selected: true, notes: 'preserves Phase 1 lock' },
          { label: 'in MCP server', selected: false, notes: null },
        ],
        follow_up: null,
      },
    },
    snippet: {
      type: 'SnippetToggle',
      props: {
        language: 'json',
        code: JSON.stringify(
          {
            kind: 'render-spec',
            session_id: 'poc',
            mode: 'webview',
            rendered_via: 'webview',
          },
          null,
          2,
        ),
        collapsible: true,
      },
    },
    status: {
      type: 'StatusPill',
      props: { status: 'pending', label: 'awaiting submit' },
    },
    actions: {
      type: 'Stack',
      props: { direction: 'horizontal', gap: 2 },
      children: ['submitBtn', 'resetBtn'],
    },
    submitBtn: {
      type: 'Button',
      props: { label: 'submit', variant: 'primary', action: 'submit' },
    },
    resetBtn: {
      type: 'Button',
      props: { label: 'reset', variant: 'secondary', action: 'reset' },
    },
  },
} as const) as unknown as JsonRenderSpec;

/**
 * Helper used by both the PocScreen payload provider and the round-trip tests.
 * Extracts the currently-selected option label per gray area card.
 */
export function pocDefaultSelections(): Array<{ card: string; selected: string }> {
  const elements = POC_SPEC.elements as Record<
    string,
    { type: string; props: Record<string, unknown>; children?: string[] }
  >;
  return ['card1', 'card2', 'card3', 'card4'].map((id) => {
    const props = elements[id].props as {
      title: string;
      options: Array<{ label: string; selected: boolean }>;
    };
    const sel = props.options.find((o) => o.selected);
    return { card: props.title, selected: sel ? sel.label : '(none)' };
  });
}
