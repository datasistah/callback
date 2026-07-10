-- Callback — Career Vault + provenance (Phase 1).
-- Safe to run repeatedly: every statement is IF NOT EXISTS / idempotent.
--
-- Adds:
--   career_items — longitudinal, atomic career facts (one bullet/skill/project
--                  per row) with a pgvector embedding for semantic retrieval.
--   resumes.provenance — per-bullet source map for the tailored resume: which
--                  career_item each bullet is grounded in, and whether the
--                  groundedness check passed.
--   match_career_items() — RLS-scoped similarity search RPC (SECURITY INVOKER),
--                  so the caller only ever matches against their own vault.
--
-- Embedding dimension is fixed at 768 (Ollama nomic-embed-text and the
-- deterministic no-model fallback both produce 768-d vectors). Switching to an
-- embedder of a different dimension requires re-embedding every row.

-- pgvector: the `vector` column type + distance operators.
create extension if not exists vector;

-- Kind of career fact (drives grouping / UI, not retrieval).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'career_item_kind') then
    create type career_item_kind as enum ('experience', 'project', 'achievement', 'skill', 'education');
  end if;
end$$;

-- One atomic career fact per row. Every row scoped to a Supabase auth user.
create table if not exists career_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        career_item_kind not null default 'experience',
  title       text not null default '',
  content     text not null,
  source      text,
  embedding   vector(768),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists career_items_user_id_idx on career_items (user_id);

-- Approximate-nearest-neighbour index for cosine distance. HNSW needs no
-- training and works well on small demo datasets (unlike ivfflat).
create index if not exists career_items_embedding_idx on career_items
  using hnsw (embedding vector_cosine_ops);

alter table career_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'career_items' and policyname = 'career_items_owner') then
    create policy career_items_owner on career_items
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end$$;

-- Per-bullet provenance for the tailored resume. Array of objects:
--   { text, source_id, source_title, grounded, similarity }
alter table resumes add column if not exists provenance jsonb not null default '[]'::jsonb;

-- Similarity search over the CALLER's own career items. Functions are
-- SECURITY INVOKER by default, so RLS on career_items applies to the caller —
-- one user can never match against another user's vault.
create or replace function match_career_items(
  query_embedding vector(768),
  match_count int default 6
)
returns table (
  id         uuid,
  kind       career_item_kind,
  title      text,
  content    text,
  source     text,
  similarity float
)
language sql
stable
as $$
  select
    ci.id,
    ci.kind,
    ci.title,
    ci.content,
    ci.source,
    1 - (ci.embedding <=> query_embedding) as similarity
  from career_items ci
  where ci.embedding is not null
  order by ci.embedding <=> query_embedding
  limit match_count;
$$;
