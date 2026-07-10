// /api/profile — the user's single base resume/profile.
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { userClient } from '../supabase.js';
import { sendError, serverError } from '../lib/respond.js';

const router = express.Router();

router.use(requireAuth);

// GET /api/profile — the authenticated user's base profile.
router.get('/', async (req, res) => {
  try {
    const db = userClient(req.accessToken);
    const { data, error } = await db
      .from('profiles')
      .select('id, content, updated_at')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) {
      console.error('GET /api/profile:', error.message);
      return serverError(res);
    }

    if (!data) {
      // No profile yet — contract specifies this exact empty shape.
      return res.status(200).json({ id: null, content: '', updated_at: null });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('GET /api/profile:', err.message);
    return serverError(res);
  }
});

// PUT /api/profile — create or update (upsert) the base profile.
router.put('/', async (req, res) => {
  try {
    const { content } = req.body || {};
    if (typeof content !== 'string' || content.trim() === '') {
      return sendError(res, 400, 'validation_error', 'content is required.');
    }

    const db = userClient(req.accessToken);
    const { data, error } = await db
      .from('profiles')
      .upsert(
        { user_id: req.user.id, content, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select('id, content, updated_at')
      .single();

    if (error) {
      console.error('PUT /api/profile:', error.message);
      return serverError(res);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('PUT /api/profile:', err.message);
    return serverError(res);
  }
});

export default router;
