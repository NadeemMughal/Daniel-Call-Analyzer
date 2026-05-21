import { Router } from 'express'
import { supabase } from '../db/client.js'
import { requireAuth, AuthRequest } from '../middleware/auth.js'

const router = Router()

// GET /analytics/overview — weekly stats chart data, scoped by role
router.get('/overview', requireAuth, async (req: AuthRequest, res) => {
  const { role, department_id, id: userId } = req.user!
  try {
    const weeksBack = Math.min(parseInt(String(req.query.weeks ?? '8'), 10) || 8, 26)

    if (role === 'admin') {
      const { data, error } = await (supabase as any).rpc('get_weekly_stats', { weeks_back: weeksBack })
      if (error) throw error
      return res.json(data ?? [])
    }

    // Manager/rep: build weekly stats manually from scoped calls
    const since = new Date(Date.now() - weeksBack * 7 * 86400_000).toISOString()

    let callsQuery = supabase
      .from('calls')
      .select('id, recorded_at, scorecards(overall_score)')
      .gte('recorded_at', since)
      .not('recorded_at', 'is', null)

    if (role === 'manager' && department_id) {
      callsQuery = callsQuery.eq('department_id', department_id)
    } else if (role === 'rep') {
      const { data: myParts } = await supabase
        .from('call_participants').select('call_id')
        .eq('team_member_id', userId).eq('is_external', false)
      const ids = (myParts ?? []).map((p: any) => p.call_id as string)
      if (!ids.length) return res.json([])
      callsQuery = callsQuery.in('id', ids.slice(0, 500))
    }

    const { data: calls, error } = await callsQuery
    if (error) throw error

    // Bucket into ISO weeks
    const weekMap = new Map<string, { total: number; scored: number; scores: number[] }>()
    for (const c of (calls ?? []) as any[]) {
      const d    = new Date(c.recorded_at)
      const mon  = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const label = mon.toISOString().slice(0, 10)
      if (!weekMap.has(label)) weekMap.set(label, { total: 0, scored: 0, scores: [] })
      const w = weekMap.get(label)!
      w.total++
      const sc = Array.isArray(c.scorecards) ? c.scorecards[0] : c.scorecards
      if (sc?.overall_score != null) { w.scored++; w.scores.push(parseFloat(sc.overall_score)) }
    }

    const result = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week_label, w]) => ({
        week_label,
        total_calls:  w.total,
        scored_calls: w.scored,
        avg_score:    w.scores.length ? Math.round(w.scores.reduce((a, b) => a + b, 0) / w.scores.length * 10) / 10 : null,
      }))

    res.json(result)
  } catch (err: any) {
    console.error('[analytics/overview]', err.message)
    res.status(500).json({ error: 'Failed to load weekly stats' })
  }
})

// GET /analytics/leaderboard — team rankings (existing)
router.get('/leaderboard', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await (supabase as any).rpc('get_team_leaderboard')
    if (error) throw error
    res.json(data ?? [])
  } catch (err: any) {
    console.error('[analytics/leaderboard]', err.message)
    res.status(500).json({ error: 'Failed to load leaderboard' })
  }
})

