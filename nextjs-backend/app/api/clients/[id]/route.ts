import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  const [clientRes, callsRes] = await Promise.all([
    supabase.from('clients').select('id, name, leadhub_id').eq('id', params.id).single(),
    supabase.from('calls').select(`id, call_type, status, recorded_at, duration_seconds, scorecards(id, overall_score, summary), call_participants(id, role, is_external, team_members(id, name))`).eq('client_id', params.id).order('recorded_at', { ascending: false }).limit(200),
  ])

  if (!clientRes.data) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const calls = ((callsRes.data ?? []) as any[]).map(c => {
    const host = (c.call_participants ?? []).find((p: any) => p.role === 'host' && !p.is_external)
    return { id: c.id, call_type: c.call_type, status: c.status, recorded_at: c.recorded_at, duration_seconds: c.duration_seconds, host_name: host?.team_members?.name ?? null, overall_score: c.scorecards?.[0]?.overall_score ?? null, summary: c.scorecards?.[0]?.summary ?? null }
  })

  return NextResponse.json({ client: clientRes.data, calls })
}
