/**
 * Tool definitions and dispatcher for the gsd-bridge MCP server.
 *
 * - show_playground: Claude→browser direct (writes pending.json).
 * - show_form     : Claude→browser→Claude round-trip via native MCP elicitation.
 *                   The Elicitation hook (Plan 03) intercepts the SDK's
 *                   elicitInput() request and routes it to the browser through
 *                   bridge-fs coordination files.
 * - reply         : Claude→browser direct (writes pending.json).
 *
 * No-throw contract (PATTERNS.md §159-169): every handler is wrapped in
 * try/catch and returns a CallToolResult with isError=true on failure.
 * An uncaught throw would crash the MCP server and the plugin session.
 */

import type { FieldSchema } from './schemas.js';
import { writePending } from './bridge-fs.js';

export const TOOL_DEFINITIONS = [
  {
    name: 'show_playground',
    description:
      "Écrit une URL (HTML playground) dans pending.json pour que le browser hôte l'ouvre (Claude→browser direct, pas de round-trip).",
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL à ouvrir (file:// ou http://)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'show_form',
    description:
      "Déclenche une Elicitation MCP native (server.elicitInput) qui est interceptée par le hook pour afficher un formulaire dans le browser. Bloque jusqu'à réponse user. Retourne { action, content }.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        message: { type: 'string', description: 'Prompt affiché avant le form' },
        fields: {
          type: 'object',
          description:
            'Record<fieldKey, FieldSchema> (string|number|boolean|enum + title/description/enum/required)',
        },
      },
      required: ['title', 'message', 'fields'],
    },
  },
  {
    name: 'reply',
    description:
      'Écrit un message texte dans pending.json (Claude→browser direct, sans elicitation).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    },
  },
] as const;

// MCP elicitation PrimitiveSchemaDefinition subset.
// Our FieldSchema (src/schemas.ts) exposes {type, title, description?, required?, enum?}.
// 'enum' field type maps to MCP's string-with-enum property variant; all others map 1:1.
interface RequestedSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title?: string;
  description?: string;
  enum?: readonly string[];
}

interface RequestedSchemaObject {
  type: 'object';
  properties: Record<string, RequestedSchemaProperty>;
  required?: string[];
}

interface ElicitResult {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, string | number | boolean>;
}

// Server subset required by show_form. Decoupling from @modelcontextprotocol/sdk
// makes the handler testable with a simple mock; the real Server (SDK) satisfies
// this structurally once the elicitation capability is declared.
export interface ElicitationCapableServer {
  elicitInput(params: {
    message: string;
    requestedSchema: RequestedSchemaObject;
  }): Promise<ElicitResult>;
}

interface ToolCallContext {
  cwd: string;
  server: ElicitationCapableServer;
}

type CallToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function okText(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function errText(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function buildRequestedSchema(
  fields: Record<string, FieldSchema>,
): RequestedSchemaObject {
  const properties: Record<string, RequestedSchemaProperty> = {};
  const required: string[] = [];
  for (const [key, f] of Object.entries(fields)) {
    // FieldSchema.type: 'string' | 'number' | 'boolean' | 'enum'.
    // MCP primitive types are 'string' | 'number' | 'integer' | 'boolean' — map 'enum' → string-with-enum.
    const baseType: RequestedSchemaProperty['type'] =
      f.type === 'enum' ? 'string' : f.type;
    const prop: RequestedSchemaProperty = { type: baseType };
    if (f.title) prop.title = f.title;
    if (f.description) prop.description = f.description;
    if (f.enum && f.enum.length > 0) prop.enum = f.enum;
    properties[key] = prop;
    if (f.required) required.push(key);
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolCallContext,
): Promise<CallToolResult> {
  try {
    if (name === 'show_playground') {
      const url = String(args.url ?? '');
      if (!url) return errText('show_playground: url required');
      writePending(ctx.cwd, { kind: 'show_playground', url });
      return okText(`Playground URL queued: ${url}`);
    }

    if (name === 'show_form') {
      const title = String(args.title ?? '');
      const message = String(args.message ?? title);
      const fields = (args.fields ?? {}) as Record<string, FieldSchema>;
      if (!title) return errText('show_form: title required');
      if (Object.keys(fields).length === 0) {
        return errText('show_form: fields required');
      }
      const requestedSchema = buildRequestedSchema(fields);
      // Native MCP elicitation — the hook (Plan 03) intercepts and routes to browser via bridge-fs.
      const result = await ctx.server.elicitInput({ message, requestedSchema });
      return okText(JSON.stringify(result));
    }

    if (name === 'reply') {
      const text = String(args.text ?? '');
      writePending(ctx.cwd, { kind: 'reply', text });
      return okText('reply queued');
    }

    return errText(`Unknown tool: ${name}`);
  } catch (err) {
    return errText(String(err));
  }
}
