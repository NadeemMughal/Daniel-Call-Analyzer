import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { data, error } = await supabase.from('rubrics').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden('Admin access required')
  const { name, version, content } = await req.json()
  if (!name || !content) return NextResponse.json({ error: 'name and content are required' }, { status: 400 })
  const { data, error } = await supabase.from('rubrics').insert({ name, version: version ?? 1, content, is_active: false }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
