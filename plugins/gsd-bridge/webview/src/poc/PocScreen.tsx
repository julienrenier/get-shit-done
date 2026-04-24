import { useEffect, useState } from 'react';
import { Renderer, JSONUIProvider } from '@json-render/react';
import { registry } from '../registry';
import { POC_SPEC, pocDefaultSelections } from './poc-spec';

interface SubmitPayload {
  action: 'submit';
  selections: Array<{ card: string; selected: string }>;
  snippet_expanded: boolean;
  ts: string;
}

/**
 * PocScreen — Plan 04-05 / RENDERER-CONTRACT §8 (locked POC scope).
 *
 * Renders POC_SPEC through the registry built in Plan 04-03. The Submit and
 * Reset buttons are part of the SPEC (not parallel HTML). Click → registry's
 * GsdButtonOverride (RENDERER-CONTRACT §2.1) reads `props.action` and routes
 * to `window.__gsdSubmit` / `window.__gsdReset` (host hooks injected by the
 * Phase 1 hook + sidecar HTTP from Plan 04-04).
 *
 * On mount this component installs:
 *   - `window.__gsdPayloadProvider` — called by the override at click time so
 *     the screen owns the structure of the submitted payload.
 *   - `window.__gsdReset` — toggles local state back to pristine.
 *
 * On unmount both globals are removed so the next consumer can register its
 * own provider without leaks (mitigates T-04-05-01 / T-04-05-07).
 */
export function PocScreen() {
  const [snippetExpanded, setSnippetExpanded] = useState(false);
  const [submitted, setSubmitted] = useState<SubmitPayload | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.__gsdPayloadProvider = (): SubmitPayload => {
      const payload: SubmitPayload = {
        action: 'submit',
        selections: pocDefaultSelections(),
        snippet_expanded: snippetExpanded,
        ts: new Date().toISOString(),
      };
      setSubmitted(payload);
      return payload;
    };

    window.__gsdReset = (): void => {
      setSubmitted(null);
      setSnippetExpanded(false);
    };

    return () => {
      delete window.__gsdPayloadProvider;
      delete window.__gsdReset;
    };
  }, [snippetExpanded]);

  // `setSnippetExpanded` is referenced so React keeps the dependency check
  // honest — the SnippetToggle currently maintains its own internal expanded
  // state; a future enhancement may surface it through a controlled prop.
  void setSnippetExpanded;

  return (
    <section data-testid="poc-screen" className="space-y-4">
      <JSONUIProvider registry={registry}>
        <Renderer spec={POC_SPEC as never} registry={registry} />
      </JSONUIProvider>
      {submitted ? (
        <span
          data-testid="poc-submitted-marker"
          className="text-gsd-success font-mono text-xs block pt-2"
        >
          ✓ submitted
        </span>
      ) : null}
    </section>
  );
}
