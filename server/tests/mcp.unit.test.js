// MCP server — hermetic test (Phase 2b).
//
// No DB, no network, no env: stands up the Callback MCP server and a real MCP
// Client over an in-memory transport pair, then exercises the actual protocol —
// tools/list and tools/call — to prove the registry is correctly published.
// Run: node tests/mcp.unit.test.js  (from server/)
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCallbackMcpServer } from '../mcp/server.js';

let pass = 0;
let fail = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    fail++;
    failures.push({ name, message: err.message });
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

// Connect a client to a fresh server over a linked in-memory transport pair.
async function connect(ctx = {}) {
  const server = createCallbackMcpServer({ ctx });
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

// Parse the JSON text a tool call returns.
function textResult(res) {
  return JSON.parse(res.content[0].text);
}

await test('tools/list publishes the core registry with JSON Schemas', async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepStrictEqual(names, ['check_grounding', 'grade_answer', 'question_gen', 'score_resume', 'tailor_bullets', 'vault_search']);
  const score = tools.find((t) => t.name === 'score_resume');
  assert.strictEqual(score.inputSchema.type, 'object');
  assert.deepStrictEqual(score.inputSchema.required.sort(), ['jobDescription', 'resumeContent']);
  assert.ok(score.description.length > 0, 'tool should carry a description');
});

await test('tools/call score_resume returns the match breakdown', async () => {
  const { client } = await connect();
  const res = await client.callTool({
    name: 'score_resume',
    arguments: { jobDescription: 'PyTorch and recommendation systems.', resumeContent: 'Built PyTorch recommenders.' },
  });
  assert.ok(!res.isError, 'should not be an error');
  const breakdown = textResult(res);
  assert.ok(breakdown.value > 0, 'expected a positive score');
  assert.ok(Array.isArray(breakdown.matched_keywords));
});

await test('tools/call check_grounding flags an uncited bullet', async () => {
  const { client } = await connect();
  const res = await client.callTool({
    name: 'check_grounding',
    arguments: {
      items: [{ id: 'i1', title: 'Northstar', content: 'Built a PyTorch recommender serving 4M users.' }],
      bullets: [
        { text: 'Built a PyTorch recommender serving 4M users.', source_id: 'i1' },
        { text: 'Unrelated hobby claim.', source_id: null },
      ],
    },
  });
  const { provenance } = textResult(res);
  assert.strictEqual(provenance[0].grounded, true);
  assert.strictEqual(provenance[1].grounded, false);
});

await test('tools/call with invalid args returns isError, not a crash', async () => {
  const { client } = await connect();
  const res = await client.callTool({ name: 'score_resume', arguments: { jobDescription: 123 } });
  assert.strictEqual(res.isError, true);
  assert.ok(res.content[0].text.includes('invalid_args'), 'error text should name the cause');
});

await test('vault_search without ctx.db returns a clear error (no token wired)', async () => {
  const { client } = await connect(); // ctx = {} → no db
  const res = await client.callTool({
    name: 'vault_search',
    arguments: { job: { title: 'ML', company: 'X', description: 'ML.' } },
  });
  assert.strictEqual(res.isError, true);
  assert.ok(res.content[0].text.toLowerCase().includes('ctx.db'), 'should explain the missing db');
});

console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  process.exit(1);
}
