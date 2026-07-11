// Agent Harness — MCP server that exposes the tool registry.
//
// This is Phase 2b: the same ToolRegistry the internal agent loop and
// orchestrator use (server/harness/agent/) is now published over the Model
// Context Protocol, so *external* agents — Claude Desktop, an IDE agent, or
// another service — can discover and call Callback's tools with no bespoke API.
// One registry, two consumers: internal code and the MCP surface stay in lockstep.
//
// Transport-agnostic: this module only builds the `Server` and wires it to the
// registry. The stdio entrypoint (mcp/index.js) and the in-memory test harness
// each supply their own transport.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createDefaultRegistry } from '../harness/agent/index.js';

// Map a registry tool's simple param spec onto a JSON Schema `inputSchema`,
// which is what the MCP `tools/list` response carries for each tool.
function toInputSchema(params) {
  const properties = {};
  const required = [];
  for (const [key, spec] of Object.entries(params || {})) {
    properties[key] = { type: spec.type || 'string' };
    if (spec.description) properties[key].description = spec.description;
    if (spec.required) required.push(key);
  }
  const schema = { type: 'object', properties };
  if (required.length) schema.required = required;
  return schema;
}

// Build the MCP server. `registry` defaults to Callback's core tools; `ctx` is
// passed to every tool handler (its `db` — a user-scoped Supabase client — is
// what gives vault_search its RLS scope). Callers connect a transport after.
export function createCallbackMcpServer({ registry = createDefaultRegistry(), ctx = {} } = {}) {
  const server = new Server(
    { name: 'callback-tools', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toInputSchema(t.params),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await registry.run(name, args || {}, ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      // MCP convention: surface tool failures as an error *result* (isError),
      // not a thrown protocol error — the calling agent can read and recover.
      return { content: [{ type: 'text', text: `Error (${err.code || 'tool_error'}): ${err.message}` }], isError: true };
    }
  });

  return server;
}
