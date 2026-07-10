# Reference brief — Teal (TealHQ)

**Company URL:** https://www.tealhq.com
**Repo URL:** not provided
**Language(s):** n/a

---

## What it does

Teal is a career-growth platform that helps job seekers run their entire search from one place. Its three pillars are a job application tracker (save and organize roles from any job board), an AI resume builder (write and tailor resumes to a specific job, with a match score against the job description), and AI writing tools (cover letters, professional summaries, achievement bullets). It targets active job seekers who are applying to many roles and want to tailor each application without rebuilding their resume from scratch each time. Most of our build's seed data will be in the data and AI field (Data Scientist, ML Engineer, AI Engineer, Data Analyst), reflecting our user's client base.

## Core user flow

1. The user finds a job (on a job board or by pasting a description) and saves it to their tracker.
2. The saved job lands in a pipeline/kanban (Bookmarked → Applied → Interviewing → Offer).
3. The user opens a job and tailors a resume to it — Teal compares the resume against the job description and returns a match score (keyword overlap, skills, formatting factors) with recommendations.
4. The user generates a tailored cover letter for the same job using their history plus the job's requirements.
5. The user iterates on the resume/cover letter until the match score improves, then marks the job as Applied.

## How it works (high level)

- A web app backed by a per-user data store of jobs, resumes, and generated documents; a browser extension scrapes job postings into the tracker.
- AI features call an LLM (Teal markets "advanced GPT technology") to generate cover letters, summaries, and bullets, and to compute resume-to-job alignment.
- The match score is a heuristic/AI comparison of resume text against the job description across ~15 factors (keywords, skills, structure, formatting).
- Content is organized around a job → documents relationship: each saved job can have its own tailored resume and cover letter.

## Feature inventory

| Feature | What it does |
|---------|--------------|
| Job tracker | Save jobs and organize them in a pipeline (Bookmarked → Applied → Interviewing → Offer). |
| Add job (paste/URL) | Add a job by pasting a description or a URL. |
| Chrome extension | One-click save of jobs from LinkedIn, Indeed, company sites. |
| Resume builder | Create/edit resumes section by section. |
| Resume tailoring + match score | Compare a resume to a job description, return a numeric match score and recommendations across ~15 factors. |
| AI cover letter generator | Generate a personalized cover letter from career history + job requirements. |
| AI summary/bullet writer | Generate professional summaries and achievement-rich bullets. |
| Keyword optimization | Surface missing keywords from the job description. |
| LinkedIn import | One-click import of profile data to seed a resume. |
| Multiple resume versions | Keep distinct resume versions per job/role. |
| Templates & export | Resume templates and PDF/download export. |
| Contacts / networking | Track contacts related to a job search. |
| Email templates | Outreach/follow-up email snippets. |
| Analytics | Job-search activity insights. |
| Pricing tiers (Free / Teal+) | Free tier with limited AI credits; Teal+ (~$29/mo) unlocks unlimited AI. |

## Data model (if repo provided)

n/a — no repo provided. Inferred entities for our build: **User**, **Job** (title, company, description, status, link), **Resume** (per user, optionally tied to a job, with content), **CoverLetter** (tied to a job), **MatchScore** (score + factor breakdown for a resume×job pairing).

## Key files and folders (if repo provided)

n/a — no repo provided.

## Who it's for

The person setting it up is a job seeker (here, often a career coach's client in data/AI) who wants one place to manage applications. The end user is that same job seeker, tailoring resumes and cover letters per role and tracking where each application stands.

## Things worth flagging

- **AI/LLM is central.** Cover letters, summaries, bullets, and the match-score recommendations are LLM-generated. Our build will need an LLM integration for tailoring + scoring; the match score can be a deterministic heuristic if no LLM key is available, but tailoring/cover-letter generation are the AI payload.
- **The match score is the signature feature** and the user's stated core loop — it must be concrete and visible (a number plus a short factor breakdown), not a vague label.
- **Browser extension and external job-board scraping are out of reach** for a Sprint Zero build — replace with manual "add job by paste/URL."
- **Networking, contacts, email templates, analytics, LinkedIn import, and the full template gallery are breadth features** likely to be cut to protect the core loop (job → tailored resume + cover letter + score).
- **Per-job document versioning matters.** The core loop assumes a resume and cover letter are tailored *to a specific job*, so the data model must tie documents to a job, not just to a user.
