import { Router } from 'express'
import { supabase } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /calls — list with optional filters: type, status, dept, limit
router.get('/', requireAuth, async (req, res) => {
  const { type, status, dept, limit = '200' } = req.query as Record<string, string>

  let q = supabase
    .from('calls')
    .select(`
      id, call_type, status, recorded_at, duration_seconds, created_at, department_id,
      clients(id, name),
      departments(id, name),
      call_participants(id, role, is_external, name, email, team_members(id, name, email)),
      scorecards(id, overall_score, scorecard_evidence(criterion_key, quote))
    `)
    .order('recorded_at', { ascending: false })
    .limit(Math.min(parseInt(limit) || 200, 500))

  if (type)   q = q.eq('call_type', type)
  if (status) q = q.eq('status', status)
  if (dept)   q = q.eq('department_id', dept)

  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

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
