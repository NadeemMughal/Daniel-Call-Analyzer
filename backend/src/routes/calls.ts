import { Router } from 'express'
import { supabase } from '../db/client.js'
import { requireAuth, AuthRequest } from '../middleware/auth.js'

const router = Router()

// GET /calls — list with optional filters: type, status, dept, limit
// Visibility rules:
//   admin  → all calls
//   manager → calls where any participant is in same department
//   rep    → only calls they personally participated in
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const { type, status, dept, limit = '200' } = req.query as Record<string, string>
  const userRole   = req.user!.role
  const userId     = req.user!.id
  const userDeptId = req.user!.department_id

  // Pre-fetch allowed call IDs for non-admin roles
  let allowedCallIds: string[] | null = null

  if (userRole === 'rep') {
    const { data: parts } = await supabase
      .from('call_participants')
      .select('call_id')
      .eq('team_member_id', userId)
    allowedCallIds = parts?.map((p: any) => p.call_id) ?? []
  } else if (userRole === 'manager') {
    const { data: members } = await supabase
      .from('team_members')
      .select('id')
      .eq('department_id', userDeptId)
    const memberIds = members?.map((m: any) => m.id) ?? [userId]
    const { data: parts } = await supabase
      .from('call_participants')
      .select('call_id')
      .in('team_member_id', memberIds)
    allowedCallIds = [...new Set(parts?.map((p: any) => p.call_id) ?? [])]
  }
  // admin → allowedCallIds stays null (no filter)

  if (allowedCallIds !== null && allowedCallIds.length === 0) {
    return res.json([])
  }

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

  if (allowedCallIds !== null) q = q.in('id', allowedCallIds)
  if (type)   q = q.eq('call_type', type)
  if (status) q = q.eq('status', status)
  if (dept)   q = q.eq('department_id', dept)

  const { data, error } = await q
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

// GET /calls/:id — full call detail (call + scorecard + evidence + findings + participants)
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params
  const userRole   = req.user!.role
  const userId     = req.user!.id
  const userDeptId = req.user!.department_id

  // Access check for non-admin roles
  if (userRole !== 'admin') {
    const { data: participants } = await supabase
      .from('call_participants')
      .select('team_member_id, calls!inner(department_id)')
      .eq('call_id', id)

    const isParticipant = participants?.some((p: any) => p.team_member_id === userId)

    if (userRole === 'rep' && !isParticipant) {
      return res.status(403).json({ error: 'Access denied' })
    }

    if (userRole === 'manager') {
      const inDept = participants?.some((p: any) => {
        const call = p.calls as any
        return call?.department_id === userDeptId
      })
      if (!inDept && !isParticipant) {
        return res.status(403).json({ error: 'Access denied' })
      }
    }
  }

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
