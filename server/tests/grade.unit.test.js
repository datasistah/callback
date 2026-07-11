// Interview answer grading — hermetic unit tests (Phase 5).
//
// No DB, no network, no env, no LLM: exercises the deterministic STAR rubric,
// the LLM parse/clamp path with an injected fake completer, its fallback on
// error, and the grade_answer registry tool. Proves the model-driven grading is
// real while the free/local/deterministic guarantee holds.
// Run: node tests/grade.unit.test.js  (from server/)
import assert from 'node:assert';
import { createDefaultRegistry } from '../harness/agent/index.js';
import { gradeAnswerFallback, gradeAnswerGrounded } from '../lib/grade.js';

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

const QUESTION = 'Tell me about a time you delivered measurable impact on a project.';

// A complete STAR answer: sets the scene, names the task, first-person actions,
// a quantified result — and echoes the question's content words (impact/project).
const STRONG_ANSWER =
  'When I was working on the checkout project at my last company, the team needed to ' +
  'reduce cart abandonment, which was hurting impact. My task was to lead the redesign. ' +
  'So I built a new one-page flow, I coordinated with design, and I ran an A/B test. ' +
  'As a result we increased conversion by 18% and reduced abandonment, delivering real impact.';

const WEAK_ANSWER = 'I think I did well on stuff.';

// ── Deterministic rubric (no LLM) ────────────────────────────────────────────
await test('fallback grades a complete STAR answer highly with the right shape', () => {
  const g = gradeAnswerFallback({ question: QUESTION, transcript: STRONG_ANSWER });
  assert.strictEqual(g.mode, 'deterministic');
  assert.ok(g.overall >= 70, `strong answer should score high, got ${g.overall}`);
  for (const k of ['situation', 'task', 'action', 'result']) {
    assert.ok(g.star[k] >= 0 && g.star[k] <= 25, `${k} in range`);
  }
  assert.ok(g.star.result > 0, 'detected a quantified result');
  assert.ok(g.star.action > 0, 'detected first-person actions');
  assert.ok(g.relevance > 0, 'echoes the question content words');
  assert.ok(typeof g.feedback === 'string' && g.feedback.length > 0, 'has feedback');
});

await test('fallback scores a strong answer strictly higher than a one-liner', () => {
  const strong = gradeAnswerFallback({ question: QUESTION, transcript: STRONG_ANSWER });
  const weak = gradeAnswerFallback({ question: QUESTION, transcript: WEAK_ANSWER });
  assert.ok(strong.overall > weak.overall, 'monotonic: complete STAR beats a vague one-liner');
});

await test('fallback flags a too-brief answer and scores it low', () => {
  const g = gradeAnswerFallback({ question: QUESTION, transcript: 'Yes I did.' });
  assert.ok(g.overall < 40, 'a trivial answer scores low');
  assert.match(g.feedback, /brief/i, 'feedback calls out the brevity');
});

await test('fallback handles an empty transcript without throwing', () => {
  const g = gradeAnswerFallback({ question: QUESTION, transcript: '' });
  assert.strictEqual(g.overall, 0);
  assert.strictEqual(g.star.situation + g.star.task + g.star.action + g.star.result, 0);
});

await test('fallback stays neutral on relevance when the question has no content words', () => {
  const g = gradeAnswerFallback({ question: 'Tell me about a time you did that.', transcript: STRONG_ANSWER });
  assert.strictEqual(g.relevance, 50, 'neutral rather than punishing a vague question');
});

// ── LLM path (injected fake completer) ───────────────────────────────────────
await test('gradeAnswerGrounded parses and clamps a clean JSON grade', async () => {
  const complete = async () =>
    JSON.stringify({
      overall: 88,
      star: { situation: 22, task: 20, action: 25, result: 24 },
      relevance: 90,
      feedback: 'Excellent, well-structured answer.',
    });
  const g = await gradeAnswerGrounded({ question: QUESTION, transcript: STRONG_ANSWER, complete });
  assert.strictEqual(g.mode, 'llm');
  assert.strictEqual(g.overall, 88);
  assert.strictEqual(g.star.action, 25);
  assert.strictEqual(g.relevance, 90);
});

