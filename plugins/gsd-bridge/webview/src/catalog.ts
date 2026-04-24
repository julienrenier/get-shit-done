import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { shadcnComponentDefinitions } from '@json-render/shadcn/catalog';
import { z } from 'zod';

// === Custom GSD component prop schemas (RENDERER-CONTRACT.md §2) ===
// Locked subset: all 6 custom components per Discretion Item #1.

export const grayAreaOptionSchema = z.object({
  label: z.string(),
  selected: z.boolean(),
  notes: z.string().nullable(),
});

export const grayAreaCardProps = z.object({
  title: z.string(),
  options: z.array(grayAreaOptionSchema),
  follow_up: z.string().nullable(),
});

export const snippetToggleProps = z.object({
  language: z.string(),
  code: z.string(),
  collapsible: z.boolean(),
});

export const asciiProgressProps = z.object({
  current: z.number().min(0),
  total: z.number().min(1),
  label: z.string().nullable(),
});

export const stageBannerProps = z.object({
  stage: z.string(),
  icon: z.string().nullable(),
});

export const statusPillProps = z.object({
  status: z.enum(['complete', 'failed', 'pending', 'in-progress']),
  label: z.string().nullable(),
});

export const commandBlockProps = z.object({
  command: z.string(),
  copyable: z.boolean(),
  language: z.string().nullable(),
});

// === Catalog (single export, not per-screen — Discretion Item #5) ===
//
// Spreads the 36 stock shadcn definitions then layers the 6 GSD custom
// components on top (RENDERER-CONTRACT §2 catalog scope).

export const catalog = defineCatalog(schema, {
  components: {
    ...shadcnComponentDefinitions,
    GrayAreaCard: {
      props: grayAreaCardProps,
      description: 'Discuss-phase decision card with options and optional follow-up notes.',
    },
    SnippetToggle: {
      props: snippetToggleProps,
      description: 'Collapsible code snippet with language label.',
    },
    ASCIIProgress: {
      props: asciiProgressProps,
      description: 'Terminal-style progress bar (████░░ N%).',
    },
    StageBanner: {
      props: stageBannerProps,
      description: 'Box-drawing workflow stage banner.',
    },
    StatusPill: {
      props: statusPillProps,
      description: 'Inline status pill with the GSD ✓✗◆○ symbols.',
    },
    CommandBlock: {
      props: commandBlockProps,
      description: 'Terminal-style /gsd:command block with optional copy button.',
    },
  },
  actions: {
    submit: { description: 'Submit the form back to the host (calls window.__gsdSubmit).' },
    reset: { description: 'Reset the form to its initial state (calls window.__gsdReset).' },
    cancel: { description: 'Cancel the elicitation (calls window.__gsdCancel; returns action: cancel to MCP).' },
  },
});
