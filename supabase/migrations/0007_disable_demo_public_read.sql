-- =============================================================
-- 0007_disable_demo_public_read.sql — Remove demo open-access policies
-- =============================================================
-- Auth is now implemented in the portal. Drop the permissive anon-read
-- policies added in 0003 and the anon rubric write policy.
-- The user-scoped policies from 0001 handle all authenticated access.
-- =============================================================

drop policy if exists "demo_public_read" on calls;
drop policy if exists "demo_public_read" on scorecards;
drop policy if exists "demo_public_read" on scorecard_evidence;
drop policy if exists "demo_public_read" on rule_findings;
drop policy if exists "demo_public_read" on call_participants;
drop policy if exists "demo_public_read" on team_members;
drop policy if exists "demo_public_read" on clients;
drop policy if exists "demo_public_read" on departments;
drop policy if exists "demo_public_read" on rubrics;
drop policy if exists "demo_rubric_write" on rubrics;
