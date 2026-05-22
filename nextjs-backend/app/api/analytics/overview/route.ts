import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { role, department_id, id: userId } = user
  const weeksBack = Math.min(parseInt(new URL(req.url).searchParams.get('weeks') ?? '8'), 26)

  try {
    if (role === 'admin') {
      const { data, error } = await (supabase as any).rpc('get_weekly_stats', { weeks_back: weeksBack })
      if (error) throw error
      return NextResponse.json(data ?? [])
    }

    const since = new Date(Date.now() - weeksBack * 7 * 86400_000).toISOString()
    let q = supabase.from('calls').select('id, recorded_at, scorecards(overall_score)').gte('recorded_at', since).not('recorded_at', 'is', null)
    if (role === 'manager' && department_id) q = (q as any).eq('department_id', department_id)
    else if (role === 'rep') {
      const { data: myParts } = await supabase.from('call_participants').select('call_id').eq('team_member_id', userId).eq('is_external', false)
      const ids = (myParts ?? []).map((p: any) => p.call_id as string)
      if (!ids.length) return NextResponse.json([])
      q = (q as any).in('id', ids.slice(0, 500))
    }

    const { data: calls, error } = await q
    if (error) throw error

    const weekMap = new Map<string, { total: number; scored: number; scores: number[] }>()
    for (const c of (calls ?? []) as any[]) {
      const d = new Date(c.recorded_at)
      const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const label = mon.toISOString().slice(0, 10)
      if (!weekMap.has(label)) weekMap.set(label, { total: 0, scored: 0, scores: [] })
      const w = weekMap.get(label)!
      w.total++
      const sc = Array.isArray(c.scorecards) ? c.scorecards[0] : c.scorecards
      if (sc?.overall_score != null) { w.scored++; w.scores.push(parseFloat(sc.overall_score)) }
    }

    const result = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week_label, w]) => ({
      week_label, total_calls: w.total, scored_calls: w.scored,
      avg_score: w.scores.length ? Math.round(w.scores.reduce((a, b) => a + b, 0) / w.scores.length * 10) / 10 : null,
    }))
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to load weekly stats' }, { status: 500 })
  }
}
