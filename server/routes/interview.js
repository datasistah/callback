// /api/interview — behavioral interview-question generation and prep sessions.
//
// This is Phase 3: the first feature built on the agentic layer's ReAct loop.
// A session ties a set of generated questions to a saved job; the generator
// (lib/interview.generateInterviewQuestions) drives the reason→act→observe loop
// when a model is configured and falls back to deterministic tool calls (with
// best-effort Career Vault grounding) otherwise — so it always produces
// sensible questions, model or not.
//
// Every handler scopes by req.user.id and runs under the caller's RLS.
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { userClient } from '../supabase.js';
import { sendError, notFoundJob, serverError } from '../lib/respond.js';
import { generateInterviewQuestions } from '../lib/interview.js';
import { gradeAnswer } from '../lib/grade.js';

const router = express.Router();
router.use(requireAuth);

const SESSION_COLS = 'id, job_id, mode, created_at, updated_at';
const QUESTION_COLS = 'id, session_id, position, text, competency, source, created_at';
const ANSWER_COLS =
  'id, session_id, question_id, transcript, overall, star, relevance, feedback, grade_mode, updated_at';

// Fetch a job owned by the user, or null. Throws on a real DB error.
async function getOwnedJob(db, userId, jobId) {
  const { data, error } = await db
    .from('jobs')
    .select('id, title, company, description')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Load a session's questions in generated order.
async function getSessionQuestions(db, userId, sessionId) {
  const { data, error } = await db
    .from('questions')
    .select(QUESTION_COLS)
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Load a session's graded answers (one per answered question). Returned
// alongside the questions so the studio rehydrates transcripts + scores on
// reload — recordings themselves stay in the browser and are not persisted.
async function getSessionAnswers(db, userId, sessionId) {
  const { data, error } = await db
    .from('answers')
    .select(ANSWER_COLS)
    .eq('session_id', sessionId)
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

// GET /api/interview/sessions — list the user's interview sessions (newest first).
router.get('/sessions', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const { data, error } = await db
      .from('interview_sessions')
      .select(SESSION_COLS)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/interview/sessions:', error.message);
      return serverError(res);
    }
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('GET /api/interview/sessions:', err.message);
    return serverError(res);
  }
});

// POST /api/interview/sessions — generate questions for a job and persist a
// session + its questions. Body: { job_id, count? }.
router.post('/sessions', async (req, res) => {
  try {
    const { job_id, count } = req.body || {};
    if (typeof job_id !== 'string' || !job_id.trim()) {
      return sendError(res, 400, 'validation_error', 'job_id is required.');
    }

    const db = userClient(req.accessToken);
    const job = await getOwnedJob(db, req.user.id, job_id);
    if (!job) return notFoundJob(res);
    if (!job.description || !job.description.trim()) {
      return sendError(res, 400, 'empty_description', 'This job needs a description to generate questions.');
    }

    let questions;
    let mode;
    try {
      ({ questions, mode } = await generateInterviewQuestions(db, { job, count }));
    } catch (err) {
      console.error('generateInterviewQuestions:', err.message);
      return sendError(res, 502, 'generation_failed', 'Question generation failed — try again.');
    }

    // Persist the session, then its questions (ordered).
    const sessionRes = await db
      .from('interview_sessions')
      .insert({ user_id: req.user.id, job_id: job.id, mode })
      .select(SESSION_COLS)
      .single();
    if (sessionRes.error) {
      console.error('POST /api/interview/sessions insert session:', sessionRes.error.message);
      return serverError(res);
    }
    const session = sessionRes.data;

    let saved = [];
    if (questions.length) {
      const rows = questions.map((q, i) => ({
        session_id: session.id,
        user_id: req.user.id,
        position: i,
        text: q.text,
        competency: q.competency || 'Behavioral',
        source: q.source != null ? String(q.source) : null,
      }));
      const qRes = await db.from('questions').insert(rows).select(QUESTION_COLS);
      if (qRes.error) {
        console.error('POST /api/interview/sessions insert questions:', qRes.error.message);
        return serverError(res);
      }
      saved = qRes.data || [];
    }

    // A freshly generated session has no answers yet; include the key so the
    // client can treat the create and fetch shapes uniformly.
    return res.status(201).json({ ...session, questions: saved, answers: [] });
  } catch (err) {
    console.error('POST /api/interview/sessions:', err.message);
    return serverError(res);
  }
});

