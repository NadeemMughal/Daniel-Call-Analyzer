-- =============================================================
-- 0004_departments_and_members.sql
--   - Seed all WeBuildTrades departments so the portal can group calls by team
--   - Add team-member rows for each department so the host of a call can be linked
--   - Add 'department_kind_enum' to constrain the kind field
-- =============================================================

-- Add 'executive' kind for Daniel personal-strategy meetings (already exists as text)
-- (No enum change - departments.kind is plain text so any value works.)

-- Insert departments (idempotent on name+kind via NOT EXISTS)
insert into departments (id, name, kind) values
  ('00000000-0000-0000-0000-000000000001', 'Sales',                'sales')
on conflict (id) do nothing;

insert into departments (id, name, kind) values
  ('00000000-0000-0000-0000-000000000010', 'Executive',            'exec'),
  ('00000000-0000-0000-0000-000000000011', 'SEO',                  'seo'),
  ('00000000-0000-0000-0000-000000000012', 'Operations',           'ops'),
  ('00000000-0000-0000-0000-000000000013', 'Finance',              'finance'),
  ('00000000-0000-0000-0000-000000000014', 'Content & Marketing',  'content')
on conflict (id) do nothing;

-- Sample team members per department (idempotent)
-- Daniel as Executive admin
insert into team_members (id, name, email, department_id, role) values
  ('00000000-0000-0000-0001-000000000001', 'Daniel Brown',  'daniel@webuildtrades.com',  '00000000-0000-0000-0000-000000000010', 'admin')
on conflict (id) do nothing;

-- Sales team
insert into team_members (id, name, email, department_id, role) values
  ('00000000-0000-0000-0001-000000000002', 'Jazz',          'jazz@webuildtrades.com',    '00000000-0000-0000-0000-000000000001', 'manager'),
  ('00000000-0000-0000-0001-000000000003', 'Ben',           'ben@webuildtrades.com',     '00000000-0000-0000-0000-000000000001', 'rep'),
  ('00000000-0000-0000-0001-000000000004', 'Ruben',         'ruben@webuildtrades.com',   '00000000-0000-0000-0000-000000000001', 'rep'),
  ('00000000-0000-0000-0001-000000000005', 'Cole',          'cole@webuildtrades.com',    '00000000-0000-0000-0000-000000000001', 'rep'),
  ('00000000-0000-0000-0001-000000000006', 'Dom',           'dom@webuildtrades.com',     '00000000-0000-0000-0000-000000000001', 'rep')
on conflict (id) do nothing;

-- AI / Operations: Zain (AI lead, ops manager)
insert into team_members (id, name, email, department_id, role) values
  ('00000000-0000-0000-0001-000000000007', 'Zain Ali',      'zain@webuildtrades.com',    '00000000-0000-0000-0000-000000000012', 'manager')
on conflict (id) do nothing;

-- SEO team: placeholder for Kool / SEO lead
insert into team_members (id, name, email, department_id, role) values
  ('00000000-0000-0000-0001-000000000008', 'Kool',          'kool@webuildtrades.com',    '00000000-0000-0000-0000-000000000011', 'manager')
on conflict (id) do nothing;

-- Content & Marketing: placeholder for Cameron / video lead
insert into team_members (id, name, email, department_id, role) values
  ('00000000-0000-0000-0001-000000000009', 'Cameron',       'cameron@webuildtrades.com', '00000000-0000-0000-0000-000000000014', 'manager')
on conflict (id) do nothing;

-- Finance: placeholder
insert into team_members (id, name, email, department_id, role) values
  ('00000000-0000-0000-0001-00000000000A', 'Finance Lead',  'finance@webuildtrades.com', '00000000-0000-0000-0000-000000000013', 'manager')
on conflict (id) do nothing;

-- =============================================================
-- Public read for departments (already covered by 0003) - confirm
-- =============================================================
do $$ begin
  if not exists (select 1 from pg_policies where tablename='departments' and policyname='demo_public_read') then
    create policy "demo_public_read" on departments for select to anon using (true);
  end if;
end $$;
