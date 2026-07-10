# JobTailor — backend

Express + Supabase API for the Sprint Zero core loop: save a job, tailor a
resume and cover letter to it, and get a match score. Listens on port **3001**;
the frontend (Vite) runs on **5173** and calls `http://localhost:3001/api`.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) and
   enable email auth (Authentication → Providers → Email).

2. **Copy credentials** — copy `server/.env.example` to `server/.env` and fill
   in four values:
   - `SUPABASE_URL` — Settings → API → Project URL
   - `SUPABASE_PUBLISHABLE_KEY` — Settings → API Keys (anon/public key)
   - `SUPABASE_SECRET_KEY` — Settings → API Keys (service_role key)
   - `DATABASE_URL` — Settings → Database → Connection string → URI (Session
     mode, port 5432). Looks like
     `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`

   (In this workspace a project-root `.env` already holds these values; the
   server copies it to `server/.env` automatically on first run.)

3. **Migrate and seed** — run `node seed.js`. This creates the database tables
   automatically, then creates a demo user and populates realistic data/AI-field
   sample records. The demo login (email + password) is printed to stdout.

4. **Start the server** — run `node index.js` (or `npm start`). The server
   listens on port 3001.

## Optional: AI tailoring

The match **score** is a deterministic keyword/skills heuristic and works with
no AI key. Resume **tailoring** and **cover-letter generation** call Claude only
when `ANTHROPIC_API_KEY` is set in `server/.env`. Without a key, those two
endpoints return `503 { "error": "ai_not_configured", ... }`; everything else
works normally.

## Layout

```
server/
  index.js              Express entry point (port 3001, CORS for :5173)
  supabase.js           Supabase clients (publishable for routes, admin for seed)
  middleware/auth.js    JWT verification (Supabase JWKS, RS256 + ES256)
  routes/
    profile.js          GET/PUT /api/profile
    jobs.js             /api/jobs + nested resume / cover-letter / score
  lib/
    loadEnv.js          ensures server/.env exists, loads it
    score.js            deterministic match-score heuristic (no LLM)
    ai.js               Anthropic tailoring + cover letter (key-gated)
    respond.js          consistent error responses
  migrations/001_init.sql  full schema (idempotent)
  migrate.js            runs the SQL via pg + DATABASE_URL; exports migrate()
  seed.js               migrate() + demo user + sample data (idempotent)
```

All endpoints match `docs/api-contract.md`.
