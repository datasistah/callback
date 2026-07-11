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
- **Product intent:** Callback is meant to become a real customer-facing product, not just
  a course demo. Every architecture choice must be cheap-to-demo *now* AND productizable
  *later* — no throwaway scaffolding. (NEW)
- **Agentic architecture = Node-native + MCP (NOT Google ADK).** (NEW) Evolve the existing
  provider router (`server/harness/llm/`) into a genuine agent loop — tool registry +
  reason→act→observe + a lightweight orchestrator that sequences specialized "agents"
  (tailor / question-gen / STAR-critique), faithful to Module 2's orchestrator+subagent
  pattern. Adopt the one language-neutral piece of Module 5 — **MCP** (JS SDK) — to expose
  the app's tools; internal now, an external-agent surface later. **Rejected ADK/A2A**: ADK
  is Python + Gemini-first (a second runtime + paid model coupling + more Fly infra), and
  A2A (agents as network microservices) solves cross-org coordination we don't have inside
  one app. Keep one Node codebase, one deploy. Free/local models + the deterministic mock
  must keep working through the agent loop.
- **Voice = swappable provider seam (mirrors the LLM router).** (NEW) Voice is STT→LLM→TTS
  and is a *separate* seam from the LLM (Ollama is text-only and does NOT do voice). Default
  is the **browser Web Speech API** — $0, zero voice server cost on Fly, guarantees the demo
  runs free. **Realtime speech-to-speech is opt-in premium** behind the same seam: candidate
  providers are OpenAI `gpt-realtime-2.1-mini` and Google Gemini Live (`gemini-*-flash-live`);
  exact model IDs are verified at build time, not pinned here. A realtime provider is a paid
  API, so it must always be optional — the free Web Speech path preserves the "free/local
  must always work" rule. Note: using Gemini Live does NOT require ADK — it's a WebSocket
  speech-to-speech API consumable directly from Node, just like OpenAI Realtime.
- **Product-hardening backlog (later, not blocking the demo):** input/output guardrails
  (Module 4 / Llama Guard) before untrusted users can type in, per-user cost caps + rate
  limiting, observability/tracing, and billing. Noted so no future session forgets them. (NEW)

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
- **Phase 2 agentic harness — DONE (steps 1–2, committed `8710088` + `7051253`)**: tool
  registry + agent loop + orchestrator in `server/harness/agent/`, now published over MCP.
  - `registry.js`: typed `ToolRegistry` with zero-dep arg validation; core tools
    `vault_search`, `tailor_bullets`, `check_grounding`, `score_resume` wrap the existing lib
    functions. Handlers take `(args, ctx)` — `ctx.db` is the RLS-scoped client. This is the
    seam MCP will expose (Phase 2b, not yet built).
  - `loop.js`: provider-agnostic reason→act→observe (ReAct) loop over the router's `complete()`
    using a plain-JSON tool-call protocol (so weak local models can drive it). Requires a model;
    accepts an injected `complete` for tests. `parseAction` tolerates fenced/noisy JSON.
  - `orchestrator.js`: deterministic `runPipeline(steps, ctx)` — Module 2's orchestrator pattern
    with per-step failure isolation + trace. The always-on backbone (mock/local/premium alike).
  - Wired the resume-tailoring grounded path through an orchestrated pipeline
    (`vault_search → tailor_bullets → check_grounding`); `buildTailoredResume` contract unchanged.
  - Tests: `server/tests/agent.unit.test.js` (12/12 hermetic); `vault.unit.test.js` still 7/7.
    Verified: module graph resolves, server boots clean, tailor route live (401 auth-guarded).
  - **Step 2b (MCP) — DONE (`7051253`)**: `server/mcp/server.js` publishes the registry over the
    Model Context Protocol (low-level `Server`; each tool's params → JSON Schema `inputSchema`;
    `tools/call` runs `registry.run`; failures returned as `isError` results). `server/mcp/index.js`
    is the stdio entrypoint (`npm run mcp`) — builds an RLS-scoped client from `CALLBACK_ACCESS_TOKEN`
    for `vault_search`, pure tools work without it; logs to stderr only. Added `@modelcontextprotocol/sdk`.
    Tests: `server/tests/mcp.unit.test.js` (5/5 — real MCP Client over in-memory transport); also
    verified E2E against the stdio entrypoint via a child-process client.