// GET /analytics/member-cards — rich per-member stats for dashboard grid
// Role filtering: admin = all members, manager = own dept only, rep = self only
router.get('/member-cards', requireAuth, async (req: AuthRequest, res) => {
  const { role, department_id, id: userId } = req.user!
  try {
    // Build member query based on role
    let membersQuery = supabase.from('team_members').select('id, name, email, role, departments(name)')
    if (role === 'rep') {
      membersQuery = membersQuery.eq('id', userId)
    } else if (role === 'manager' && department_id) {
      membersQuery = membersQuery.eq('department_id', department_id)
    }
    // admin: no filter — all members

    const [membersRes, partsRes, trendsRes] = await Promise.all([
      membersQuery,
      supabase.from('call_participants')
        .select('team_member_id, calls(id, call_type, recorded_at, scorecards(overall_score))')
        .eq('is_external', false)
        .not('team_member_id', 'is', null),
      supabase.from('member_trends').select('member_id, score_trend, period_end').order('period_end', { ascending: false }),
    ])

    // Latest trend per member
    const trendMap = new Map<string, string>()
    for (const t of (trendsRes.data ?? []) as any[]) {
      if (!trendMap.has(t.member_id)) trendMap.set(t.member_id, t.score_trend)
    }

    // Build per-member aggregates
    const cardMap = new Map<string, any>()
    for (const m of (membersRes.data ?? []) as any[]) {
      cardMap.set(m.id, {
        member_id: m.id, member_name: m.name, member_email: m.email,
        member_role: m.role, department_name: (m.departments as any)?.name ?? null,
        total_calls: 0, scored_calls: 0, _scores: [] as number[],
        last_call_at: null as string | null,
        call_type_counts: {} as Record<string, number>,
      })
    }

    for (const cp of (partsRes.data ?? []) as any[]) {
      const card = cardMap.get(cp.team_member_id)
      if (!card || !cp.calls) continue
      const c = cp.calls
      card.total_calls++
      const t = c.call_type || 'other'
      card.call_type_counts[t] = (card.call_type_counts[t] ?? 0) + 1
      if (c.recorded_at && (!card.last_call_at || c.recorded_at > card.last_call_at)) card.last_call_at = c.recorded_at
      const sc = Array.isArray(c.scorecards) ? c.scorecards[0] : c.scorecards
      if (sc?.overall_score != null) { card.scored_calls++; card._scores.push(parseFloat(sc.overall_score)) }
    }

    const result = [...cardMap.values()].map(card => {
      const avg = card._scores.length ? card._scores.reduce((a: number, b: number) => a + b, 0) / card._scores.length : null
      const total = Object.values(card.call_type_counts).reduce((a: number, b: any) => a + (b as number), 0) as number
      const breakdown: Record<string, number> = {}
      for (const [k, v] of Object.entries(card.call_type_counts)) {
        breakdown[k] = total > 0 ? Math.round((v as number) / total * 1000) / 1000 : 0
      }
      return {
        member_id: card.member_id, member_name: card.member_name, member_email: card.member_email,
        member_role: card.member_role, department_name: card.department_name,
        total_calls: card.total_calls, scored_calls: card.scored_calls,
        avg_score: avg !== null ? Math.round(avg * 10) / 10 : null,
        score_trend: trendMap.get(card.member_id) ?? null,
        last_call_at: card.last_call_at,
        call_type_breakdown: breakdown,
      }
    }).sort((a, b) => {
      if (a.avg_score === null && b.avg_score === null) return b.total_calls - a.total_calls
      if (a.avg_score === null) return 1
      if (b.avg_score === null) return -1
      return b.avg_score - a.avg_score
    })

    res.json(result)
  } catch (err: any) {
    console.error('[analytics/member-cards]', err.message)
    res.status(500).json({ error: 'Failed to load member cards' })
  }
})

// GET /analytics/clients — per-client stats
// admin: all clients | manager: clients from their dept's calls | rep: clients from own calls
router.get('/clients', requireAuth, async (req: AuthRequest, res) => {
  const { role, department_id, id: userId } = req.user!
  try {
    // For admin use the fast RPC; for manager/rep build filtered list
    if (role === 'admin') {
      const { data, error } = await (supabase as any).rpc('get_client_stats')
      if (error) throw error
      return res.json(data ?? [])
    }

    // Get call IDs accessible to this user
    let callIdQuery = supabase
      .from('call_participants')
      .select('call_id, team_member_id, team_members(department_id)')
      .eq('is_external', false)

    if (role === 'rep') {
      callIdQuery = callIdQuery.eq('team_member_id', userId)
    } else if (role === 'manager' && department_id) {
      // manager sees their whole department — join via team_members
      const { data: deptMembers } = await supabase
        .from('team_members').select('id').eq('department_id', department_id)
      const memberIds = (deptMembers ?? []).map((m: any) => m.id)
      callIdQuery = callIdQuery.in('team_member_id', memberIds)
    }

    const { data: parts } = await callIdQuery
    const callIds = [...new Set((parts ?? []).map((p: any) => p.call_id))]

    if (callIds.length === 0) return res.json([])

    // Aggregate client stats for those calls
    const { data: calls } = await supabase
      .from('calls')
      .select('id, client_id, recorded_at, clients(id, name), scorecards(overall_score)')
      .in('id', callIds.slice(0, 500))
      .not('client_id', 'is', null)

    const clientMap = new Map<string, any>()
    for (const c of (calls ?? []) as any[]) {
      const cl = c.clients
      if (!cl) continue
      if (!clientMap.has(cl.id)) {
        clientMap.set(cl.id, { client_id: cl.id, client_name: cl.name, total_calls: 0, scored_calls: 0, _scores: [], last_call_at: null })
      }
      const entry = clientMap.get(cl.id)!
      entry.total_calls++
      if (c.recorded_at && (!entry.last_call_at || c.recorded_at > entry.last_call_at)) entry.last_call_at = c.recorded_at
      const sc = Array.isArray(c.scorecards) ? c.scorecards[0] : c.scorecards
      if (sc?.overall_score != null) { entry.scored_calls++; entry._scores.push(parseFloat(sc.overall_score)) }
    }

    const result = [...clientMap.values()].map(e => ({
      client_id: e.client_id, client_name: e.client_name,
      total_calls: e.total_calls, scored_calls: e.scored_calls,
      avg_score: e._scores.length ? Math.round(e._scores.reduce((a: number, b: number) => a + b, 0) / e._scores.length * 10) / 10 : null,
      last_call_at: e.last_call_at,
    })).sort((a, b) => (b.last_call_at ?? '').localeCompare(a.last_call_at ?? ''))

    res.json(result)
  } catch (err: any) {
    console.error('[analytics/clients]', err.message)
    res.status(500).json({ error: 'Failed to load client stats' })
  }
})

