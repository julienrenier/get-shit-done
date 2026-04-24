import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { POC_DESCRIPTOR, pocInitialSelections } from './poc-spec';
import { PocScreen } from './PocScreen';

// =====================================================================
// Plan 04-05 v2 tests — shadcn-only interactive POC.
//
// Covers:
//   1. POC_DESCRIPTOR structure (4 cards, autoFlag, actions)
//   2. Initial render: banner, 4 Cards, 8 radio options, checkbox, buttons
//   3. Interactivity: clicking radios updates selections, checkbox toggles
//   4. Submit round-trip: window.__gsdSubmit receives real user selections
//   5. Reset: clears selections + submitted marker + invokes window.__gsdReset
//   6. shadcn-only assertion: no GSD custom components in the rendered tree
// =====================================================================

describe('POC_DESCRIPTOR structure', () => {
  it('exposes exactly 4 gray-area cards with stable ids', () => {
    expect(POC_DESCRIPTOR.cards).toHaveLength(4);
    expect(POC_DESCRIPTOR.cards.map((c) => c.id)).toEqual([
      'card1',
      'card2',
      'card3',
      'card4',
    ]);
  });

  it('every card has at least 2 options and a valid defaultValue', () => {
    for (const card of POC_DESCRIPTOR.cards) {
      expect(card.options.length).toBeGreaterThanOrEqual(2);
      const values = card.options.map((o) => o.value);
      expect(values).toContain(card.defaultValue);
    }
  });

  it('autoFlag defaults to unchecked', () => {
    expect(POC_DESCRIPTOR.autoFlag.defaultChecked).toBe(false);
  });

  it('submit/reset actions use shadcn Button variants (default + outline)', () => {
    expect(POC_DESCRIPTOR.actions.submit.variant).toBe('default');
    expect(POC_DESCRIPTOR.actions.reset.variant).toBe('outline');
  });

  it('pocInitialSelections seeds every card with its defaultValue', () => {
    const initial = pocInitialSelections();
    for (const card of POC_DESCRIPTOR.cards) {
      expect(initial[card.id]).toBe(card.defaultValue);
    }
  });
});

describe('PocScreen render', () => {
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

  it('renders the banner tagline', () => {
    render(<PocScreen />);
    expect(screen.getByText(POC_DESCRIPTOR.banner.stage)).toBeTruthy();
    expect(screen.getByText(POC_DESCRIPTOR.banner.tagline)).toBeTruthy();
  });

  it('renders 4 shadcn Cards with their card titles', () => {
    render(<PocScreen />);
    for (const card of POC_DESCRIPTOR.cards) {
      expect(screen.getByTestId(`poc-${card.id}`)).toBeTruthy();
      expect(screen.getByText(card.title)).toBeTruthy();
    }
  });

  it('each card has a RadioGroup with its 2 options selectable', () => {
    render(<PocScreen />);
    for (const card of POC_DESCRIPTOR.cards) {
      const group = screen.getByTestId(`poc-${card.id}-radiogroup`);
      expect(group).toBeTruthy();
      const radios = within(group).getAllByRole('radio');
      expect(radios).toHaveLength(card.options.length);
    }
  });

  it('renders the --auto checkbox', () => {
    render(<PocScreen />);
    const checkbox = screen.getByTestId('poc-auto-checkbox');
    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute('role')).toBe('checkbox');
  });

  it('renders shadcn Submit + Reset buttons', () => {
    render(<PocScreen />);
    expect(screen.getByTestId('poc-submit').textContent).toMatch(/submit/i);
    expect(screen.getByTestId('poc-reset').textContent).toMatch(/reset/i);
  });
});

describe('PocScreen — interactivity', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      delete window.__gsdSubmit;
      delete window.__gsdReset;
      delete window.__gsdPayloadProvider;
    }
  });

  it('clicking a non-default RadioGroupItem updates the card selection in the payload', () => {
    render(<PocScreen />);
    // Click Card 1 option "vanilla-cjs" (non-default)
    const altRadio = screen.getByTestId('poc-card1-option-vanilla-cjs');
    fireEvent.click(altRadio);

    // The payload provider should now reflect the new selection
    const payload = window.__gsdPayloadProvider!() as {
      selections: Record<string, string>;
      selections_flat: Array<{ card: string; value: string; label: string }>;
    };
    expect(payload.selections.card1).toBe('vanilla-cjs');
    const card1Entry = payload.selections_flat.find((e) => /Gray Area 1/.test(e.card));
    expect(card1Entry?.label).toContain('vanilla CJS');
  });

  it('toggling the auto checkbox flips payload.auto', () => {
    render(<PocScreen />);
    const initialPayload = window.__gsdPayloadProvider!() as { auto: boolean };
    expect(initialPayload.auto).toBe(false);

    fireEvent.click(screen.getByTestId('poc-auto-checkbox'));

    const togglePayload = window.__gsdPayloadProvider!() as { auto: boolean };
    expect(togglePayload.auto).toBe(true);
  });

  it('registers window.__gsdPayloadProvider on mount and removes it on unmount', () => {
    const { unmount } = render(<PocScreen />);
    expect(typeof window.__gsdPayloadProvider).toBe('function');
    unmount();
    expect(window.__gsdPayloadProvider).toBeUndefined();
  });
});

