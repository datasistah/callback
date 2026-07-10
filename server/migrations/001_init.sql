-- JobTailor schema (Sprint Zero, Prod).
-- Safe to run repeatedly: every statement is IF NOT EXISTS / idempotent.
--
-- Entities (from docs/api-contract.md):
--   profiles      — one base resume/profile per user
--   jobs          — saved job postings the user is tracking
--   resumes       — one tailored resume per job
--   cover_letters — one tailored cover letter per job
--   scores        — match scores per job (latest one is read back)
--
-- Every row is scoped to a Supabase auth user via user_id. RLS is enabled and
-- policies restrict each user to their own rows; the Express layer additionally
-- scopes every query by req.user.id.

-- Enum for the job pipeline stage.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type job_status as enum ('bookmarked', 'applied', 'interviewing', 'offer');
  end if;
end$$;

-- One base profile per user.
create table if not exists profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  content     text not null default '',
  updated_at  timestamptz not null default now()
);

-- Saved jobs.
create table if not exists jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  company     text not null,
  description text not null,
  url         text,
  status      job_status not null default 'bookmarked',
  created_at  timestamptz not null default now()
);

create index if not exists jobs_user_id_idx on jobs (user_id);

-- One tailored resume per job.
create table if not exists resumes (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null unique references jobs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null default '',
  updated_at  timestamptz not null default now()
);

create index if not exists resumes_user_id_idx on resumes (user_id);

-- One tailored cover letter per job.
create table if not exists cover_letters (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null unique references jobs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null default '',
  updated_at  timestamptz not null default now()
);

create index if not exists cover_letters_user_id_idx on cover_letters (user_id);

-- Match scores. The latest row per job is the one served.
create table if not exists scores (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references jobs (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  value            integer not null check (value between 0 and 100),
  matched_keywords jsonb not null default '[]'::jsonb,
  missing_keywords jsonb not null default '[]'::jsonb,
  skills_coverage  real not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists scores_job_id_created_at_idx on scores (job_id, created_at desc);
create index if not exists scores_user_id_idx on scores (user_id);

-- Row Level Security: each user sees only their own rows.
alter table profiles      enable row level security;
alter table jobs          enable row level security;
alter table resumes       enable row level security;
alter table cover_letters enable row level security;
alter table scores        enable row level security;

-- Policies (create-if-absent via the catalog check, since CREATE POLICY has no IF NOT EXISTS).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_owner') then
    create policy profiles_owner on profiles
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'jobs_owner') then
    create policy jobs_owner on jobs
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'resumes' and policyname = 'resumes_owner') then
    create policy resumes_owner on resumes
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'cover_letters' and policyname = 'cover_letters_owner') then
    create policy cover_letters_owner on cover_letters
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'scores' and policyname = 'scores_owner') then
    create policy scores_owner on scores
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end$$;
