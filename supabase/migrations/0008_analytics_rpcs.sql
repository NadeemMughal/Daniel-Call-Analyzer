-- =============================================================
-- 0008_analytics_rpcs.sql — Rich member cards + client stats RPCs
-- =============================================================

-- get_member_cards()
-- Powers the dashboard member grid. Returns one row per team member with
-- aggregated call stats, call-type breakdown percentages, and latest trend.
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
language sql
security definer
stable
as $$
  with call_counts as (
    select
      cp.team_member_id,
      c.call_type::text as call_type,
      count(*)          as cnt
    from call_participants cp
    join calls c on c.id = cp.call_id
    where cp.is_external = false
      and cp.team_member_id is not null
    group by cp.team_member_id, c.call_type
  ),
  member_calls as (
    select
      cp.team_member_id,
      count(distinct c.id)::bigint             as total_calls,
      count(distinct sc.id)::bigint            as scored_calls,
      round(avg(sc.overall_score)::numeric, 1) as avg_score,
      max(c.recorded_at)                       as last_call_at
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
      member_id,
      score_trend
    from member_trends
    order by member_id, period_end desc
  )
  select
    tm.id                                          as member_id,
    tm.name                                        as member_name,
    tm.email                                       as member_email,
    tm.role::text                                  as member_role,
    d.name                                         as department_name,
    coalesce(mc.total_calls, 0)                    as total_calls,
    coalesce(mc.scored_calls, 0)                   as scored_calls,
    mc.avg_score,
    lt.score_trend,
    mc.last_call_at,
    coalesce(tb.breakdown, '{}'::jsonb)            as call_type_breakdown
  from team_members tm
  left join departments d  on d.id  = tm.department_id
  left join member_calls mc on mc.team_member_id = tm.id
  left join type_breakdown tb on tb.team_member_id = tm.id
  left join latest_trend lt  on lt.member_id = tm.id
  order by mc.avg_score desc nulls last;
$$;

-- get_client_stats()
-- Powers the /clients list page. One row per client with aggregated call stats.
create or replace function get_client_stats()
returns table(
  client_id    uuid,
  client_name  text,
  total_calls  bigint,
  scored_calls bigint,
  avg_score    numeric,
  last_call_at timestamptz
)
language sql
security definer
stable
as $$
  select
    cl.id                                            as client_id,
    cl.name                                          as client_name,
    count(distinct c.id)::bigint                     as total_calls,
    count(distinct sc.id)::bigint                    as scored_calls,
    round(avg(sc.overall_score)::numeric, 1)         as avg_score,
    max(c.recorded_at)                               as last_call_at
  from clients cl
  left join calls c  on c.client_id = cl.id
  left join scorecards sc
    on sc.call_id = c.id
   and sc.overall_score is not null
  group by cl.id, cl.name
  order by max(c.recorded_at) desc nulls last, cl.name asc;
$$;

grant execute on function get_member_cards  to authenticated;
grant execute on function get_client_stats  to authenticated;

-- Performance indexes (idempotent)
create index if not exists idx_call_participants_member_ext
  on call_participants(team_member_id, is_external)
  where is_external = false and team_member_id is not null;

create index if not exists idx_calls_client_recorded
  on calls(client_id, recorded_at desc);

create index if not exists idx_member_trends_member_period
  on member_trends(member_id, period_end desc);
