import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { id } = await params
  const { data, error } = await supabase
    .from('member_notes').select('id, content, created_at, author:author_id(id, name, role)')
    .eq('member_id', id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  if (user.role === 'rep') return forbidden('Only managers and admins can add notes')
  const { id } = await params
  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 })
  const { data, error } = await supabase
    .from('member_notes').insert({ member_id: id, author_id: user.id, content: content.trim() })
    .select('id, content, created_at, author:author_id(id, name, role)').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
