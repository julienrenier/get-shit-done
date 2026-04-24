import type { ReactNode } from 'react';
import { shadcnComponents } from '@json-render/shadcn';

// Stock shadcn Button impl from the registry source — re-exported so we wrap, not replace.
// Cast through a permissive functional shape: shadcn impls follow the json-render
// component signature `({ props, children, emit, bindings? }) => ReactNode`.
const StockButton = (
  shadcnComponents as unknown as Record<string, (args: { props: Record<string, unknown>; children?: ReactNode }) => ReactNode>
).Button;

// Mirror shadcn Button prop shape for the fields we read directly. `variant`
// is nullable in the shadcn schema (z.enum([...]).nullable()), and `action`
// is the spec-level routing key we layer on top per RENDERER-CONTRACT §2.1.
// All other shadcn props are forwarded verbatim via the index signature.
interface ButtonProps {
  label?: string;
  variant?: string | null;
  action?: 'submit' | 'reset' | 'cancel' | string | null;
  [k: string]: unknown;
}

/**
 * Resolve the payload to send. PocScreen (and other screens) register
 * `window.__gsdPayloadProvider` to inject their domain-specific payload.
 * Default fallback: { action, ts } so the Submit click is at least observable.
 */
function buildPayload(action: string): unknown {
  if (typeof window !== 'undefined' && typeof window.__gsdPayloadProvider === 'function') {
    try {
      return window.__gsdPayloadProvider();
    } catch {
      /* fall through */
    }
  }
  return { action, ts: new Date().toISOString() };
}

/**
 * GsdButtonOverride — RENDERER-CONTRACT §2.1.
 *
 * Wraps the stock shadcn Button. When the spec carries `props.action`, the
 * click is intercepted and routed to the corresponding host hook before the
 * stock Button's own handlers fire. The override is installed BEFORE the
 * spread `...shadcnComponents` is overlaid (registry.ts), so it wins.
 *
 * Routing table:
 *   props.action === 'submit'  → window.__gsdSubmit(buildPayload('submit'))
 *   props.action === 'reset'   → window.__gsdReset()
 *   props.action === 'cancel'  → window.__gsdCancel()
 *   props.action absent / other → pass-through (no preventDefault)
 *
 * Dev fallback: missing host hook → console.log so the action is still observable.
 */
export function GsdButtonOverride(args: { props: ButtonProps; children?: ReactNode }): ReactNode {
  const { props } = args;
  const action = props.action;

  const handleClick = (e?: { preventDefault?: () => void }) => {
    if (typeof window === 'undefined') return;

    if (action === 'submit') {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      const payload = buildPayload('submit');
      if (typeof window.__gsdSubmit === 'function') {
        try {
          void window.__gsdSubmit(payload);
        } catch {
          /* swallow — host will surface errors via its own logging */
        }
      } else {
        console.log('[gsd] action submit fired (no host)', payload);
      }
      return;
    }

    if (action === 'reset') {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof window.__gsdReset === 'function') {
        try {
          window.__gsdReset();
        } catch {
          /* swallow */
        }
      } else {
        console.log('[gsd] action reset fired (no host)');
      }
      return;
    }

    if (action === 'cancel') {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof window.__gsdCancel === 'function') {
        try {
          window.__gsdCancel();
        } catch {
          /* swallow */
        }
      } else {
        console.log('[gsd] action cancel fired (no host)');
      }
      return;
    }

    // Unrecognised / absent action → pass-through. Stock Button's default
    // handlers (if any) still fire because we did NOT call preventDefault.
  };

  // Defensive fallback if the stock Button could not be resolved (should never
  // happen at runtime — keeps the override from crashing the screen).
  if (typeof StockButton !== 'function') {
    return (
      <button type="button" onClick={handleClick} className="gsd-button-fallback">
        {props.label ?? 'button'}
      </button>
    );
  }

  // Delegate render to the stock shadcn Button. Inject our onClick into its
  // props so the action routing wires up at the React event boundary.
  const wrappedProps: Record<string, unknown> = { ...props, onClick: handleClick };
  return <StockButton {...args} props={wrappedProps} />;
}
