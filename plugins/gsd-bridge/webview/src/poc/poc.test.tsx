import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { POC_SPEC, pocDefaultSelections } from './poc-spec';
import { PocScreen } from './PocScreen';

// =====================================================================
// POC_SPEC structure (Plan 04-05 Task 1 — spec-as-source-of-truth gates)
// =====================================================================

describe('POC_SPEC structure', () => {
  it('has root=page with the 5 expected children in order', () => {
    expect(POC_SPEC.root).toBe('page');
    const elements = POC_SPEC.elements as Record<string, { children?: string[] }>;
    expect(elements.page.children).toEqual(['banner', 'grid', 'snippet', 'status', 'actions']);
  });

  it('grid contains exactly 4 GrayAreaCards with distinct titles', () => {
    const elements = POC_SPEC.elements as Record<
      string,
      { type: string; props: { title?: string }; children?: string[] }
    >;
    expect(elements.grid.children).toHaveLength(4);
    const titles = new Set<string>();
    for (const id of ['card1', 'card2', 'card3', 'card4']) {
      expect(elements[id].type).toBe('GrayAreaCard');
      titles.add(String(elements[id].props.title));
    }
    expect(titles.size).toBe(4);
  });

  it('snippet is a collapsible json SnippetToggle', () => {
    const elements = POC_SPEC.elements as Record<
      string,
      { type: string; props: { language: string; collapsible: boolean } }
    >;
    expect(elements.snippet.type).toBe('SnippetToggle');
    expect(elements.snippet.props.language).toBe('json');
    expect(elements.snippet.props.collapsible).toBe(true);
  });

  it('status is a StatusPill in pending state', () => {
    const elements = POC_SPEC.elements as Record<
      string,
      { type: string; props: { status: string } }
    >;
    expect(elements.status.type).toBe('StatusPill');
    expect(elements.status.props.status).toBe('pending');
  });

  it('actions has submitBtn + resetBtn with action verbs (no other Buttons)', () => {
    const elements = POC_SPEC.elements as Record<
      string,
      { type: string; props: { action?: string }; children?: string[] }
    >;
    expect(elements.actions.children).toEqual(['submitBtn', 'resetBtn']);
    expect(elements.submitBtn.type).toBe('Button');
    expect(elements.submitBtn.props.action).toBe('submit');
    expect(elements.resetBtn.type).toBe('Button');
    expect(elements.resetBtn.props.action).toBe('reset');
  });
});

// =====================================================================
// pocDefaultSelections helper
// =====================================================================

describe('pocDefaultSelections helper', () => {
  it('returns the selected option label for each of the 4 cards', () => {
    const sel = pocDefaultSelections();
    expect(sel).toHaveLength(4);
    expect(sel[0].selected).toContain('json-render');
    expect(sel[1].selected).toContain('shadcn');
    expect(sel[2].selected).toContain('Vite');
    expect(sel[3].selected).toContain('hook');
  });
});

// =====================================================================
// PocScreen — spec-driven round-trip via the Plan 04-03 Button override
// =====================================================================

describe('PocScreen — spec-driven round-trip via Button override', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      delete window.__gsdSubmit;
      delete window.__gsdReset;
      delete window.__gsdPayloadProvider;
      delete window.__gsdCancel;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the StageBanner and the 4 GrayAreaCards', () => {
    render(<PocScreen />);
    expect(screen.getByText(/PHASE 4 POC/i)).toBeTruthy();
    expect(screen.getByText(/Gray Area 1/i)).toBeTruthy();
    expect(screen.getByText(/Gray Area 2/i)).toBeTruthy();
    expect(screen.getByText(/Gray Area 3/i)).toBeTruthy();
    expect(screen.getByText(/Gray Area 4/i)).toBeTruthy();
  });

  it('registers __gsdPayloadProvider on mount and removes it on unmount', () => {
    const { unmount } = render(<PocScreen />);
    expect(typeof window.__gsdPayloadProvider).toBe('function');
    const payload = window.__gsdPayloadProvider!() as {
      action: string;
      selections: unknown[];
      snippet_expanded: boolean;
      ts: string;
    };
    expect(payload.action).toBe('submit');
    expect(payload.selections).toHaveLength(4);
    expect(typeof payload.ts).toBe('string');
    unmount();
    expect(window.__gsdPayloadProvider).toBeUndefined();
    expect(window.__gsdReset).toBeUndefined();
  });

  it('clicking the spec-rendered Submit button calls window.__gsdSubmit once with the assembled payload', () => {
    const submitSpy = vi.fn();
    window.__gsdSubmit = submitSpy;

    render(<PocScreen />);
    // The Button is rendered FROM THE SPEC (via the registry override). Its
    // accessible name is "submit" (label prop in POC_SPEC).
    const submitButton = screen.getByRole('button', { name: /^submit$/i });
    fireEvent.click(submitButton);

    expect(submitSpy).toHaveBeenCalledTimes(1);
    const payload = submitSpy.mock.calls[0][0] as {
      action: string;
      selections: Array<{ card: string; selected: string }>;
      snippet_expanded: boolean;
      ts: string;
    };
    expect(payload.action).toBe('submit');
    expect(payload.selections).toHaveLength(4);
    expect(payload.snippet_expanded).toBe(false);
    expect(typeof payload.ts).toBe('string');
    expect(payload.ts).toMatch(/^\d{4}-/);
  });

  it('falls back to console.log when window.__gsdSubmit is absent (dev mode)', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(<PocScreen />);
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    expect(consoleSpy).toHaveBeenCalled();
    // First arg should mention the action
    const firstArg = String(consoleSpy.mock.calls[0]?.[0] ?? '');
    expect(firstArg).toMatch(/submit/);
  });

  it('clicking the spec-rendered Reset clears the submitted marker via window.__gsdReset', () => {
    window.__gsdSubmit = () => {};
    render(<PocScreen />);

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    expect(screen.getByTestId('poc-submitted-marker')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));
    expect(screen.queryByTestId('poc-submitted-marker')).toBeNull();
  });

  it('PocScreen does NOT render parallel HTML buttons outside the spec', () => {
    render(<PocScreen />);
    const buttons = screen.getAllByRole('button');
    // Exactly one Submit and one Reset (the spec-rendered ones). The
    // SnippetToggle's own expand/collapse button is unrelated.
    const submitButtons = buttons.filter((b) => /^submit$/i.test(b.textContent || ''));
    const resetButtons = buttons.filter((b) => /^reset$/i.test(b.textContent || ''));
    expect(submitButtons).toHaveLength(1);
    expect(resetButtons).toHaveLength(1);
  });

  it('renders the SnippetToggle in collapsed state with an expand affordance', () => {
    render(<PocScreen />);
    // SnippetToggle starts collapsed (collapsible=true) — the JSON body is hidden
    expect(screen.queryByText(/"kind": "render-spec"/)).toBeNull();
    // The expand button is present
    expect(screen.getByRole('button', { name: /expand/i })).toBeTruthy();
  });

  it('renders the StatusPill with the awaiting-submit label', () => {
    render(<PocScreen />);
    expect(screen.getByText(/awaiting submit/i)).toBeTruthy();
  });

  it('payload provider includes snippet_expanded reflecting current screen state', () => {
    render(<PocScreen />);
    const initial = window.__gsdPayloadProvider!() as { snippet_expanded: boolean };
    expect(initial.snippet_expanded).toBe(false);
  });
});