await test('gradeAnswerGrounded clamps out-of-range component scores', async () => {
  const complete = async () =>
    JSON.stringify({ overall: 250, star: { situation: 99, task: -5, action: 25, result: 25 }, relevance: 500 });
  const g = await gradeAnswerGrounded({ question: QUESTION, transcript: STRONG_ANSWER, complete });
  assert.strictEqual(g.overall, 100, 'overall clamped to 100');
  assert.strictEqual(g.star.situation, 25, 'component clamped to 25');
  assert.strictEqual(g.star.task, 0, 'negative clamped to 0');
  assert.strictEqual(g.relevance, 100, 'relevance clamped to 100');
});

await test('gradeAnswerGrounded derives overall from components when the model omits it', async () => {
  const complete = async () =>
    JSON.stringify({ star: { situation: 20, task: 20, action: 20, result: 15 }, relevance: 70 });
  const g = await gradeAnswerGrounded({ question: QUESTION, transcript: STRONG_ANSWER, complete });
  assert.strictEqual(g.overall, 75, 'overall = sum of components when not given');
});

await test('gradeAnswerGrounded parses a grade wrapped in prose / code fences', async () => {
  const complete = async () =>
    'Here is the grade:\n```json\n{"overall":60,"star":{"situation":15,"task":15,"action":15,"result":15},"relevance":50,"feedback":"Solid."}\n```\nHope that helps!';
  const g = await gradeAnswerGrounded({ question: QUESTION, transcript: STRONG_ANSWER, complete });
  assert.strictEqual(g.overall, 60);
  assert.strictEqual(g.feedback, 'Solid.');
});

await test('gradeAnswerGrounded falls back to the rubric when the model throws', async () => {
  const throwing = async () => {
    throw new Error('OpenRouter 429: temporarily rate-limited upstream');
  };
  const g = await gradeAnswerGrounded({ question: QUESTION, transcript: STRONG_ANSWER, complete: throwing });
  assert.strictEqual(g.mode, 'deterministic', 'degraded to the deterministic rubric');
  assert.ok(g.overall > 0, 'still produced a grade');
});

await test('gradeAnswerGrounded falls back when the model returns unusable output', async () => {
  const complete = async () => 'I could not grade this, sorry!';
  const g = await gradeAnswerGrounded({ question: QUESTION, transcript: STRONG_ANSWER, complete });
  assert.strictEqual(g.mode, 'deterministic');
});

await test('gradeAnswerGrounded does not call the model for an empty transcript', async () => {
  let called = false;
  const complete = async () => {
    called = true;
    return '{}';
  };
  const g = await gradeAnswerGrounded({ question: QUESTION, transcript: '   ', complete });
  assert.strictEqual(called, false, 'no model call wasted on an empty answer');
  assert.strictEqual(g.mode, 'deterministic');
});

// ── grade_answer registry tool (no LLM → fallback) ──────────────────────────
await test('grade_answer tool returns a grade via the registry', async () => {
  const reg = createDefaultRegistry();
  const g = await reg.run('grade_answer', { question: QUESTION, transcript: STRONG_ANSWER });
  assert.ok(g.overall >= 0 && g.overall <= 100);
  assert.ok(g.star && typeof g.star.action === 'number');
  assert.strictEqual(g.mode, 'deterministic', 'no provider configured in tests → deterministic');
});

await test('grade_answer tool rejects a missing required transcript (schema validation)', async () => {
  const reg = createDefaultRegistry();
  await assert.rejects(() => reg.run('grade_answer', { question: QUESTION }), (e) => e.code === 'invalid_args');
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  process.exit(1);
}
