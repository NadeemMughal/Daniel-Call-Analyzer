-- =============================================================
-- 0001_init.sql — Call Analyzer initial schema
-- =============================================================

-- Enable extensions
create extension if not exists "uuid-ossp";
-- pgvector is not required for V1 (no vector columns yet). If you ever need it,
-- enable via Supabase Dashboard -> Database -> Extensions -> "vector".

-- =============================================================
-- Enums
-- =============================================================

create type call_type_enum as enum (
  'discovery',
  'ads_intro',
  'launch',
  'follow_up',
  'team',
  'other'
);

create type call_status_enum as enum (
  'pending',
  'processing',
  'scored',
  'failed'
);

create type call_source_enum as enum (
  'fathom',
  'manual'
);

create type participant_role_enum as enum (
  'host',
  'guest'
);

create type severity_enum as enum (
  'critical',
  'warning',
  'info'
);

create type member_role_enum as enum (
  'admin',
  'manager',
  'rep'
);

-- =============================================================
-- Tables
-- =============================================================

create table clients (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  leadhub_id  text,
  created_at  timestamptz not null default now()
);

create table departments (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  kind        text not null default 'sales',
  created_at  timestamptz not null default now()
);

create table team_members (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  email            text not null unique,
  department_id    uuid references departments(id) on delete set null,
  role             member_role_enum not null default 'rep',
  supabase_user_id uuid,
  created_at       timestamptz not null default now()
);

