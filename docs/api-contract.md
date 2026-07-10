# API contract

_Sprint Zero build. Stack: Express + Supabase. Level: Prod._

## Auth

All user-facing auth (sign up, log in, log out, password reset) is handled client-side via `@supabase/supabase-js`. The Express backend does not expose `/auth/*` routes.

Protected endpoints require an `Authorization: Bearer <token>` header. The token is the Supabase session access token. Express middleware validates it against Supabase (JWKS / `supabase.auth.getUser`). Invalid or expired tokens return `401 Unauthorized`.

Every entity is scoped to the authenticated user by `user_id`. List endpoints return only the current user's records. Ownership is checked on every read and write; accessing another user's resource returns `404 Not Found` (not `403`, to avoid leaking existence).

## Base URL

`http://localhost:3001/api` (development). The backend listens on port **3001**; the frontend (Vite) runs on port **5173** and calls this base URL. Production URL is environment-configured.

## Entities

- `Job` — a saved job posting the user is tracking (title, company, description, url, status).
- `Profile` — the user's single base resume/profile text that tailoring draws from (one per user).
- `Resume` — a tailored resume generated for a specific job (one per job).
- `CoverLetter` — a tailored cover letter generated for a specific job (one per job).
- `Score` — a match score (0–100) plus factor breakdown for a job's resume against its description (latest one per job).

Job status is one of: `bookmarked`, `applied`, `interviewing`, `offer`.

---

## Endpoints

### GET /api/profile

**Purpose:** Get the authenticated user's base profile.
**Auth:** required
**Request body:** none
**Response:** `200 OK`
```json
{
  "id": "8f2a1c4e-9b7d-4a3e-bc11-2d6f0a9e7c10",
  "content": "Senior Machine Learning Engineer with 6 years building recommendation systems in PyTorch...",
  "updated_at": "2026-06-10T14:22:00Z"
}
```
If the user has no profile yet: `200 OK` with `{ "id": null, "content": "", "updated_at": null }`.
**Error responses:** `401` `{ "error": "unauthorized", "message": "Invalid or expired session." }`
**Notes:** One profile per user. Never returns another user's profile.

### PUT /api/profile

**Purpose:** Create or update the authenticated user's base profile (upsert).
**Auth:** required
**Request body:**
```json
{ "content": "Data Scientist with 4 years in NLP and LLM evaluation. Built RAG pipelines on AWS..." }
```
**Response:** `200 OK`
```json
{
  "id": "8f2a1c4e-9b7d-4a3e-bc11-2d6f0a9e7c10",
  "content": "Data Scientist with 4 years in NLP and LLM evaluation. Built RAG pipelines on AWS...",
  "updated_at": "2026-06-13T09:05:00Z"
}
```
**Error responses:**
- `400` `{ "error": "validation_error", "message": "content is required." }` (empty content)
- `401` `{ "error": "unauthorized", "message": "Invalid or expired session." }`

---

### GET /api/jobs

**Purpose:** List the authenticated user's saved jobs.
**Auth:** required
**Request body:** none
**Response:** `200 OK`
```json
[
  {
    "id": "1b9d2f47-3c6a-4e10-8a5b-7c2e9f4d1a08",
    "title": "Senior Machine Learning Engineer",
    "company": "Northwind AI",
    "description": "We are hiring an ML engineer to own our recommendation stack. Required: Python, PyTorch, MLOps, feature stores, Ray...",
    "url": "https://northwind.ai/careers/sr-ml-engineer",
    "status": "bookmarked",
    "created_at": "2026-06-12T16:40:00Z"
  },
  {
    "id": "44a1e0b2-8d3c-4f59-9c77-1e6a2b5d3f90",
    "title": "Applied AI Engineer",
    "company": "Halcyon Labs",
    "description": "Build LLM-powered features end to end. Required: Python, LangChain, evaluation, prompt engineering...",
    "url": "https://halcyonlabs.com/jobs/applied-ai-engineer",
    "status": "applied",
    "created_at": "2026-06-11T10:15:00Z"
  }
]
```
**Error responses:** `401` `{ "error": "unauthorized", "message": "Invalid or expired session." }`
**Notes:** Returns only the current user's jobs. Empty list returns `200 OK` with `[]`.

### GET /api/jobs/:id

