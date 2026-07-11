# LLM setup — Callback Agent Harness

Callback routes every AI task through one layer (`server/harness/llm`). You pick
which engine runs each task via environment variables. Set **at least one**
provider. With none set, the app still runs — it falls back to deterministic
mock output so you can click through the whole flow without any AI.

Check what's active any time:

```
curl http://localhost:3001/api/llm/status
```

## Option A — OpenRouter (recommended)

One API key, access to many models (including free ones). Best quality for the
reasoning-heavy tasks (resume tailoring, STAR critique, question generation).

1. Sign up at https://openrouter.ai and create a key at https://openrouter.ai/keys
2. In `server/.env` set:

   ```
   OPENROUTER_API_KEY=sk-or-...
   OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct
   ```

3. To start at zero cost, pick a `:free` model from https://openrouter.ai/models
   (e.g. `meta-llama/llama-3.3-70b-instruct:free`). Free models are rate-limited,
   and when a free model is throttled or unavailable the app falls back to the
   deterministic mock — so the demo never breaks. This is the **recommended path
   for a deployed app** (see "Deploying" below): a hosted API costs nothing on
   the free tier and avoids running a model server 24/7.

## Option B — Local Qwen via Ollama (offline / private / no per-call cost)

Good for cheap drafting and working offline. A small local model (1.5B–3B) is
weaker at nuanced feedback, so by default only the `draft` task routes here —
the quality-critical tasks stay on OpenRouter.

1. Install Ollama: https://ollama.com (`brew install ollama` on macOS)
2. Start it and pull a model:

   ```
   ollama serve            # if not already running
   ollama pull qwen2.5:3b
   ```

3. In `server/.env` set:

   ```
   OLLAMA_ENABLED=1
   OLLAMA_MODEL=qwen2.5:3b
   ```

## Routing

Each task has a default provider (see `server/harness/llm/router.js`):

| Task            | Default    | Notes                                  |
| --------------- | ---------- | -------------------------------------- |
| `resume_tailor` | openrouter | provenance-aware tailoring             |
| `cover_letter`  | openrouter |                                        |
| `star_critique` | openrouter | interview answer feedback              |
| `question_gen`  | openrouter | JD-based interview questions           |
| `draft`         | ollama     | cheap/offline drafting                 |

Override any task without touching code:

```
CALLBACK_PROVIDER_RESUME_TAILOR=ollama      # run tailoring locally
CALLBACK_PROVIDER_STAR_CRITIQUE=anthropic   # send critique to Claude
```

If a task's preferred provider isn't configured, the router falls back to any
provider that is — and if none are, to the deterministic mock.

## Deploying (free path — no Ollama)

Ollama is a **local** convenience: it runs a model on your own machine. You do
**not** deploy it — a cloud box big enough to serve even a 3B model always-on is
far pricier than pay-per-token, and CPU inference is slow. For a deployed app,
use a hosted API and leave Ollama out entirely.

**Chat / question generation.** Set OpenRouter with a `:free` model. That's the
whole switch — `question_gen`, `resume_tailor`, `star_critique`, etc. all route
to it:

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free   # confirm it's still listed on /models
```

**Embeddings (Career Vault search).** OpenRouter isn't wired for embeddings here,
so with no Ollama the vault uses the built-in **deterministic embedder** — free,
no network, never throws (`server/harness/embeddings.js`). The one rule: **seed
and serve with the same embedder**, because a row embedded one way must be
compared against queries embedded the same way. For a no-Ollama deploy that means
seed with Ollama off:

```
# On the deploy host, with OLLAMA_* unset/empty so embed() uses the deterministic path:
OLLAMA_ENABLED=0
OLLAMA_MODEL=
OLLAMA_EMBED_MODEL=
node seed.js            # re-embeds the vault in the deterministic space
```

`curl https://<your-host>/api/llm/status` should then show
`enabled: true`, the openrouter provider configured, and
`embedding: "deterministic"`.

**When to pay.** If free-tier rate limits or quality bite once you have real
users, switch `question_gen` (or the global default) to Claude Haiku 4.5 — set
`ANTHROPIC_API_KEY` and `CALLBACK_LLM_PROVIDER=anthropic` (or a per-task
override). It's ~a fraction of a cent per interview session and needs no code
change. Keep it as the *preferred* provider with the mock as the floor, never a
required dependency.
