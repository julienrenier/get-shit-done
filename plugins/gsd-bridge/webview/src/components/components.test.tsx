import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { catalog } from '../catalog';
import { registry } from '../registry';
import { GrayAreaCard } from './GrayAreaCard';
import { SnippetToggle } from './SnippetToggle';
import { ASCIIProgress } from './ASCIIProgress';
import { StageBanner } from './StageBanner';
import { StatusPill } from './StatusPill';
import { CommandBlock } from './CommandBlock';

// =====================================================================
// Catalog declarations + Zod safeParse positive/negative
// =====================================================================

describe('catalog', () => {
  // The defineCatalog return shape exposes its registry under
  // `catalog.data.components` (verified via runtime inspection — the public
  // `componentNames` array mirrors the same set). Tests reach into `data`
  // explicitly so a future API rename surfaces here as a typed failure.
  const components = (catalog as unknown as {
    data: { components: Record<string, { props: { safeParse: (v: unknown) => { success: boolean } } }> };
  }).data.components;

  it('exposes the 6 GSD custom component definitions', () => {
    for (const expected of [
      'GrayAreaCard',
      'SnippetToggle',
      'ASCIIProgress',
      'StageBanner',
      'StatusPill',
      'CommandBlock',
    ]) {
      expect(catalog.componentNames).toContain(expected);
      expect(components[expected]).toBeTruthy();
    }
  });

  it('exposes at least 36 stock shadcn components alongside the 6 GSD ones', () => {
    expect(catalog.componentNames.length).toBeGreaterThanOrEqual(42);
    expect(Object.keys(components).length).toBeGreaterThanOrEqual(42);
  });

  it('GrayAreaCard schema accepts a valid payload', () => {
    const def = components.GrayAreaCard;
    expect(def).toBeTruthy();
    const result = def.props.safeParse({
      title: 'Gray Area 1',
      options: [{ label: 'Option A', selected: true, notes: null }],
      follow_up: null,
    });
    expect(result.success).toBe(true);
  });

  it('GrayAreaCard schema rejects a missing title', () => {
    const def = components.GrayAreaCard;
    const result = def.props.safeParse({ options: [], follow_up: null });
    expect(result.success).toBe(false);
  });

  it('StatusPill schema rejects an unknown status', () => {
    const def = components.StatusPill;
    const result = def.props.safeParse({ status: 'bogus', label: null });
    expect(result.success).toBe(false);
  });
});

// =====================================================================
// Registry construction (smoke)
// =====================================================================

describe('registry', () => {
  it('builds without throwing and is exported as a defined object', () => {
    expect(registry).toBeTruthy();
    // The internal registry shape is owned by json-render; this smoke just
    // proves defineRegistry accepted our catalog + impls without an unhandled
    // error. The Button override + 6 GSD components are wired in registry.ts.
  });
});

// =====================================================================
// GrayAreaCard
// =====================================================================

describe('GrayAreaCard', () => {
  it('renders title, option labels, and follow-up text', () => {
    render(
      <GrayAreaCard
        props={{
          title: 'Gray Area X',
          options: [
            { label: 'Option A', selected: true, notes: 'note A' },
            { label: 'Option B', selected: false, notes: null },
          ],
          follow_up: 'Decide before Friday.',
        }}
      />,
    );
    expect(screen.getByText('Gray Area X')).toBeTruthy();
    expect(screen.getByText('Option A')).toBeTruthy();
    expect(screen.getByText('note A')).toBeTruthy();
    expect(screen.getByText('Option B')).toBeTruthy();
    expect(screen.getByText('Decide before Friday.')).toBeTruthy();
  });

  it('marks the selected option visually distinct via data-selected', () => {
    const { container } = render(
      <GrayAreaCard
        props={{
          title: 'Selection test',
          options: [
            { label: 'A', selected: true, notes: null },
            { label: 'B', selected: false, notes: null },
          ],
          follow_up: null,
        }}
      />,
    );
    const selected = container.querySelector('[data-selected="true"]');
    const unselected = container.querySelector('[data-selected="false"]');
    expect(selected?.textContent).toContain('A');
    expect(unselected?.textContent).toContain('B');
  });

  it('renders an empty-state message when no options provided', () => {
    render(<GrayAreaCard props={{ title: 'Empty', options: [], follow_up: null }} />);
    expect(screen.getByText(/No options defined\./i)).toBeTruthy();
  });
});

