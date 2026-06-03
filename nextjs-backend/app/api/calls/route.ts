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

  // For managers, fetch cross-dept participation IDs only (small list).
  // The dept filter is applied server-side with eq/or to avoid URL length limits
  // that arise from building a 1000-item .in() array.
  let managerPartIds: string[] | null = null
  if (user.role === 'manager') {
    const { data: partsResult } = await supabase.from('call_participants').select('call_id').eq('team_member_id', user.id)
    managerPartIds = partsResult?.map((p: any) => p.call_id) ?? []
  }

  let q = supabase.from('calls').select(`id, call_type, status, recorded_at, duration_seconds, created_at, department_id, clients(id, name), departments(id, name), call_participants(id, role, is_external, name, email, team_members(id, name, email)), scorecards(id, overall_score, scorecard_evidence(criterion_key, quote))`).order('recorded_at', { ascending: false }).limit(limit)

  if (allowedCallIds !== null) q = (q as any).in('id', allowedCallIds)

  if (managerPartIds !== null) {
    if (user.department_id && managerPartIds.length > 0) {
      q = (q as any).or(`department_id.eq.${user.department_id},id.in.(${managerPartIds.slice(0, 200).join(',')})`)
    } else if (user.department_id) {
      q = (q as any).eq('department_id', user.department_id)
    } else if (managerPartIds.length > 0) {
      q = (q as any).in('id', managerPartIds.slice(0, 200))
    } else {
      return NextResponse.json([])
    }
  }
  if (type)   q = (q as any).eq('call_type', type)
  if (status) q = (q as any).eq('status', status)
  if (dept)   q = (q as any).eq('department_id', dept)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
