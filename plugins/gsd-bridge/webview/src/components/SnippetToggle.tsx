import { useState } from 'react';
import type { z } from 'zod';
import type { snippetToggleProps } from '../catalog';

type Props = z.infer<typeof snippetToggleProps>;

/**
 * SnippetToggle — collapsible code snippet with a language label.
 * When `collapsible=true`, the body is hidden initially and a button toggles
 * between "expand" and "collapse". When `false`, the snippet is always shown.
 */
export function SnippetToggle({ props }: { props: Props }) {
  const [open, setOpen] = useState(!props.collapsible);
  return (
    <div className="bg-gsd-surface-variant rounded-md font-mono text-sm">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gsd-surface">
        <span className="text-xs uppercase text-gsd-fg-muted">{props.language}</span>
        {props.collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-gsd-accent hover:text-gsd-accent-dark"
          >
            {open ? 'collapse' : 'expand'}
          </button>
        ) : null}
      </header>
      {open ? (
        <pre className="px-4 py-3 overflow-x-auto text-gsd-fg whitespace-pre">
          <code>{props.code}</code>
        </pre>
      ) : null}
    </div>
  );
}
