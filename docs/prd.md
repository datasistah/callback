# JobTailor — PRD

_Built with Sprint Zero. Reference: Teal (TealHQ). Level: Prod._

## 1. Problem statement

Job seekers in data and AI apply to many roles, and the applications that land interviews are the ones tailored to the specific job. Tailoring by hand — rewriting a resume, drafting a fresh cover letter, and guessing whether it actually matches the posting — is slow and easy to skip when you are applying to ten roles a week. JobTailor gives a job seeker one place to save a job, tailor a resume and cover letter to it, and see a concrete match score that tells them whether the tailoring worked before they hit apply. This matters now because AI makes per-job tailoring fast enough to do every time, and a visible score turns "I think this is good" into "this is an 82, here's what's missing."

## 2. Goals

- Enable a user to save a job and produce a tailored resume + cover letter for it in under 5 minutes.
- Enable a user to see a match score (0–100) with a factor breakdown for a resume against a job, and watch it improve as they edit.
- Enable a user to track every saved job through a pipeline (Bookmarked → Applied → Interviewing → Offer) without leaving the app.
- Keep all of a user's jobs and documents private to their own account, persisted across sessions.
- Hold the experience to a Prod bar: no dead ends, every screen has a loading and empty state, and bad input is caught with a clear message.

## 3. Non-goals

- No browser extension or automated scraping of job boards (jobs are added by paste or URL + manual fields).
- No LinkedIn import, contacts/networking, email templates, analytics dashboards, or template gallery (reference features intentionally cut — see decisions).
- No auto-apply or submitting applications on the user's behalf.
- No team/multi-user collaboration; single-user accounts only.
- No payment tiers or AI-credit metering — all features are available to every signed-in user.

## 4. Users & use cases

Maya is a machine-learning engineer applying to 8–10 roles a week. She finds a "Senior ML Engineer" posting, pastes it into JobTailor, and within a few minutes has a resume tailored to the role and a cover letter that names the company's stack. Her match score comes back at 74; the breakdown flags three missing keywords (MLOps, feature store, Ray), she edits her resume to include the ones that are genuinely true of her, and the score climbs to 88 before she marks the job Applied.

