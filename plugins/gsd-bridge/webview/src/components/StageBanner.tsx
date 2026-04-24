import type { z } from 'zod';
import type { stageBannerProps } from '../catalog';

type Props = z.infer<typeof stageBannerProps>;

const RULE = '━'.repeat(62);

/**
 * StageBanner — full-width box-drawing workflow banner per ui-brand.md.
 * Renders as `━━━…\n {icon?} GSD ► {STAGE}\n━━━…` (62-char rules).
 */
export function StageBanner({ props }: { props: Props }) {
  const headline = props.icon
    ? `${props.icon} GSD ► ${props.stage}`
    : ` GSD ► ${props.stage}`;
  return (
    <pre
      className="font-mono text-gsd-accent text-sm whitespace-pre"
      aria-label={`Stage: ${props.stage}`}
    >{`${RULE}\n${headline}\n${RULE}`}</pre>
  );
}
