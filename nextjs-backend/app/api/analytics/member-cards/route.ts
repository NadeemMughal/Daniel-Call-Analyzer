import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { role, department_id, id: userId } = user
  try {
    let membersQuery = supabase.from('team_members').select('id, name, email, role, departments(name)')
    if (role === 'rep') membersQuery = (membersQuery as any).eq('id', userId)
    else if (role === 'manager' && department_id) membersQuery = (membersQuery as any).eq('department_id', department_id)

    const [membersRes, partsRes, trendsRes] = await Promise.all([
      membersQuery,
      supabase.from('call_participants').select('team_member_id, calls(id, call_type, recorded_at, scorecards(overall_score))').eq('is_external', false).not('team_member_id', 'is', null),
      supabase.from('member_trends').select('member_id, score_trend, period_end').order('period_end', { ascending: false }),
    ])

    const trendMap = new Map<string, string>()
    for (const t of (trendsRes.data ?? []) as any[]) {
      if (!trendMap.has(t.member_id)) trendMap.set(t.member_id, t.score_trend)
    }

    const cardMap = new Map<string, any>()
    for (const m of (membersRes.data ?? []) as any[]) {
      cardMap.set(m.id, { member_id: m.id, member_name: m.name, member_email: m.email, member_role: m.role, department_name: (m.departments as any)?.name ?? null, total_calls: 0, scored_calls: 0, _scores: [] as number[], last_call_at: null as string | null, call_type_counts: {} as Record<string, number> })
    }
    for (const cp of (partsRes.data ?? []) as any[]) {
      const card = cardMap.get(cp.team_member_id)
      if (!card || !cp.calls) continue
      const c = cp.calls
      card.total_calls++
      const t = c.call_type || 'other'
      card.call_type_counts[t] = (card.call_type_counts[t] ?? 0) + 1
      if (c.recorded_at && (!card.last_call_at || c.recorded_at > card.last_call_at)) card.last_call_at = c.recorded_at
      const sc = Array.isArray(c.scorecards) ? c.scorecards[0] : c.scorecards
      if (sc?.overall_score != null) { card.scored_calls++; card._scores.push(parseFloat(sc.overall_score)) }
    }

    const result = [...cardMap.values()].map(card => {
      const avg = card._scores.length ? card._scores.reduce((a: number, b: number) => a + b, 0) / card._scores.length : null
      const total = Object.values(card.call_type_counts).reduce((a: number, b: any) => a + (b as number), 0) as number
      const breakdown: Record<string, number> = {}
      for (const [k, v] of Object.entries(card.call_type_counts)) breakdown[k] = total > 0 ? Math.round((v as number) / total * 1000) / 1000 : 0
      return { member_id: card.member_id, member_name: card.member_name, member_email: card.member_email, member_role: card.member_role, department_name: card.department_name, total_calls: card.total_calls, scored_calls: card.scored_calls, avg_score: avg !== null ? Math.round(avg * 10) / 10 : null, score_trend: trendMap.get(card.member_id) ?? null, last_call_at: card.last_call_at, call_type_breakdown: breakdown }
    }).sort((a, b) => { if (a.avg_score === null && b.avg_score === null) return b.total_calls - a.total_calls; if (a.avg_score === null) return 1; if (b.avg_score === null) return -1; return b.avg_score - a.avg_score })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Failed to load member cards' }, { status: 500 })
  }
}
