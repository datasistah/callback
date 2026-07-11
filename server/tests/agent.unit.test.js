// Agent Harness — hermetic unit tests for the agentic layer (Phase 2).
//
// No DB, no network, no env, no LLM: exercises the tool registry (validation +
// run), the deterministic orchestrator (sequencing + failure isolation), the
// reason→act→observe loop (with an injected fake completer), and confirms the
// tailoring flow still grounds every bullet now that it runs through the layer.
// Run: node tests/agent.unit.test.js  (from server/)
import assert from 'node:assert';
import {
  createDefaultRegistry,
  validateArgs,
  runPipeline,
  runAgentLoop,
  parseAction,
} from '../harness/agent/index.js';
import { buildTailoredResume } from '../lib/tailor.js';

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

// ── Tool registry ──────────────────────────────────────────────────────────
await test('registry lists the core tools', () => {
  const names = createDefaultRegistry().list().map((t) => t.name).sort();
  assert.deepStrictEqual(names, ['check_grounding', 'grade_answer', 'question_gen', 'score_resume', 'tailor_bullets', 'vault_search']);
});

await test('validateArgs catches missing required and wrong types', () => {
  const params = { a: { type: 'string', required: true }, n: { type: 'number' } };
  assert.deepStrictEqual(validateArgs(params, { a: 'x', n: 3 }), []);
  assert.ok(validateArgs(params, { n: 3 }).some((e) => e.includes('missing required "a"')));
  assert.ok(validateArgs(params, { a: 5 }).some((e) => e.includes('must be string')));
});

await test('registry.run rejects unknown tools and invalid args', async () => {
  const reg = createDefaultRegistry();
  await assert.rejects(() => reg.run('nope', {}), (e) => e.code === 'unknown_tool');
  await assert.rejects(() => reg.run('score_resume', { jobDescription: 1 }), (e) => e.code === 'invalid_args');
});

await test('score_resume tool runs (pure, no LLM)', async () => {
  const reg = createDefaultRegistry();
  const out = await reg.run('score_resume', {
    jobDescription: 'PyTorch and recommendation systems.',
    resumeContent: 'Built PyTorch recommendation systems.',
  });
  assert.ok(out.value > 0, 'expected a positive match score');
  assert.ok(Array.isArray(out.matched_keywords));
});

await test('tailor_bullets fallback (no LLM) yields one grounded bullet per item', async () => {
  const reg = createDefaultRegistry();
  const items = [
    { id: 'a', kind: 'skill', title: 'PyTorch', content: 'PyTorch for production ML.' },
    { id: 'b', kind: 'skill', title: 'AWS', content: 'Deploying on AWS.' },
  ];
  const { bullets } = await reg.run('tailor_bullets', { job: { title: 'X' }, items });
  assert.strictEqual(bullets.length, 2);
  assert.ok(bullets.every((b) => items.some((i) => i.id === b.source_id)), 'every bullet cites a real item');
});

// ── Orchestrator ───────────────────────────────────────────────────────────
await test('runPipeline sequences steps and threads prior results', async () => {
  const { results, trace } = await runPipeline([
    { name: 'one', run: () => 1 },
    { name: 'two', run: (_ctx, { prior }) => prior + 1 },
    { name: 'three', run: (_ctx, { results }) => results.two + 1 },
  ]);
  assert.deepStrictEqual([results.one, results.two, results.three], [1, 2, 3]);
  assert.ok(trace.every((t) => t.ok), 'all steps should be ok');
});

await test('runPipeline isolates an optional step failure but stops on a required one', async () => {
  // Optional failure → recorded, pipeline continues.
  const ok = await runPipeline([
    { name: 'flaky', required: false, run: () => { throw new Error('boom'); } },
    { name: 'after', run: () => 'ran' },
  ]);
  assert.strictEqual(ok.results.flaky, null);
  assert.strictEqual(ok.results.after, 'ran');
  assert.strictEqual(ok.trace[0].ok, false);

  // Required failure → throws, but carries partial results + trace (no crash).
  await assert.rejects(
    () => runPipeline([
      { name: 'good', run: () => 'v' },
      { name: 'bad', run: () => { throw new Error('halt'); } },
      { name: 'never', run: () => 'unreached' },
    ]),
    (err) => err.partial.good === 'v' && err.partial.never === undefined && Array.isArray(err.trace)
  );
});

