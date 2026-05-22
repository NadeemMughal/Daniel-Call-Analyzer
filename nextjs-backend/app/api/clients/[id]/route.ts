import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  const { id } = await params

  // Build scoped calls query
  let callsQ = supabase
    .from('calls')
    .select(`id, call_type, status, recorded_at, duration_seconds, scorecards(id, overall_score, summary), call_participants(id, role, is_external, team_members(id, name))`)
    .eq('client_id', id)
    .order('recorded_at', { ascending: false })
    .limit(200)
  if (user.role === 'manager' && user.department_id) callsQ = (callsQ as any).eq('department_id', user.department_id)
  if (user.role === 'rep') {
    const { data: myParts } = await supabase.from('call_participants').select('call_id').eq('team_member_id', user.id).eq('is_external', false)
    const myCallIds = (myParts ?? []).map((p: any) => p.call_id)
    if (myCallIds.length === 0) return NextResponse.json({ client: null, calls: [] })
    callsQ = (callsQ as any).in('id', myCallIds.slice(0, 500))
  }

  const [clientRes, callsRes] = await Promise.all([
    supabase.from('clients').select('id, name, leadhub_id').eq('id', id).single(),
    callsQ,
  ])

  if (!clientRes.data) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const calls = ((callsRes.data ?? []) as any[]).map(c => {
    const host = (c.call_participants ?? []).find((p: any) => p.role === 'host' && !p.is_external)
    return { id: c.id, call_type: c.call_type, status: c.status, recorded_at: c.recorded_at, duration_seconds: c.duration_seconds, host_name: host?.team_members?.name ?? null, overall_score: c.scorecards?.[0]?.overall_score ?? null, summary: c.scorecards?.[0]?.summary ?? null }
  })

  return NextResponse.json({ client: clientRes.data, calls })
}
