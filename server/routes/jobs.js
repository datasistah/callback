// /api/jobs and its nested resume / cover-letter / score endpoints.
//
// Every handler scopes by req.user.id. Accessing a job you don't own returns
// 404 (never another user's data, never 403).
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { userClient } from '../supabase.js';
import { sendError, notFoundJob, serverError } from '../lib/respond.js';
import { computeScore } from '../lib/score.js';
import {
  aiEnabled,
  tailorResume,
  generateCoverLetter,
  tailorResumeFallback,
  generateCoverLetterFallback,
} from '../lib/ai.js';

const router = express.Router();
router.use(requireAuth);

const VALID_STATUSES = ['bookmarked', 'applied', 'interviewing', 'offer'];

// Fetch a job owned by the user, or null. Throws on a real DB error.
async function getOwnedJob(db, userId, jobId) {
  const { data, error } = await db
    .from('jobs')
    .select('id, title, company, description, url, status, created_at')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Load the user's base profile content (or '' if none).
async function getProfileContent(db, userId) {
  const { data, error } = await db
    .from('profiles')
    .select('content')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data && data.content ? data.content : '';
}

// ---------------------------------------------------------------------------
// Jobs collection
// ---------------------------------------------------------------------------

// GET /api/jobs — list the user's jobs.
router.get('/', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const { data, error } = await db
      .from('jobs')
      .select('id, title, company, description, url, status, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/jobs:', error.message);
      return serverError(res);
    }
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('GET /api/jobs:', err.message);
    return serverError(res);
  }
});

// POST /api/jobs — create a job (always starts bookmarked).
router.post('/', async (req, res) => {
  try {
    const { title, company, description, url } = req.body || {};
    if (
      typeof title !== 'string' || title.trim() === '' ||
      typeof description !== 'string' || description.trim() === ''
    ) {
      return sendError(res, 400, 'validation_error', 'title and description are required.');
    }

    const db = userClient(req.accessToken);
    const { data, error } = await db
      .from('jobs')
      .insert({
        user_id: req.user.id,
        title,
        company: typeof company === 'string' ? company : '',
        description,
        url: typeof url === 'string' && url.trim() !== '' ? url : null,
        status: 'bookmarked',
      })
      .select('id, title, company, description, url, status, created_at')
      .single();

    if (error) {
      console.error('POST /api/jobs:', error.message);
      return serverError(res);
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/jobs:', err.message);
    return serverError(res);
  }
});

// GET /api/jobs/:id — one job with nested resume, cover_letter, latest score.
router.get('/:id', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    const [resumeRes, coverRes, scoreRes] = await Promise.all([
      db.from('resumes').select('id, content, updated_at').eq('job_id', job.id).maybeSingle(),
      db.from('cover_letters').select('id, content, updated_at').eq('job_id', job.id).maybeSingle(),
      db
        .from('scores')
        .select('id, value, matched_keywords, missing_keywords, skills_coverage, created_at')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (resumeRes.error || coverRes.error || scoreRes.error) {
      console.error('GET /api/jobs/:id nested:', (resumeRes.error || coverRes.error || scoreRes.error).message);
      return serverError(res);
    }

    return res.status(200).json({
      ...job,
      resume: resumeRes.data || null,
      cover_letter: coverRes.data || null,
      score: scoreRes.data || null,
    });
  } catch (err) {
    console.error('GET /api/jobs/:id:', err.message);
    return serverError(res);
  }
});

// PUT /api/jobs/:id — update editable fields.
router.put('/:id', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    const { title, company, description, url } = req.body || {};
    const updates = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        return sendError(res, 400, 'validation_error', 'title cannot be empty.');
      }
      updates.title = title;
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim() === '') {
        return sendError(res, 400, 'validation_error', 'description cannot be empty.');
      }
      updates.description = description;
    }
    if (company !== undefined) updates.company = typeof company === 'string' ? company : '';
    if (url !== undefined) updates.url = typeof url === 'string' && url.trim() !== '' ? url : null;

    if (Object.keys(updates).length === 0) {
      // Nothing to change — return the job as-is.
      return res.status(200).json(job);
    }

    const { data, error } = await db
      .from('jobs')
      .update(updates)
      .eq('id', job.id)
      .eq('user_id', req.user.id)
      .select('id, title, company, description, url, status, created_at')
      .single();

    if (error) {
      console.error('PUT /api/jobs/:id:', error.message);
      return serverError(res);
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('PUT /api/jobs/:id:', err.message);
    return serverError(res);
  }
});