// ── Reason→act→observe loop (injected fake completer, no real model) ────────
await test('parseAction extracts JSON from fenced / noisy replies', () => {
  assert.deepStrictEqual(parseAction('```json\n{"final":"done"}\n```'), { final: 'done' });
  assert.deepStrictEqual(parseAction('sure: {"tool":"t","args":{"x":1}} ok'), { tool: 't', args: { x: 1 } });
  assert.strictEqual(parseAction('no json here'), null);
});

await test('runAgentLoop calls a tool then returns the final answer', async () => {
  const reg = createDefaultRegistry();
  // Fake model: first turn calls score_resume, second turn finalizes.
  const replies = [
    JSON.stringify({ thought: 'score it', tool: 'score_resume', args: { jobDescription: 'PyTorch', resumeContent: 'PyTorch' } }),
    JSON.stringify({ thought: 'done', final: 'scored' }),
  ];
  let i = 0;
  const fakeComplete = async () => replies[i++];

  const { output, trace, steps } = await runAgentLoop({
    registry: reg,
    goal: 'Score the resume.',
    complete: fakeComplete,
    maxSteps: 4,
  });
  assert.strictEqual(output, 'scored');
  assert.strictEqual(steps, 2);
  assert.strictEqual(trace[0].tool, 'score_resume');
  assert.ok(trace[0].observation.includes('value'), 'tool observation should carry the score');
});

await test('runAgentLoop gives up with agent_max_steps if never final', async () => {
  const reg = createDefaultRegistry();
  const fakeComplete = async () => JSON.stringify({ thought: 'loop', tool: 'score_resume', args: { jobDescription: 'a', resumeContent: 'a' } });
  await assert.rejects(
    () => runAgentLoop({ registry: reg, goal: 'x', complete: fakeComplete, maxSteps: 3 }),
    (e) => e.code === 'agent_max_steps' && Array.isArray(e.trace)
  );
});

// ── Tailoring still works end-to-end through the agent layer ───────────────
function fakeDb(items) {
  return {
    async rpc(fn, args) {
      assert.strictEqual(fn, 'match_career_items');
      assert.ok(Array.isArray(args.query_embedding));
      return { data: items, error: null };
    },
  };
}

await test('buildTailoredResume (through the pipeline) grounds every bullet', async () => {
  const items = [
    { id: 'a', kind: 'experience', title: 'Northstar', content: 'Built a PyTorch recommender serving 4M users.' },
    { id: 'b', kind: 'skill', title: 'AWS', content: 'Deploying models on AWS.' },
  ];
  const { provenance, grounded } = await buildTailoredResume(fakeDb(items), {
    profile: 'Maya Rivera — Senior ML Engineer',
    job: { title: 'Senior ML Engineer', company: 'Northwind AI', description: 'PyTorch, AWS.' },
  });
  assert.strictEqual(grounded, true);
  assert.strictEqual(provenance.length, 2);
  assert.ok(provenance.every((p) => p.grounded && p.source_id), 'all bullets grounded + cited');
});

await test('buildTailoredResume with an empty vault falls back (no provenance)', async () => {
  const { provenance, grounded } = await buildTailoredResume(fakeDb([]), {
    profile: 'Maya Rivera — Senior ML Engineer\n- Built recommenders.',
    job: { title: 'ML Engineer', company: 'X', description: 'ML.' },
  });
  assert.strictEqual(grounded, false);
  assert.deepStrictEqual(provenance, []);
});

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  process.exit(1);
}
