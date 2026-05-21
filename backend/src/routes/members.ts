import { Router } from 'express'
import { supabase } from '../db/client.js'
import { requireAuth, AuthRequest } from '../middleware/auth.js'

const router = Router()

// GET /members — list all team members (for dropdowns, selectors)
router.get('/', requireAuth, async (_req, res) => {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, email, role, department_id, departments(name)')
    .order('name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

// GET /members/me — current user's profile
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, email, role, department_id, departments(name)')
    .eq('id', req.user!.id)
    .single()
  if (error || !data) return res.status(404).json({ error: 'Profile not found' })
  res.json(data)
})

// GET /members/:id — full member report (info + all calls with scorecards)
// Uses service role so it works regardless of RLS supabase_user_id setup
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  const [memberRes, partsRes, trendsRes] = await Promise.all([
    supabase
      .from('team_members')
      .select('id, name, email, role, department_id, departments(name)')
      .eq('id', id)
      .single(),

    supabase
      .from('call_participants')
      .select(`
        calls(
          id, call_type, status, recorded_at, duration_seconds,
          clients(name),
          scorecards(overall_score, summary, strengths, improvements)
        )
      `)
      .eq('team_member_id', id)
      .eq('is_external', false)
      .limit(300),

    supabase
      .from('member_trends')
      .select('*')
      .eq('member_id', id)
      .order('period_end', { ascending: false })
      .limit(1)
      .single(),
  ])

  if (!memberRes.data) {
    return res.status(404).json({ error: 'Member not found' })
  }

  const rows: any[] = []
  for (const cp of (partsRes.data ?? []) as any[]) {
    const c = cp.calls
    if (!c) continue
    const sc = Array.isArray(c.scorecards) ? c.scorecards[0] : c.scorecards
    rows.push({
      call_id:          c.id,
      call_type:        c.call_type,
      status:           c.status,
      recorded_at:      c.recorded_at,
      duration_seconds: c.duration_seconds,
      client_name:      c.clients?.name ?? null,
      overall_score:    sc?.overall_score ?? null,
      summary:          sc?.summary ?? null,
      strengths:        sc?.strengths ?? null,
      improvements:     sc?.improvements ?? null,
    })
  }

  rows.sort((a, b) => {
    if (!a.recorded_at) return 1
    if (!b.recorded_at) return -1
    return new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  })

  res.json({
    member: memberRes.data,
    calls:  rows,
    trend:  trendsRes.data ?? null,
  })
})

// GET /members/:id/notes
router.get('/:id/notes', requireAuth, async (req: AuthRequest, res) => {
  const { data, error } = await supabase
    .from('member_notes')
    .select('id, content, created_at, author:author_id(id, name, role)')
    .eq('member_id', req.params.id)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

// POST /members/:id/notes
router.post('/:id/notes', requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role === 'rep') return res.status(403).json({ error: 'Only managers and admins can add notes' })
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'content is required' })
  const { data, error } = await supabase
    .from('member_notes')
    .insert({ member_id: req.params.id, author_id: req.user!.id, content: content.trim() })
    .select('id, content, created_at, author:author_id(id, name, role)')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /members/:id/notes/:noteId
router.delete('/:id/notes/:noteId', requireAuth, async (req: AuthRequest, res) => {
  const { role, id: userId } = req.user!
  const { noteId } = req.params
  const { data: note } = await supabase.from('member_notes').select('author_id').eq('id', noteId).single()
  if (!note) return res.status(404).json({ error: 'Note not found' })
  if (role !== 'admin' && note.author_id !== userId)
    return res.status(403).json({ error: "Cannot delete another manager's note" })
  await supabase.from('member_notes').delete().eq('id', noteId)
  res.json({ ok: true })
})

export default router
