/**
 * GSD Bridge MCP Server — exposes tools (show_playground, show_form, reply)
 * and advertises the elicitation capability (D-03/D-08). Tool calls are
 * routed through handleToolCall which coordinates with the Elicitation hook
 * (Plan 03) via bridge files under {cwd}/.planning/.bridge/.
 *
 * Lifecycle mirrors sdk/src/ws-transport.ts:
 *   - constructor wires tools + capability.
 *   - start() connects StdioServerTransport (idempotent if closing).
 *   - close() flips `closing` and shuts the transport, swallowing per-connection errors.
 *
 * No-throw contract (PATTERNS.md §159-169): every request handler is wrapped
 * in try/catch so an unexpected error becomes a CallToolResult{isError:true}
 * instead of crashing the process and losing the plugin session.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  TOOL_DEFINITIONS,
  handleToolCall,
  type ElicitationCapableServer,
} from './tools.js';

export class BridgeServer {
  private readonly server: Server;
  private transport: StdioServerTransport | null = null;
  private closing = false;

  constructor() {
    // Per MCP spec, `elicitation:` is a CLIENT capability (declared by Claude Code),
    // not a server capability. The server simply calls server.elicitInput() when it
    // needs input — the client's declared elicitation capability permits the round
    // trip. Declaring elicitation in ServerCapabilities fails ts strict (not in the
    // ServerCapabilities union). We therefore only declare `tools: {}` and rely on
    // the client-declared capability to enable D-03/D-08. elicitation: the hook
    // (Plan 03) is what actually gates whether the round-trip reaches the browser.
    this.server = new Server(
      { name: 'gsd-bridge', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Cast through readonly → mutable array shape expected by the SDK result schema.
      return { tools: TOOL_DEFINITIONS as unknown as typeof TOOL_DEFINITIONS[number][] };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      try {
        const name = req.params.name;
        const args = (req.params.arguments ?? {}) as Record<string, unknown>;
        const cwd = process.env.GSD_BRIDGE_CWD ?? process.cwd();
        // `this.server` exposes elicitInput() because capabilities.elicitation is declared.
        // Structural compat with ElicitationCapableServer (see tools.ts) is enforced via cast.
        const elicitServer = this.server as unknown as ElicitationCapableServer;
        return await handleToolCall(name, args, { cwd, server: elicitServer });
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `server error: ${String(err)}` },
          ],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    if (this.closing) return;
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
  }

  async close(): Promise<void> {
    this.closing = true;
    try {
      await this.transport?.close?.();
    } catch {
      // swallow per-connection errors (PATTERNS.md §171)
    }
  }
}

// CLI entry — only when this file is executed directly (not when imported by tests).
// Detecting ESM main: compare import.meta.url against the invoked script path.
const invoked = process.argv[1] ?? '';
const isMain =
  import.meta.url === `file://${invoked}` ||
  invoked.endsWith('server.js') ||
  invoked.endsWith('server.ts');
if (isMain) {
  const srv = new BridgeServer();
  srv.start().catch((err) => {
    // stderr only — stdout is reserved for MCP JSON-RPC framing.
    console.error('gsd-bridge failed to start:', err);
    process.exit(1);
  });
}
