import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  if (user.role !== 'admin') {
    if (user.role === 'rep') {
      const { data: parts } = await supabase.from('call_participants').select('team_member_id').eq('call_id', params.id)
      if (!parts?.some((p: any) => p.team_member_id === user.id)) return forbidden()
    }
    if (user.role === 'manager') {
      const { data: callRow } = await supabase.from('calls').select('department_id').eq('id', params.id).single()
      if (callRow?.department_id !== user.department_id) return forbidden()
    }
  }

  const [callRes, scorecardRes, findingsRes] = await Promise.all([
    supabase.from('calls').select(`*, clients(id, name), departments(id, name), call_participants(id, role, is_external, name, email, team_members(id, name, email))`).eq('id', params.id).single(),
    supabase.from('scorecards').select('*, scorecard_evidence(*)').eq('call_id', params.id).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('rule_findings').select('*').eq('call_id', params.id),
  ])

  if (!callRes.data) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  return NextResponse.json({ call: callRes.data, scorecard: scorecardRes.data ?? null, findings: findingsRes.data ?? [] })
}
