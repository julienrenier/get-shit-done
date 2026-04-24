import { Renderer, JSONUIProvider } from '@json-render/react';
import { registry } from './registry';

// window-types.d.ts is an ambient declaration file picked up by tsconfig
// `include`. No runtime import needed — Vite would fail to resolve a .d.ts
// path at bundle time.

// Read host-injected spec (RENDERER-CONTRACT.md §3).
// In dev (vite dev) the spec is undefined — render PLACEHOLDER_SPEC so the
// dev server is usable for iterating on components without a host.
function getSpec(): unknown {
  if (typeof window === 'undefined') return null;
  return window.__gsdSpec ?? null;
}

/**
 * Deterministic placeholder spec used when no host has injected window.__gsdSpec.
 * Exported so vitest can assert against it without depending on host injection.
 */
export const PLACEHOLDER_SPEC = {
  root: 'page',
  elements: {
    page: {
      type: 'Stack',
      props: { direction: 'vertical', gap: 4 },
      children: ['banner', 'msg'],
    },
    banner: {
      type: 'StageBanner',
      props: { stage: 'WEBVIEW DEV MODE', icon: '⚡' },
    },
    msg: {
      type: 'Text',
      props: {
        children: 'No spec injected. Set window.__gsdSpec or open via the Phase 1 hook.',
      },
    },
  },
} as const;

/**
 * App — root component of the webview.
 * Reads window.__gsdSpec (host-injected by the Phase 1 elicitation hook) and
 * renders it through the json-render <Renderer>. Falls back to PLACEHOLDER_SPEC
 * in dev mode.
 */
export function App() {
  const spec = getSpec() ?? PLACEHOLDER_SPEC;
  return (
    <main className="min-h-screen p-6 font-mono text-gsd-fg bg-gsd-bg">
      <JSONUIProvider registry={registry}>
        <Renderer spec={spec as never} registry={registry} />
      </JSONUIProvider>
    </main>
  );
}
