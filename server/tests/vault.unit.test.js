// Career Vault — hermetic unit tests for the RAG logic (Phase 1).
//
// No DB, no network, no env: exercises the deterministic embedder + grounding
// + chunking + the mock tailoring orchestration with a fake Supabase client.
// Run: node tests/vault.unit.test.js  (from server/)
import assert from 'node:assert';
import { embed, cosineSim, DIM } from '../harness/embeddings.js';
import { chunkProfileIntoItems, verifyGrounding } from '../lib/vault.js';
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

// ── Deterministic embedder ────────────────────────────────────────────────
await test('embed is deterministic, DIM-length, and L2-normalized', async () => {
  const a = await embed('recommendation systems in PyTorch');
  const b = await embed('recommendation systems in PyTorch');
  assert.strictEqual(a.length, DIM, 'wrong dimension');
  assert.deepStrictEqual(a, b, 'not deterministic');
  const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6, `not normalized (norm=${norm})`);
});

await test('cosine similarity ranks related text above unrelated', async () => {
  const q = await embed('deep learning recommendation systems with PyTorch');
  const near = await embed('built a PyTorch recommendation system');
  const far = await embed('baked sourdough bread on the weekend');
  const simNear = cosineSim(q, near);
  const simFar = cosineSim(q, far);
  assert.ok(simNear > simFar, `expected near(${simNear}) > far(${simFar})`);
});

// ── Profile chunking ──────────────────────────────────────────────────────
await test('chunkProfileIntoItems splits bullets and skills into atomic items', () => {
  const profile = [
    'SUMMARY',
    'Senior ML engineer shipping recommendation systems.',
    'EXPERIENCE',
    'Northstar Data — Senior ML Engineer (2021–present)',
    '- Built a PyTorch recommender serving 4M users.',
    '- Ran weekly A/B tests.',
    'SKILLS',
    'Python, PyTorch, AWS',
  ].join('\n');

  const items = chunkProfileIntoItems(profile);
  const experience = items.filter((i) => i.kind === 'experience');
  const skills = items.filter((i) => i.kind === 'skill');
  const summary = items.filter((i) => i.kind === 'achievement');

  assert.strictEqual(experience.length, 2, 'expected 2 experience bullets');
  assert.strictEqual(skills.length, 3, 'expected 3 skills');
  assert.strictEqual(summary.length, 1, 'expected 1 summary item');
  // Bullets are tagged with the role heading above them.
  assert.ok(experience[0].title.includes('Northstar'), 'bullet not tagged with role heading');
});

// ── Groundedness check ────────────────────────────────────────────────────
await test('verifyGrounding: cited-and-matching → grounded; uncited → flagged', async () => {
  const items = [
    { id: 'i1', title: 'Northstar', content: 'Built a PyTorch recommendation system serving 4M users.' },
  ];
  const bullets = [
    { text: 'Built a PyTorch recommendation system serving 4M users.', source_id: 'i1' },
    { text: 'Fluent in seven languages and a competitive chess player.', source_id: null },
  ];
  const prov = await verifyGrounding(bullets, items);
  assert.strictEqual(prov[0].grounded, true, 'matching cited bullet should be grounded');
  assert.strictEqual(prov[0].source_id, 'i1');
  assert.ok(prov[0].similarity >= 0.3, `similarity too low: ${prov[0].similarity}`);
  assert.strictEqual(prov[1].grounded, false, 'uncited bullet should be flagged');
  assert.strictEqual(prov[1].source_id, null);
});

await test('verifyGrounding: a source_id that was not retrieved is dropped to unsupported', async () => {
  const items = [{ id: 'i1', title: 'A', content: 'Python and PyTorch for production ML.' }];
  const bullets = [{ text: 'Something about Rust.', source_id: 'i-nope' }];
  const prov = await verifyGrounding(bullets, items);
  assert.strictEqual(prov[0].grounded, false);
  assert.strictEqual(prov[0].source_id, null);
});

// ── Full mock tailoring orchestration (fake Supabase client) ──────────────
function fakeDb(items) {
  return {
    async rpc(fn, args) {
      assert.strictEqual(fn, 'match_career_items');
      assert.ok(Array.isArray(args.query_embedding), 'query_embedding must be an array');
      return { data: items, error: null };
    },
  };
}

await test('buildTailoredResume (no LLM) grounds every bullet in a retrieved item', async () => {
  const items = [
    { id: 'a', kind: 'experience', title: 'Northstar', content: 'Built a PyTorch recommender serving 4M users.', source: 'Northstar' },
    { id: 'b', kind: 'skill', title: 'AWS', content: 'Deploying models on AWS (ECS, Lambda).', source: 'SKILLS' },
  ];
  const job = { title: 'Senior ML Engineer', company: 'Northwind AI', description: 'PyTorch, recommendation systems, AWS.' };

  const { content, provenance, grounded } = await buildTailoredResume(fakeDb(items), {
    profile: 'Maya Rivera — Senior ML Engineer',
    job,
  });

  assert.strictEqual(grounded, true, 'vault-driven tailoring should report grounded=true');
  assert.strictEqual(provenance.length, 2, 'one provenance entry per retrieved item');
  assert.ok(provenance.every((p) => p.grounded), 'mock path bullets must all be grounded');
  assert.ok(provenance.every((p) => p.source_id), 'every bullet must cite a source');
  assert.ok(content.includes('grounded in your Career Vault'), 'resume text missing grounded section');
});

await test('buildTailoredResume with an empty vault falls back (no provenance)', async () => {
  const { provenance, grounded } = await buildTailoredResume(fakeDb([]), {
    profile: 'Maya Rivera — Senior ML Engineer\n- Built recommenders.',
    job: { title: 'ML Engineer', company: 'X', description: 'ML.' },
  });
  assert.strictEqual(grounded, false, 'empty vault should use the legacy path');
  assert.deepStrictEqual(provenance, [], 'legacy path has no provenance');
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  process.exit(1);
}