// PATCH /api/jobs/:id/status — move pipeline stage.
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!VALID_STATUSES.includes(status)) {
      return sendError(
        res, 400, 'validation_error',
        'status must be one of bookmarked, applied, interviewing, offer.'
      );
    }

    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    const { data, error } = await db
      .from('jobs')
      .update({ status })
      .eq('id', job.id)
      .eq('user_id', req.user.id)
      .select('id, status')
      .single();

    if (error) {
      console.error('PATCH /api/jobs/:id/status:', error.message);
      return serverError(res);
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('PATCH /api/jobs/:id/status:', err.message);
    return serverError(res);
  }
});

// DELETE /api/jobs/:id — cascade-deletes resume/cover letter/scores via FK.
router.delete('/:id', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    const { error } = await db
      .from('jobs')
      .delete()
      .eq('id', job.id)
      .eq('user_id', req.user.id);

    if (error) {
      console.error('DELETE /api/jobs/:id:', error.message);
      return serverError(res);
    }
    return res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/jobs/:id:', err.message);
    return serverError(res);
  }
});

// ---------------------------------------------------------------------------
// Resume (one per job)
// ---------------------------------------------------------------------------

// POST /api/jobs/:id/resume/tailor — generate a tailored resume (LLM).
router.post('/:id/resume/tailor', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    const profile = await getProfileContent(db, req.user.id);
    if (!profile.trim()) {
      return sendError(res, 400, 'no_profile', 'Add your base profile before tailoring.');
    }

    let content;
    if (aiEnabled()) {
      try {
        content = await tailorResume({ profile, job });
      } catch (err) {
        console.error('tailorResume:', err.message);
        return sendError(res, 502, 'generation_failed', 'Tailoring failed — try again.');
      }
    } else {
      // No AI key: deterministic mock so the loop works end-to-end.
      content = tailorResumeFallback({ profile, job });
    }

    const { data, error } = await db
      .from('resumes')
      .upsert(
        { job_id: job.id, user_id: req.user.id, content, updated_at: new Date().toISOString() },
        { onConflict: 'job_id' }
      )
      .select('id, job_id, content, updated_at')
      .single();

    if (error) {
      console.error('POST resume/tailor save:', error.message);
      return serverError(res);
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/jobs/:id/resume/tailor:', err.message);
    return serverError(res);
  }
});

// GET /api/jobs/:id/resume — the tailored resume.
router.get('/:id/resume', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    const { data, error } = await db
      .from('resumes')
      .select('id, job_id, content, updated_at')
      .eq('job_id', job.id)
      .maybeSingle();

    if (error) {
      console.error('GET resume:', error.message);
      return serverError(res);
    }
    if (!data) return sendError(res, 404, 'not_found', 'No resume for this job yet.');
    return res.status(200).json(data);
  } catch (err) {
    console.error('GET /api/jobs/:id/resume:', err.message);
    return serverError(res);
  }
});

