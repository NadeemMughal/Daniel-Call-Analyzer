import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { data, error } = await supabase
    .from('team_members').select('id, name, email, role, department_id, departments(name)')
    .eq('id', user.id).single()
  if (error || !data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  return NextResponse.json(data)
}
