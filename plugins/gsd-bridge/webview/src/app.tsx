import { Renderer, JSONUIProvider } from '@json-render/react';
import { registry } from './registry';
import { PocScreen } from './poc/PocScreen';

// window-types.d.ts is an ambient declaration file picked up by tsconfig
// `include`. No runtime import needed — Vite would fail to resolve a .d.ts
// path at bundle time.

// Read host-injected spec (RENDERER-CONTRACT.md §3).
// In dev (vite dev) the spec is undefined → render the POC fallback so the
// dev server is usable for iterating on components without a host.
function getInjectedSpec(): unknown {
  if (typeof window === 'undefined') return null;
  return window.__gsdSpec ?? null;
}

/**
 * App — root component of the webview.
 *
 * Reads window.__gsdSpec (host-injected by the Phase 1 elicitation hook). When
 * present, renders the host spec through the json-render <Renderer>. Falls
 * back to <PocScreen /> in dev mode so the developer always has a meaningful
 * surface to work against (Plan 04-05 / RENDERER-CONTRACT §8).
 */
export function App() {
  const spec = getInjectedSpec();
  return (
    <main className="min-h-screen p-6 font-mono text-gsd-fg bg-gsd-bg">
      {spec ? (
        <JSONUIProvider registry={registry}>
          <Renderer spec={spec as never} registry={registry} />
        </JSONUIProvider>
      ) : (
        <PocScreen />
      )}
    </main>
  );
}
