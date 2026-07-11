// Job-posting import: turn a job-posting URL into { title, company, description }
// so a candidate can add a job to the board from a link instead of copy-pasting.
//
// Two layers, kept separate so the hard part is trivially testable:
//   - parseJobPosting(html, url)  — PURE, deterministic, no network, no LLM.
//       Extraction priority: schema.org JobPosting JSON-LD (Greenhouse, Lever,
//       and most ATSes embed it) -> ATS-specific selectors -> generic og/title.
//   - fetchJobFromUrl(url)        — the network wrapper: an SSRF guard, a bounded
//       fetch, then parseJobPosting. This is the only part that touches the wire.
//
// No new dependencies and no model: parsing is regex + JSON.parse, so the whole
// feature honors the free/local guarantee (works with zero API keys).

// ── HTML helpers (dependency-free) ──────────────────────────────────────────

// Decode the handful of HTML entities that actually show up in job text.
function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return '';
      }
    });
}

// Strip tags to readable text: drop script/style wholesale, turn block breaks
// into newlines, collapse the rest, and decode entities. Good enough to feed the
// description into scoring / tailoring / question-gen.
function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(
    String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

// First <meta property|name="key"> content on the page.
function metaContent(html, key) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
    'i'
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]).trim();
  // content= may precede property= — try the reversed attribute order too.
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    'i'
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]).trim() : '';
}

// ── Layer 1: schema.org JobPosting JSON-LD ──────────────────────────────────

// Yield every JSON value found in <script type="application/ld+json"> blocks,
// tolerating the shapes real sites emit: a bare object, an array, or an
// @graph wrapper. Malformed JSON in one block never sinks the others.
function* jsonLdNodes(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let parsed;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        stack.push(...node);
      } else if (node && typeof node === 'object') {
        yield node;
        if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
      }
    }
  }
}

function isJobPosting(node) {
  const t = node && node['@type'];
  return Array.isArray(t) ? t.includes('JobPosting') : t === 'JobPosting';
}

function fromJsonLd(html) {
  for (const node of jsonLdNodes(html)) {
    if (!isJobPosting(node)) continue;
    const org = node.hiringOrganization;
    const company =
      (org && typeof org === 'object' ? org.name : typeof org === 'string' ? org : '') || '';
    const title = typeof node.title === 'string' ? node.title : '';
    const description = htmlToText(node.description || '');
    if (title || description) {
      return { title: decodeEntities(title).trim(), company: String(company).trim(), description };
    }
  }
  return null;
}

// ── Layer 2: ATS-specific selectors (JSON-LD-less pages) ────────────────────

// Text content of the first element carrying a given class, e.g. class="job__title".
function textByClass(html, className) {
  const re = new RegExp(
    `<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/`,
    'i'
  );
  const m = html.match(re);
  return m ? htmlToText(m[1]) : '';
}

// Inner HTML of the first div/section/article matching an opening-tag regex,
// with BALANCED nesting: walks same-type open/close tags so a container full of
// nested <div>s isn't truncated at the first </div> (as a non-greedy match would
// be). Returns '' when no opening tag matches.
function innerHtmlByOpen(html, openRe) {
  const m = openRe.exec(html);
  if (!m) return '';
  const tag = m[1].toLowerCase();
  const start = m.index + m[0].length;
  const tagRe = new RegExp(`<(/?)(?:${tag})\\b[^>]*>`, 'gi');
  tagRe.lastIndex = start;
  let depth = 1;
  let mm;
  while ((mm = tagRe.exec(html))) {
    if (mm[1] === '/') {
      depth--;
      if (depth === 0) return html.slice(start, mm.index);
    } else {
      depth++;
    }
  }
  return html.slice(start); // unbalanced markup — take the remainder
}

function innerHtmlByClass(html, className) {
  return innerHtmlByOpen(
    html,
    new RegExp(`<(div|section|article)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'i')
  );
}

function innerHtmlById(html, id) {
  return innerHtmlByOpen(html, new RegExp(`<(div|section|article)[^>]*id=["']${id}["'][^>]*>`, 'i'));
}

// Company name from a known ATS URL path, used when the page markup doesn't carry
// one (modern Greenhouse omits it): boards.greenhouse.io/<company>/jobs/… and
// jobs.lever.co/<company>/<id> both put the org slug as the first path segment.
function companyFromAtsUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!/greenhouse\.io$|lever\.co$/.test(host)) return '';
    const slug = u.pathname.split('/').filter(Boolean)[0] || '';
    if (!slug) return '';
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return '';
  }
}

function fromGreenhouse(html, url) {
  // Greenhouse markup, old and new: title in .job__title (new) or .app-title
  // (old) or og:title; JD in .job__description (new) or #content (old). The org
  // isn't in the markup on new boards, so fall back to the URL slug.
  const title = metaContent(html, 'og:title') || textByClass(html, 'job__title') || textByClass(html, 'app-title');
  const body = innerHtmlByClass(html, 'job__description') || innerHtmlById(html, 'content');
  if (!title || !body) return null;
  return {
    title,
    company: textByClass(html, 'company-name') || companyFromAtsUrl(url),
    description: htmlToText(body),
  };
}

