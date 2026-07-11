// Job-posting import — hermetic unit tests.
//
// No network, no env, no LLM: exercises the pure parser (parseJobPosting) against
// saved-HTML fixtures for the shapes real sites emit — schema.org JobPosting
// JSON-LD, Greenhouse, Lever, and a non-job page — plus the fetch wrapper's SSRF
// guard and graceful-miss path via an injected fake fetch.
// Run: node tests/jobimport.unit.test.js  (from server/)
import assert from 'node:assert';
import { parseJobPosting, fetchJobFromUrl, ImportError } from '../lib/jobimport.js';

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

// ── Fixtures ────────────────────────────────────────────────────────────────

const JSONLD_HTML = `<!doctype html><html><head><title>Careers</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"JobPosting","title":"Staff Data Engineer",
"hiringOrganization":{"@type":"Organization","name":"Acme Data"},
"description":"<p>Own our data platform.</p><ul><li>Build pipelines in Python &amp; Spark.</li><li>Deploy on AWS.</li></ul>"}
</script></head><body>...</body></html>`;

const GRAPH_HTML = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
{"@type":"WebSite","name":"Jobs"},
{"@type":"JobPosting","title":"Backend Engineer","hiringOrganization":{"name":"Northwind"},
"description":"Design APIs. Scale services."}]}
</script></head><body></body></html>`;

const GREENHOUSE_HTML = `<html><body>
<div class="app-title">Senior ML Engineer</div>
<span class="company-name">Northwind AI</span>
<div id="content"><p>Build recommendation systems in PyTorch.</p><p>Deploy models on AWS. Run A/B testing.</p></div>
</body></html>`;

// Modern Greenhouse: og:title, .job__title / .job__description (nested divs), no
// company in the markup — the org comes from the URL slug.
const GREENHOUSE_NEW_HTML = `<html><head><meta property="og:title" content="Account Executive - ASEAN"/></head>
<body><main class="main font-secondary job-post"><div class="job-post-container">
<h1 class="section-header job__title">Account Executive - ASEAN</h1>
<div class="job__location"><div>Singapore</div></div>
<div class="job__description body"><p>Drive revenue across the ASEAN region.</p>
<div><ul><li>Own the full sales cycle.</li><li>Partner with solutions engineering.</li></ul></div></div>
</div></main></body></html>`;

const LEVER_HTML = `<html><head><meta property="og:site_name" content="Lever Co"></head><body>
<div class="posting-headline"><h2>Product Designer</h2></div>
<div class="section-wrapper page-full-width"><p>Craft delightful flows. Partner with PMs and engineers to ship.</p></div>
</body></html>`;

const GENERIC_HTML = `<html><head>
<meta property="og:title" content="Growth Marketer">
<meta property="og:site_name" content="BrightCo">
<meta name="description" content="Own paid acquisition and lifecycle marketing for a fast-growing SaaS company.">
</head><body></body></html>`;

const NOT_A_JOB_HTML = `<html><head><title>Home</title></head><body><p>Welcome.</p></body></html>`;

// ── Parser: JSON-LD ─────────────────────────────────────────────────────────
await test('parses a schema.org JobPosting from JSON-LD (entities + HTML stripped)', () => {
  const p = parseJobPosting(JSONLD_HTML, 'https://acme.com/jobs/1');
  assert.strictEqual(p.title, 'Staff Data Engineer');
  assert.strictEqual(p.company, 'Acme Data');
  assert.ok(p.description.includes('Python & Spark'), 'entity decoded, tags stripped');
  assert.ok(!/[<>]/.test(p.description), 'no HTML tags leak into the description');
  assert.strictEqual(p.url, 'https://acme.com/jobs/1');
});

await test('finds the JobPosting inside an @graph array', () => {
  const p = parseJobPosting(GRAPH_HTML);
  assert.strictEqual(p.title, 'Backend Engineer');
  assert.strictEqual(p.company, 'Northwind');
});

// ── Parser: ATS selectors ───────────────────────────────────────────────────
await test('parses a Greenhouse page (app-title / company-name / #content)', () => {
  const p = parseJobPosting(GREENHOUSE_HTML);
  assert.strictEqual(p.title, 'Senior ML Engineer');
  assert.strictEqual(p.company, 'Northwind AI');
  assert.ok(p.description.includes('PyTorch') && p.description.includes('A/B testing'));
});

await test('parses a modern Greenhouse page (job__title/job__description, company from URL)', () => {
  const p = parseJobPosting(GREENHOUSE_NEW_HTML, 'https://boards.greenhouse.io/anthropic/jobs/5222180008');
  assert.strictEqual(p.title, 'Account Executive - ASEAN');
  assert.strictEqual(p.company, 'Anthropic', 'company derived from the URL slug');
  assert.ok(p.description.includes('full sales cycle'), 'nested description not truncated');
  assert.ok(p.description.includes('ASEAN region'));
});

await test('parses a Lever page (posting-headline / section-wrapper)', () => {
  const p = parseJobPosting(LEVER_HTML);
  assert.strictEqual(p.title, 'Product Designer');
  assert.strictEqual(p.company, 'Lever Co');
  assert.ok(p.description.includes('delightful flows'));
});

// ── Parser: generic + misses ────────────────────────────────────────────────
await test('falls back to og/meta tags on a generic page', () => {
  const p = parseJobPosting(GENERIC_HTML);
  assert.strictEqual(p.title, 'Growth Marketer');
  assert.strictEqual(p.company, 'BrightCo');
  assert.ok(p.description.includes('paid acquisition'));
});

await test('returns null for a page with no job signal', () => {
  assert.strictEqual(parseJobPosting(NOT_A_JOB_HTML), null);
});

await test('returns null for empty/garbage input', () => {
  assert.strictEqual(parseJobPosting(''), null);
  assert.strictEqual(parseJobPosting('   '), null);
  assert.strictEqual(parseJobPosting('<html>'), null);
});

await test('tolerates a malformed JSON-LD block and still parses the good one', () => {
  const html =
    '<script type="application/ld+json">{ broken json </script>' +
    '<script type="application/ld+json">{"@type":"JobPosting","title":"QA Lead","description":"Own quality across releases and tooling."}</script>';
  const p = parseJobPosting(html);
  assert.strictEqual(p.title, 'QA Lead');
});

// ── Fetch wrapper: SSRF guard ───────────────────────────────────────────────
const neverFetch = async () => {
  throw new Error('fetch should not have been called for a blocked URL');
};

for (const bad of [
  'http://localhost:3001/admin',
  'http://127.0.0.1/',
  'http://169.254.169.254/latest/meta-data/',
  'http://10.0.0.5/',
  'http://192.168.1.1/',
  'http://[::1]/',
  'file:///etc/passwd',
  'ftp://example.com/',
  'not a url',
]) {
  await test(`SSRF guard rejects ${bad}`, async () => {
    await assert.rejects(
      () => fetchJobFromUrl(bad, { fetchImpl: neverFetch }),
      (e) => e instanceof ImportError && e.status >= 400 && e.status < 500
    );
  });
}

// ── Fetch wrapper: happy path + graceful miss (injected fetch) ──────────────
function fakeResponse(html, { ok = true, status = 200, contentType = 'text/html' } = {}) {
  return {
    ok,
    status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    async text() {
      return html;
    },
  };
}

await test('fetchJobFromUrl returns a parsed posting on success', async () => {
  const fetchImpl = async () => fakeResponse(GREENHOUSE_HTML);
  const p = await fetchJobFromUrl('https://boards.greenhouse.io/acme/jobs/1', { fetchImpl });
  assert.strictEqual(p.title, 'Senior ML Engineer');
  assert.strictEqual(p.url, 'https://boards.greenhouse.io/acme/jobs/1');
});

await test('fetchJobFromUrl throws a 422 ImportError when the page has no posting', async () => {
  const fetchImpl = async () => fakeResponse(NOT_A_JOB_HTML);
  await assert.rejects(
    () => fetchJobFromUrl('https://example.com/', { fetchImpl }),
    (e) => e instanceof ImportError && e.status === 422 && e.code === 'no_posting'
  );
});

await test('fetchJobFromUrl rejects a non-HTML response', async () => {
  const fetchImpl = async () => fakeResponse('%PDF-1.4', { contentType: 'application/pdf' });
  await assert.rejects(
    () => fetchJobFromUrl('https://example.com/jd.pdf', { fetchImpl }),
    (e) => e instanceof ImportError && e.code === 'not_html'
  );
});

await test('fetchJobFromUrl maps an upstream error status to a 502 ImportError', async () => {
  const fetchImpl = async () => fakeResponse('nope', { ok: false, status: 404 });
  await assert.rejects(
    () => fetchJobFromUrl('https://example.com/gone', { fetchImpl }),
    (e) => e instanceof ImportError && e.status === 502
  );
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed.`);
if (fail > 0) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  process.exit(1);
}
