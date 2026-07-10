// /api/vault — the Career Vault: the candidate's longitudinal, atomic career
// facts. Each item carries a pgvector embedding (computed on write) used for
// provenance-aware, RAG-grounded tailoring.
//
// Every handler scopes by req.user.id and runs under the caller's RLS.
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { userClient } from '../supabase.js';
import { sendError, serverError } from '../lib/respond.js';
import { embedItem, retrieveCareerItems, chunkProfileIntoItems } from '../lib/vault.js';

const router = express.Router();
router.use(requireAuth);

const VALID_KINDS = ['experience', 'project', 'achievement', 'skill', 'education'];

// Columns returned to clients — never the raw embedding vector.
const ITEM_COLS = 'id, kind, title, content, source, created_at, updated_at';

// pgvector wants a bracketed literal like "[0.1,0.2,...]". supabase-js
// serializes a JS array to exactly that, but stringify explicitly so intent is
// clear and it survives both insert and RPC paths.
function toVector(embedding) {
  return JSON.stringify(embedding);
}

function validItemBody(body) {
  const { kind, content } = body || {};
  if (typeof content !== 'string' || content.trim() === '') {
    return 'content is required.';
  }
  if (kind !== undefined && !VALID_KINDS.includes(kind)) {
    return `kind must be one of ${VALID_KINDS.join(', ')}.`;
  }
  return null;
}

// GET /api/vault — list the user's career items (newest first).
router.get('/', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const { data, error } = await db
      .from('career_items')
      .select(ITEM_COLS)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/vault:', error.message);
      return serverError(res);
    }
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('GET /api/vault:', err.message);
    return serverError(res);
  }
});

// POST /api/vault — create a career item (embeds on write).
router.post('/', async (req, res) => {
  try {
    const problem = validItemBody(req.body);
    if (problem) return sendError(res, 400, 'validation_error', problem);

    const { kind, title, content, source } = req.body;
    const item = {
      kind: kind || 'experience',
      title: typeof title === 'string' ? title : '',
      content: content.trim(),
      source: typeof source === 'string' && source.trim() ? source.trim() : null,
    };
    const embedding = await embedItem(item);

    const db = userClient(req.accessToken);
    const { data, error } = await db
      .from('career_items')
      .insert({ user_id: req.user.id, ...item, embedding: toVector(embedding) })
      .select(ITEM_COLS)
      .single();

    if (error) {
      console.error('POST /api/vault:', error.message);
      return serverError(res);
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/vault:', err.message);
    return serverError(res);
  }
});

// PUT /api/vault/:id — update a career item (re-embeds when the text changes).
router.put('/:id', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const existing = await db
      .from('career_items')
      .select('id, kind, title, content, source')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (existing.error) {
      console.error('PUT /api/vault lookup:', existing.error.message);
      return serverError(res);
    }
    if (!existing.data) return sendError(res, 404, 'not_found', 'Career item not found.');

    const { kind, title, content, source } = req.body || {};
    if (kind !== undefined && !VALID_KINDS.includes(kind)) {
      return sendError(res, 400, 'validation_error', `kind must be one of ${VALID_KINDS.join(', ')}.`);
    }
    if (content !== undefined && (typeof content !== 'string' || content.trim() === '')) {
      return sendError(res, 400, 'validation_error', 'content cannot be empty.');
    }

    const merged = {
      kind: kind !== undefined ? kind : existing.data.kind,
      title: title !== undefined ? (typeof title === 'string' ? title : '') : existing.data.title,
      content: content !== undefined ? content.trim() : existing.data.content,
      source:
        source !== undefined
          ? typeof source === 'string' && source.trim()
            ? source.trim()
            : null
          : existing.data.source,
    };

    const updates = { ...merged, updated_at: new Date().toISOString() };
    // Re-embed only when the embedded text (title/content) actually changed.
    if (merged.title !== existing.data.title || merged.content !== existing.data.content) {
      updates.embedding = toVector(await embedItem(merged));
    }

    const { data, error } = await db
      .from('career_items')
      .update(updates)
      .eq('id', existing.data.id)
      .eq('user_id', req.user.id)
      .select(ITEM_COLS)
      .single();

    if (error) {
      console.error('PUT /api/vault save:', error.message);
      return serverError(res);
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('PUT /api/vault/:id:', err.message);
    return serverError(res);
  }
});

// DELETE /api/vault/:id.
router.delete('/:id', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const existing = await db
      .from('career_items')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (existing.error) {
      console.error('DELETE /api/vault lookup:', existing.error.message);
      return serverError(res);
    }
    if (!existing.data) return sendError(res, 404, 'not_found', 'Career item not found.');

    const { error } = await db
      .from('career_items')
      .delete()
      .eq('id', existing.data.id)
      .eq('user_id', req.user.id);

    if (error) {
      console.error('DELETE /api/vault:', error.message);
      return serverError(res);
    }
    return res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/vault/:id:', err.message);
    return serverError(res);
  }
});

// POST /api/vault/build-from-profile — one-tap vault seeding: chunk the user's
// base profile into atomic items and insert them (each embedded). Returns the
// created items. Additive — it never deletes existing vault entries.
router.post('/build-from-profile', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const profileRes = await db
      .from('profiles')
      .select('content')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (profileRes.error) {
      console.error('build-from-profile profile:', profileRes.error.message);
      return serverError(res);
    }
    const content = profileRes.data && profileRes.data.content;
    if (!content || !content.trim()) {
      return sendError(res, 400, 'no_profile', 'Add your base profile before building a vault.');
    }

    const chunks = chunkProfileIntoItems(content);
    if (chunks.length === 0) {
      return sendError(res, 422, 'no_items', 'Could not derive any career items from your profile.');
    }

    const rows = [];
    for (const item of chunks) {
      const embedding = await embedItem(item);
      rows.push({ user_id: req.user.id, ...item, embedding: toVector(embedding) });
    }

    const { data, error } = await db.from('career_items').insert(rows).select(ITEM_COLS);
    if (error) {
      console.error('build-from-profile insert:', error.message);
      return serverError(res);
    }
    return res.status(201).json(data || []);
  } catch (err) {
    console.error('POST /api/vault/build-from-profile:', err.message);
    return serverError(res);
  }
});

// POST /api/vault/search — retrieve the vault items most relevant to a job-like
// query. Exposes the retrieval step for debugging and the (future) UI preview.
// Body: { title?, company?, description } OR { query }.
router.post('/search', async (req, res) => {
  try {
    const { title, company, description, query } = req.body || {};
    const job = {
      title: title || '',
      company: company || '',
      description: description || query || '',
    };
    if (!job.title && !job.description) {
      return sendError(res, 400, 'validation_error', 'Provide a description or query to search against.');
    }

    const db = userClient(req.accessToken);
    const items = await retrieveCareerItems(db, { job });
    return res.status(200).json(items);
  } catch (err) {
    console.error('POST /api/vault/search:', err.message);
    return serverError(res);
  }
});

export default router;
