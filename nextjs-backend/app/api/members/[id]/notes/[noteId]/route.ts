import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function DELETE(req: NextRequest, { params }: { params: { id: string; noteId: string } }) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  const { data: note } = await supabase.from('member_notes').select('author_id').eq('id', params.noteId).single()
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  if (user.role !== 'admin' && note.author_id !== user.id) return forbidden("Cannot delete another manager's note")
  await supabase.from('member_notes').delete().eq('id', params.noteId)
  return NextResponse.json({ ok: true })
}
