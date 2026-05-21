create table if not exists member_notes (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references team_members(id) on delete cascade,
  author_id  uuid not null references team_members(id) on delete cascade,
  content    text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_member_notes_member on member_notes(member_id);
create index if not exists idx_member_notes_author on member_notes(author_id);

alter table member_notes enable row level security;
create policy "member_notes_read_authenticated" on member_notes
  for select to authenticated using (true);
