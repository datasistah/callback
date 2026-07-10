# User stories

_Level: Prod. Expanded from `docs/prd.md`._

## Must-have

### Story 1 — Sign up

**Story:** As a new user, I want to sign up with email and password so that I can access the product.

**Acceptance criteria:**

- Given a new user on `/signup`, when they enter a valid email and a password of at least 8 characters and click "Create account", then a Supabase session is created and they land on `/board` with their email shown in the header.
- Given a user on `/signup`, when they submit a password under 8 characters, then an inline error "Password must be at least 8 characters" appears and no account is created.
- Given a user on `/signup`, when they submit an email already registered, then an inline error "That email is already in use" appears and they stay on `/signup`.

**Priority:** Must-have
**Effort:** Small

### Story 2 — Log in

**Story:** As a returning user, I want to log in so that I can see my own data.

**Acceptance criteria:**

- Given a registered user on `/login`, when they enter correct credentials and click "Log in", then a Supabase session is created and they land on `/board` showing only their own jobs.
- Given a user on `/login`, when they submit wrong credentials, then the message "Invalid email or password" appears and they stay on `/login`.

**Priority:** Must-have
**Effort:** Small

### Story 3 — Session persists across reload

**Story:** As a signed-in user, I want my session to persist across reloads so that I don't have to log in every time.

**Acceptance criteria:**

- Given a signed-in user on `/board`, when they reload the page, then they remain on `/board` and their jobs are visible without re-entering credentials.
- Given a user whose session token is expired or invalid, when they load `/board`, then they are redirected to `/login`.

**Priority:** Must-have
**Effort:** Small

### Story 4 — Log out

**Story:** As a signed-in user, I want to log out so that my session ends.

**Acceptance criteria:**

- Given a signed-in user, when they click "Log out" in the header, then their Supabase session ends and they are redirected to `/login`.
- Given a logged-out user, when they navigate directly to `/board`, then they are redirected to `/login`.

**Priority:** Must-have
**Effort:** Small

### Story 5 — Add a job

**Story:** As a signed-in user, I want to add a job by pasting its description or URL plus a title and company, so that I can tailor documents to it.

**Acceptance criteria:**

- Given a signed-in user on `/board`, when they click "Add job", fill in title, company, and a description, and click "Save", then the job is persisted to their account and appears as a card in the "Bookmarked" column.
- Given the add-job form, when the title or description is empty and the user clicks "Save", then a validation error appears under the empty field and no job is created.
- Given the add-job form, when the user provides a URL in the URL field, then the URL is saved and shown as a link on the job card.

**Priority:** Must-have
**Effort:** Medium

### Story 6 — View pipeline board

**Story:** As a signed-in user, I want to see all my saved jobs on a pipeline board grouped by status so that I know where each application stands.

**Acceptance criteria:**

- Given a signed-in user with saved jobs, when they open `/board`, then they see four columns — Bookmarked, Applied, Interviewing, Offer — with each job card under its current status.
- Given a signed-in user with no jobs, when they open `/board`, then they see an empty state with the text "Add your first job to get started".
- Given the board is loading jobs, when the request is in flight, then a loading indicator is visible.

**Priority:** Must-have
**Effort:** Medium

### Story 7 — Move a job between stages

**Story:** As a signed-in user, I want to move a job between pipeline stages so that my tracker reflects reality.

**Acceptance criteria:**

- Given a job in "Bookmarked", when the user changes its status to "Applied", then the card moves to the "Applied" column and remains there after a page reload.
- Given a status-change request that fails, when the user changes a job's status, then the card returns to its original column and an error toast "Could not update job" appears.

**Priority:** Must-have
**Effort:** Medium

### Story 8 — Tailor a resume to a job

**Story:** As a signed-in user, I want to tailor a resume to a specific saved job so that my application fits that role.

**Acceptance criteria:**

- Given a saved job and a stored base profile, when the user opens the job at `/jobs/:id` and clicks "Tailor resume", then a tailored resume is generated, saved against that job, and displayed in the resume panel.
- Given a user with no base profile, when they click "Tailor resume", then a message "Add your base profile first" appears with a link to set it, and no spinner hangs.
- Given the generation request fails, when the user clicks "Tailor resume", then a retryable error "Tailoring failed — try again" appears.

**Priority:** Must-have
**Effort:** Large

### Story 9 — Generate a cover letter for a job

