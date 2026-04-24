import type { z } from 'zod';
import type { asciiProgressProps } from '../catalog';

type Props = z.infer<typeof asciiProgressProps>;

const TOTAL_CELLS = 10;

/**
 * ASCIIProgress — terminal-style progress bar matching ui-brand.md (████░░ N%).
 * 10 cells total, filled count = round(current/total * 10). Clamps to [0,1].
 */
export function ASCIIProgress({ props }: { props: Props }) {
  const ratio = Math.max(0, Math.min(1, props.current / props.total));
  const filled = Math.round(ratio * TOTAL_CELLS);
  const bar = '█'.repeat(filled) + '░'.repeat(TOTAL_CELLS - filled);
  const pct = Math.round(ratio * 100);
  return (
    <span className="font-mono text-sm text-gsd-accent">
      {props.label ? `${props.label}: ` : ''}
      {bar} {pct}%
    </span>
  );
}
