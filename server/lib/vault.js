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

// Split a free-text base résumé/profile into atomic career items, à la the
// Module 3 chunking pattern but résumé-aware: bullet lines become experience
// items tagged with the role heading above them; the SKILLS list fans out into
// one item per skill; SUMMARY lines become achievement items. Used by
// POST /api/vault/build-from-profile so a user can seed their vault in one tap.
export function chunkProfileIntoItems(profile) {
  const lines = String(profile || '').split('\n');
  const items = [];
  let section = '';
  let heading = '';

  const isSectionHeader = (line) =>
    line.length <= 40 && /[A-Z]/.test(line) && line === line.toUpperCase();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (isSectionHeader(line)) {
      section = line;
      heading = '';
      continue;
    }

    const bullet = /^[-•*]\s+/.test(line);
    if (bullet) {
      const content = line.replace(/^[-•*]\s+/, '');
      items.push({
        kind: 'experience',
        title: heading || section || 'Experience',
        content,
        source: heading || section || 'profile',
      });
    } else if (section === 'SKILLS') {
      line
        .split(/[,·]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((skill) =>
          items.push({ kind: 'skill', title: skill, content: skill, source: 'SKILLS' })
        );
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
