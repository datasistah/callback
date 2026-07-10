# Decisions

_Sprint Zero build compared to Teal (TealHQ). Level: Prod._

## Why this document exists

We built JobTailor, a focused slice of what Teal does: save a job, tailor a resume and cover letter to it, and get a match score that tells you whether the tailoring worked. Teal is a broad career-growth suite — tracker, resume builder, AI writing, networking, analytics, a browser extension, and pricing tiers. We kept the one loop our user named as core (job → tailored resume + cover letter + score) and cut almost everything else. Because this is a Prod build for 5–10 real users, the cuts below are the ones that survive contact with real usage, not just demo shortcuts: each removed feature is one we judged the core loop does not need to be genuinely useful.

## Scope decisions

### Browser extension and job-board scraping

- **Reference does:** A Chrome extension saves jobs from LinkedIn, Indeed, and company sites in one click.
- **We chose to:** Let users add a job by pasting the description or a URL plus title and company.
- **Reason:** The core loop starts once a job is in the tracker; how it gets there is incidental. A browser extension is its own build and distribution problem, far outside a single Sprint Zero loop.

### LinkedIn import

- **Reference does:** One-click import of a LinkedIn profile to seed a resume.
- **We chose to:** Have the user store a base profile/resume once, by paste.
- **Reason:** Tailoring needs source history, but LinkedIn import requires OAuth and scraping we can't justify for the core loop. A pasted base profile feeds tailoring just as well.

### Contacts, networking, and email templates

- **Reference does:** Tracks contacts tied to a search and offers outreach/follow-up email templates.
- **We chose to:** Omit them entirely.
- **Reason:** None of these touch the job → tailored documents → score loop. They are a different job-search workflow.

### Analytics dashboard

- **Reference does:** Surfaces job-search activity insights.
- **We chose to:** Omit it.
- **Reason:** Analytics is a layer on top of having data; with one core loop and a handful of users, it adds no value yet.

### Template gallery and multiple resume versions

- **Reference does:** A gallery of resume templates and many named resume versions per role.
- **We chose to:** One tailored resume per job, rendered in a single clean layout.
- **Reason:** The score, not the visual template, is the signature of the core loop. Multiple versions per job is a should-have we deferred to keep the data model and UI simple at Prod quality.

### AI credits and pricing tiers

- **Reference does:** Free tier with limited AI credits; Teal+ unlocks unlimited AI.
- **We chose to:** Give every signed-in user every feature, no metering.
- **Reason:** Monetization is out of scope for a v1 build; metering would add billing complexity that does nothing for the core loop.

### Match score implementation

- **Reference does:** AI/GPT analysis across ~15 factors.
- **We chose to:** A deterministic keyword/skills heuristic for the score (matched keywords, missing keywords, skills coverage), with the LLM reserved for generating the tailored resume and cover letter text.
- **Reason:** A deterministic score is fast, explainable, and works even without an LLM key — which protects the signature feature's credibility. The factor breakdown makes the number defensible to a coach and their client.

## Technical decisions

### Stack: React + Vite + Express + Supabase

- **We chose:** React (Vite) on the frontend, Express on the backend, Supabase for Postgres and auth.
- **Reason:** Sprint Zero v1 ships one stack. The user brings their own Supabase project. Five minutes of setup, no server-side maintenance.

### Testing: Playwright via MCP

- **We chose:** Playwright driven by the QA sub-agent through the Playwright MCP.
- **Reason:** Browser-driven tests catch the real user journey, including the auth dance and the tailor→score loop. MCP lets the agent drive the browser without hand-wiring a test framework.

### Build level: Prod

- **We chose:** Prod.
- **Reason:** The user is putting this in front of real clients (data/AI job seekers and a coach), so it needs error handling, validation, and loading/empty states on every screen — not just a clickable walkthrough. Prod adds one error-path test per core loop so the signature features fail gracefully.

### LLM integration is optional-but-graceful

- **We chose:** Tailoring and cover-letter generation call an LLM if a key is configured; if not, they return a clear "configure an AI key" message while the match score keeps working as a heuristic.
- **Reason:** Keeps the app demoable and the score trustworthy even before an AI key is wired, and avoids a hard dependency that could block launch.

## What we'd add next

Ranked by user value per hour of work:

1. **Editable resume + live re-scoring** (should-have already in the PRD) — let users edit the tailored resume and watch the score move. Highest payoff: it turns the score from a verdict into a coaching loop, the heart of the product.
2. **Missing-keyword one-click insert** — make the breakdown's missing keywords clickable to add to the resume. Small build, directly closes the tailoring loop.
3. **Multiple resume versions per job** — restore the should-have so users can A/B tailorings against the same job.
4. **Crawl job URL to auto-extract the description** — removes the paste step for the most common add-job path.
5. **LinkedIn/base-profile import** — cut the cold-start typing for new users; higher effort due to OAuth.
