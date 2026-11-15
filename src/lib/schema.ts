// Every statement is idempotent, so the list runs on every start against any
// earlier state. Never edit an earlier statement: a database that already ran
// it would not see the edit. Add each change as a new statement at the end.
export const schemaStatements = [
  `create table if not exists requests (
    id uuid primary key default gen_random_uuid(),
    seq bigint generated always as identity,
    title text not null,
    details text not null default '',
    team text not null check (team in ('operations', 'finance', 'support')),
    priority text not null default 'medium'
      check (priority in ('low', 'medium', 'high')),
    status text not null default 'open'
      check (status in ('open', 'in_progress', 'closed')),
    created_at timestamptz not null default now()
  )`,
  `create index if not exists requests_created_at_idx
    on requests (created_at desc)`,
  `create index if not exists requests_team_status_idx
    on requests (team, status)`,
  `create table if not exists notes (
    id uuid primary key default gen_random_uuid(),
    seq bigint generated always as identity,
    title text not null default '',
    body text not null,
    created_at timestamptz not null default now()
  )`,
  // One sentence is one memory, whatever its kind: the unique index runs on
  // the visitor and the text, not the kind.
  `create table if not exists memories (
    id uuid primary key default gen_random_uuid(),
    visitor text not null,
    kind text not null,
    text text not null,
    created_at timestamptz not null default now(),
    unique (visitor, text)
  )`,
  // pgvector is optional: a Postgres without the extension keeps word search
  // and skips the embedding column below.
  `do $$ begin
    create extension if not exists vector;
  exception when others then
    raise notice 'pgvector is unavailable; knowledge search uses words only';
  end $$`,
  // One row per `##` section of a knowledge document. The tsvector is derived,
  // so it can never fall out of step with the text it indexes.
  `create table if not exists chunks (
    id uuid primary key default gen_random_uuid(),
    path text not null,
    section text not null,
    slug text not null,
    title text not null,
    heading text not null default '',
    position integer not null,
    text text not null,
    updated timestamptz not null default now(),
    search tsvector generated always as (
      to_tsvector('english', title || ' ' || heading || ' ' || text)
    ) stored,
    unique (path, position)
  )`,
  `create index if not exists chunks_search_idx on chunks using gin (search)`,
  `create index if not exists chunks_section_idx on chunks (section)`,
  // The embedding's size is part of the schema, so it must match the model:
  // voyage-3.5 returns 1024 values.
  `do $$ begin
    if exists (select 1 from pg_type where typname = 'vector') then
      execute 'alter table chunks add column if not exists embedding vector(1024)';
    end if;
  end $$`,
];