// PUT /api/jobs/:id/resume — edit and save the tailored resume text.
router.put('/:id/resume', async (req, res) => {
  try {
    const { content } = req.body || {};
    if (typeof content !== 'string' || content.trim() === '') {
      return sendError(res, 400, 'validation_error', 'content is required.');
    }

    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    // Must already exist to edit.
    const existing = await db
      .from('resumes')
      .select('id')
      .eq('job_id', job.id)
      .maybeSingle();
    if (existing.error) {
      console.error('PUT resume lookup:', existing.error.message);
      return serverError(res);
    }
    if (!existing.data) return sendError(res, 404, 'not_found', 'No resume for this job yet.');

    const { data, error } = await db
      .from('resumes')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('job_id', job.id)
      .eq('user_id', req.user.id)
      .select('id, job_id, content, updated_at')
      .single();

    if (error) {
      console.error('PUT resume save:', error.message);
      return serverError(res);
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('PUT /api/jobs/:id/resume:', err.message);
    return serverError(res);
  }
});

// ---------------------------------------------------------------------------
// Cover letter (one per job)
// ---------------------------------------------------------------------------

// POST /api/jobs/:id/cover-letter/generate — generate a cover letter (LLM).
router.post('/:id/cover-letter/generate', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    const profile = await getProfileContent(db, req.user.id);
    if (!profile.trim()) {
      return sendError(res, 400, 'no_profile', 'Add your base profile before generating a cover letter.');
    }

    let content;
    if (aiEnabled()) {
      try {
        content = await generateCoverLetter({ profile, job });
      } catch (err) {
        console.error('generateCoverLetter:', err.message);
        return sendError(res, 502, 'generation_failed', 'Generation failed — try again.');
      }
    } else {
      // No AI key: deterministic mock so the loop works end-to-end.
      content = generateCoverLetterFallback({ profile, job });
    }

    const { data, error } = await db
      .from('cover_letters')
      .upsert(
        { job_id: job.id, user_id: req.user.id, content, updated_at: new Date().toISOString() },
        { onConflict: 'job_id' }
      )
      .select('id, job_id, content, updated_at')
      .single();

    if (error) {
      console.error('POST cover-letter save:', error.message);
      return serverError(res);
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/jobs/:id/cover-letter/generate:', err.message);
    return serverError(res);
  }
});

// GET /api/jobs/:id/cover-letter — the cover letter.
router.get('/:id/cover-letter', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    const { data, error } = await db
      .from('cover_letters')
      .select('id, job_id, content, updated_at')
      .eq('job_id', job.id)
      .maybeSingle();

    if (error) {
      console.error('GET cover-letter:', error.message);
      return serverError(res);
    }
    if (!data) return sendError(res, 404, 'not_found', 'No cover letter for this job yet.');
    return res.status(200).json(data);
  } catch (err) {
    console.error('GET /api/jobs/:id/cover-letter:', err.message);
    return serverError(res);
  }
});

// ---------------------------------------------------------------------------
// Score (deterministic — no LLM)
// ---------------------------------------------------------------------------

// POST /api/jobs/:id/score — compute and store the match score.
router.post('/:id/score', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    if (!job.description || !job.description.trim()) {
      return sendError(res, 400, 'empty_description', 'This job needs a description to score against.');
    }

    const resume = await db
      .from('resumes')
      .select('content')
      .eq('job_id', job.id)
      .maybeSingle();
    if (resume.error) {
      console.error('POST score resume lookup:', resume.error.message);
      return serverError(res);
    }
    if (!resume.data || !resume.data.content || !resume.data.content.trim()) {
      return sendError(res, 400, 'no_resume', 'Tailor or add a resume before scoring.');
    }

    const breakdown = computeScore(job.description, resume.data.content);

    const { data, error } = await db
      .from('scores')
      .insert({
        job_id: job.id,
        user_id: req.user.id,
        value: breakdown.value,
        matched_keywords: breakdown.matched_keywords,
        missing_keywords: breakdown.missing_keywords,
        skills_coverage: breakdown.skills_coverage,
      })
      .select('id, job_id, value, matched_keywords, missing_keywords, skills_coverage, created_at')
      .single();

    if (error) {
      console.error('POST score save:', error.message);
      return serverError(res);
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/jobs/:id/score:', err.message);
    return serverError(res);
  }
});

// GET /api/jobs/:id/score — latest stored score.
router.get('/:id/score', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, req.params.id);
    if (!job) return notFoundJob(res);

    const { data, error } = await db
      .from('scores')
      .select('id, job_id, value, matched_keywords, missing_keywords, skills_coverage, created_at')
      .eq('job_id', job.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('GET score:', error.message);
      return serverError(res);
    }
    if (!data) return sendError(res, 404, 'not_found', 'No score for this job yet.');
    return res.status(200).json(data);
  } catch (err) {
    console.error('GET /api/jobs/:id/score:', err.message);
    return serverError(res);
  }
});

export default router;