create table calls (
  id                   uuid primary key default uuid_generate_v4(),
  client_id            uuid references clients(id) on delete set null,
  department_id        uuid references departments(id) on delete set null,
  call_type            call_type_enum,
  source               call_source_enum not null default 'fathom',
  source_id            text unique,
  recorded_at          timestamptz,
  duration_seconds     integer,
  audio_url            text,
  transcript_raw       text,
  transcript_segments  jsonb,
  status               call_status_enum not null default 'pending',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table call_participants (
  id             uuid primary key default uuid_generate_v4(),
  call_id        uuid not null references calls(id) on delete cascade,
  team_member_id uuid references team_members(id) on delete set null,
  name           text,
  email          text,
  role           participant_role_enum not null default 'guest',
  is_external    boolean not null default false,
  created_at     timestamptz not null default now()
);

create table rubrics (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  version     integer not null default 1,
  content     jsonb not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table scorecards (
  id             uuid primary key default uuid_generate_v4(),
  call_id        uuid not null references calls(id) on delete cascade,
  rubric_id      uuid references rubrics(id) on delete set null,
  overall_score  numeric(3,1),
  summary        text,
  strengths      jsonb,
  improvements   jsonb,
  llm_model      text,
  created_at     timestamptz not null default now()
);

create table scorecard_evidence (
  id                uuid primary key default uuid_generate_v4(),
  scorecard_id      uuid not null references scorecards(id) on delete cascade,
  criterion_key     text not null,
  quote             text not null,
  timestamp_seconds integer,
  created_at        timestamptz not null default now()
);

create table rule_findings (
  id               uuid primary key default uuid_generate_v4(),
  call_id          uuid not null references calls(id) on delete cascade,
  rule_key         text not null,
  value            jsonb,
  severity         severity_enum not null default 'warning',
  context_snippets jsonb,
  created_at       timestamptz not null default now()
);

-- =============================================================
-- Indexes
-- =============================================================

create index idx_calls_status        on calls(status);
create index idx_calls_call_type     on calls(call_type);
create index idx_calls_department_id on calls(department_id);
create index idx_calls_client_id     on calls(client_id);
create index idx_calls_recorded_at   on calls(recorded_at desc);

create index idx_call_participants_call_id        on call_participants(call_id);
create index idx_call_participants_team_member_id on call_participants(team_member_id);

create index idx_scorecards_call_id on scorecards(call_id);
create index idx_scorecard_evidence_scorecard_id on scorecard_evidence(scorecard_id);

create index idx_rule_findings_call_id  on rule_findings(call_id);
create index idx_rule_findings_severity on rule_findings(severity);

-- =============================================================
-- updated_at trigger
-- =============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger calls_updated_at
  before update on calls
  for each row execute function set_updated_at();

-- =============================================================
-- Row Level Security
-- =============================================================

alter table clients            enable row level security;
alter table departments        enable row level security;
alter table team_members       enable row level security;
alter table calls              enable row level security;
alter table call_participants  enable row level security;
alter table rubrics            enable row level security;
alter table scorecards         enable row level security;
alter table scorecard_evidence enable row level security;
alter table rule_findings      enable row level security;

-- Service role bypasses RLS (n8n uses service role key)

-- Rubrics: all authenticated users can read; only admin can write
create policy "rubrics_read" on rubrics
  for select to authenticated using (true);

create policy "rubrics_admin_write" on rubrics
  for all to authenticated
  using (
    exists (
      select 1 from team_members
      where supabase_user_id = auth.uid()
        and role = 'admin'
    )
  );

-- Team members: read own row or manager/admin reads all in dept
create policy "team_members_read_own" on team_members
  for select to authenticated
  using (
    supabase_user_id = auth.uid()
    or exists (
      select 1 from team_members tm
      where tm.supabase_user_id = auth.uid()
        and tm.role in ('manager', 'admin')
    )
  );

-- Calls: rep sees calls they participated in; manager sees dept; admin sees all
create policy "calls_read_participant" on calls
  for select to authenticated
  using (
    exists (
      select 1 from call_participants cp
      join team_members tm on tm.id = cp.team_member_id
      where cp.call_id = calls.id
        and tm.supabase_user_id = auth.uid()
    )
    or exists (
      select 1 from team_members tm
      where tm.supabase_user_id = auth.uid()
        and tm.role in ('manager', 'admin')
        and (tm.department_id = calls.department_id or tm.role = 'admin')
    )
  );

-- Scorecards: same visibility as calls
create policy "scorecards_read" on scorecards
  for select to authenticated
  using (
    exists (
      select 1 from calls c
      join call_participants cp on cp.call_id = c.id
      join team_members tm on tm.id = cp.team_member_id
      where c.id = scorecards.call_id
        and tm.supabase_user_id = auth.uid()
    )
    or exists (
      select 1 from team_members tm
      where tm.supabase_user_id = auth.uid()
        and tm.role in ('manager', 'admin')
    )
  );

-- Evidence & findings: same visibility as scorecards/calls
create policy "scorecard_evidence_read" on scorecard_evidence
  for select to authenticated
  using (
    exists (
      select 1 from scorecards s
      join calls c on c.id = s.call_id
      join call_participants cp on cp.call_id = c.id
      join team_members tm on tm.id = cp.team_member_id
      where s.id = scorecard_evidence.scorecard_id
        and tm.supabase_user_id = auth.uid()
    )
    or exists (
      select 1 from team_members tm
      where tm.supabase_user_id = auth.uid()
        and tm.role in ('manager', 'admin')
    )
  );

create policy "rule_findings_read" on rule_findings
  for select to authenticated
  using (
    exists (
      select 1 from calls c
      join call_participants cp on cp.call_id = c.id
      join team_members tm on tm.id = cp.team_member_id
      where c.id = rule_findings.call_id
        and tm.supabase_user_id = auth.uid()
    )
    or exists (
      select 1 from team_members tm
      where tm.supabase_user_id = auth.uid()
        and tm.role in ('manager', 'admin')
    )
  );

-- Departments: readable by all authenticated users
create policy "departments_read" on departments
  for select to authenticated using (true);

-- Clients: readable by authenticated users
create policy "clients_read" on clients
  for select to authenticated using (true);

-- Call participants: readable by authenticated users
create policy "call_participants_read" on call_participants
  for select to authenticated
  using (
    exists (
      select 1 from team_members tm
      where tm.supabase_user_id = auth.uid()
    )
  );
