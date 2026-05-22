import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden('Admin access required')
  const { id } = await params
  const { name, content, is_active } = await req.json()
  if (is_active) await supabase.from('rubrics').update({ is_active: false }).neq('id', id)
  const { data, error } = await supabase
    .from('rubrics')
    .update({ ...(name && { name }), ...(content && { content }), ...(is_active !== undefined && { is_active }) })
    .eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