**Purpose:** Get one job by id, with its tailored documents and latest score if present.
**Auth:** required
**Request body:** none
**Response:** `200 OK`
```json
{
  "id": "1b9d2f47-3c6a-4e10-8a5b-7c2e9f4d1a08",
  "title": "Senior Machine Learning Engineer",
  "company": "Northwind AI",
  "description": "We are hiring an ML engineer to own our recommendation stack...",
  "url": "https://northwind.ai/careers/sr-ml-engineer",
  "status": "bookmarked",
  "created_at": "2026-06-12T16:40:00Z",
  "resume": {
    "id": "c2d4...",
    "content": "MAYA RIVERA — Senior ML Engineer\nTailored summary: 6 years building recommendation systems...",
    "updated_at": "2026-06-12T17:02:00Z"
  },
  "cover_letter": {
    "id": "e7f9...",
    "content": "Dear Northwind AI Hiring Team, I was excited to see your Senior ML Engineer role...",
    "updated_at": "2026-06-12T17:05:00Z"
  },
  "score": {
    "id": "9a0b...",
    "value": 74,
    "matched_keywords": ["python", "pytorch", "recommendation systems"],
    "missing_keywords": ["mlops", "feature store", "ray"],
    "skills_coverage": 0.68,
    "created_at": "2026-06-12T17:06:00Z"
  }
}
```
`resume`, `cover_letter`, and `score` are `null` when not yet generated.
**Error responses:**
- `401` `{ "error": "unauthorized", "message": "Invalid or expired session." }`
- `404` `{ "error": "not_found", "message": "Job not found." }` (missing or not owned by user)

### POST /api/jobs

**Purpose:** Create a new saved job.
**Auth:** required
**Request body:**
```json
{
  "title": "LLM Evaluation Engineer",
  "company": "Cobalt Systems",
  "description": "Own our model evaluation harness. Required: Python, eval frameworks, statistics, LLM-as-judge...",
  "url": "https://cobalt.systems/careers/llm-eval"
}
```
`url` is optional; `title`, `company`, and `description` are required.
**Response:** `201 Created`
```json
{
  "id": "7d5c3a91-2e8b-4061-bf42-9a0c1d7e6b53",
  "title": "LLM Evaluation Engineer",
  "company": "Cobalt Systems",
  "description": "Own our model evaluation harness...",
  "url": "https://cobalt.systems/careers/llm-eval",
  "status": "bookmarked",
  "created_at": "2026-06-13T09:10:00Z"
}
```
**Error responses:**
- `400` `{ "error": "validation_error", "message": "title and description are required." }`
- `401` `{ "error": "unauthorized", "message": "Invalid or expired session." }`
**Notes:** New jobs always start with `status: "bookmarked"`.

### PUT /api/jobs/:id

**Purpose:** Update a job's editable fields (title, company, description, url).
**Auth:** required
**Request body:** any subset of `{ "title", "company", "description", "url" }`.
**Response:** `200 OK` — the updated job (same shape as GET /api/jobs/:id without nested docs).
**Error responses:**
- `400` `{ "error": "validation_error", "message": "title cannot be empty." }`
- `401` unauthorized
- `404` `{ "error": "not_found", "message": "Job not found." }`

### PATCH /api/jobs/:id/status

**Purpose:** Move a job to a different pipeline stage (Story 7).
**Auth:** required
**Request body:**
```json
{ "status": "applied" }
```
`status` must be one of `bookmarked | applied | interviewing | offer`.
**Response:** `200 OK`
```json
{ "id": "1b9d2f47-3c6a-4e10-8a5b-7c2e9f4d1a08", "status": "applied" }
```
**Error responses:**
- `400` `{ "error": "validation_error", "message": "status must be one of bookmarked, applied, interviewing, offer." }`
- `401` unauthorized
- `404` not_found

### DELETE /api/jobs/:id

**Purpose:** Delete a job and cascade-delete its resume, cover letter, and scores.
**Auth:** required
**Request body:** none
**Response:** `204 No Content`
**Error responses:**
- `401` unauthorized
- `404` `{ "error": "not_found", "message": "Job not found." }`
**Notes:** Deletion cascades so no orphaned resume/cover-letter/score rows remain.

---

### POST /api/jobs/:id/resume/tailor

