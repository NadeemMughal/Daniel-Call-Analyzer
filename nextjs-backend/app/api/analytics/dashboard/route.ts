import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { role, department_id, id: userId } = user
  const now = Date.now()
  const sevenDaysAgo    = new Date(now -  7 * 86400_000).toISOString()
  const fourteenDaysAgo = new Date(now - 14 * 86400_000).toISOString()
  const oneDayAgo       = new Date(now -      86400_000).toISOString()

  try {
    let repCallIds: string[] | null = null
    if (role === 'rep') {
      const { data: myParts } = await supabase.from('call_participants').select('call_id').eq('team_member_id', userId).eq('is_external', false)
      repCallIds = [...new Set((myParts ?? []).map((p: any) => p.call_id))]
    }

    let managerCallIds: string[] | null = null
    if (role === 'manager') {
      const [partsResult, deptResult] = await Promise.all([
        supabase.from('call_participants').select('call_id').eq('team_member_id', userId),
        department_id
          ? supabase.from('calls').select('id').eq('department_id', department_id)
          : Promise.resolve({ data: [] as { id: string }[] | null }),
      ])
      const partIds = partsResult.data?.map((p: any) => p.call_id) ?? []
      const deptIds = deptResult.data?.map((c: any) => c.id) ?? []
      managerCallIds = [...new Set([...partIds, ...deptIds])]
    }

    function scope(q: any) {
      if (role === 'manager') return managerCallIds?.length ? q.in('id', managerCallIds.slice(0, 500)) : q.in('id', ['00000000-0000-0000-0000-000000000000'])
      if (role === 'rep' && repCallIds) return q.in('id', repCallIds.slice(0, 500))
      return q
    }
    function scopedScores() {
      const base = supabase.from('scorecards').select('overall_score').not('overall_score', 'is', null)
      if (role === 'manager') return managerCallIds?.length ? (base as any).in('call_id', managerCallIds.slice(0, 500)) : (base as any).in('call_id', ['00000000-0000-0000-0000-000000000000'])
      if (role === 'rep' && repCallIds) return (base as any).in('call_id', repCallIds.slice(0, 500))
      return base
    }

    const [totalRes, scoresRes, weekRes, prevWeekRes, deptRes, recentRes, callTypeRes, findingsRes, phaseRes, actionRes, failRes] = await Promise.all([
      scope(supabase.from('calls').select('id', { count: 'exact', head: true })),
      scopedScores(),
      scope(supabase.from('calls').select('id', { count: 'exact', head: true })).gte('recorded_at', sevenDaysAgo),
      scope(supabase.from('calls').select('id', { count: 'exact', head: true })).gte('recorded_at', fourteenDaysAgo).lt('recorded_at', sevenDaysAgo),
      supabase.from('departments').select('id, name, calls(id, scorecards(overall_score))'),
      scope(supabase.from('calls').select('id, call_type, status, recorded_at, departments(name), scorecards(overall_score, summary)').order('recorded_at', { ascending: false, nullsFirst: false }).limit(5)),
      scope(supabase.from('calls').select('call_type, scorecards(overall_score)')),
      supabase.from('rule_findings').select('rule_key'),
      supabase.from('scorecard_evidence').select('quote').eq('criterion_key', 'meeting_phase'),
      supabase.from('scorecard_evidence').select('quote, scorecards(call_id, calls(call_type))').eq('criterion_key', 'action_item').order('created_at', { ascending: false }).limit(8),
      supabase.from('failed_executions').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
    ])

    const allScores = (scoresRes.data ?? []).map((d: any) => parseFloat(d.overall_score)).filter(Boolean)
    const avgScore  = allScores.length ? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length : null
    const scoreTiers = { excellent: allScores.filter((s: number) => s >= 8.5).length, good: allScores.filter((s: number) => s >= 7 && s < 8.5).length, needsWork: allScores.filter((s: number) => s >= 5 && s < 7).length, poor: allScores.filter((s: number) => s < 5).length }

    const byDept = ((deptRes.data ?? []) as any[]).map((d: any) => { const calls = d.calls ?? []; const scs = calls.map((c: any) => c.scorecards?.[0]?.overall_score).filter((s: any) => s != null) as number[]; return { name: d.name as string, count: calls.length, avg: scs.length ? scs.reduce((a: number, b: number) => a + b, 0) / scs.length : null } }).filter((d: any) => d.count > 0).sort((a: any, b: any) => b.count - a.count)
    const recentCalls = ((recentRes.data ?? []) as any[]).map((c: any) => ({ id: c.id, call_type: c.call_type, status: c.status, recorded_at: c.recorded_at, score: c.scorecards?.[0]?.overall_score ?? null, department_name: c.departments?.name ?? null, summary_first_line: (c.scorecards?.[0]?.summary ?? '').split('.')[0].slice(0, 80) }))

    const ctMap: Record<string, { count: number; scores: number[] }> = {}
    for (const row of (callTypeRes.data ?? []) as any[]) { const ct = row.call_type ?? 'other'; if (!ctMap[ct]) ctMap[ct] = { count: 0, scores: [] }; ctMap[ct].count++; const s = row.scorecards?.[0]?.overall_score; if (s != null) ctMap[ct].scores.push(parseFloat(s)) }
    const byCallType = Object.entries(ctMap).map(([call_type, { count, scores }]) => ({ call_type, count, avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null })).sort((a, b) => b.count - a.count)

    const fkMap: Record<string, number> = {}
    for (const row of (findingsRes.data ?? []) as any[]) { const k = row.rule_key ?? 'unknown'; fkMap[k] = (fkMap[k] ?? 0) + 1 }
    const totalF = Object.values(fkMap).reduce((a, b) => a + b, 0)
    const topFindings = Object.entries(fkMap).map(([rule_key, count]) => ({ rule_key, count, pct: totalF > 0 ? Math.round(count / totalF * 100) : 0 })).sort((a, b) => b.count - a.count).slice(0, 8)

    const phaseCounts: Record<string, number> = {}
    for (const row of (phaseRes.data ?? []) as any[]) { const p = String(row.quote ?? '').trim().toLowerCase(); if (!p) continue; phaseCounts[p] = (phaseCounts[p] ?? 0) + 1 }
    const byPhase = Object.entries(phaseCounts).map(([phase, count]) => ({ phase, count })).sort((a, b) => b.count - a.count)

    const topActions = ((actionRes.data ?? []) as any[]).map((r: any) => ({ task: String(r.quote ?? '').split(' - Owner:')[0].split(' [')[0], call_id: r.scorecards?.call_id ?? '', call_type: r.scorecards?.calls?.call_type ?? null })).filter((a: any) => a.call_id)

    return NextResponse.json({ totalCalls: totalRes.count ?? 0, scoredCalls: allScores.length, weekCalls: weekRes.count ?? 0, prevWeekCalls: prevWeekRes.count ?? 0, avgScore, scoreTiers, byDept, recentCalls, byCallType, topFindings, byPhase, topActions, failures24h: failRes.count ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
  }
}