Devang is a career coach (our buyer's client profile) helping data analysts switch into AI roles. He uses JobTailor to show a client, side by side, why their generic resume scores a 52 against a target job and how tailoring lifts it. The factor breakdown gives him concrete coaching points instead of vague advice.

Priya is a data scientist returning from a career break. She tracks six saved jobs on the pipeline board, sees at a glance which are still Bookmarked versus Applied, and reopens each one to refine the cover letter before interviews.

## 5. User stories

### Must-have

- As a new user, I want to sign up with email and password so that I can access the product.
- As a returning user, I want to log in so that I can see my own data.
- As a signed-in user, I want my session to persist across reloads so that I don't have to log in every time.
- As a signed-in user, I want to log out so that my session ends.
- As a signed-in user, I want to add a job (by pasting a description or URL plus title and company) so that I can tailor documents to it.
- As a signed-in user, I want to see all my saved jobs on a pipeline board grouped by status so that I know where each application stands.
- As a signed-in user, I want to move a job between pipeline stages (Bookmarked → Applied → Interviewing → Offer) so that my tracker reflects reality.
- As a signed-in user, I want to tailor a resume to a specific saved job so that my application fits that role.
- As a signed-in user, I want to generate a cover letter for a specific saved job so that I don't write one from scratch.
- As a signed-in user, I want a match score (0–100) with a factor breakdown for my resume against a job so that I know how well it fits before applying.

### Should-have

- As a signed-in user, I want to edit the tailored resume and re-score it so that I can watch the match score improve.
- As a signed-in user, I want to store a base resume/profile once so that tailoring has my history to work from.
- As a signed-in user, I want to delete a job so that my board stays relevant.
- As a signed-in user, I want to see the missing keywords from the job description so that I know what to add.

### Nice-to-have

- As a signed-in user, I want to import my LinkedIn profile so that I don't type my history (reference feature, out of scope).
- As a signed-in user, I want to save a job from any job board with one click (browser extension, out of scope).
- As a signed-in user, I want multiple named resume versions per job (out of scope for v1).

## 6. Acceptance criteria

**Sign up**
- Given I am on the sign-up page, When I enter a valid email and a password of at least 8 characters and submit, Then my account is created and I land in the app signed in.
- Error path: Given I enter an email already in use or a password under 8 characters, When I submit, Then I see a specific inline error and no account is created.

**Log in**
- Given I have an account, When I enter correct credentials and submit, Then I am signed in and see my own jobs.
- Error path: Given I enter wrong credentials, When I submit, Then I see an "invalid email or password" message and stay on the login page.

**Session persistence**
- Given I am signed in, When I reload the page, Then I remain signed in and see my data without logging in again.
- Error path: Given my session token is expired/invalid, When I load a protected page, Then I am redirected to login rather than shown a broken page.

**Log out**
- Given I am signed in, When I click log out, Then my session ends and I am returned to the login page; protected routes are no longer accessible.
- Error path: Given I am logged out, When I navigate directly to a protected URL, Then I am redirected to login.

**Add a job**
- Given I am signed in, When I submit the add-job form with a title, company, and a description (pasted text or URL), Then the job is saved to my account and appears in the Bookmarked column.
- Error path: Given I submit with an empty title or empty description, When I save, Then I see a validation error and the job is not created.

**View pipeline board**
- Given I have saved jobs, When I open the board, Then I see them grouped under Bookmarked / Applied / Interviewing / Offer.
- Empty/loading: Given I have no jobs, When I open the board, Then I see an empty state inviting me to add my first job; while jobs load I see a loading indicator.

**Move a job between stages**
- Given a job exists, When I change its status, Then it moves to the new column and the change persists across reload.
- Error path: Given the update request fails, When I change status, Then the card reverts and I see an error toast.

**Tailor a resume to a job**
- Given a saved job and my base profile, When I request a tailored resume, Then a resume tailored to that job is generated, saved against the job, and displayed.
- Error path: Given generation fails or no base profile exists, When I request tailoring, Then I see a clear message telling me what to fix, not a spinner that never ends.

**Generate a cover letter for a job**
- Given a saved job and my base profile, When I request a cover letter, Then a personalized cover letter is generated, saved against the job, and displayed.
- Error path: Given generation fails, When I request it, Then I see a retryable error message.

**Match score with breakdown**
- Given a tailored resume and a job description, When I request a score, Then I see a number 0–100 plus a breakdown of factors (matched keywords, missing keywords, skills coverage) and the score persists with the resume.
- Error path: Given the resume or job description is empty, When I request a score, Then I see a message explaining what is required rather than a score of 0 with no context.

## 7. Risks & assumptions

**Risks**
- LLM dependency: tailoring and cover-letter generation need an LLM API key. If none is configured, those features must degrade gracefully (clear message), and the match score should still work as a deterministic keyword/skills heuristic.
- Supabase free-tier limits (row caps, rate limits) could bite under demo load; unlikely at 5–10 users but worth noting.
- Match-score credibility: if the score feels arbitrary, the signature feature loses trust. The factor breakdown must make the number explainable.

**Assumptions**
- [ASSUMPTION] The match score is computed for a resume against a single job description; it does not compare across multiple jobs.
- [ASSUMPTION] A user maintains one base profile/resume that tailoring draws from; multiple base resumes are out of scope for v1.
- [ASSUMPTION] Jobs added "by URL" store the URL and any pasted text; we do not crawl the URL to extract the description automatically.
- [ASSUMPTION] Seed data centers on data/AI roles for demo realism; the app is not domain-locked.

## 8. Open questions

- Should the match score be LLM-computed or a deterministic heuristic when an LLM key is present? (Default: heuristic for the score so it is fast and explainable; LLM for tailoring/cover-letter text.) Not blocking.
- Should "missing keywords" be clickable to auto-insert into the resume? Deferred to post-v1. Not blocking.

## 9. Success metrics

- Leading indicator: % of saved jobs that get at least one tailored document within the first session (target ≥ 60%).
- Leading indicator: median time from "add job" to "first match score" under 5 minutes.
- Lagging indicator: average match-score lift between a user's first and best resume version per job (target +15 points).
- Lagging indicator: % of users who move at least one job to "Applied" (target ≥ 70% of active users).