// GET /analytics/dashboard — all KPI + chart data for the Command Center
// admin: org-wide | manager: dept-scoped | rep: own calls only
router.get('/dashboard', requireAuth, async (req: AuthRequest, res) => {
  const { role, department_id, id: userId } = req.user!
  const now             = Date.now()
  const sevenDaysAgo    = new Date(now -  7 * 86400_000).toISOString()
  const fourteenDaysAgo = new Date(now - 14 * 86400_000).toISOString()
  const oneDayAgo       = new Date(now -      86400_000).toISOString()

  try {
    // Rep scope: collect their call IDs (reps have far fewer calls — safe for .in())
    let repCallIds: string[] | null = null
    if (role === 'rep') {
      const { data: myParts } = await supabase
        .from('call_participants').select('call_id')
        .eq('team_member_id', userId).eq('is_external', false)
      repCallIds = [...new Set((myParts ?? []).map((p: any) => p.call_id))]
    }
    // Managers: use department_id directly on calls table — avoids 2000-UUID .in() URL blowup

    // Helper: scope a query on the calls table
    function scopeCalls(q: any) {
      if (role === 'manager' && department_id) return q.eq('department_id', department_id)
      if (role === 'rep' && repCallIds) return q.in('id', repCallIds.slice(0, 500))
      return q  // admin: no filter
    }
    // Build a scoped scorecards query that joins through calls for manager dept filter
    function scopedScorecardsQuery() {
      const base = supabase.from('scorecards').select('overall_score').not('overall_score', 'is', null)
      if (role === 'manager' && department_id) {
        return (supabase as any)
          .from('scorecards')
          .select('overall_score, calls!inner(department_id)')
          .eq('calls.department_id', department_id)
          .not('overall_score', 'is', null)
      }
      if (role === 'rep' && repCallIds) return base.in('call_id', repCallIds.slice(0, 500))
      return base  // admin
    }

    const [
      totalRes, scoresRes, weekRes, prevWeekRes,
      deptRes, recentRes, callTypeRes, findingsRes,
      phaseRes, actionRes, failRes,
    ] = await Promise.all([
      scopeCalls(supabase.from('calls').select('id', { count: 'exact', head: true })),
      scopedScorecardsQuery(),
      scopeCalls(supabase.from('calls').select('id', { count: 'exact', head: true }).gte('recorded_at', sevenDaysAgo)),
      scopeCalls(supabase.from('calls').select('id', { count: 'exact', head: true }).gte('recorded_at', fourteenDaysAgo).lt('recorded_at', sevenDaysAgo)),
      supabase.from('departments').select('id, name, calls(id, scorecards(overall_score))'),
      scopeCalls(supabase.from('calls').select('id, call_type, status, recorded_at, departments(name), scorecards(overall_score, summary)').order('recorded_at', { ascending: false, nullsFirst: false }).limit(5)),
      scopeCalls(supabase.from('calls').select('call_type, scorecards(overall_score)')),
      supabase.from('rule_findings').select('rule_key'),
      supabase.from('scorecard_evidence').select('quote').eq('criterion_key', 'meeting_phase'),
      supabase.from('scorecard_evidence').select('quote, scorecards(call_id, calls(call_type))').eq('criterion_key', 'action_item').order('created_at', { ascending: false }).limit(8),
      supabase.from('failed_executions').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
    ])

    // Scores + tiers
    const allScores = (scoresRes.data ?? []).map((d: any) => parseFloat(d.overall_score)).filter(Boolean)
    const avgScore  = allScores.length ? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length : null
    const scoreTiers = {
      excellent: allScores.filter((s: number) => s >= 8.5).length,
      good:      allScores.filter((s: number) => s >= 7 && s < 8.5).length,
      needsWork: allScores.filter((s: number) => s >= 5 && s < 7).length,
      poor:      allScores.filter((s: number) => s < 5).length,
    }

    // Dept breakdown
    const byDept = ((deptRes.data ?? []) as any[])
      .map((d: any) => {
        const calls = d.calls ?? []
        const scs   = calls.map((c: any) => c.scorecards?.[0]?.overall_score).filter((s: any) => s != null) as number[]
        return { name: d.name as string, count: calls.length, avg: scs.length ? scs.reduce((a: number, b: number) => a + b, 0) / scs.length : null }
      })
      .filter((d: any) => d.count > 0)
      .sort((a: any, b: any) => b.count - a.count)

    // Recent calls
    const recentCalls = ((recentRes.data ?? []) as any[]).map((c: any) => ({
      id: c.id, call_type: c.call_type, status: c.status, recorded_at: c.recorded_at,
      score: c.scorecards?.[0]?.overall_score ?? null,
      department_name: c.departments?.name ?? null,
      summary_first_line: (c.scorecards?.[0]?.summary ?? '').split('.')[0].slice(0, 80),
    }))

    // Call type breakdown
    const ctMap: Record<string, { count: number; scores: number[] }> = {}
    for (const row of (callTypeRes.data ?? []) as any[]) {
      const ct = row.call_type ?? 'other'
      if (!ctMap[ct]) ctMap[ct] = { count: 0, scores: [] }
      ctMap[ct].count++
      const s = row.scorecards?.[0]?.overall_score
      if (s != null) ctMap[ct].scores.push(parseFloat(s))
    }
    const byCallType = Object.entries(ctMap).map(([call_type, { count, scores }]) => ({
      call_type, count, avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    })).sort((a, b) => b.count - a.count)

    // Top rule findings
    const fkMap: Record<string, number> = {}
    for (const row of (findingsRes.data ?? []) as any[]) {
      const k = row.rule_key ?? 'unknown'
      fkMap[k] = (fkMap[k] ?? 0) + 1
    }
    const totalF = Object.values(fkMap).reduce((a, b) => a + b, 0)
    const topFindings = Object.entries(fkMap)
      .map(([rule_key, count]) => ({ rule_key, count, pct: totalF > 0 ? Math.round(count / totalF * 100) : 0 }))
      .sort((a, b) => b.count - a.count).slice(0, 8)

    // Meeting phases
    const phaseCounts: Record<string, number> = {}
    for (const row of (phaseRes.data ?? []) as any[]) {
      const p = String(row.quote ?? '').trim().toLowerCase()
      if (!p) continue
      phaseCounts[p] = (phaseCounts[p] ?? 0) + 1
    }
    const byPhase = Object.entries(phaseCounts).map(([phase, count]) => ({ phase, count })).sort((a, b) => b.count - a.count)

    // Action items
    const topActions = ((actionRes.data ?? []) as any[])
      .map((r: any) => ({
        task:      String(r.quote ?? '').split(' - Owner:')[0].split(' [')[0],
        call_id:   r.scorecards?.call_id ?? '',
        call_type: r.scorecards?.calls?.call_type ?? null,
      }))
      .filter((a: any) => a.call_id)

    res.json({
      totalCalls:    totalRes.count ?? 0,
      scoredCalls:   allScores.length,
      weekCalls:     weekRes.count ?? 0,
      prevWeekCalls: prevWeekRes.count ?? 0,
      avgScore,
      scoreTiers,
      byDept,
      recentCalls,
      byCallType,
      topFindings,
      byPhase,
      topActions,
      failures24h: failRes.count ?? 0,
    })
  } catch (err: any) {
    console.error('[analytics/dashboard]', err.message)
    res.status(500).json({ error: 'Failed to load dashboard data' })
  }
})

export default router
