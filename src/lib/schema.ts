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
];
