# Callback — Build Roadmap & Decisions

> Working notes so any session (or a fresh chat) can resume without re-deriving context.
> Repo: `~/Documents/repos/jobtailor` (standalone, extracted from the course's Sprint Zero).

## What Callback is

An interview-prep + resume-rewriter web app:
- **Resume rewriter** tailored to a specific job description.
- **Video/voice interview prep** with AI feedback on behavioral answers, critiquing
  **STAR** format; questions generated from the job description.
- **Company Dossier** — company as a first-class entity (signals, culture, stack).
- **Career Vault + provenance** — longitudinal career record; every tailored bullet
  cites the vault item it came from (RAG-grounded, hallucination-checked).
  Ref: "Career-Aware Resume Tailoring via Multi-Source RAG."

## Stack (unchanged from JobTailor)

React + Vite (client) · Express/Node ESM (server) · Supabase (Postgres + Auth + Storage).
Layered with an **Agent Harness** (Tools, Permissions, Context, Planning, Verification,
Agent Loop) — added on top, NOT a rewrite.

## Locked decisions

- **Name:** Callback.
- **Keep Supabase** (add harness on top; no MongoDB rewrite).
- **Video-first** interview mode.
- **Design:** slick but professional, **dark mode preferred**. (NEW)
- **LLM: free/local only.** User wants zero-cost. A weak local model is fine — the goal
  is to demonstrate functionality, not maximize quality. (NEW — supersedes the earlier
  "OpenRouter recommended" framing. Ollama/Qwen is the primary path; OpenRouter free-tier
  optional. Everything must still run on the deterministic mock with no model at all.)
- **External job search:** connect to open jobs on job boards. (NEW — new feature.)
- **RAG/chunking:** reuse the course's Module 3 patterns as the reference implementation
  (see below), don't reinvent. (NEW)

## RAG reference material (course repo)

In `~/Documents/repos/multi-agent-course-sprint-zero`:
- `modules/Module_3_Agentic_RAG/rag_helpers.py` — chunking/embedding/retrieval helpers.
- `modules/Module_3_Agentic_RAG/Agentic_RAG/Agentic_RAG_Notebook.ipynb` — end-to-end agentic RAG.
- `modules/Module_3_Agentic_RAG/Agentic_RAG_with_Semantic_Cache.ipynb` — semantic caching.
- `modules/Module_3_Agentic_RAG/Knowledge_Graphs/` — KG-based retrieval (later, for Dossier).

## Status

- **Phase 0 — DONE** (commit `5408fba`): rebrand JobTailor→Callback + Agent Harness LLM
  router (`server/harness/llm/`) with per-task routing over OpenRouter/Ollama/Anthropic +
  deterministic mock fallback. `GET /api/llm/status` reports active providers.
- **Phase 1 backend — DONE (uncommitted)**: Career Vault + provenance-aware, RAG-grounded
  tailoring. Verified end-to-end against Supabase on the deterministic (no-model) path.
  - Migration `002_career_vault.sql`: `pgvector`, `career_items` (768-d embedding, HNSW,
    RLS), `resumes.provenance jsonb`, `match_career_items()` RPC (SECURITY INVOKER → RLS-scoped).
  - Embedding layer `server/harness/embeddings.js`: Ollama `nomic-embed-text` when reachable,
    else a deterministic 768-d hashed fallback (`embed`, `cosineSim`, `embeddingMode`). Never throws.
  - `server/lib/vault.js`: retrieval RPC wrapper, `verifyGrounding` (bullet↔cited-item cosine
    vs. `GROUNDEDNESS_THRESHOLD`, default 0.3), `chunkProfileIntoItems`.
  - `server/lib/tailor.js` `buildTailoredResume`: retrieve → grounded bullets (LLM JSON w/
    `source_id`, or mock = one bullet per item) → groundedness check → render + provenance.
    Empty vault → legacy whole-resume tailoring, no provenance.
  - Routes `server/routes/vault.js`: `GET/POST/PUT/DELETE /api/vault`, `POST /api/vault/build-from-profile`,
    `POST /api/vault/search`. `GET /api/llm/status` now also reports `embedding` mode.
  - Seed: 10 curated career items for Maya (embedded on insert). `migrate.js` now runs all
    `migrations/*.sql` in order.
  - Tests: `server/tests/vault.unit.test.js` (hermetic — embedder, chunking, grounding, mock
    orchestration; 7/7 pass).
- **Phase 1 frontend — DONE (uncommitted)**: dark-mode-first UI + Career Vault + provenance.
  - Whole client converted to a dark, slick/professional theme. New semantic Tailwind tokens
    in `client/tailwind.config.js` (`bg`, `surface`, `surface-hover`, `border`, `ink` redefined
    to light text, `muted`, brightened `accent`); `index.css` sets `color-scheme: dark`. Every
    page/component (marketing, auth, board, profile, job detail, shared components) restyled.
  - `client/src/pages/VaultPage.jsx` — dark Career Vault page: list, add/edit/delete items,
    kind filter chips with counts, "Build from profile" button. Routed at `/app/vault` (see
    `App.jsx`) with a nav entry in `AppLayout.jsx`. Wordmark rebranded JobTailor→Callback.
  - Provenance display in `JobDetailPage.jsx` (`ProvenancePanel`): every tailored bullet shows a
    green citation chip (source_title) + similarity %, an "N / M bullets grounded" counter, and
    flags `grounded === false` bullets amber as "Unverified — no matching vault source".
  - API layer `client/src/api/client.js` extended: `listVault`/`createVaultItem`/`updateVaultItem`/
    `deleteVaultItem`/`buildVaultFromProfile`/`searchVault`.
  - Verified end-to-end in-browser against the live backend (demo login, 10 seeded items load,
    tailor → 6/6 grounded provenance, create/delete round-trip, prod build clean). `.claude/launch.json`
    added for `server` (node) + `client` (vite) preview.
  - **Next:** Phase 2 (JD-based interview question generation). Optional: `ollama pull nomic-embed-text`
    for real semantic embeddings; tune `GROUNDEDNESS_THRESHOLD` for the LLM tailor path (the
    deterministic path grounds every bullet, so the amber "unverified" state only appears on the
    LLM path).

## Phases (planned)

1. **Career Vault + provenance-aware, RAG-grounded tailoring** ← next milestone.
   - `career_items` data model; pgvector semantic retrieval (reuse Module 3 chunking).
   - Tailoring cites source `career_item` IDs; unsupported bullets flagged (groundedness check).
2. **JD-based interview question generation** (`questionGenerator` tool; `interview_sessions`/`questions` tables).
3. **Interview Studio** — video capture + transcript (getUserMedia/MediaRecorder + browser STT).
4. **STAR critique** + streamed feedback report.
5. **External job-board search** — connect to open-jobs source(s); dark-mode UI polish;
   manual→automated Company Dossier signals (web-search agent); interviewer TTS; tests.

## Local LLM setup (free path)

```
brew install ollama
ollama pull qwen2.5:3b      # or a smaller 1.5b for weaker hardware
# in server/.env:
OLLAMA_ENABLED=1
OLLAMA_MODEL=qwen2.5:3b
```
Then `curl localhost:3001/api/llm/status` should show ollama configured. No key = mocks.

## Guardrails (don't break)

- Never commit `.env`/secrets.
- Demo login stays `maya.rivera@example.com` / `JobTailor2026!` (changing the demo password
  breaks the existing Supabase auth user without a re-seed).
- No `Co-Authored-By: Claude` / "Generated with Claude Code" trailers in commits or PRs.
