import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { role, department_id, id: userId } = user
  try {
    if (role === 'admin') {
      const { data, error } = await (supabase as any).rpc('get_client_stats')
      if (error) throw error
      return NextResponse.json(data ?? [])
    }

    let callIdQuery = supabase.from('call_participants').select('call_id, team_member_id').eq('is_external', false)
    if (role === 'rep') callIdQuery = (callIdQuery as any).eq('team_member_id', userId)
    else if (role === 'manager' && department_id) {
      const { data: deptMembers } = await supabase.from('team_members').select('id').eq('department_id', department_id)
      const memberIds = (deptMembers ?? []).map((m: any) => m.id)
      callIdQuery = (callIdQuery as any).in('team_member_id', memberIds)
    }

    const { data: parts } = await callIdQuery
    const callIds = [...new Set((parts ?? []).map((p: any) => p.call_id))]
    if (callIds.length === 0) return NextResponse.json([])

    const { data: calls } = await supabase.from('calls').select('id, client_id, recorded_at, clients(id, name), scorecards(overall_score)').in('id', callIds.slice(0, 500)).not('client_id', 'is', null)

    const clientMap = new Map<string, any>()
    for (const c of (calls ?? []) as any[]) {
      const cl = c.clients
      if (!cl) continue
      if (!clientMap.has(cl.id)) clientMap.set(cl.id, { client_id: cl.id, client_name: cl.name, total_calls: 0, scored_calls: 0, _scores: [], last_call_at: null })
      const entry = clientMap.get(cl.id)!
      entry.total_calls++
      if (c.recorded_at && (!entry.last_call_at || c.recorded_at > entry.last_call_at)) entry.last_call_at = c.recorded_at
      const sc = Array.isArray(c.scorecards) ? c.scorecards[0] : c.scorecards
      if (sc?.overall_score != null) { entry.scored_calls++; entry._scores.push(parseFloat(sc.overall_score)) }
    }

    const result = [...clientMap.values()].map(e => ({ client_id: e.client_id, client_name: e.client_name, total_calls: e.total_calls, scored_calls: e.scored_calls, avg_score: e._scores.length ? Math.round(e._scores.reduce((a: number, b: number) => a + b, 0) / e._scores.length * 10) / 10 : null, last_call_at: e.last_call_at })).sort((a, b) => (b.last_call_at ?? '').localeCompare(a.last_call_at ?? ''))
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Failed to load client stats' }, { status: 500 })
  }
}