// =====================================================================
// SnippetToggle
// =====================================================================

describe('SnippetToggle', () => {
  it('hides code when collapsible=true and reveals on expand', () => {
    render(<SnippetToggle props={{ language: 'json', code: '{"k":1}', collapsible: true }} />);
    expect(screen.queryByText('{"k":1}')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));
    expect(screen.getByText('{"k":1}')).toBeTruthy();
  });

  it('shows code immediately when collapsible=false', () => {
    render(<SnippetToggle props={{ language: 'ts', code: 'const x = 1;', collapsible: false }} />);
    expect(screen.getByText('const x = 1;')).toBeTruthy();
  });
});

// =====================================================================
// ASCIIProgress
// =====================================================================

describe('ASCIIProgress', () => {
  it('renders 5 filled and 5 empty blocks at 50%', () => {
    const { container } = render(
      <ASCIIProgress props={{ current: 50, total: 100, label: null }} />,
    );
    expect(container.textContent).toContain('█████░░░░░');
    expect(container.textContent).toContain('50%');
  });

  it('clamps to 0 when current=0 and renders the label prefix', () => {
    const { container } = render(
      <ASCIIProgress props={{ current: 0, total: 100, label: 'p' }} />,
    );
    expect(container.textContent).toContain('░░░░░░░░░░');
    expect(container.textContent).toContain('0%');
    expect(container.textContent).toContain('p:');
  });

  it('saturates at 100% when current >= total', () => {
    const { container } = render(
      <ASCIIProgress props={{ current: 100, total: 100, label: null }} />,
    );
    expect(container.textContent).toContain('██████████');
    expect(container.textContent).toContain('100%');
  });
});

// =====================================================================
// StageBanner
// =====================================================================

describe('StageBanner', () => {
  it('renders rule + headline + rule', () => {
    const { container } = render(
      <StageBanner props={{ stage: 'QUESTIONING', icon: null }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('━'.repeat(62));
    expect(text).toContain('GSD ► QUESTIONING');
  });

  it('prefixes the icon when provided', () => {
    const { container } = render(
      <StageBanner props={{ stage: 'PHASE 4 COMPLETE', icon: '⚡' }} />,
    );
    expect(container.textContent).toContain('⚡ GSD ► PHASE 4 COMPLETE');
  });
});

// =====================================================================
// StatusPill
// =====================================================================

describe('StatusPill', () => {
  it.each([
    ['complete', '✓'],
    ['failed', '✗'],
    ['pending', '○'],
    ['in-progress', '◆'],
  ] as const)('renders the %s symbol %s', (status, symbol) => {
    const { container } = render(<StatusPill props={{ status, label: null }} />);
    expect(container.textContent).toContain(symbol);
  });

  it('uses the default label when label is null', () => {
    render(<StatusPill props={{ status: 'complete', label: null }} />);
    expect(screen.getByText('Complete')).toBeTruthy();
  });

  it('uses the custom label when provided', () => {
    render(<StatusPill props={{ status: 'failed', label: 'oh no' }} />);
    expect(screen.getByText('oh no')).toBeTruthy();
  });
});

// =====================================================================
// CommandBlock
// =====================================================================

describe('CommandBlock', () => {
  it('renders the command text', () => {
    render(
      <CommandBlock props={{ command: '/gsd:plan-phase 4', copyable: false, language: null }} />,
    );
    expect(screen.getByText('/gsd:plan-phase 4')).toBeTruthy();
  });

  it('shows the copy button only when copyable=true', () => {
    const { rerender } = render(
      <CommandBlock props={{ command: '/gsd:x', copyable: false, language: null }} />,
    );
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();

    rerender(<CommandBlock props={{ command: '/gsd:x', copyable: true, language: null }} />);
    expect(screen.getByRole('button', { name: /copy/i })).toBeTruthy();
  });
});
