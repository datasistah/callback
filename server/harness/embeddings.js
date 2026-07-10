// Agent Harness — embedding layer for the Career Vault RAG.
//
// One interface (`embed`) for turning text into a fixed-dimension vector used
// for pgvector semantic retrieval and the groundedness check. Two backends:
//
//   1. Ollama (local, free) — nomic-embed-text, 768-d. Primary path.
//   2. Deterministic hashed fallback — signed random projection of the token
//      bag into 768 dims. No model, no network. Cosine similarity still tracks
//      token overlap, so retrieval + grounding behave sensibly with no LLM.
//
// This mirrors the course's Module 3 embed→retrieve pattern, ported to
// Node/pgvector. The column dimension is fixed (DIM) regardless of backend, so
// the two can coexist in one table — but a row embedded one way should be
// compared against queries embedded the same way (re-embed after switching).
import crypto from 'node:crypto';

export const DIM = 768;

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

// Ollama is a candidate embedder whenever the daemon is configured at all.
// Reachability is only checked at call time (the daemon may be down), and any
// failure falls back to the deterministic embedder so embed() never throws.
function ollamaEmbedEnabled() {
  return (
    process.env.OLLAMA_ENABLED === '1' ||
    Boolean(process.env.OLLAMA_MODEL) ||
    Boolean(process.env.OLLAMA_EMBED_MODEL)
  );
}

// Which embedder embed() will try first — for a status endpoint / debugging.
export function embeddingMode() {
  return ollamaEmbedEnabled() ? `ollama:${OLLAMA_EMBED_MODEL}` : 'deterministic';
}

function l2normalize(vec) {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

// Cosine similarity of two vectors. Inputs are L2-normalized (embed() always
// returns normalized vectors), so this is just a dot product in [-1, 1].
export function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Deterministic signed-hash embedding. Each token is hashed to a bucket and a
// sign; collisions are rare enough at 768 dims for short career facts. Shared
// tokens push two texts toward the same buckets → higher cosine similarity.
function deterministicEmbed(text) {
  const vec = new Array(DIM).fill(0);
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9+#.]+/g) || [];
  for (const tok of tokens) {
    if (tok.length < 2) continue;
    const h = crypto.createHash('md5').update(tok).digest();
    const idx = ((h[0] << 8) | h[1]) % DIM;
    const sign = h[2] & 1 ? 1 : -1;
    vec[idx] += sign;
  }
  return l2normalize(vec);
}

async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama embeddings ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const emb = data && data.embedding;
  if (!Array.isArray(emb) || emb.length === 0) {
    throw new Error('Ollama returned an empty embedding.');
  }
  // Guard the column dimension: a wrong-sized vector would corrupt the table,
  // so refuse it and let the caller fall back to the deterministic embedder.
  if (emb.length !== DIM) {
    throw new Error(
      `Ollama embed model returned ${emb.length} dims; expected ${DIM}. ` +
        `Use a ${DIM}-d model (e.g. nomic-embed-text) or re-run the migration for the new size.`
    );
  }
  return l2normalize(emb);
}

// Embed one string into a normalized DIM-length vector. Never throws: on any
// Ollama failure it falls back to the deterministic embedder, so the Career
// Vault always works — even with no model configured (locked decision).
export async function embed(text) {
  const input = String(text || '').slice(0, 8000);
  if (ollamaEmbedEnabled()) {
    try {
      return await ollamaEmbed(input);
    } catch (err) {
      console.warn(`embed: Ollama failed, using deterministic fallback (${err.message}).`);
    }
  }
  return deterministicEmbed(input);
}