describe('PocScreen — submit round-trip', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      delete window.__gsdSubmit;
      delete window.__gsdReset;
      delete window.__gsdPayloadProvider;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicking Submit calls window.__gsdSubmit once with the real selections', () => {
    const submitSpy = vi.fn();
    window.__gsdSubmit = submitSpy;

    render(<PocScreen />);
    // Change card2 + card3 to non-default BEFORE submitting
    fireEvent.click(screen.getByTestId('poc-card2-option-shadcn-only'));
    fireEvent.click(screen.getByTestId('poc-card3-option-esbuild-custom'));
    fireEvent.click(screen.getByTestId('poc-auto-checkbox'));

    fireEvent.click(screen.getByTestId('poc-submit'));

    expect(submitSpy).toHaveBeenCalledTimes(1);
    const payload = submitSpy.mock.calls[0][0] as {
      action: string;
      selections: Record<string, string>;
      auto: boolean;
      ts: string;
    };
    expect(payload.action).toBe('submit');
    expect(payload.selections.card1).toBe('json-render-shadcn'); // unchanged default
    expect(payload.selections.card2).toBe('shadcn-only'); // changed
    expect(payload.selections.card3).toBe('esbuild-custom'); // changed
    expect(payload.selections.card4).toBe('in-hook'); // unchanged default
    expect(payload.auto).toBe(true);
    expect(payload.ts).toMatch(/^\d{4}-/);
  });

  it('clicking Submit without a host falls back to console.log (dev mode)', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(<PocScreen />);
    fireEvent.click(screen.getByTestId('poc-submit'));

    expect(consoleSpy).toHaveBeenCalled();
    const firstArg = String(consoleSpy.mock.calls[0]?.[0] ?? '');
    expect(firstArg).toMatch(/submit/);
  });

  it('after Submit the submitted marker renders with a pretty-printed payload', () => {
    window.__gsdSubmit = () => {};
    render(<PocScreen />);
    expect(screen.queryByTestId('poc-submitted-marker')).toBeNull();

    fireEvent.click(screen.getByTestId('poc-submit'));
    const marker = screen.getByTestId('poc-submitted-marker');
    expect(marker).toBeTruthy();
    expect(within(marker).getByText(/"action": "submit"/)).toBeTruthy();
  });
});

describe('PocScreen — reset', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      delete window.__gsdSubmit;
      delete window.__gsdReset;
      delete window.__gsdPayloadProvider;
    }
  });

  it('clicking Reset clears selections back to defaults and removes the submitted marker', () => {
    window.__gsdSubmit = () => {};
    render(<PocScreen />);

    // Mutate state
    fireEvent.click(screen.getByTestId('poc-card1-option-vanilla-cjs'));
    fireEvent.click(screen.getByTestId('poc-auto-checkbox'));
    fireEvent.click(screen.getByTestId('poc-submit'));
    expect(screen.getByTestId('poc-submitted-marker')).toBeTruthy();

    fireEvent.click(screen.getByTestId('poc-reset'));
    expect(screen.queryByTestId('poc-submitted-marker')).toBeNull();

    // Payload provider reflects cleared state
    const payload = window.__gsdPayloadProvider!() as {
      selections: Record<string, string>;
      auto: boolean;
    };
    expect(payload.selections.card1).toBe('json-render-shadcn');
    expect(payload.auto).toBe(false);
  });

  it('clicking Reset also invokes window.__gsdReset when a host registered one', () => {
    const resetSpy = vi.fn();
    window.__gsdReset = resetSpy;
    render(<PocScreen />);

    fireEvent.click(screen.getByTestId('poc-reset'));
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });
});

describe('PocScreen — shadcn-only (no GSD custom components)', () => {
  it('renders no GSD custom component markers in the tree', () => {
    render(<PocScreen />);
    // These data-testids are hardcoded in the 6 GSD custom components
    // (GrayAreaCard / SnippetToggle / StatusPill / StageBanner / ASCIIProgress
    // / CommandBlock — see src/components/*.tsx). The POC must NOT contain
    // any of them.
    const forbiddenTestIds = [
      'gray-area-card',
      'snippet-toggle',
      'status-pill',
      'stage-banner',
      'ascii-progress',
      'command-block',
    ];
    for (const id of forbiddenTestIds) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });

  it('renders no legacy "PHASE 4 POC" stage banner copy (v1 artefact)', () => {
    render(<PocScreen />);
    // v1 banner text used uppercase "PHASE 4 POC"; v2 uses the descriptor's
    // `banner.stage` which is title-case "Phase 4 POC — shadcn interactive".
    // Keeping this assertion guards against accidental revert.
    expect(screen.queryByText(/^PHASE 4 POC$/)).toBeNull();
  });
});
