// POC descriptor — shadcn-only (Plan 04-05 v2 refactor, 2026-04-24).
//
// v1 (rejected) used GSD custom components (GrayAreaCard / SnippetToggle /
// StatusPill / StageBanner) rendered through json-render's <Renderer>, which:
//   - didn't look like shadcn (custom terminal-brand palette)
//   - didn't support real click-to-select interactivity
//
// v2 uses ONLY stock shadcn primitives (Card / RadioGroup / Checkbox /
// Button / Separator / Label) rendered directly in PocScreen with genuine
// React state. This module is now a **pure descriptor** of the POC content
// (titles, options, button labels) consumed by both PocScreen and
// poc.test.tsx so the two stay structurally synchronised.
//
// Non-goal: this is NOT a json-render spec. Host-injected specs continue to
// flow through `<Renderer>` via `app.tsx` (unchanged). The POC simply
// renders when no host is present (dev fallback).

export interface PocOption {
  readonly value: string;
  readonly label: string;
  readonly notes: string | null;
}

export interface PocCard {
  readonly id: 'card1' | 'card2' | 'card3' | 'card4';
  readonly title: string;
  readonly description: string | null;
  readonly options: readonly PocOption[];
  /** Option `value` pre-selected when the POC first mounts (RadioGroup defaultValue). */
  readonly defaultValue: string;
}

export interface PocDescriptor {
  readonly banner: {
    readonly stage: string;
    readonly tagline: string;
  };
  readonly cards: readonly PocCard[];
  readonly autoFlag: {
    readonly label: string;
    readonly description: string;
    readonly defaultChecked: boolean;
  };
  readonly actions: {
    readonly submit: { readonly label: string; readonly variant: 'default' };
    readonly reset: { readonly label: string; readonly variant: 'outline' };
  };
}

export const POC_DESCRIPTOR: PocDescriptor = Object.freeze({
  // `as const` narrows the `id` literals to their exact union values for the
  // PocCard discriminant. The outer `as PocDescriptor` cast validates the
  // overall shape.
  banner: {
    stage: 'Phase 4 POC — shadcn interactive',
    tagline: 'Pick one option per card, then submit. Uses ONLY stock shadcn components.',
  },
  cards: [
    {
      id: 'card1',
      title: 'Gray Area 1 — stack',
      description: 'Which UI stack ships the webview?',
      defaultValue: 'json-render-shadcn',
      options: [
        {
          value: 'json-render-shadcn',
          label: 'json-render + shadcn',
          notes: 'locked Pivot #2',
        },
        { value: 'vanilla-cjs', label: 'vanilla CJS', notes: 'archived' },
      ],
    },
    {
      id: 'card2',
      title: 'Gray Area 2 — catalog scope',
      description: 'How many components does the catalog expose?',
      defaultValue: 'shadcn-plus-gsd',
      options: [
        { value: 'shadcn-plus-gsd', label: '36 shadcn + 6 GSD custom', notes: null },
        { value: 'shadcn-only', label: 'shadcn only', notes: null },
      ],
    },
    {
      id: 'card3',
      title: 'Gray Area 3 — build pipeline',
      description: 'Which bundler powers the single-file build?',
      defaultValue: 'vite-singlefile',
      options: [
        {
          value: 'vite-singlefile',
          label: 'Vite + vite-plugin-singlefile',
          notes: 'D-10 lock',
        },
        { value: 'esbuild-custom', label: 'esbuild custom', notes: null },
      ],
    },
    {
      id: 'card4',
      title: 'Gray Area 4 — adapter location',
      description: 'Where does requested_schema → spec adaptation live?',
      defaultValue: 'in-hook',
      options: [
        {
          value: 'in-hook',
          label: 'In the hook (gsd-bridge-elicitation.cjs)',
          notes: 'preserves Phase 1 lock',
        },
        { value: 'in-mcp-server', label: 'In the MCP server', notes: null },
      ],
    },
  ],
  autoFlag: {
    label: 'Advance automatically after submit (--auto)',
    description:
      'When enabled, the host resumes the workflow without waiting for a manual Continue click.',
    defaultChecked: false,
  },
  actions: {
    submit: { label: 'Submit', variant: 'default' },
    reset: { label: 'Reset', variant: 'outline' },
  },
} as const) as unknown as PocDescriptor;

/**
 * Default selection map derived from POC_DESCRIPTOR — used by PocScreen as
 * the initial state and by tests that assert the pristine payload shape.
 */
export function pocInitialSelections(): Record<PocCard['id'], string> {
  const result: Record<string, string> = {};
  for (const card of POC_DESCRIPTOR.cards) {
    result[card.id] = card.defaultValue;
  }
  return result as Record<PocCard['id'], string>;
}
