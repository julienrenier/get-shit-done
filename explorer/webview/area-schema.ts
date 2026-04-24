import { defineSchema, defineCatalog } from "@json-render/core";
import { z } from "zod";

/**
 * Custom json-render schema for an explorer "area" detail view.
 *
 * This is NOT the built-in `@json-render/react` flat-tree schema.
 * It defines its own grammar: a flat list of domain widgets inside a
 * single root spec — matching the style documented in `@json-render/core`:
 *
 *   {
 *     "area": "Widget mapping source",
 *     "domain": "...",
 *     "layout": "grid",
 *     "columns": 2,
 *     "widgets": [
 *       { "type": "question", "props": { "text": "..." } },
 *       { "type": "trade-off", "props": { "options": [...] } },
 *       { "type": "recommendation", "props": { "option": "...", "rationale": "..." } }
 *     ]
 *   }
 *
 * Widget `type` values reference the `catalog.widgets` map. Widget `props`
 * are validated against the Zod schema declared for that type in the
 * catalog (see `areaCatalog` below).
 *
 * This schema is schema-agnostic-compatible: any renderer that can consume
 * `@json-render/core` schemas can render it — React via `@json-render/react`
 * with a custom catalog, Vue, plain HTML, Slack blocks, PDF, anything.
 */
export const areaSchema = defineSchema((s) => ({
  spec: s.object({
    area: s.string(),
    domain: s.string(),
    layout: s.string(),
    columns: s.number(),
    widgets: s.array(
      s.object({
        type: s.ref("catalog.widgets"),
        props: s.propsOf("catalog.widgets"),
      }),
    ),
  }),
  catalog: s.object({
    widgets: s.map({
      props: s.zod(),
      description: s.string(),
    }),
  }),
}));

/**
 * Catalog of domain widgets for the explorer. Each entry declares:
 *  - `props`: a Zod schema validating the widget's props
 *  - `description`: human-readable blurb (used by AI prompt templates)
 */
export const areaCatalog = defineCatalog(areaSchema, {
  widgets: {
    question: {
      props: z.object({
        text: z.string(),
      }),
      description: "One of the gray area questions asked to the user.",
    },

    annotation: {
      props: z.object({
        text: z.string(),
      }),
      description: "Code-context or prior-decision annotation attached to the area.",
    },

    "trade-off": {
      props: z.object({
        options: z
          .array(
            z.object({
              name: z.string(),
              pros: z.array(z.string()),
              cons: z.array(z.string()),
            }),
          )
          .min(2)
          .max(5),
        generic: z.boolean().nullable(),
      }),
      description:
        "Trade-off comparison between 2-5 options with pros/cons. `generic: true` flags a pre-scout generic analysis that should be re-evaluated once codebase context is loaded.",
    },

    recommendation: {
      props: z.object({
        option: z.string(),
        rationale: z.string(),
        cites: z.array(z.string()),
      }),
      description:
        "Recommended option with a rationale tied to concrete project context (citations from canonical_refs).",
    },

    status: {
      props: z.object({
        advisor: z.enum(["pending", "running", "done"]).nullable(),
        chat: z.enum(["idle", "thinking", "waiting_user", "done"]).nullable(),
      }),
      description: "Aggregated status of the advisor queue and chat session for this area.",
    },

    "advisor-trigger": {
      props: z.object({
        area: z.string(),
        disabled: z.boolean(),
        label: z.string(),
      }),
      description:
        "Button that queues an advisor research request. `area` is the gray area label passed back when pressed.",
    },

    chat: {
      props: z.object({
        area: z.string(),
        status: z.enum(["idle", "thinking", "waiting_user", "done"]),
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
            at: z.string(),
          }),
        ),
      }),
      description:
        "Area-scoped chat session. Persists until the user marks done or submits a decision for the area.",
    },

    decision: {
      props: z.object({
        area: z.string(),
        locked: z.boolean(),
        value: z.string().nullable(),
        rationale: z.string().nullable(),
      }),
      description:
        "Current state of the locked decision for this area. `locked: false` means no decision captured yet.",
    },
  },
});

/**
 * TypeScript helpers — the shape of a spec that conforms to this schema.
 * Consumers can use `AreaSpec` to type-check their spec-builders.
 */
export type AreaSpec = {
  area: string;
  domain: string;
  layout: "stack" | "grid";
  columns: number;
  widgets: Array<
    | { type: "question"; props: { text: string } }
    | { type: "annotation"; props: { text: string } }
    | {
        type: "trade-off";
        props: {
          options: { name: string; pros: string[]; cons: string[] }[];
          generic: boolean | null;
        };
      }
    | {
        type: "recommendation";
        props: { option: string; rationale: string; cites: string[] };
      }
    | {
        type: "status";
        props: {
          advisor: "pending" | "running" | "done" | null;
          chat: "idle" | "thinking" | "waiting_user" | "done" | null;
        };
      }
    | {
        type: "advisor-trigger";
        props: { area: string; disabled: boolean; label: string };
      }
    | {
        type: "chat";
        props: {
          area: string;
          status: "idle" | "thinking" | "waiting_user" | "done";
          messages: { role: "user" | "assistant"; content: string; at: string }[];
        };
      }
    | {
        type: "decision";
        props: { area: string; locked: boolean; value: string | null; rationale: string | null };
      }
  >;
};