- **Phase 3 — DONE (uncommitted)**: JD-based interview question generation — the first *new*
  agent built on the agentic layer, and the first flow to actually drive the **ReAct loop**
  (`harness/agent/loop.js`), not just the orchestrator.
  - `lib/questions.js`: behavioral (STAR-eliciting) question generation. LLM path
    (`generateQuestionsGrounded`, task `question_gen`, returns JSON `{questions:[{text,competency,
    source}]}`, falls back if the model returns nothing) + deterministic `generateQuestionsFallback`
    that round-robins three pools — Career Vault-grounded, JD-skill, and role-agnostic competency
    questions — so sensible questions come out with **no LLM at all**. `source` is a vault item id,
    `'jd'`, or `'core'`.
  - New tool `question_gen` in `harness/agent/registry.js` (params `job` req, `items?`, `count?`);
    now the registry is 5 tools, published unchanged over MCP.
  - `lib/interview.js` `generateInterviewQuestions(db, {job, count, complete})`: model configured →
    runs the **ReAct loop** over `vault_search`+`question_gen`; the authoritative structured
    questions are read from the recorded `question_gen` observation in the trace (loop drives *tool
    selection*, tool owns the output shape). No model → deterministic direct tool calls with
    best-effort vault grounding. Returns `mode: agentic | agentic-fallback | deterministic`.
  - Migration `003_interview.sql`: `interview_sessions` (user/job scoped, records `mode`) +
    `questions` (position-ordered, `competency`, `source`), both RLS owner-scoped.
  - Routes `routes/interview.js` (mounted `/api/interview`): `POST/GET/DELETE /sessions[/:id]`
    (persist a session + its questions for a saved job) and stateless `POST /preview` (generate from
    an ad-hoc JD, mirrors `/api/vault/search`).
  - Tests: `server/tests/interview.unit.test.js` (10/10 hermetic — deterministic generator incl. a
    dedup/termination regression, the `question_gen` tool, the deterministic + injected-completer
    ReAct + fallback agent paths). Agent/MCP registry-name tests updated to 5 tools. All suites green
    (interview 10, agent 12, mcp 5, vault 7).
  - **Bug found + fixed during verify:** `generateQuestionsFallback`'s round-robin terminated on a
    total that counted duplicates, so colliding question texts (real vault items do collide) spun a
    synchronous infinite loop and hung the request. Loop is now index-bounded; regression test added.
  - Verified E2E against live Supabase (demo login, deterministic path): preview, persist a
    5-question session (ordered, first bullet grounded in a real vault item id), GET/list, 400 on
    missing `job_id`, 204 delete with question cascade, 404 after — no server errors.
  - **Next:** Phase 4 (Interview Studio + swappable voice) — video capture + transcript and the
    `webspeech`/`realtime` voice seam; a frontend to run these sessions. Optional: `ollama pull
    qwen2.5:3b` to exercise the `agentic` (model-driven) path end-to-end.

## Phases (planned)

1. **Career Vault + provenance-aware, RAG-grounded tailoring** — DONE (see Status).
   - `career_items` data model; pgvector semantic retrieval (reuse Module 3 chunking).
   - Tailoring cites source `career_item` IDs; unsupported bullets flagged (groundedness check).
2. **Agentic harness (Node-native + MCP)** ← next milestone. Turn the provider router into a
   real agent loop and orchestrator; keep free/local + mock working throughout.
   - **Tool registry + agent loop:** define tools (vault search, score, question-gen, grounding
     check) with typed schemas; a reason→act→observe loop drives tool-calling models, and a
     deterministic single-pass path covers the no-model/weak-model case.
   - **Orchestrator:** sequences the specialized agents (tailor → question-gen → STAR-critique)
     following Module 2's pattern (shared spec, isolated tasks, failures isolated not cascading).
   - **MCP tool layer:** wrap the tool registry behind an MCP server (JS SDK,
     `@modelcontextprotocol/sdk`) so tools are consumable internally now and by external agents
     later. `GET /api/llm/status` reports the agentic/MCP mode.
3. **JD-based interview question generation** (`question_gen` tool + `lib/interview.js` agent;
   `interview_sessions`/`questions` tables) — DONE (see Status). First flow to drive the ReAct loop.
4. **Interview Studio + swappable voice** — video capture + transcript (getUserMedia/MediaRecorder).
   - **Voice provider seam** mirroring the LLM router: `webspeech` (browser STT+TTS, $0 default)
     and an opt-in `realtime` provider (OpenAI `gpt-realtime-2.1-mini` or Gemini Live —
     WebSocket speech-to-speech from Node, no ADK). Selected via env; free path always works.
5. **STAR critique** + streamed feedback report (agentic: retrieve rubric → critique → verify).
6. **External job-board search** — connect to open-jobs source(s); dark-mode UI polish;
   manual→automated Company Dossier signals (web-search agent); interviewer TTS; tests.
7. **Product hardening** — guardrails (Module 4 / Llama Guard) on untrusted input/output, per-user
   cost caps + rate limiting, observability/tracing, billing. Gate before public/customer launch.

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
