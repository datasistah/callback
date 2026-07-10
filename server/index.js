// JobTailor backend — Express + Supabase.
// Base URL: http://localhost:3001/api  (frontend runs on http://localhost:5173).
import './lib/loadEnv.js'; // ensures server/.env exists and is loaded first
import express from 'express';
import cors from 'cors';
import profileRouter from './routes/profile.js';
import jobsRouter from './routes/jobs.js';

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

// Lightweight health check (unauthenticated) — handy for QA and uptime checks.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/profile', profileRouter);
app.use('/api/jobs', jobsRouter);

// 404 for any unmatched /api route, in the contract's error shape.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found.' });
});

// Catch-all error handler (e.g. malformed JSON body).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'validation_error', message: 'Request body must be valid JSON.' });
  }
  console.error('Unhandled error:', err && err.message);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`JobTailor backend listening on http://localhost:${PORT}`);
});