// GET /api/interview/sessions/:id — one session with its questions.
router.get('/sessions/:id', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const sessionRes = await db
      .from('interview_sessions')
      .select(SESSION_COLS)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (sessionRes.error) {
      console.error('GET /api/interview/sessions/:id:', sessionRes.error.message);
      return serverError(res);
    }
    if (!sessionRes.data) return sendError(res, 404, 'not_found', 'Interview session not found.');

    const [questions, answers] = await Promise.all([
      getSessionQuestions(db, req.user.id, sessionRes.data.id),
      getSessionAnswers(db, req.user.id, sessionRes.data.id),
    ]);
    return res.status(200).json({ ...sessionRes.data, questions, answers });
  } catch (err) {
    console.error('GET /api/interview/sessions/:id:', err.message);
    return serverError(res);
  }
});

// POST /api/interview/sessions/:id/answers — grade a transcribed answer to one
// of the session's questions and upsert it (one graded answer per question, so
// re-recording overwrites). Body: { question_id, transcript }.
// Grading uses the LLM when a provider is configured and a deterministic STAR
// rubric otherwise, so it always returns a grade — never a 503.
router.post('/sessions/:id/answers', async (req, res) => {
  try {
    const { question_id, transcript } = req.body || {};
    if (typeof question_id !== 'string' || !question_id.trim()) {
      return sendError(res, 400, 'validation_error', 'question_id is required.');
    }
    if (typeof transcript !== 'string' || !transcript.trim()) {
      return sendError(res, 400, 'empty_transcript', 'Record or type an answer before scoring it.');
    }

    const db = userClient(req.accessToken);

    // The question must belong to this session AND this user — this both scopes
    // the write and gives us the question text to grade against.
    const questionRes = await db
      .from('questions')
      .select('id, text')
      .eq('id', question_id)
      .eq('session_id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (questionRes.error) {
      console.error('POST answers question lookup:', questionRes.error.message);
      return serverError(res);
    }
    if (!questionRes.data) {
      return sendError(res, 404, 'not_found', 'That question is not part of this interview session.');
    }

    let grade;
    try {
      grade = await gradeAnswer({ question: questionRes.data.text, transcript });
    } catch (err) {
      // gradeAnswer degrades to the deterministic rubric internally, so this is
      // a genuine unexpected failure.
      console.error('gradeAnswer:', err.message);
      return sendError(res, 502, 'grading_failed', 'Scoring failed — try again.');
    }

    const { data, error } = await db
      .from('answers')
      .upsert(
        {
          session_id: req.params.id,
          question_id: questionRes.data.id,
          user_id: req.user.id,
          transcript: transcript.trim(),
          overall: grade.overall,
          star: grade.star,
          relevance: grade.relevance,
          feedback: grade.feedback,
          grade_mode: grade.mode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'question_id' }
      )
      .select(ANSWER_COLS)
      .single();
    if (error) {
      console.error('POST answers upsert:', error.message);
      return serverError(res);
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('POST /api/interview/sessions/:id/answers:', err.message);
    return serverError(res);
  }
});

// DELETE /api/interview/sessions/:id — cascade-deletes its questions via FK.
router.delete('/sessions/:id', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const existing = await db
      .from('interview_sessions')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (existing.error) {
      console.error('DELETE /api/interview/sessions lookup:', existing.error.message);
      return serverError(res);
    }
    if (!existing.data) return sendError(res, 404, 'not_found', 'Interview session not found.');

    const { error } = await db
      .from('interview_sessions')
      .delete()
      .eq('id', existing.data.id)
      .eq('user_id', req.user.id);
    if (error) {
      console.error('DELETE /api/interview/sessions:', error.message);
      return serverError(res);
    }
    return res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/interview/sessions/:id:', err.message);
    return serverError(res);
  }
});

// POST /api/interview/preview — generate questions for an ad-hoc job description
// WITHOUT persisting a session. Mirrors POST /api/vault/search: a lightweight way
// to demo the generator (and exercise the agent loop) from a raw JD.
// Body: { title?, company?, description, count? }.
router.post('/preview', async (req, res) => {
  try {
    const { title, company, description, count } = req.body || {};
    if (typeof description !== 'string' || !description.trim()) {
      return sendError(res, 400, 'validation_error', 'description is required.');
    }
    const job = { title: title || '', company: company || '', description };

    const db = userClient(req.accessToken);
    const { questions, mode } = await generateInterviewQuestions(db, { job, count });
    return res.status(200).json({ mode, questions });
  } catch (err) {
    console.error('POST /api/interview/preview:', err.message);
    return serverError(res);
  }
});

export default router;