**Story:** As a signed-in user, I want to generate a cover letter for a specific saved job so that I don't write one from scratch.

**Acceptance criteria:**

- Given a saved job and a stored base profile, when the user clicks "Generate cover letter" at `/jobs/:id`, then a personalized cover letter is generated, saved against the job, and shown in the cover-letter panel.
- Given the generation request fails, when the user clicks "Generate cover letter", then a retryable error "Generation failed — try again" appears and no partial content is saved.

**Priority:** Must-have
**Effort:** Medium

### Story 10 — Match score with breakdown

**Story:** As a signed-in user, I want a match score with a factor breakdown for my resume against a job so that I know how well it fits before applying.

**Acceptance criteria:**

- Given a tailored resume and a job description, when the user clicks "Score match" at `/jobs/:id`, then a number 0–100 is displayed along with a breakdown listing matched keywords, missing keywords, and skills coverage, and the score persists with the resume after reload.
- Given a job with no resume yet, when the user clicks "Score match", then a message "Tailor or add a resume first" appears instead of a score.
- Given an empty job description, when the user clicks "Score match", then a message explaining a description is required appears rather than a score of 0.

**Priority:** Must-have
**Effort:** Large

## Should-have

### Story 11 — Edit resume and re-score

**Story:** As a signed-in user, I want to edit the tailored resume and re-score it so that I can watch the match score improve.

**Acceptance criteria:**

- Given a tailored resume displayed at `/jobs/:id`, when the user edits the resume text and clicks "Save", then the changes persist across reload.
- Given an edited resume, when the user clicks "Score match" again, then a new score is computed and replaces the previous one.

**Priority:** Should-have
**Effort:** Medium

### Story 12 — Store a base profile

**Story:** As a signed-in user, I want to store a base resume/profile once so that tailoring has my history to work from.

**Acceptance criteria:**

- Given a signed-in user on `/profile`, when they paste their base resume/profile text and click "Save", then it persists to their account and is available to tailoring on every job.
- Given a returning user, when they open `/profile`, then their previously saved base profile is shown.

**Priority:** Should-have
**Effort:** Small

### Story 13 — Delete a job

**Story:** As a signed-in user, I want to delete a job so that my board stays relevant.

**Acceptance criteria:**

- Given a job card, when the user clicks "Delete" and confirms, then the job and its documents are removed and the card disappears from the board, persisting after reload.
- Given a delete request that fails, when the user confirms deletion, then the card remains and an error toast appears.

**Priority:** Should-have
**Effort:** Small

### Story 14 — See missing keywords

**Story:** As a signed-in user, I want to see the missing keywords from the job description so that I know what to add.

**Acceptance criteria:**

- Given a computed match score, when the user views the breakdown at `/jobs/:id`, then a "Missing keywords" list shows terms present in the job description but absent from the resume.
- Given a resume that already covers all detected keywords, when the score is computed, then the "Missing keywords" list shows "None — strong keyword coverage".

**Priority:** Should-have
**Effort:** Small

## Nice-to-have

- As a user, I want to import my LinkedIn profile so I don't type my history (out of scope — OAuth).
- As a user, I want a browser extension to save jobs from any board in one click (out of scope).
- As a user, I want multiple named resume versions per job (deferred to v2).

## Edge cases to discuss

- **Cross-account isolation:** a user must never see another user's jobs or documents. Every job/resume/cover-letter query must be scoped to the authenticated user id (verify with two seeded accounts).
- **Tailoring without an LLM key:** if no AI key is configured, "Tailor resume" and "Generate cover letter" must return a clear configure-key message, while "Score match" still works as a heuristic (error path for Stories 8 and 9).
- **Scoring an empty/very short description:** scoring must require a non-trivial job description and resume, returning a guidance message rather than a misleading 0 (error path for Story 10).
- **Status update race / network failure:** a failed status change must revert the card optimistically rather than leaving the board in a false state (error path for Story 7).
- **Deleting a job with documents:** deleting a job must cascade to its tailored resume, cover letter, and score so no orphaned rows remain (error path for Story 13).

## Questions for the team

1. When no LLM API key is configured, should "Tailor resume" fall back to a templated resume derived from the base profile + job keywords, or block with a configure-key message? (Default assumed: block with a clear message; score still works.) Not blocking — heuristic score covers the demo.
2. Should the base profile be required before a user can add jobs, or only before tailoring? (Default assumed: only before tailoring.) Not blocking.
