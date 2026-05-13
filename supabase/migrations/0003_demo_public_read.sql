-- =============================================================
-- 0003_demo_public_read.sql — Open read access for demo/portal
-- =============================================================
-- The frontend uses the Supabase anon key. The default RLS policies
-- in 0001 require auth.uid() (a logged-in user) so anonymous requests
-- return zero rows. For the demo (no auth yet) we add public-read
-- policies that let anon read everything. Writes stay restricted -
-- only n8n with the service role key can write.
--
-- Once you implement real auth, drop these "demo_public_read" policies
-- and rely on the user-scoped policies from 0001.
-- =============================================================

-- Drop any prior demo policies (idempotent)
drop policy if exists "demo_public_read"      on calls;
drop policy if exists "demo_public_read"      on scorecards;
drop policy if exists "demo_public_read"      on scorecard_evidence;
drop policy if exists "demo_public_read"      on rule_findings;
drop policy if exists "demo_public_read"      on call_participants;
drop policy if exists "demo_public_read"      on team_members;
drop policy if exists "demo_public_read"      on clients;
drop policy if exists "demo_public_read"      on departments;
drop policy if exists "demo_public_read"      on rubrics;

-- Add public read on every table
create policy "demo_public_read" on calls              for select to anon using (true);
create policy "demo_public_read" on scorecards         for select to anon using (true);
create policy "demo_public_read" on scorecard_evidence for select to anon using (true);
create policy "demo_public_read" on rule_findings      for select to anon using (true);
create policy "demo_public_read" on call_participants  for select to anon using (true);
create policy "demo_public_read" on team_members       for select to anon using (true);
create policy "demo_public_read" on clients            for select to anon using (true);
create policy "demo_public_read" on departments        for select to anon using (true);
create policy "demo_public_read" on rubrics            for select to anon using (true);

-- Allow rubric updates from anon for the in-app rubric editor.
-- (When real auth is in place, drop this and require admin role.)
drop policy if exists "demo_rubric_write" on rubrics;
create policy "demo_rubric_write" on rubrics for update to anon using (true) with check (true);
