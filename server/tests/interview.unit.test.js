// Interview question-generation — hermetic unit tests (Phase 3).
//
// No DB, no network, no env, no LLM: exercises the deterministic question
// generator, the question_gen registry tool, and the interview agent on both
// paths — the reason→act→observe loop (with an injected fake completer) and the
// no-model deterministic fallback. Proves the model-driven path is real while
// the free/local/mock guarantee holds.
// Run: node tests/interview.unit.test.js  (from server/)
import assert from 'node:assert';
import { createDefaultRegistry } from '../harness/agent/index.js';
import { generateQuestionsFallback } from '../lib/questions.js';
import { generateInterviewQuestions } from '../lib/interview.js';

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

const JOB = {
  title: 'Senior ML Engineer',
  company: 'Northwind AI',
  description: 'Build recommendation systems in PyTorch. Deploy models on AWS. A/B testing.',
};

// ── Deterministic generator (no LLM) ────────────────────────────────────────
await test('fallback produces sensible behavioral questions with valid shape', () => {
  const qs = generateQuestionsFallback({ job: JOB, count: 6 });
  assert.strictEqual(qs.length, 6);
  assert.ok(
    qs.every((q) => typeof q.text === 'string' && q.text.trim().length > 10),
    'every question has real text'
  );
  assert.ok(
    qs.every((q) => typeof q.competency === 'string' && q.competency),
    'every question names a competency'
  );
  assert.ok(
    qs.every((q) => ['jd', 'core', 'vault'].includes(q.source) || typeof q.source === 'string'),
    'every question carries a source'
  );
  // JD skills should surface as skill-based questions.
  assert.ok(qs.some((q) => q.source === 'jd'), 'at least one JD-derived question');
});

await test('fallback clamps count into [1,12]', () => {
  assert.strictEqual(generateQuestionsFallback({ job: JOB, count: 3 }).length, 3);
  assert.strictEqual(generateQuestionsFallback({ job: JOB, count: 99 }).length, 12);
  assert.strictEqual(generateQuestionsFallback({ job: JOB, count: 0 }).length, 1);
});

await test('fallback grounds a question in a provided vault item', () => {
  const items = [{ id: 'item-1', kind: 'project', title: 'Ranking revamp', content: 'Rebuilt the ranking model.' }];
  const qs = generateQuestionsFallback({ job: JOB, items, count: 6 });
  const grounded = qs.find((q) => q.source === 'item-1');
  assert.ok(grounded, 'a question cites the vault item id');
  assert.ok(grounded.text.includes('Ranking revamp'), 'grounded question references the item');
});

await test('fallback terminates and dedupes when questions collide', () => {
  // Two items with the SAME label produce identical question text; dedup drops
  // the duplicate. A prior round-robin whose termination counted duplicates
  // spun forever on exactly this input. Must return quickly, no repeats.
  const items = [
    { id: 'i1', kind: 'project', title: 'Same Project', content: 'x' },
    { id: 'i2', kind: 'project', title: 'Same Project', content: 'y' },
  ];
  const qs = generateQuestionsFallback({ job: JOB, items, count: 12 });
  const texts = qs.map((q) => q.text);
  assert.strictEqual(new Set(texts).size, texts.length, 'no duplicate question texts');
  assert.ok(qs.length > 0);
});

await test('fallback works with an empty/description-less job', () => {
  const qs = generateQuestionsFallback({ job: { title: '', company: '', description: '' }, count: 4 });
  assert.strictEqual(qs.length, 4);
  assert.ok(qs.every((q) => q.text.trim()), 'still produces real questions from core competencies');
});

// ── question_gen registry tool (no LLM → fallback) ──────────────────────────
await test('question_gen tool returns { questions } via the registry', async () => {
  const reg = createDefaultRegistry();
  const { questions } = await reg.run('question_gen', { job: JOB, count: 5 });
  assert.strictEqual(questions.length, 5);
  assert.ok(questions.every((q) => q.text && q.competency));
});

await test('question_gen tool rejects a missing required job (schema validation)', async () => {
  const reg = createDefaultRegistry();
  await assert.rejects(() => reg.run('question_gen', { count: 3 }), (e) => e.code === 'invalid_args');
});

await test('question_gen self-retrieves the vault when handed bare item ids', async () => {
  // A weak model passes the ids it saw from vault_search, not the objects. With
  // ctx.db present the tool must re-hydrate from the vault so grounding survives.
  const reg = createDefaultRegistry();
  const dbItems = [
    { id: 'v1', kind: 'experience', title: 'Recsys at scale', content: 'Built a PyTorch recommender.' },
  ];
  const ctx = {
    db: {
      async rpc(fn) {
        assert.strictEqual(fn, 'match_career_items');
        return { data: dbItems, error: null };
      },
    },
  };
  const { questions } = await reg.run('question_gen', { job: JOB, items: ['v1'], count: 6 }, ctx);
  assert.ok(questions.some((q) => q.source === 'v1'), 'a question is grounded in the re-hydrated item');
});

// ── Interview agent: deterministic path (no model, no db) ───────────────────
await test('generateInterviewQuestions runs deterministically with no model', async () => {
  const { questions, mode } = await generateInterviewQuestions(null, { job: JOB, count: 6 });
  assert.strictEqual(mode, 'deterministic');
  assert.strictEqual(questions.length, 6);
  assert.ok(questions.every((q) => q.text && q.competency));
});

// ── Interview agent: model-driven ReAct path (injected fake completer) ──────
function fakeDb(items) {
  return {
    async rpc(fn, args) {
      assert.strictEqual(fn, 'match_career_items');
      assert.ok(Array.isArray(args.query_embedding));
      return { data: items, error: null };
    },
  };
}

await test('generateInterviewQuestions drives the ReAct loop end to end (mode=agentic)', async () => {
  const items = [{ id: 'a', kind: 'experience', title: 'Recsys at scale', content: 'Built a PyTorch recommender.' }];
  // Fake model: retrieve the vault, then generate questions, then finish.
  const replies = [
    JSON.stringify({ thought: 'retrieve', tool: 'vault_search', args: { job: JOB } }),
    JSON.stringify({ thought: 'generate', tool: 'question_gen', args: { job: JOB, items, count: 5 } }),
    JSON.stringify({ thought: 'done', final: 'generated 5 questions' }),
  ];
  let i = 0;
  const complete = async () => replies[i++];

  const { questions, mode } = await generateInterviewQuestions(fakeDb(items), { job: JOB, count: 5, complete });
  assert.strictEqual(mode, 'agentic', 'the loop, not the deterministic path, produced these');
  assert.ok(questions.length > 0, 'questions came from the question_gen tool observation in the trace');
  assert.ok(questions.every((q) => q.text && q.competency), 'well-formed questions out of the loop');
});

await test('generateInterviewQuestions falls back when the loop never calls question_gen', async () => {
  // Model finishes immediately without generating — agent path attempted but
  // yields nothing, so we backstop with the deterministic tool call.
  const complete = async () => JSON.stringify({ thought: 'lazy', final: 'nothing' });
  const { questions, mode } = await generateInterviewQuestions(null, { job: JOB, count: 4, complete });
  assert.strictEqual(mode, 'agentic-fallback');
  assert.strictEqual(questions.length, 4);
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  process.exit(1);
}
