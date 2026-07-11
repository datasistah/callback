// Callback MCP server — stdio entrypoint.
//
// Run:  node server/mcp/index.js
// Exposes Callback's tool registry over the Model Context Protocol on stdio, so
// an MCP client (Claude Desktop, an IDE agent, another service) can list and
// call the tools. Point a client at this command to connect.
//
// Auth: tools that read the user's data (vault_search) need a user-scoped
// Supabase client. If CALLBACK_ACCESS_TOKEN is set, we build one and put it in
// ctx.db; otherwise vault_search returns a clear error and the pure tools
// (score_resume, check_grounding, tailor_bullets) still work. No token is ever
// logged, and stdout is reserved for the protocol — logs go to stderr only.
import '../lib/loadEnv.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { userClient } from '../supabase.js';
import { createCallbackMcpServer } from './server.js';

function buildCtx() {
  const token = process.env.CALLBACK_ACCESS_TOKEN;
  if (!token) {
    console.error('[callback-mcp] No CALLBACK_ACCESS_TOKEN — vault_search disabled; pure tools available.');
    return {};
  }
  console.error('[callback-mcp] Access token present — vault_search enabled (RLS-scoped).');
  return { db: userClient(token) };
}

async function main() {
  const server = createCallbackMcpServer({ ctx: buildCtx() });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[callback-mcp] Serving Callback tools over stdio.');
}

main().catch((err) => {
  console.error('[callback-mcp] Fatal:', err.message);
  process.exit(1);
});
