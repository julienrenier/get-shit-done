import type { z } from 'zod';
import type { grayAreaCardProps } from '../catalog';

type Props = z.infer<typeof grayAreaCardProps>;

/**
 * GrayAreaCard — discuss-phase decision card.
 * Renders a title, an option list (selected options visually elevated), and an
 * optional follow-up note. Used by the Phase 3 4-gray-areas POC and beyond.
 *
 * Styling consumes only the gsd-* Tailwind tokens defined in tailwind.config.js
 * (RENDERER-CONTRACT §2 — no hardcoded hex).
 */
export function GrayAreaCard({ props }: { props: Props }) {
  return (
    <section className="bg-gsd-surface border border-gsd-surface-variant rounded-lg p-6 font-mono">
      <h3 className="text-gsd-fg text-lg font-semibold mb-4">{props.title}</h3>
      {props.options.length === 0 ? (
        <p className="text-gsd-fg-muted text-sm">No options defined.</p>
      ) : (
        <ul className="space-y-3">
          {props.options.map((opt, i) => (
            <li
              key={i}
              data-selected={opt.selected ? 'true' : 'false'}
              className={
                opt.selected
                  ? 'text-gsd-accent border-l-2 border-gsd-accent pl-3'
                  : 'text-gsd-fg-muted border-l-2 border-gsd-surface-variant pl-3'
              }
            >
              <span className="text-sm">{opt.label}</span>
              {opt.notes ? (
                <p className="text-xs text-gsd-fg-muted mt-1">{opt.notes}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {props.follow_up ? (
        <p className="mt-4 pt-4 border-t border-gsd-surface-variant text-sm text-gsd-fg-muted">
          {props.follow_up}
        </p>
      ) : null}
    </section>
  );
}
