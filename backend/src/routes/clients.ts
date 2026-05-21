import { Router } from 'express'
import { supabase } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /clients/:id — client info + all their calls with scorecards
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  const [clientRes, callsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, leadhub_id')
      .eq('id', id)
      .single(),

    supabase
      .from('calls')
      .select(`
        id, call_type, status, recorded_at, duration_seconds,
        scorecards(id, overall_score, summary),
        call_participants(
          id, role, is_external,
          team_members(id, name)
        )
      `)
      .eq('client_id', id)
      .order('recorded_at', { ascending: false })
      .limit(200),
  ])

  if (!clientRes.data) {
    return res.status(404).json({ error: 'Client not found' })
  }

  const calls = ((callsRes.data ?? []) as any[]).map(c => {
    const host = (c.call_participants ?? []).find((p: any) => p.role === 'host' && !p.is_external)
    return {
      id:               c.id,
      call_type:        c.call_type,
      status:           c.status,
      recorded_at:      c.recorded_at,
      duration_seconds: c.duration_seconds,
      host_name:        host?.team_members?.name ?? null,
      overall_score:    c.scorecards?.[0]?.overall_score ?? null,
      summary:          c.scorecards?.[0]?.summary ?? null,
    }
  })

  res.json({ client: clientRes.data, calls })
})

export default router