**Purpose:** Generate a tailored resume for this job from the user's base profile + job description (Story 8). Overwrites any existing tailored resume for the job.
**Auth:** required
**Request body:** none (uses the stored base profile and the job's description)
**Response:** `201 Created`
```json
{
  "id": "c2d4b8e6-1f3a-4d72-9e05-6b8c2a1f4d09",
  "job_id": "1b9d2f47-3c6a-4e10-8a5b-7c2e9f4d1a08",
  "content": "MAYA RIVERA — Senior ML Engineer\nSummary tailored to Northwind AI: 6 years building recommendation systems in PyTorch with MLOps and feature stores...",
  "updated_at": "2026-06-13T09:12:00Z"
}
```
**Error responses:**
- `400` `{ "error": "no_profile", "message": "Add your base profile before tailoring." }` (user has no/empty base profile)
- `401` unauthorized
- `404` not_found (job)
- `502` `{ "error": "generation_failed", "message": "Tailoring failed — try again." }` (LLM call failed)
- `503` `{ "error": "ai_not_configured", "message": "No AI key configured. Set one to enable tailoring." }` (no LLM key)
**Notes:** Requires an LLM API key (server-side env). If absent, returns `503` so the UI can show a configure-key message; the score endpoint still works without AI.

### GET /api/jobs/:id/resume

**Purpose:** Get the tailored resume for a job.
**Auth:** required
**Response:** `200 OK` — same shape as the tailor response, or `404` if none generated yet.
**Error responses:** `401` unauthorized · `404` `{ "error": "not_found", "message": "No resume for this job yet." }`

### PUT /api/jobs/:id/resume

**Purpose:** Edit and save the tailored resume text (Story 11).
**Auth:** required
**Request body:**
```json
{ "content": "MAYA RIVERA — Senior ML Engineer\n(edited) Added MLOps and Ray experience..." }
```
**Response:** `200 OK` — the updated resume.
**Error responses:**
- `400` `{ "error": "validation_error", "message": "content is required." }`
- `401` unauthorized · `404` not_found

---

### POST /api/jobs/:id/cover-letter/generate

**Purpose:** Generate a tailored cover letter for this job (Story 9). Overwrites any existing one.
**Auth:** required
**Request body:** none
**Response:** `201 Created`
```json
{
  "id": "e7f9a2c1-4b6d-4e80-bf13-7a2c9d5e1b04",
  "job_id": "1b9d2f47-3c6a-4e10-8a5b-7c2e9f4d1a08",
  "content": "Dear Northwind AI Hiring Team,\n\nI was excited to see your Senior ML Engineer role. Over the past six years I have...",
  "updated_at": "2026-06-13T09:14:00Z"
}
```
**Error responses:**
- `400` `{ "error": "no_profile", "message": "Add your base profile before generating a cover letter." }`
- `401` unauthorized · `404` not_found
- `502` `{ "error": "generation_failed", "message": "Generation failed — try again." }`
- `503` `{ "error": "ai_not_configured", "message": "No AI key configured. Set one to enable generation." }`

### GET /api/jobs/:id/cover-letter

**Purpose:** Get the cover letter for a job.
**Auth:** required
**Response:** `200 OK` — same shape, or `404` if none yet.
**Error responses:** `401` unauthorized · `404` `{ "error": "not_found", "message": "No cover letter for this job yet." }`

---

### POST /api/jobs/:id/score

**Purpose:** Compute a match score for the job's tailored resume against its description (Story 10). Deterministic keyword/skills heuristic — no LLM required. Stores the latest score.
**Auth:** required
**Request body:** none (scores the job's current resume against the job description)
**Response:** `201 Created`
```json
{
  "id": "9a0bd3c7-5e21-4f88-9a6c-3d1e7b2f0c45",
  "job_id": "1b9d2f47-3c6a-4e10-8a5b-7c2e9f4d1a08",
  "value": 74,
  "matched_keywords": ["python", "pytorch", "recommendation systems", "aws"],
  "missing_keywords": ["mlops", "feature store", "ray"],
  "skills_coverage": 0.68,
  "created_at": "2026-06-13T09:16:00Z"
}
```
**Error responses:**
- `400` `{ "error": "no_resume", "message": "Tailor or add a resume before scoring." }` (job has no resume)
- `400` `{ "error": "empty_description", "message": "This job needs a description to score against." }`
- `401` unauthorized · `404` not_found
**Notes:** `value` is an integer 0–100. `skills_coverage` is a 0–1 float. The score is recomputed on each call and replaces the stored one. Works without any AI key.

### GET /api/jobs/:id/score

**Purpose:** Get the latest stored score for a job.
**Auth:** required
**Response:** `200 OK` — same shape as the POST response, or `404` if not scored yet.
**Error responses:** `401` unauthorized · `404` `{ "error": "not_found", "message": "No score for this job yet." }`

---

## Conventions

- All request and response bodies are JSON.
- Timestamps are ISO 8601 strings (e.g. `"2026-06-13T09:30:00Z"`).
- IDs are UUID v4 strings (Supabase default).
- The backend never returns `user_id` in response bodies — it's implicit from the session.
- `POST` returns `201 Created` with the created resource.
- `PUT` returns `200 OK` with the updated resource; `PATCH` returns `200 OK` with the changed fields.
- `DELETE` returns `204 No Content`.
- Error responses use shape: `{ "error": "short_code", "message": "Human readable." }`.
- Accessing a resource you don't own returns `404`, never another user's data.

## What agents must NOT do

- Do not add or remove endpoints without updating this file first.
- Do not change response shapes. The frontend and backend engineers build against this document in parallel — shape drift breaks the build.
- Do not skip JWT middleware on protected routes.
- Do not invent a different port. Backend is `3001`, frontend is `5173`.
