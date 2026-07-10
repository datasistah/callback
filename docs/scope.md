# Sprint Zero — Scope

## Reference

- **Company URL:** https://tealhq.com
- **Repo URL:** not provided

## Build level

**Prod**

A polished build with real Supabase auth and data, error handling, loading states, and input validation — ready for 5–10 real users, with a Playwright happy path plus one error path per core loop.

## Core loop

A user finds or adds a job to their tracker, then tailors a resume and a cover letter to that specific job and receives a match score rating how well the tailored documents fit the job.

## Excludes

None specified.

## Assumptions made during scoping

- Build level stated explicitly as `Prod`. [ASSUMED] nothing — taken from the user.
- The core loop bundles three outputs against a saved job: a tailored resume, a tailored cover letter, and a numeric match score. [ASSUMED] the match score applies to the tailored resume/cover-letter pairing against the job description.
- Seed data will center on the **data and AI** field (e.g. Data Scientist, ML Engineer, AI Engineer, Data Analyst roles at realistic companies), because the user's clients are mostly in that field. [ASSUMED] for seed-data realism only; the app itself is not domain-locked.
