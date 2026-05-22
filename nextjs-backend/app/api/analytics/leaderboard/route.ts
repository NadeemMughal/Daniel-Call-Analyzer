import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  try {
    const { data, error } = await (supabase as any).rpc('get_team_leaderboard')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 })
  }
}
