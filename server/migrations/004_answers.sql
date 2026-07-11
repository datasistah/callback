-- Callback — Interview answer scoring (Phase 5).
-- Safe to run repeatedly: every statement is IF NOT EXISTS / idempotent.
--
-- Adds:
--   answers — the candidate's transcribed spoken answer to a generated
--             interview question, plus its STAR grade. One answer per question
--             (re-recording / re-grading overwrites), so a UNIQUE constraint on
--             question_id lets the API upsert. The video recording itself is
--             NOT stored here — it lives only in the browser for the session;
--             we persist the transcript and the grade, which are what the
--             candidate comes back to review.
--
-- Grade shape mirrors lib/grade.js:
--   overall    — 0–100 blended score.
--   star       — jsonb { situation, task, action, result }, each 0–25, so the
--                 four components sum to the 0–100 STAR-structure sub-score.
--   relevance  — 0–100, how on-topic the answer is to the question asked.
--   feedback   — short coaching text.
--   grade_mode — 'llm' (a provider graded it) or 'deterministic' (the no-LLM
--                rubric), recorded for the observability requirement.
--
-- Every row is scoped to a Supabase auth user via user_id. RLS is enabled and
-- policies restrict each user to their own rows; the Express layer additionally
-- scopes every query by req.user.id.

create table if not exists answers (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references interview_sessions (id) on delete cascade,
  question_id  uuid not null references questions (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  transcript   text not null default '',
  overall      integer not null default 0,
  star         jsonb not null default '{"situation":0,"task":0,"action":0,"result":0}'::jsonb,
  relevance    integer not null default 0,
  feedback     text not null default '',
  grade_mode   text not null default 'deterministic',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One graded answer per question; the API upserts on this so re-recording an
  -- answer replaces its grade rather than piling up rows.
  unique (question_id)
);

create index if not exists answers_session_id_idx on answers (session_id);
create index if not exists answers_user_id_idx on answers (user_id);

alter table answers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'answers' and policyname = 'answers_owner') then
    create policy answers_owner on answers
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end$$;
