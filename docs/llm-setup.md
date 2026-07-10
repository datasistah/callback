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
   (e.g. `meta-llama/llama-3.3-70b-instruct:free`). Free models are rate-limited.

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
