import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  const { searchParams } = new URL(req.url)
  const type   = searchParams.get('type')
  const status = searchParams.get('status')
  const dept   = searchParams.get('dept')
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500)

  let allowedCallIds: string[] | null = null
  if (user.role === 'rep') {
    const { data: parts } = await supabase.from('call_participants').select('call_id').eq('team_member_id', user.id)
    allowedCallIds = parts?.map((p: any) => p.call_id) ?? []
    if (allowedCallIds.length === 0) return NextResponse.json([])
  }

  if (user.role === 'manager') {
    const [partsResult, deptResult] = await Promise.all([
      supabase.from('call_participants').select('call_id').eq('team_member_id', user.id),
      user.department_id
        ? supabase.from('calls').select('id').eq('department_id', user.department_id)
        : Promise.resolve({ data: [] as { id: string }[] | null }),
    ])
    const partIds = partsResult.data?.map((p: any) => p.call_id) ?? []
    const deptIds = deptResult.data?.map((c: any) => c.id) ?? []
    allowedCallIds = [...new Set([...partIds, ...deptIds])]
    if (allowedCallIds.length === 0) return NextResponse.json([])
  }

  let q = supabase.from('calls').select(`id, call_type, status, recorded_at, duration_seconds, created_at, department_id, clients(id, name), departments(id, name), call_participants(id, role, is_external, name, email, team_members(id, name, email)), scorecards(id, overall_score, scorecard_evidence(criterion_key, quote))`).order('recorded_at', { ascending: false }).limit(limit)

  if (allowedCallIds !== null) q = (q as any).in('id', allowedCallIds)
  if (type)   q = (q as any).eq('call_type', type)
  if (status) q = (q as any).eq('status', status)
  if (dept)   q = (q as any).eq('department_id', dept)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
