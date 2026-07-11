// Callback backend — Express + Supabase.
//
// In development the API runs on http://localhost:3001/api and the Vite client
// on http://localhost:5173 (cross-origin, so CORS is scoped to that origin).
// In production (single-app Fly.io deploy) this same server also serves the
// built client from client/dist, so the browser loads the SPA and calls /api on
// the SAME origin — no CORS needed. See DEPLOY.md.
import './lib/loadEnv.js'; // loads env (server/.env in dev, real env vars in prod)
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import profileRouter from './routes/profile.js';
import jobsRouter from './routes/jobs.js';
import vaultRouter from './routes/vault.js';
import interviewRouter from './routes/interview.js';
import { providerStatus } from './harness/llm/index.js';
import { embeddingMode } from './harness/embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Fly (and most hosts) inject the port to bind via $PORT; fall back to 3001 for
// local dev. Bind 0.0.0.0 so the container is reachable, not just loopback.
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// In dev the client is a separate origin (Vite on 5173); allow it. In a
// same-origin prod deploy this is simply unused (same-origin requests don't need
// CORS). Override with CORS_ORIGIN to allow a separately-hosted client.
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

// Lightweight health check (unauthenticated) — handy for QA and uptime checks.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Which LLM provider(s) the harness will use — for debugging / setup checks.
app.get('/api/llm/status', (req, res) => {
  res.status(200).json({ ...providerStatus(), embedding: embeddingMode() });
});

app.use('/api/profile', profileRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/vault', vaultRouter);
app.use('/api/interview', interviewRouter);

// 404 for any unmatched /api route, in the contract's error shape. Registered
// before the static/SPA handlers so unmatched API calls return JSON, never the
// SPA's index.html.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found.' });
});

// --- Static client (production single-app deploy) --------------------------
// When a built client is present (client/dist — always true in the Docker
// image, absent in local dev), serve it and fall back to index.html for client
// routes so deep links / refreshes work. When it's absent, we skip this
// entirely and local `node index.js` behaves exactly as before (API only).
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
const clientIndex = path.join(clientDist, 'index.html');
if (fs.existsSync(clientIndex)) {
  // Inject the client's PUBLIC config (Supabase URL + publishable/anon key) into
  // the page from RUNTIME env, so the deployed frontend is configured by the
  // same Fly secrets as the server — no build-time args required. Both values
  // are safe to expose (the URL is public; the anon key is protected by RLS).
  // The secret key is NEVER included here.
  const config = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    apiBaseUrl: '/api',
  };
  // Escape "<" so the value can never break out of the <script> tag.
  const configJson = JSON.stringify(config).replace(/</g, '\\u003c');
  const rawIndex = fs.readFileSync(clientIndex, 'utf8');
  const indexHtml = rawIndex.replace(
    '</head>',
    `<script>window.__CALLBACK_CONFIG__=${configJson}</script></head>`
  );

  // Serve hashed assets from disk, but NOT index.html (index: false) — every
  // HTML response goes through our handler so it carries the injected config.
  app.use(express.static(clientDist, { index: false }));
  // SPA fallback: any non-/api GET returns the config-injected app shell.
  // /api/* never reaches here — it's fully handled above.
  app.get('*', (req, res) => {
    res.set('Content-Type', 'text/html').send(indexHtml);
  });
  console.log(`Serving built client from ${clientDist}`);
}

// Catch-all error handler (e.g. malformed JSON body).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'validation_error', message: 'Request body must be valid JSON.' });
  }
  console.error('Unhandled error:', err && err.message);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong. Please try again.' });
});

app.listen(PORT, HOST, () => {
  console.log(`Callback backend listening on ${HOST}:${PORT}`);
});
