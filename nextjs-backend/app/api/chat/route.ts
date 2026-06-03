import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { anthropic } from '@/lib/anthropic'
import { supabase } from '@/lib/supabase'

export async function OPTIONS() { return new Response(null, { status: 204 }) }

// ── Tool implementations ──────────────────────────────────────────────────────

async function getTeamOverview(user: { id: string; role: string; department_id?: string }) {
  let q = supabase.from('team_members').select('id, name, role, departments(name)')
  if (user.role === 'manager' && user.department_id) q = (q as any).eq('department_id', user.department_id)
  else if (user.role === 'rep') q = (q as any).eq('id', user.id)

  const [membersRes, scoresRes] = await Promise.all([
    q,
    supabase.from('scorecards').select('overall_score, calls(recorded_at, call_type, department_id, call_participants(team_member_id, is_external))').not('overall_score', 'is', null).order('created_at', { ascending: false }).limit(500),
  ])

  const members = (membersRes.data ?? []) as any[]
  const scorecards = (scoresRes.data ?? []) as any[]

  const memberStats: Record<string, { name: string; scores: number[]; calls: number }> = {}
  for (const m of members) memberStats[m.id] = { name: m.name, scores: [], calls: 0 }

  for (const sc of scorecards) {
    const call = sc.calls
    if (!call) continue
    const internals = (call.call_participants ?? []).filter((p: any) => !p.is_external)
    for (const p of internals) {
      if (memberStats[p.team_member_id]) {
        memberStats[p.team_member_id].scores.push(parseFloat(sc.overall_score))
        memberStats[p.team_member_id].calls++
      }
    }
  }

  return Object.entries(memberStats).map(([id, s]) => ({
    id, name: s.name,
    avg_score: s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length * 10) / 10 : null,
    total_calls: s.calls,
  })).sort((a, b) => (b.avg_score ?? 0) - (a.avg_score ?? 0))
}

async function getMemberStats(memberId: string, user: { id: string; role: string; department_id?: string }) {
  if (user.role === 'rep' && user.id !== memberId) return { error: 'You can only view your own stats' }

  const [memberRes, partsRes, trendsRes] = await Promise.all([
    supabase.from('team_members').select('id, name, email, role, departments(name)').eq('id', memberId).single(),
    supabase.from('call_participants').select('calls(id, call_type, recorded_at, scorecards(overall_score, summary, strengths, improvements))').eq('team_member_id', memberId).eq('is_external', false).limit(50),
    supabase.from('member_trends').select('*').eq('member_id', memberId).order('period_end', { ascending: false }).limit(1).single(),
  ])

  const calls = (partsRes.data ?? []).map((cp: any) => cp.calls).filter(Boolean)
  const scores = calls.map((c: any) => c.scorecards?.[0]?.overall_score).filter((s: any) => s != null).map(parseFloat)
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null

  return { member: memberRes.data, avg_score: avgScore, total_calls: calls.length, recent_calls: calls.slice(0, 5), trend: trendsRes.data ?? null }
}

async function searchCalls(params: { rep_name?: string; score_min?: number; score_max?: number; call_type?: string; days_back?: number; limit?: number }, user: { id: string; role: string; department_id?: string }) {
  const daysBack = params.days_back ?? 30
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString()

  let q = supabase.from('calls').select('id, call_type, recorded_at, status, clients(name), scorecards(overall_score, summary), call_participants(team_member_id, is_external, team_members(name))')
    .gte('recorded_at', since).order('recorded_at', { ascending: false }).limit(params.limit ?? 10)

  if (user.role === 'manager') {
    const { data: partsResult } = await supabase.from('call_participants').select('call_id').eq('team_member_id', user.id)
    const partIds = partsResult?.map((p: any) => p.call_id) ?? []
    if (user.department_id && partIds.length > 0)
      q = (q as any).or(`department_id.eq.${user.department_id},id.in.(${partIds.slice(0, 200).join(',')})`)
    else if (user.department_id)
      q = (q as any).eq('department_id', user.department_id)
    else if (partIds.length > 0)
      q = (q as any).in('id', partIds.slice(0, 300))
    else return []
  }
  if (params.call_type) q = (q as any).eq('call_type', params.call_type)

  const { data } = await q
  let results = (data ?? []) as any[]

  if (params.rep_name) {
    const name = params.rep_name.toLowerCase()
    results = results.filter((c: any) =>
      (c.call_participants ?? []).some((p: any) => !p.is_external && p.team_members?.name?.toLowerCase().includes(name))
    )
  }
  if (params.score_min != null) results = results.filter((c: any) => (c.scorecards?.[0]?.overall_score ?? 0) >= params.score_min!)
  if (params.score_max != null) results = results.filter((c: any) => (c.scorecards?.[0]?.overall_score ?? 10) <= params.score_max!)

  return results.map((c: any) => ({
    id: c.id, call_type: c.call_type, recorded_at: c.recorded_at, client: c.clients?.name ?? null,
    score: c.scorecards?.[0]?.overall_score ?? null, summary: c.scorecards?.[0]?.summary ?? null,
    reps: (c.call_participants ?? []).filter((p: any) => !p.is_external).map((p: any) => p.team_members?.name).filter(Boolean),
  }))
}

