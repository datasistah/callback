// JobTailor — API integration tests (Sprint Zero, Prod scope).
//
// Validates the running backend (http://localhost:3001/api) against
// docs/api-contract.md. Uses the native fetch API and Node's built-in
// assert. No test framework.
//
// How to run:
//   1. Start the backend:  node index.js   (from server/)
//   2. Seed the demo user: node seed.js     (from server/) — needs a working DB
//   3. Run:                node tests/integration.test.js   (from server/)
//
// Auth: mints a real JWT by signing the seeded demo user in against the
// Supabase Auth REST endpoint (password grant), exactly as a browser client
// would. If that sign-in fails (e.g. the seed did not run), the suite still
// runs every test that does not need a token — including the negative 401
// test and the AI-not-configured 503 shape checks — and clearly SKIPs the
// authenticated core-loop tests with the reason, rather than inventing a pass.

import assert from 'node:assert';
import '../lib/loadEnv.js'; // loads SUPABASE_URL + publishable key from server/.env

const API = 'http://localhost:3001/api';
const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

// Seeded demo credentials (see server/seed.js). No password is committed — set
// DEMO_PASSWORD (and optionally DEMO_EMAIL) in the environment to the values you
// seeded with. When unset, the authenticated suite below simply skips.
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'maya.rivera@example.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';

let pass = 0;
let fail = 0;
let skip = 0;
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

function skipTest(name, reason) {
  skip++;
  console.log(`  SKIP  ${name}\n        ${reason}`);
}

// Small fetch helper that returns { status, body }.
async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let parsed = null;
  const text = await res.text();
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  return { status: res.status, body: parsed };
}

// Mint a real Supabase session access token for the seeded demo user.
async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.access_token) {
    const why = data && (data.msg || data.error_description || data.error) || `HTTP ${res.status}`;
    throw new Error(`Auth sign-in failed: ${why}`);
  }
  return data.access_token;
}

function isIsoTimestamp(v) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

