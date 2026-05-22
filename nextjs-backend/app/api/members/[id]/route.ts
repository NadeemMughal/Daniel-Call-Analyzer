import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  const { id } = await params

  // Reps can only view their own profile; managers only their department's members
  if (user.role === 'rep' && user.id !== id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (user.role === 'manager' && user.department_id) {
    const { data: m } = await supabase.from('team_members').select('department_id').eq('id', id).single()
    if (!m || m.department_id !== user.department_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [memberRes, partsRes, trendsRes] = await Promise.all([
    supabase.from('team_members').select('id, name, email, role, department_id, departments(name)').eq('id', id).single(),
    supabase.from('call_participants').select(`calls(id, call_type, status, recorded_at, duration_seconds, clients(name), scorecards(overall_score, summary, strengths, improvements))`).eq('team_member_id', id).eq('is_external', false).limit(300),
    supabase.from('member_trends').select('*').eq('member_id', id).order('period_end', { ascending: false }).limit(1).single(),
  ])

  if (!memberRes.data) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const rows: any[] = []
  for (const cp of (partsRes.data ?? []) as any[]) {
    const c = cp.calls
    if (!c) continue
    const sc = Array.isArray(c.scorecards) ? c.scorecards[0] : c.scorecards
    rows.push({ call_id: c.id, call_type: c.call_type, status: c.status, recorded_at: c.recorded_at, duration_seconds: c.duration_seconds, client_name: c.clients?.name ?? null, overall_score: sc?.overall_score ?? null, summary: sc?.summary ?? null, strengths: sc?.strengths ?? null, improvements: sc?.improvements ?? null })
  }
  rows.sort((a, b) => {
    if (!a.recorded_at) return 1
    if (!b.recorded_at) return -1
    return new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  })

  return NextResponse.json({ member: memberRes.data, calls: rows, trend: trendsRes.data ?? null })
}
