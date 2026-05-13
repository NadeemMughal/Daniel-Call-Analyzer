-- =============================================================
-- 0005_failed_executions.sql — Capture every n8n workflow failure
--   The error-handler workflow writes a row here whenever any other
--   workflow throws. Gives us a queryable history of what broke,
--   when, and why - so production failures don't disappear.
-- =============================================================

create table if not exists failed_executions (
  id                uuid primary key default uuid_generate_v4(),
  workflow_id       text,
  workflow_name     text,
  execution_id      text,
  node_name         text,
  error_message     text,
  error_stack       text,
  payload_excerpt   jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_failed_executions_workflow_id on failed_executions(workflow_id);
create index if not exists idx_failed_executions_created_at on failed_executions(created_at desc);

alter table failed_executions enable row level security;

-- Public read for the portal (matches 0003 pattern)
drop policy if exists "demo_public_read" on failed_executions;
create policy "demo_public_read" on failed_executions for select to anon using (true);