function fromLever(html, url) {
  // jobs.lever.co: .posting-headline holds the title; body in .section-wrapper.
  const headline = html.match(
    /class=["'][^"']*\bposting-headline\b[^"']*["'][^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i
  );
  const title = headline ? htmlToText(headline[1]) : '';
  if (!title) return null;
  return {
    title,
    company: metaContent(html, 'og:site_name') || companyFromAtsUrl(url),
    description: htmlToText(innerHtmlByClass(html, 'section-wrapper')),
  };
}

// ── Layer 3: generic fallback ───────────────────────────────────────────────

function fromGeneric(html) {
  const title =
    metaContent(html, 'og:title') ||
    htmlToText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const company = metaContent(html, 'og:site_name');
  const description =
    metaContent(html, 'og:description') ||
    metaContent(html, 'description') ||
    htmlToText((html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i) || [])[1] || '');
  if (!title && !description) return null;
  return { title, company, description };
}

// ── Public: pure parser ─────────────────────────────────────────────────────

// Parse a job posting out of raw HTML. Deterministic; returns
// { title, company, description } or null when nothing usable is found. `url`
// is accepted so callers can route by host later, but extraction never depends
// on the network. A result is only returned when it has a title OR a
// non-trivial description — a bare page title alone isn't a job.
export function parseJobPosting(html, url = '') {
  const raw = String(html || '');
  if (!raw.trim()) return null;

  // Structured sources (JSON-LD JobPosting, Greenhouse, Lever) positively
  // identify the page AS a job, so a title alone is enough. The generic
  // og/<title> guess is not self-identifying, so it must carry a real
  // description to avoid mistaking a homepage's <title> for a posting.
  const structured = fromJsonLd(raw) || fromGreenhouse(raw, url) || fromLever(raw, url);
  const candidate = structured || fromGeneric(raw);
  if (!candidate) return null;

  const title = (candidate.title || '').trim();
  const company = (candidate.company || '').trim();
  const description = (candidate.description || '').trim();

  if (structured) {
    if (!title && description.length < 40) return null;
  } else {
    // Generic guess: demand substance before we call it a job.
    if (description.length < 40) return null;
  }

  return { title, company, description, url: typeof url === 'string' ? url : '' };
}

// ── Network wrapper: SSRF guard + bounded fetch ─────────────────────────────

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const FETCH_TIMEOUT_MS = 10_000;

export class ImportError extends Error {
  constructor(message, { status = 422, code = 'import_failed' } = {}) {
    super(message);
    this.name = 'ImportError';
    this.status = status;
    this.code = code;
  }
}

// Reject anything that isn't a public http/https URL. Blocks loopback, private,
// link-local, and cloud-metadata addresses to keep a user-supplied URL from
// being aimed at internal services (SSRF). Hostname-based: a DNS name that
// resolves to a private IP is a residual risk we accept for this demo, but the
// obvious literal-IP and localhost vectors are closed.
function assertPublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new ImportError('That doesn\'t look like a valid link.', { status: 400, code: 'bad_url' });
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ImportError('Only http(s) links can be imported.', { status: 400, code: 'bad_scheme' });
  }
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new ImportError('That link points to a private address.', { status: 400, code: 'blocked_host' });
  }
  // IPv4 literal in a private / loopback / link-local / metadata range.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const priv =
      a === 127 ||
      a === 10 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254); // link-local incl. 169.254.169.254 metadata
    if (priv) throw new ImportError('That link points to a private address.', { status: 400, code: 'blocked_host' });
  }
  // IPv6 loopback / unique-local / link-local literals.
  if (host === '::1' || /^\[?(::1|fc00|fd[0-9a-f]{2}|fe80)/i.test(host)) {
    throw new ImportError('That link points to a private address.', { status: 400, code: 'blocked_host' });
  }
  return u;
}

// Fetch a job-posting URL and parse it. Never throws a raw network error to the
// caller: everything degrades to an ImportError with a user-facing message and a
// sensible status, so the route can always return clean JSON and the UI can fall
// back to manual entry. `fetchImpl` is injectable for tests.
export async function fetchJobFromUrl(url, { fetchImpl = fetch } = {}) {
  const u = assertPublicHttpUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(u.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // A real UA — some ATS pages return a stub to unknown clients.
        'user-agent':
          'Mozilla/5.0 (compatible; CallbackBot/1.0; +https://github.com/datasistah/callback)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'That link took too long to load.' : 'Couldn\'t reach that link.';
    throw new ImportError(msg, { status: 502, code: 'fetch_failed' });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ImportError(`That link returned an error (${res.status}).`, { status: 502, code: 'fetch_status' });
  }
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type && !type.includes('html') && !type.includes('xml')) {
    throw new ImportError('That link isn\'t a web page we can read.', { status: 415, code: 'not_html' });
  }

  const html = await readCapped(res);
  const parsed = parseJobPosting(html, u.toString());
  if (!parsed) {
    throw new ImportError(
      'Couldn\'t read a job posting from that link — paste the details manually.',
      { status: 422, code: 'no_posting' }
    );
  }
  return parsed;
}

// Read the response body but stop once we've seen MAX_BYTES, so a giant or
// endless page can't exhaust memory. Falls back to res.text() when the body
// isn't a readable stream (e.g. a test stub).
async function readCapped(res) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    out += decoder.decode(value, { stream: true });
    if (total >= MAX_BYTES) {
      try {
        await reader.cancel();
      } catch {
        /* no-op */
      }
      break;
    }
  }
  return out;
}
