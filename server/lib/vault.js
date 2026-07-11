// Career Vault helpers — retrieval, chunking, and the groundedness check.
//
// These are the RAG plumbing shared by the vault routes and the tailoring
// flow. Retrieval goes through the pgvector `match_career_items` RPC (RLS
// scoped to the caller); grounding compares a generated bullet against the
// career item it claims to draw from.
import { embed, cosineSim } from '../harness/embeddings.js';

// A bullet counts as "grounded" when its cosine similarity to the cited career
// item clears this bar. Tunable per embedder (deterministic vs. Ollama).
export function groundednessThreshold() {
  const raw = Number(process.env.GROUNDEDNESS_THRESHOLD);
  return Number.isFinite(raw) ? raw : 0.3;
}

// Build the text we embed for a career item: title + content, so a one-line
// skill ("AWS") still carries a little context.
export function itemText(item) {
  return [item.title, item.content].filter(Boolean).join(' — ');
}

// Embed a career item's text. Exported so the write path (routes/seed) and the
// grounding check produce identical vectors for the same item.
export function embedItem(item) {
  return embed(itemText(item));
}

// Retrieve the top-K career items most relevant to a job via pgvector.
// Returns [] when the vault is empty (the caller then uses the legacy,
// non-grounded tailoring path). `db` is a user-scoped Supabase client, so the
// RPC only ever matches the caller's own vault.
export async function retrieveCareerItems(db, { job, matchCount = 6 }) {
  const query = [job.title, job.company, job.description].filter(Boolean).join('\n');
  const queryEmbedding = await embed(query);
  const { data, error } = await db.rpc('match_career_items', {
    query_embedding: queryEmbedding,
    match_count: matchCount,
  });
  if (error) throw error;
  return data || [];
}

// Verify each generated bullet against the career item it cites. A bullet is
// grounded when (a) its source_id is one of the retrieved items and (b) the
// bullet is semantically close to that item's text. Everything else is flagged
// unsupported — the provenance signal the UI surfaces.
//
// Returns provenance entries: { text, source_id, source_title, grounded, similarity }.
export async function verifyGrounding(bullets, items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = [];
  for (const b of bullets) {
    const item = b.source_id ? byId.get(b.source_id) : null;
    let grounded = false;
    let similarity = 0;
    if (item) {
      const [bulletVec, itemVec] = await Promise.all([embed(b.text), embedItem(item)]);
      similarity = cosineSim(bulletVec, itemVec);
      grounded = similarity >= groundednessThreshold();
    }
    out.push({
      text: b.text,
      source_id: item ? item.id : null,
      source_title: item ? item.title || item.kind : null,
      grounded,
      similarity: Math.round(similarity * 1000) / 1000,
    });
  }
  return out;
}

// The bullet glyphs real résumés actually use — PDFs and Word docs are full of
// ● ▪ ◦ ‣ · and en/em dashes, not just the ASCII "- • *" the old regex knew. A
// leading one (with following whitespace) marks a bullet line.
const BULLET_CHARS = '-–—•●▪◦‣∙·*»›';
const BULLET_RE = new RegExp(`^[${BULLET_CHARS}]\\s+`);
const BULLET_ONLY_RE = new RegExp(`^[${BULLET_CHARS}]\\s*$`);

// Canonical résumé sections. Maps the many ways a section gets labelled onto a
// single key so the SKILLS / SUMMARY special-casing fires regardless of wording
// or capitalization ("Technical Skills", "Professional Summary", "Objective").
const SECTION_ALIASES = {
  experience: 'EXPERIENCE',
  'work experience': 'EXPERIENCE',
  'professional experience': 'EXPERIENCE',
  employment: 'EXPERIENCE',
  'employment history': 'EXPERIENCE',
  education: 'EDUCATION',
  skills: 'SKILLS',
  'technical skills': 'SKILLS',
  'core skills': 'SKILLS',
  technologies: 'SKILLS',
  competencies: 'SKILLS',
  projects: 'PROJECTS',
  'personal projects': 'PROJECTS',
  summary: 'SUMMARY',
  'professional summary': 'SUMMARY',
  objective: 'SUMMARY',
};

// Decide whether a line is a section header, and if so return its canonical key.
// A line qualifies when it's a known section name (any case) OR a short ALL-CAPS
// line (the original heuristic, for custom headers like "PATENTS"). Returns null
// for ordinary content lines.
function canonicalSection(line) {
  const bare = line.replace(/:\s*$/, '').trim();
  const key = bare.toLowerCase();
  if (SECTION_ALIASES[key]) return SECTION_ALIASES[key];
  const allCaps = bare.length <= 40 && /[A-Z]/.test(bare) && bare === bare.toUpperCase();
  return allCaps ? bare : null;
}

// Fan a skills line out into individual skills. Drops a leading category label
// ("Languages: Python, SQL" → Python, SQL) and splits on the usual separators —
// but never on "/", so "S3/ECS" and "CI/CD" survive intact.
// Split on any of `seps`, but only at the top level — separators inside (...)
// or [...] are kept, so "AWS (S3, ECS, SageMaker)" stays a single skill.
function splitTopLevel(str, seps) {
  const out = [];
  let buf = '';
  let depth = 0;
  for (const ch of str) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && seps.includes(ch)) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}

function splitSkills(line) {
  // Strip a leading category label up to its colon ("ML / Modeling: PyTorch, …"
  // → "PyTorch, …"). Matching only the prefix before ":" means the "/" allowed
  // here can't affect values like "S3/ECS" further down the line.
  const noLabel = line.replace(/^[A-Za-z][\w &/+.-]{0,30}:\s+/, '');
  return splitTopLevel(noLabel, ',;·•|')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Split a free-text base résumé/profile into atomic career items, à la the
// Module 3 chunking pattern but résumé-aware: bullet lines become experience
// items tagged with the role heading above them; the SKILLS list fans out into
// one item per skill; SUMMARY lines become achievement items. Tolerant of the
// bullet glyphs and heading styles real PDF/Word résumés use. Used by
// POST /api/vault/build-from-profile so a user can seed their vault in one tap.
export function chunkProfileIntoItems(profile) {
  const lines = String(profile || '').split('\n');
  const items = [];
  let section = '';
  let heading = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // A stray bullet glyph on its own line (PDF layout artifact) isn't a heading.
    if (BULLET_ONLY_RE.test(line)) continue;

    const sec = canonicalSection(line);
    if (sec) {
      section = sec;
      heading = '';
      continue;
    }

    const isBullet = BULLET_RE.test(line);
    const text = isBullet ? line.replace(BULLET_RE, '') : line;

    if (section === 'SKILLS') {
      // Skills — bulleted or comma-separated, with or without a category label.
      splitSkills(text).forEach((skill) =>
        items.push({ kind: 'skill', title: skill, content: skill, source: 'SKILLS' })
      );
    } else if (isBullet) {
      items.push({
        kind: 'experience',
        title: heading || section || 'Experience',
        content: text,
        source: heading || section || 'profile',
      });
    } else if (section === 'SUMMARY') {
      items.push({ kind: 'achievement', title: 'Summary', content: line, source: 'SUMMARY' });
    } else {
      // A non-bullet, non-header line inside an experience section is a role
      // heading (e.g. "Northstar Data — Senior ML Engineer (2021–present)").
      heading = line;
    }
  }

  return items;
}
