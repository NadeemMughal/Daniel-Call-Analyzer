import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest, { params }: { params: { memberId: string } }) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  if (user.role === 'rep' && user.id !== params.memberId) return forbidden("Cannot view other members' trends")
  const { data, error } = await supabase
    .from('member_trends').select('*').eq('member_id', params.memberId)
    .order('period_end', { ascending: false }).limit(1).single()
  if (error) return NextResponse.json({ error: 'No trend data found' }, { status: 404 })
  return NextResponse.json(data)
}
