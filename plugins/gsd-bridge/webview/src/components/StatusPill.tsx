import type { z } from 'zod';
import type { statusPillProps } from '../catalog';

type Props = z.infer<typeof statusPillProps>;

const STYLES: Record<Props['status'], { className: string; symbol: string; defaultLabel: string }> = {
  complete: {
    className: 'bg-gsd-success text-black',
    symbol: '✓',
    defaultLabel: 'Complete',
  },
  failed: {
    className: 'bg-gsd-destructive text-white',
    symbol: '✗',
    defaultLabel: 'Failed',
  },
  pending: {
    className: 'bg-gsd-warning text-black',
    symbol: '○',
    defaultLabel: 'Pending',
  },
  'in-progress': {
    className: 'bg-gsd-info text-white',
    symbol: '◆',
    defaultLabel: 'In Progress',
  },
};

/**
 * StatusPill — inline status chip with the GSD ✓✗◆○ symbol set
 * (ui-brand.md §Status Symbols). Falls back to the canonical label when
 * `label === null`.
 */
export function StatusPill({ props }: { props: Props }) {
  const { className, symbol, defaultLabel } = STYLES[props.status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-mono text-xs font-semibold ${className}`}
      data-status={props.status}
    >
      <span aria-hidden>{symbol}</span>
      <span>{props.label ?? defaultLabel}</span>
    </span>
  );
}
