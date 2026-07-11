-- Callback — Interview prep (Phase 3).
-- Safe to run repeatedly: every statement is IF NOT EXISTS / idempotent.
--
-- Adds:
--   interview_sessions — one interview-prep session per generation run, tied to
--                        a saved job. Holds the set of questions produced for it.
--   questions          — the behavioral questions generated for a session, each
--                        with the competency it probes and its source ('jd',
--                        'core', or a Career Vault item id it is grounded in).
--
-- Every row is scoped to a Supabase auth user via user_id. RLS is enabled and
-- policies restrict each user to their own rows; the Express layer additionally
-- scopes every query by req.user.id.

-- One interview-prep session per generation run, for a specific job.
create table if not exists interview_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  job_id      uuid not null references jobs (id) on delete cascade,
  -- How the questions were produced: 'agentic' (ReAct loop drove the model),
  -- 'agentic-fallback', or 'deterministic' (no model). Recorded for the trace /
  -- observability requirement, not just debug.
  mode        text not null default 'deterministic',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists interview_sessions_user_id_idx on interview_sessions (user_id);
create index if not exists interview_sessions_job_id_idx on interview_sessions (job_id);

-- Generated behavioral questions belonging to a session. `position` preserves
-- the generated order; `source` is 'jd', 'core', or a career_items id.
create table if not exists questions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references interview_sessions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  position    integer not null default 0,
  text        text not null,
  competency  text not null default 'Behavioral',
  source      text,
  created_at  timestamptz not null default now()
);

create index if not exists questions_session_id_idx on questions (session_id, position);
create index if not exists questions_user_id_idx on questions (user_id);

alter table interview_sessions enable row level security;
alter table questions          enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'interview_sessions' and policyname = 'interview_sessions_owner') then
    create policy interview_sessions_owner on interview_sessions
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'questions' and policyname = 'questions_owner') then
    create policy questions_owner on questions
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end$$;