async function getCoachingInsights(memberId: string, user: { id: string; role: string; department_id?: string }) {
  if (user.role === 'rep' && user.id !== memberId) return { error: 'You can only view your own insights' }

  const { data: parts } = await supabase.from('call_participants').select('calls(id, scorecards(strengths, improvements, coaching_priorities))').eq('team_member_id', memberId).eq('is_external', false).limit(20)

  const allStrengths: Record<string, number> = {}
  const allImprovements: Record<string, number> = {}
  const coachingPriorities: string[] = []

  for (const cp of (parts ?? []) as any[]) {
    const sc = cp.calls?.scorecards?.[0]
    if (!sc) continue
    for (const s of (sc.strengths ?? [])) allStrengths[s.criterion] = (allStrengths[s.criterion] ?? 0) + 1
    for (const i of (sc.improvements ?? [])) allImprovements[i.criterion] = (allImprovements[i.criterion] ?? 0) + 1
    if (sc.coaching_priorities) coachingPriorities.push(...(Array.isArray(sc.coaching_priorities) ? sc.coaching_priorities : [sc.coaching_priorities]))
  }

  return {
    top_strengths: Object.entries(allStrengths).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
    top_improvements: Object.entries(allImprovements).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
    recent_coaching_priorities: coachingPriorities.slice(0, 5),
  }
}

// ── Tool definitions for Claude ───────────────────────────────────────────────

const TOOLS: any[] = [
  {
    name: 'get_team_overview',
    description: 'Get team performance overview — avg scores and call counts for all members the user can see.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_member_stats',
    description: 'Get detailed stats for a specific team member: avg score, recent calls, coaching insights, trend.',
    input_schema: { type: 'object', properties: { member_id: { type: 'string', description: 'UUID of the team member' }, member_name: { type: 'string', description: 'Name to search for if ID unknown' } }, required: [] },
  },
  {
    name: 'search_calls',
    description: 'Search and filter calls. Can filter by rep name, score range, call type, or days back.',
    input_schema: { type: 'object', properties: { rep_name: { type: 'string' }, score_min: { type: 'number' }, score_max: { type: 'number' }, call_type: { type: 'string', enum: ['discovery', 'ads_intro', 'launch', 'follow_up', 'team', 'other'] }, days_back: { type: 'number', default: 30 }, limit: { type: 'number', default: 10 } }, required: [] },
  },
  {
    name: 'get_coaching_insights',
    description: 'Get coaching insights for a team member: their consistent strengths and areas needing improvement.',
    input_schema: { type: 'object', properties: { member_id: { type: 'string' } }, required: ['member_id'] },
  },
]

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()

  const { messages } = await req.json() as { messages: { role: string; content: string }[] }
  if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 })

  const roleLabel = user.role === 'admin' ? 'Admin (full org access)' : user.role === 'manager' ? 'Manager (department access only)' : 'Rep (own data only)'

  const systemPrompt = `You are an AI sales coaching assistant for WeBuildTrades. You help managers, reps, and admins understand call performance and improve coaching.

Current user: ${roleLabel} (ID: ${user.id})

You have access to tools to query live data. Use them to give accurate, specific answers.
- For admins: show full org data
- For managers: show only their department's data
- For reps: show only their own data — never show other reps' data

Be concise, data-driven, and actionable. Format scores clearly (e.g. "8.1/10").
When giving coaching advice, be specific and encouraging.`

  try {
    // Agentic loop — handle tool use
    const anthropicMessages: any[] = messages.map(m => ({ role: m.role, content: m.content }))
    let response = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, system: systemPrompt, tools: TOOLS, messages: anthropicMessages })

    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks: any[] = response.content.filter((b: any) => b.type === 'tool_use')
      const toolResults: any[] = []

      for (const block of toolUseBlocks) {
        const input = (block as any).input ?? {}
        let result: any

        try {
          if (block.name === 'get_team_overview') {
            result = await getTeamOverview(user)
          } else if (block.name === 'get_member_stats') {
            let memberId = input.member_id
            if (!memberId && input.member_name) {
              const { data } = await supabase.from('team_members').select('id, name').ilike('name', `%${input.member_name}%`).limit(1).single()
              memberId = data?.id
            }
            result = memberId ? await getMemberStats(memberId, user) : { error: 'Member not found' }
          } else if (block.name === 'search_calls') {
            result = await searchCalls(input, user)
          } else if (block.name === 'get_coaching_insights') {
            result = await getCoachingInsights(input.member_id, user)
          }
        } catch (e: any) {
          result = { error: e.message }
        }

        toolResults.push({ type: 'tool_result', tool_use_id: (block as any).id, content: JSON.stringify(result) })
      }

      anthropicMessages.push({ role: 'assistant', content: response.content })
      anthropicMessages.push({ role: 'user', content: toolResults })
      response = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1024, system: systemPrompt, tools: TOOLS, messages: anthropicMessages })
    }

    const text = response.content.find((b: any) => b.type === 'text')
    return NextResponse.json({ reply: (text as any)?.text ?? 'No response generated.' })
  } catch (err: any) {
    console.error('[chat] error:', err?.status, err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Sorry, something went wrong. Please try again.' }, { status: 500 })
  }
}
