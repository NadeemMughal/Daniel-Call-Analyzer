-- =============================================================
-- 0006_analytics_views.sql — Analytics RPCs + performance indexes
-- =============================================================
-- These functions are callable by the frontend via supabase.rpc()
-- They use SECURITY DEFINER so they bypass RLS and can aggregate
-- data across all rows (needed for org-wide dashboards).
-- =============================================================

-- Open member_trends for demo/anon access (consistent with 0003)
drop policy if exists "demo_public_read" on member_trends;
create policy "demo_public_read" on member_trends
  for select to anon using (true);

-- ------------------------------------------------------------------
-- get_weekly_stats(weeks_back)
-- Returns one row per week for the last N weeks with call counts
-- and avg score. weeks_back defaults to 8.
-- ------------------------------------------------------------------
create or replace function get_weekly_stats(weeks_back integer default 8)
returns table(
  week_start  timestamptz,
  week_label  text,
  total_calls bigint,
  scored_calls bigint,
  avg_score   numeric
)
language sql
security definer
stable
as $$
  select
    gs.w                                        as week_start,
    to_char(gs.w, 'Mon DD')                     as week_label,
    count(distinct c.id)                        as total_calls,
    count(distinct sc.id)                       as scored_calls,
    round(avg(sc.overall_score)::numeric, 1)    as avg_score
  from generate_series(
    date_trunc('week', now() - ((weeks_back - 1)::text || ' weeks')::interval),
    date_trunc('week', now()),
    '1 week'::interval
  ) as gs(w)
  left join calls c
    on date_trunc('week', c.recorded_at) = gs.w
  left join scorecards sc
    on sc.call_id = c.id
   and sc.overall_score is not null
  group by gs.w
  order by gs.w asc;
$$;

-- ------------------------------------------------------------------
-- get_team_leaderboard()
-- Returns every team member who has at least one call, ranked by
-- avg score descending. Includes latest score_trend from member_trends.
-- ------------------------------------------------------------------
create or replace function get_team_leaderboard()
returns table(
  member_id    uuid,
  member_name  text,
  total_calls  bigint,
  scored_calls bigint,
  avg_score    numeric,
  score_trend  text
)
language sql
security definer
stable
as $$
  select
    tm.id                                        as member_id,
    tm.name                                      as member_name,
    count(distinct cp.call_id)::bigint           as total_calls,
    count(distinct sc.id)::bigint                as scored_calls,
    round(avg(sc.overall_score)::numeric, 1)     as avg_score,
    coalesce((
      select mt.score_trend
      from   member_trends mt
      where  mt.member_id = tm.id
      order  by mt.period_end desc
      limit  1
    ), 'NEW')                                    as score_trend
  from      team_members tm
  join      call_participants cp
    on      cp.team_member_id = tm.id
   and      cp.is_external = false
  left join scorecards sc
    on      sc.call_id = cp.call_id
   and      sc.overall_score is not null
  group by  tm.id, tm.name
  having    count(distinct cp.call_id) > 0
  order by  avg_score desc nulls last;
$$;

-- Grant execute to both anon (demo) and authenticated
grant execute on function get_weekly_stats   to anon, authenticated;
grant execute on function get_team_leaderboard to anon, authenticated;

-- ------------------------------------------------------------------
-- Performance indexes for analytics queries
-- ------------------------------------------------------------------
create index if not exists idx_scorecard_evidence_criterion_key
  on scorecard_evidence(criterion_key);

create index if not exists idx_rule_findings_rule_key
  on rule_findings(rule_key);

create index if not exists idx_scorecards_not_null_score
  on scorecards(overall_score) where overall_score is not null;

create index if not exists idx_member_trends_member_period
  on member_trends(member_id, period_end desc);

create index if not exists idx_call_participants_external
  on call_participants(team_member_id, is_external);
