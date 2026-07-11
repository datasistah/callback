# Deploying Callback to Fly.io

Callback ships as **one Fly.io app**: the Express server serves the API **and**
the built React client from the same origin, so there's no CORS to configure and
the browser calls `/api` relative to wherever the app is hosted. Supabase
(Postgres + pgvector + Auth) stays managed — Fly only runs the app container.

```
Browser ──► Fly app (Express)
              ├─ GET /            → static client build (client/dist)
              └─ /api/*           → JSON API
                     └──────────► Supabase (Postgres + pgvector, RLS)
```

The image is built by [`Dockerfile`](Dockerfile) (multi-stage: build the Vite
client, then run the Node server serving it). Fly builds it on a remote builder,
so you do **not** need Docker installed locally.

---

## Prerequisites

- A [Fly.io](https://fly.io) account and the CLI:
  `curl -L https://fly.io/install.sh | sh` then `fly auth login`.
- Your Supabase project's URL and keys, and a `DATABASE_URL` (Supabase → Settings
  → Database → Connection string, Session mode / port 5432).
- Optional: an OpenRouter API key for LLM features. **Without it the app still
  works** — question generation, résumé tailoring, and answer grading all fall
  back to deterministic paths (see "The free path always works" below).

> **Keys:** you set every secret yourself with the commands below. This runbook
> never asks you to paste a key anywhere it would be committed.

---

## Step 1 — Apply database migrations (once per Supabase project)

Migrations are DDL and must run against Postgres directly, not through the app.
Run them from your machine with `DATABASE_URL` set (it's already in
`server/.env` for local dev):

```bash
cd server
npm install
npm run migrate      # applies migrations/*.sql idempotently (001 … 004)
```

`004_answers.sql` adds the interview answer-scoring table. Re-running is safe.

## Step 2 — Seed the Career Vault with the SAME embedder production uses

**This matters for retrieval quality.** The vault uses vector similarity, so the
embedder that *seeds* a row must match the embedder that *serves* queries — mix
them and cosine similarity is meaningless.

Production runs the **deterministic** embedder (no Ollama in the container, no
paid embedding dependency). So seed the demo/base data deterministically too, by
running the seed with the `OLLAMA_*` variables unset:

```bash
cd server
env -u OLLAMA_ENABLED -u OLLAMA_MODEL -u OLLAMA_EMBED_MODEL node seed.js
# (verify it printed "embedding: deterministic", not "ollama:…")
```

If you'd rather not preload demo data, skip this — the app auto-seeds each user's
vault deterministically on their first profile save, which already matches
production.

## Step 3 — Create the Fly app (no deploy yet)

```bash
cd <repo root>
fly launch --no-deploy      # detects Dockerfile + fly.toml; pick an app name + region
```

Edit `app` and `primary_region` in [`fly.toml`](fly.toml) if `fly launch`
changed them.

## Step 4 — Set the runtime secrets

These are the **server-side** environment variables (never exposed to the
browser). Set your own values:

```bash
fly secrets set \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_PUBLISHABLE_KEY="<supabase publishable / anon key>" \
  SUPABASE_SECRET_KEY="<supabase secret / service_role key>" \
  OPENROUTER_API_KEY="<your OpenRouter key, optional>" \
  OPENROUTER_MODEL="<model slug, optional>"
```

Leave the `OLLAMA_*` variables **unset** in production so embeddings stay
deterministic and consistent with how you seeded (Step 2).

## Step 5 — Deploy (pass the client's PUBLIC Supabase config as build args)

Vite inlines the client's Supabase config at **build** time, so it goes in as
`--build-arg`, not as a secret. Both values are safe to expose: the URL is
public and the *publishable/anon* key is designed for browsers — every row is
protected by Supabase Row-Level Security. **Never** pass the secret/service_role
key as a build arg.

```bash
fly deploy \
  --build-arg VITE_SUPABASE_URL="https://<ref>.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="<supabase publishable / anon key>"
# VITE_API_BASE_URL defaults to "/api" (same origin) — no need to pass it.
```

## Step 5b — Enable Google sign-in (Supabase + Google Cloud)

