-- =============================================================
-- 0009_fix_rls_open_authenticated.sql
-- =============================================================
-- The team_members.supabase_user_id column is not yet populated,
-- so all existing RLS policies (which check supabase_user_id =
-- auth.uid()) lock every logged-in user out of their own data.
--
-- This migration replaces those policies with simple
-- "authenticated users can read everything" rules, which is
-- correct for an internal tool where everyone is an employee.
-- Write access stays restricted to admins.
-- =============================================================

-- ── calls ────────────────────────────────────────────────────
drop policy if exists "calls_read_participant" on calls;
create policy "calls_read_authenticated" on calls
  for select to authenticated using (true);

-- ── scorecards ───────────────────────────────────────────────
drop policy if exists "scorecards_read" on scorecards;
create policy "scorecards_read_authenticated" on scorecards
  for select to authenticated using (true);

-- ── scorecard_evidence ───────────────────────────────────────
drop policy if exists "scorecard_evidence_read" on scorecard_evidence;
create policy "scorecard_evidence_read_authenticated" on scorecard_evidence
  for select to authenticated using (true);

-- ── rule_findings ────────────────────────────────────────────
drop policy if exists "rule_findings_read" on rule_findings;
create policy "rule_findings_read_authenticated" on rule_findings
  for select to authenticated using (true);

-- ── call_participants ────────────────────────────────────────
drop policy if exists "call_participants_read" on call_participants;
create policy "call_participants_read_authenticated" on call_participants
  for select to authenticated using (true);

-- ── team_members ─────────────────────────────────────────────
drop policy if exists "team_members_read_own" on team_members;
create policy "team_members_read_authenticated" on team_members
  for select to authenticated using (true);

-- ── failed_executions ────────────────────────────────────────
drop policy if exists "demo_public_read" on failed_executions;
create policy "failed_executions_read_authenticated" on failed_executions
  for select to authenticated using (true);

-- ── Fix get_member_cards — handle NULL call_type ─────────────
-- The original jsonb_object_agg crashes when call_type is NULL.
-- This version coalesces NULL to 'other'.
create or replace function get_member_cards()
returns table(
  member_id           uuid,
  member_name         text,
  member_email        text,
  member_role         text,
  department_name     text,
  total_calls         bigint,
  scored_calls        bigint,
  avg_score           numeric,
  score_trend         text,
  last_call_at        timestamptz,
  call_type_breakdown jsonb
)
language sql security definer stable as $$
  with call_counts as (
    select
      cp.team_member_id,
      coalesce(c.call_type::text, 'other') as call_type,
      count(*) as cnt
    from call_participants cp
    join calls c on c.id = cp.call_id
    where cp.is_external = false
      and cp.team_member_id is not null
    group by cp.team_member_id, c.call_type
  ),
  member_calls as (
    select
      cp.team_member_id,
      count(distinct c.id)::bigint              as total_calls,
      count(distinct sc.id)::bigint             as scored_calls,
      round(avg(sc.overall_score)::numeric, 1)  as avg_score,
      max(c.recorded_at)                        as last_call_at
    from call_participants cp
    join calls c on c.id = cp.call_id
    left join scorecards sc on sc.call_id = c.id
    where cp.is_external = false
      and cp.team_member_id is not null
    group by cp.team_member_id
  ),
  type_totals as (
    select team_member_id, sum(cnt) as total_cnt
    from call_counts
    group by team_member_id
  ),
  type_breakdown as (
    select
      cc.team_member_id,
      jsonb_object_agg(
        cc.call_type,
        round((cc.cnt::numeric / tt.total_cnt), 3)
      ) as breakdown
    from call_counts cc
    join type_totals tt on tt.team_member_id = cc.team_member_id
    group by cc.team_member_id
  ),
  latest_trend as (
    select distinct on (member_id)
      member_id, score_trend
    from member_trends
    order by member_id, period_end desc
  )
  select
    tm.id,
    tm.name,
    tm.email,
    tm.role::text,
    d.name                                         as department_name,
    coalesce(mc.total_calls, 0),
    coalesce(mc.scored_calls, 0),
    mc.avg_score,
    lt.score_trend,
    mc.last_call_at,
    coalesce(tb.breakdown, '{}'::jsonb)
  from team_members tm
  left join departments d    on d.id  = tm.department_id
  left join member_calls mc  on mc.team_member_id = tm.id
  left join type_breakdown tb on tb.team_member_id = tm.id
  left join latest_trend lt  on lt.member_id = tm.id
  order by mc.avg_score desc nulls last;
$$;

grant execute on function get_member_cards to authenticated;

-- ── Backfill calls.department_id from primary participant ─────
-- Most calls have no department_id set. Assign it from the
-- internal team member's department who participated.
update calls c
set department_id = (
  select tm.department_id
  from call_participants cp
  join team_members tm on tm.id = cp.team_member_id
  where cp.call_id = c.id
    and cp.is_external = false
    and tm.department_id is not null
  order by cp.created_at asc
  limit 1
)
where c.department_id is null;