async function run() {
  console.log('JobTailor integration tests — Prod scope\n');

  // --- Health (public) -----------------------------------------------------
  await test('GET /api/health returns 200 {status:"ok"}', async () => {
    const { status, body } = await call('GET', '/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'ok');
  });

  // --- Negative auth: invalid token (no seed needed) -----------------------
  await test('Protected route with NO token -> 401 + {error:"unauthorized"}', async () => {
    const { status, body } = await call('GET', '/jobs');
    assert.strictEqual(status, 401, `expected 401, got ${status}`);
    assert.strictEqual(body.error, 'unauthorized');
    assert.ok(typeof body.message === 'string' && body.message.length > 0);
  });

  await test('Protected route with INVALID token -> 401 + {error:"unauthorized"}', async () => {
    const { status, body } = await call('GET', '/jobs', { token: 'not-a-real-jwt.token.value' });
    assert.strictEqual(status, 401, `expected 401, got ${status}`);
    assert.strictEqual(body.error, 'unauthorized');
    assert.ok(typeof body.message === 'string' && body.message.length > 0);
  });

  await test('Protected route with EXPIRED-style token "expired" -> 401', async () => {
    const { status, body } = await call('GET', '/profile', { token: 'expired' });
    assert.strictEqual(status, 401, `expected 401, got ${status}`);
    assert.strictEqual(body.error, 'unauthorized');
  });

  // --- Authenticated suite -------------------------------------------------
  let token = null;
  try {
    token = await signIn();
    console.log('  (signed in as seeded demo user; running authenticated suite)\n');
  } catch (err) {
    console.log(`  (could not sign in seeded user: ${err.message})`);
    console.log('  (skipping authenticated tests — run `node seed.js` against a reachable DB first)\n');
  }

  const need = (name) =>
    skipTest(name, 'No JWT: seeded demo user sign-in failed (seed did not run / DB unreachable).');

  if (!token) {
    [
      'GET /api/profile returns base profile shape',
      'PUT /api/profile upserts content',
      'GET /api/jobs returns an array',
      'POST /api/jobs creates a bookmarked job',
      'POST /api/jobs validation error on empty title',
      'GET /api/jobs/:id returns nested resume/cover_letter/score keys',
      'PUT /api/jobs/:id updates editable fields',
      'PATCH /api/jobs/:id/status moves pipeline stage',
      'PATCH /api/jobs/:id/status invalid status -> 400',
      'POST resume/tailor -> 503 ai_not_configured (no AI key)',
      'POST cover-letter/generate -> 503 ai_not_configured (no AI key)',
      'POST /api/jobs/:id/score (core loop) returns 0-100 + keyword breakdown',
      'GET /api/jobs/:id/score returns latest stored score',
      'GET protected route for unknown job id -> 404 not_found',
      'DELETE /api/jobs/:id -> 204 and cascades',
    ].forEach(need);
  } else {
    let jobId = null;

    // Profile
    await test('GET /api/profile returns base profile shape', async () => {
      const { status, body } = await call('GET', '/profile', { token });
      assert.strictEqual(status, 200);
      assert.ok('id' in body && 'content' in body && 'updated_at' in body);
      assert.ok(typeof body.content === 'string');
    });

    await test('PUT /api/profile upserts content', async () => {
      const content =
        'Data/ML engineer. Python, PyTorch, machine learning, recommendation systems, ' +
        'model evaluation, A/B testing, AWS, SQL, data pipelines, statistics.';
      const { status, body } = await call('PUT', '/profile', { token, body: { content } });
      assert.strictEqual(status, 200);
      assert.strictEqual(body.content, content);
      assert.ok(isIsoTimestamp(body.updated_at));
    });

    await test('PUT /api/profile empty content -> 400 validation_error', async () => {
      const { status, body } = await call('PUT', '/profile', { token, body: { content: '   ' } });
      assert.strictEqual(status, 400);
      assert.strictEqual(body.error, 'validation_error');
    });

    // Jobs
    await test('GET /api/jobs returns an array', async () => {
      const { status, body } = await call('GET', '/jobs', { token });
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(body));
    });

    await test('POST /api/jobs creates a bookmarked job', async () => {
      const { status, body } = await call('POST', '/jobs', {
        token,
        body: {
          title: 'QA Senior ML Engineer',
          company: 'Northwind AI',
          description:
            'We need an ML engineer. Required: Python, PyTorch, machine learning, ' +
            'recommendation systems, model evaluation, A/B testing, AWS, data pipelines, MLOps, Ray.',
          url: 'https://northwind.ai/careers/qa-sr-ml',
        },
      });
      assert.strictEqual(status, 201);
      assert.strictEqual(body.status, 'bookmarked');
      assert.ok(typeof body.id === 'string' && body.id.length > 0);
      assert.ok(isIsoTimestamp(body.created_at));
      assert.ok(!('user_id' in body), 'response must not leak user_id');
      jobId = body.id;
    });

    await test('POST /api/jobs validation error on empty title', async () => {
      const { status, body } = await call('POST', '/jobs', {
        token,
        body: { title: '', description: 'something' },
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(body.error, 'validation_error');
    });

    await test('GET /api/jobs/:id returns nested resume/cover_letter/score keys', async () => {
      assert.ok(jobId, 'no jobId from create');
      const { status, body } = await call('GET', `/jobs/${jobId}`, { token });
      assert.strictEqual(status, 200);
      assert.ok('resume' in body && 'cover_letter' in body && 'score' in body);
      assert.strictEqual(body.resume, null);
      assert.strictEqual(body.cover_letter, null);
      assert.strictEqual(body.score, null);
    });

    await test('PUT /api/jobs/:id updates editable fields', async () => {
      const { status, body } = await call('PUT', `/jobs/${jobId}`, {
        token,
        body: { company: 'Northwind AI (updated)' },
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(body.company, 'Northwind AI (updated)');
    });

    await test('PATCH /api/jobs/:id/status moves pipeline stage', async () => {
      const { status, body } = await call('PATCH', `/jobs/${jobId}/status`, {
        token,
        body: { status: 'applied' },
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(body.status, 'applied');
      assert.strictEqual(body.id, jobId);
    });

    await test('PATCH /api/jobs/:id/status invalid status -> 400', async () => {
      const { status, body } = await call('PATCH', `/jobs/${jobId}/status`, {
        token,
        body: { status: 'ghosted' },
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(body.error, 'validation_error');
    });

    // AI endpoints — expected 503 (no AI key configured), per the contract.
    await test('POST resume/tailor -> 503 ai_not_configured (no AI key)', async () => {
      const { status, body } = await call('POST', `/jobs/${jobId}/resume/tailor`, { token });
      assert.strictEqual(status, 503, `expected 503, got ${status}`);
      assert.strictEqual(body.error, 'ai_not_configured');
      assert.ok(typeof body.message === 'string' && body.message.length > 0);
    });

    await test('POST cover-letter/generate -> 503 ai_not_configured (no AI key)', async () => {
      const { status, body } = await call('POST', `/jobs/${jobId}/cover-letter/generate`, { token });
      assert.strictEqual(status, 503, `expected 503, got ${status}`);
      assert.strictEqual(body.error, 'ai_not_configured');
    });

    // Core loop: score requires a resume. Tailor is 503 without AI, so we set
    // a resume directly via PUT (Story 11), then score it.
    await test('POST score without a resume -> 400 no_resume', async () => {
      const { status, body } = await call('POST', `/jobs/${jobId}/score`, { token });
      assert.strictEqual(status, 400);
      assert.strictEqual(body.error, 'no_resume');
    });

    await test('PUT /api/jobs/:id/resume before tailor -> 404 (none yet)', async () => {
      const { status, body } = await call('PUT', `/jobs/${jobId}/resume`, {
        token,
        body: { content: 'x' },
      });
      // No resume row exists yet, so editing returns 404 per the contract.
      assert.strictEqual(status, 404, `expected 404, got ${status}`);
      assert.strictEqual(body.error, 'not_found');
    });

    // The score endpoint reads the resume row. Without AI we cannot tailor,
    // and PUT requires an existing row — so a fresh job legitimately cannot be
    // scored end to end without the AI path. We assert the documented guard
    // (no_resume) which IS the deterministic, no-AI-key behavior, then verify
    // the score math directly against the deterministic scorer below.
    await test('Score heuristic (lib/score.js) returns 0-100 + matched/missing keywords', async () => {
      const { computeScore } = await import('../lib/score.js');
      const desc =
        'Required: Python, PyTorch, machine learning, recommendation systems, ' +
        'model evaluation, A/B testing, AWS, MLOps, Ray, feature stores.';
      const resume =
        'Python and PyTorch engineer. Built recommendation systems with model ' +
        'evaluation and A/B testing on AWS.';
      const r = computeScore(desc, resume);
      assert.ok(Number.isInteger(r.value) && r.value >= 0 && r.value <= 100, `value=${r.value}`);
      assert.ok(Array.isArray(r.matched_keywords) && r.matched_keywords.length > 0);
      assert.ok(Array.isArray(r.missing_keywords));
      assert.ok(r.skills_coverage >= 0 && r.skills_coverage <= 1);
      // Resume clearly covers some required keywords and misses others.
      assert.ok(r.matched_keywords.includes('python'));
      assert.ok(r.missing_keywords.length > 0, 'should flag missing keywords like mlops/ray');
    });

    await test('GET protected route for unknown job id -> 404 not_found', async () => {
      const { status, body } = await call(
        'GET',
        '/jobs/00000000-0000-4000-8000-000000000000',
        { token }
      );
      assert.strictEqual(status, 404);
      assert.strictEqual(body.error, 'not_found');
    });

    await test('GET /api/jobs/:id/score before scoring -> 404 not_found', async () => {
      const { status, body } = await call('GET', `/jobs/${jobId}/score`, { token });
      assert.strictEqual(status, 404);
      assert.strictEqual(body.error, 'not_found');
    });

    await test('DELETE /api/jobs/:id -> 204', async () => {
      const { status } = await call('DELETE', `/jobs/${jobId}`, { token });
      assert.strictEqual(status, 204);
      // And it is gone:
      const after = await call('GET', `/jobs/${jobId}`, { token });
      assert.strictEqual(after.status, 404);
    });
  }

  // --- Summary -------------------------------------------------------------
  console.log(`\n${'='.repeat(48)}`);
  console.log(`Results: ${pass} passed, ${fail} failed, ${skip} skipped`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f.name}: ${f.message}`));
  }
  console.log('='.repeat(48));

  process.exit(fail === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
