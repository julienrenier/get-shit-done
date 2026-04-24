import { defineRegistry } from '@json-render/react';
import { shadcnComponents } from '@json-render/shadcn';
import { catalog } from './catalog';
import { GrayAreaCard } from './components/GrayAreaCard';
import { SnippetToggle } from './components/SnippetToggle';
import { ASCIIProgress } from './components/ASCIIProgress';
import { StageBanner } from './components/StageBanner';
import { StatusPill } from './components/StatusPill';
import { CommandBlock } from './components/CommandBlock';
import { GsdButtonOverride } from './components/GsdButtonOverride';

// Single registry exporting both the 36 shadcn implementations and the 6 GSD
// custom implementations. The Button entry is OVERRIDDEN with GsdButtonOverride
// per RENDERER-CONTRACT §2.1 — the override intercepts props.action
// ('submit'/'reset'/'cancel') and routes to host hooks
// (window.__gsdSubmit / __gsdReset / __gsdCancel) BEFORE delegating render to
// the stock shadcn Button. This keeps the spec as the single source of truth
// for action wiring (PocScreen does not need parallel HTML buttons).
//
// Order matters: spreading shadcnComponents FIRST then overriding Button
// ensures the GSD wrapper wins.
//
// Consumed by <App> (app.tsx) and by Phase 3+ webview screens.

// Action handlers — invoked by json-render's ActionProvider when a spec emits
// an action. Each maps to the corresponding host hook (RENDERER-CONTRACT §2.1
// + §3); GsdButtonOverride remains the primary entry point (it handles the
// payload assembly via __gsdPayloadProvider). These handlers are kept as a
// safety net for spec-driven actions that bypass the override (e.g. emit()
// from a non-Button component) so the routing contract stays one-way.
function fireSubmit(payload?: unknown): void {
  if (typeof window === 'undefined') return;
  if (typeof window.__gsdSubmit === 'function') {
    try {
      void window.__gsdSubmit(payload);
    } catch {
      /* swallow */
    }
  } else {
    console.log('[gsd] action submit fired (no host)', payload);
  }
}

function fireReset(): void {
  if (typeof window === 'undefined') return;
  if (typeof window.__gsdReset === 'function') {
    try {
      window.__gsdReset();
    } catch {
      /* swallow */
    }
  } else {
    console.log('[gsd] action reset fired (no host)');
  }
}

function fireCancel(): void {
  if (typeof window === 'undefined') return;
  if (typeof window.__gsdCancel === 'function') {
    try {
      window.__gsdCancel();
    } catch {
      /* swallow */
    }
  } else {
    console.log('[gsd] action cancel fired (no host)');
  }
}

export const { registry } = defineRegistry(catalog, {
  components: {
    ...shadcnComponents,
    Button: GsdButtonOverride,
    GrayAreaCard,
    SnippetToggle,
    ASCIIProgress,
    StageBanner,
    StatusPill,
    CommandBlock,
  },
  actions: {
    submit: async (params: unknown) => {
      fireSubmit(params);
    },
    reset: async () => {
      fireReset();
    },
    cancel: async () => {
      fireCancel();
    },
  },
});
