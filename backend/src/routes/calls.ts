import { Router } from 'express'
import { supabase } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /calls/:id — full call detail (call + scorecard + evidence + findings + participants)
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  const [callRes, scorecardRes, findingsRes] = await Promise.all([
    supabase
      .from('calls')
      .select(`
        *,
        clients(id, name),
        departments(id, name),
        call_participants(
          id, role, is_external, name, email,
          team_members(id, name, email)
        )
      `)
      .eq('id', id)
      .single(),

    supabase
      .from('scorecards')
      .select('*, scorecard_evidence(*)')
      .eq('call_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),

    supabase
      .from('rule_findings')
      .select('*')
      .eq('call_id', id),
  ])

  if (!callRes.data) {
    return res.status(404).json({ error: 'Call not found' })
  }

  res.json({
    call:      callRes.data,
    scorecard: scorecardRes.data ?? null,
    findings:  findingsRes.data ?? [],
  })
})

export default router
