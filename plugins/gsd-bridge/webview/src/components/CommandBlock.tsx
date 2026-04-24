import { useState } from 'react';
import type { z } from 'zod';
import type { commandBlockProps } from '../catalog';

type Props = z.infer<typeof commandBlockProps>;

/**
 * CommandBlock — terminal-style `/gsd:command` block.
 * When `copyable=true`, exposes a copy button that writes ONLY `props.command`
 * to the clipboard (T-04-03-02 mitigation: never reads document.body).
 */
export function CommandBlock({ props }: { props: Props }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable in some browsers — silent */
    }
  };

  return (
    <div className="bg-gsd-surface-variant rounded-md p-4 font-mono text-sm flex items-center justify-between gap-4">
      <code
        className="text-gsd-accent overflow-x-auto whitespace-pre"
        data-language={props.language ?? 'shell'}
      >
        {props.command}
      </code>
      {props.copyable ? (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-xs text-gsd-fg-muted hover:text-gsd-accent"
        >
          {copied ? 'copied ✓' : 'copy'}
        </button>
      ) : null}
    </div>
  );
}