The app shows a "Continue with Google" button on the login/signup pages. It only
works once you enable the Google provider — this is dashboard config (it involves
creating OAuth credentials, so it's yours to do, not something the app can set):

1. **Google Cloud Console** → APIs & Services → Credentials → *Create OAuth client
   ID* → **Web application**. Under *Authorized redirect URIs* add your Supabase
   callback: `https://<ref>.supabase.co/auth/v1/callback`. Copy the generated
   **Client ID** and **Client secret**.
2. **Supabase** → Authentication → Providers → **Google** → enable, paste the
   Client ID + secret, save.
3. **Supabase** → Authentication → URL Configuration → add your app origins to
   **Redirect URLs**: `https://<your-app>.fly.dev/**` and, for local dev,
   `http://localhost:5173/**`. Set **Site URL** to your Fly URL.

New Google users land in the app with an empty profile; the Career Vault
auto-seeds on their first profile save, so nothing else is needed per user.

> No shared demo password: the app has no committed credentials. If you want a
> preloaded demo account, seed one with your own `DEMO_PASSWORD` (see Step 2);
> otherwise everyone just signs up.

## Step 6 — Verify

```bash
fly open                                   # opens the app
curl https://<your-app>.fly.dev/api/health # → {"status":"ok"}
curl https://<your-app>.fly.dev/api/llm/status   # shows provider + embedding mode
```

Then in the browser: sign up or log in, add a job, generate interview questions,
record/type an answer, and click **Score my answer**. Deep links (e.g.
`/app/board`) and refreshes should work — the server falls back to the SPA shell
for non-`/api` routes.

---

## The free path always works

If `OPENROUTER_API_KEY` is unset (or the provider is rate-limited/down), the app
degrades deterministically instead of erroring:

- **Interview questions** → template generator from the job description.
- **Résumé tailoring / cover letters** → deterministic, clearly-labelled output.
- **Answer grading** → the STAR rubric (`lib/grade.js`), same shape as the LLM
  grade, tagged "Rubric-graded".
- **Embeddings** → the 768-d signed-hash embedder (no model, no network).

So a zero-secret deploy still runs end to end; adding the OpenRouter key upgrades
the generative surfaces in place.

---

## Environment variable reference

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | Fly secret | Supabase project URL (server-side) |
| `SUPABASE_PUBLISHABLE_KEY` | Fly secret | Supabase anon key (server-side client) |
| `SUPABASE_SECRET_KEY` | Fly secret | Supabase service_role key (admin ops) |
| `OPENROUTER_API_KEY` | Fly secret (optional) | Enables LLM features |
| `OPENROUTER_MODEL` | Fly secret (optional) | Model slug for OpenRouter |
| `PORT` / `HOST` | set by Fly | Bind address (defaults 8080 / `0.0.0.0`) |
| `CORS_ORIGIN` | Fly secret (optional) | Only needed if the client is hosted separately |
| `DATABASE_URL` | local only | Direct Postgres URL for `npm run migrate` |
| `VITE_SUPABASE_URL` | `--build-arg` | Public Supabase URL, inlined into the client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `--build-arg` | Public anon key, inlined into the client |
| `VITE_API_BASE_URL` | `--build-arg` | API base; defaults to `/api` (same origin) |

---

## Security advisories (assessed 2026-07-11)

`npm audit` in `client/` reports **2 advisories (1 high, 1 moderate)**, both in
the **Vite / esbuild dev toolchain**, resolvable only by upgrading to `vite@8`
(a 3-major jump from the pinned `vite@5`).

| Advisory | Severity | Surface |
|---|---|---|
| esbuild ≤0.24.2 — dev server accepts cross-origin requests ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)) | moderate | dev server only |
| vite path traversal in optimized-deps `.map` ([GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9)) | moderate | dev server only |
| vite `launch-editor` NTLM hash disclosure ([GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)) | moderate | Windows dev only |
| vite `server.fs.deny` bypass ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)) | high | Windows dev only |

**Decision: deferred, not force-fixed.** Every one is a `vite dev` / `vite
preview` **development-server** vulnerability. The production artifact is a static
`vite build` bundle — esbuild and the dev server never run in the deployed
container, so **production runtime exposure is zero**. The high-severity item and
one moderate are additionally Windows-only. `npm audit fix --force` would pull
`vite@8` + `@vitejs/plugin-react@5` (breaking) to fix issues that cannot reach
production — not a good trade right before launch.

`pdfjs-dist` and `mammoth` (the résumé-parsing deps) audit **clean**.

**Re-evaluate when:** you next upgrade the build toolchain, or if a *production*
(not dev-server) advisory appears. The upgrade path is a deliberate `vite@8` bump
with a build + smoke test, done on its own branch — not `audit fix --force`.
