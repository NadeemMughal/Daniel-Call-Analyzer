import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { data, error } = await supabase.from('rubrics').select('*').eq('is_active', true).single()
  if (error) return NextResponse.json({ error: 'No active rubric found' }, { status: 404 })
  return NextResponse.json(data)
}
