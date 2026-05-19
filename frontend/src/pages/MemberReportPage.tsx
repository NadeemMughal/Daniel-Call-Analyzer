import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { TeamMember, Scorecard } from '@/types'
import ScoreRing from '@/components/ScoreRing'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  ChevronLeft, Activity, TrendingUp, TrendingDown, Minus,
  ArrowRight, Target, Award, Users, Clock, CheckCircle,
} from 'lucide-react'

// ─── constants ────────────────────────────────────────────────
const CALL_TYPE_TINT: Record<string, string> = {
  discovery: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  ads_intro: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  launch: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  follow_up: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  team: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  other: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}
const CALL_TYPE_COLORS: Record<string, string> = {
  discovery: '#a855f7',
  ads_intro: '#3b82f6',
  launch: '#10b981',
  follow_up: '#f59e0b',
  team: '#94a3b8',
  other: '#6b7280',
}
const STATUS_TINT: Record<string, string> = {
  pending: 'bg-gray-500/10 text-gray-400',
  processing: 'bg-blue-500/10 text-blue-400',
  scored: 'bg-emerald-500/10 text-emerald-400',
  failed: 'bg-red-500/10 text-red-400',
}

function scoreHex(s: number | null) {
  if (s === null) return '#64748b'
  if (s >= 8) return '#10b981'
  if (s >= 6) return '#3b82f6'
  if (s >= 4) return '#f59e0b'
  return '#ef4444'
}

interface CallRow {
  call_id: string
  call_type: string | null
  status: string
  recorded_at: string | null
  duration_seconds: number | null
  client_name: string | null
  overall_score: number | null
  summary: string | null
  strengths: Array<{ criterion: string; score: number }> | null
  improvements: Array<{ criterion: string; score: number }> | null
}

interface CriterionStat {
  criterion: string
  avg: number
  count: number
  type: 'strength' | 'improvement'
}

// ─── component ────────────────────────────────────────────────
export default function MemberReportPage() {
  const { id } = useParams<{ id: string }>()
  const [member, setMember] = useState<TeamMember & { departments?: { name: string } } | null>(null)
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [_trend, setTrend] = useState<any>(null)

  useEffect(() => {
    if (!id) return

    Promise.all([
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
        .limit(200),
      api.trends.member(id).catch(() => null),
    ]).then(([mRes, cpRes, trendData]) => {
      if (mRes.data) setMember(mRes.data as any)
      if (trendData) setTrend(trendData)

      const rows: CallRow[] = []
      for (const cp of (cpRes.data ?? []) as any[]) {
        const c = cp.calls
        if (!c) continue
        const sc: Scorecard | null = c.scorecards?.[0] ?? null
        rows.push({
          call_id: c.id,
          call_type: c.call_type,
          status: c.status,
          recorded_at: c.recorded_at,
          duration_seconds: c.duration_seconds,
          client_name: c.clients?.name ?? null,
          overall_score: sc?.overall_score ?? null,
          summary: sc?.summary ?? null,
          strengths: sc?.strengths ?? null,
          improvements: sc?.improvements ?? null,
        })
      }
      rows.sort((a, b) => {
        if (!a.recorded_at) return 1
        if (!b.recorded_at) return -1
        return new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
      })
      setCalls(rows)
      setLoading(false)
    })
  }, [id])

  // ── derived stats ──────────────────────────────────────────
  const scored = calls.filter(c => c.overall_score !== null)
  const avgScore = scored.length
    ? scored.reduce((s, c) => s + c.overall_score!, 0) / scored.length
    : null
  const slaRate = scored.length
    ? Math.round(scored.filter(c => c.overall_score! >= 7).length / scored.length * 100)
    : null
  const latest = scored[0]?.overall_score ?? null
  const previous = scored[1]?.overall_score ?? null
  const delta = latest !== null && previous !== null ? +(latest - previous).toFixed(1) : null

  // Trend direction (last 3 vs prior 3 in chronological order)
  const chronoScored = [...scored].reverse()
  let trendDir: 'up' | 'down' | 'flat' = 'flat'
  if (chronoScored.length >= 4) {
    const r = chronoScored.slice(-3).reduce((s, c) => s + c.overall_score!, 0) / 3
    const p = chronoScored.slice(-6, -3).reduce((s, c) => s + c.overall_score!, 0) / Math.min(3, chronoScored.length - 3)
    if (r - p > 0.3) trendDir = 'up'
    else if (r - p < -0.3) trendDir = 'down'
  }

  // Chart data (chronological)
  const chartData = [...scored].reverse().map((c, i) => ({
    idx: i + 1,
    date: c.recorded_at ? formatDate(c.recorded_at) : '',
    score: c.overall_score,
    type: c.call_type ?? 'other',
  }))

  // Call type breakdown
  const typeMap: Record<string, { count: number; totalCalls: number }> = {}
  for (const c of calls) {
    const k = c.call_type ?? 'other'
    if (!typeMap[k]) typeMap[k] = { count: 0, totalCalls: calls.length }
    typeMap[k].count++
  }

  // Criteria aggregation from strengths + improvements
  const criteriaMap: Record<string, { sum: number; count: number; strengthCount: number; improvCount: number }> = {}
  for (const c of scored) {
    for (const s of c.strengths ?? []) {
      const k = s.criterion
      if (!criteriaMap[k]) criteriaMap[k] = { sum: 0, count: 0, strengthCount: 0, improvCount: 0 }
      criteriaMap[k].sum += s.score
      criteriaMap[k].count++
      criteriaMap[k].strengthCount++
    }
    for (const imp of c.improvements ?? []) {
      const k = imp.criterion
      if (!criteriaMap[k]) criteriaMap[k] = { sum: 0, count: 0, strengthCount: 0, improvCount: 0 }
      criteriaMap[k].sum += imp.score
      criteriaMap[k].count++
      criteriaMap[k].improvCount++
    }
  }
  const criteriaStats: CriterionStat[] = Object.entries(criteriaMap)
    .filter(([, v]) => v.count >= 1)
    .map(([criterion, v]) => ({
      criterion,
      avg: +(v.sum / v.count).toFixed(1),
      count: v.count,
      type: (v.strengthCount >= v.improvCount ? 'strength' : 'improvement') as CriterionStat['type'],
    }))
    .sort((a, b) => b.avg - a.avg)

  const initials = member?.name.split(' ').map(p => p[0]).slice(0, 2).join('') ?? '?'

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!member) return (
    <div className="min-h-screen p-12 text-gray-500 text-sm">Member not found.</div>
  )

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto fade-up">

      {/* ── Back ── */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-300 mb-6 transition"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      {/* ── Hero card ── */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">{member.name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-gray-400 text-sm">{member.email}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {member.role}
              </span>
              {(member as any).departments?.name && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[hsl(222,47%,10%)] text-gray-400 border border-[hsl(222,32%,20%)]">
                  {(member as any).departments.name}
                </span>
              )}
            </div>
          </div>
          <ScoreRing score={avgScore} size="xl" showLabel />
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile icon={Users}       label="Total Calls"   value={calls.length} borderColor="border-l-blue-500" />
        <StatTile icon={CheckCircle} label="Scored"        value={scored.length} borderColor="border-l-emerald-500" accent="text-emerald-400" />
        <StatTile
          icon={Target}
          label="SLA Rate"
          value={slaRate !== null ? `${slaRate}%` : '—'}
          borderColor={slaRate !== null && slaRate >= 80 ? 'border-l-emerald-500' : slaRate !== null && slaRate >= 60 ? 'border-l-amber-500' : 'border-l-red-500'}
          accent={slaRate !== null && slaRate >= 80 ? 'text-emerald-400' : slaRate !== null && slaRate >= 60 ? 'text-amber-400' : 'text-red-400'}
          sub="≥ 7.0 target"
        />
        <StatTile
          icon={trendDir === 'up' ? TrendingUp : trendDir === 'down' ? TrendingDown : Minus}
          label="Direction"
          value={trendDir === 'up' ? 'Improving' : trendDir === 'down' ? 'Declining' : 'Steady'}
          borderColor={trendDir === 'up' ? 'border-l-emerald-500' : trendDir === 'down' ? 'border-l-red-500' : 'border-l-gray-500'}
          accent={trendDir === 'up' ? 'text-emerald-400' : trendDir === 'down' ? 'text-red-400' : 'text-gray-400'}
          sub={delta !== null ? `${delta > 0 ? '+' : ''}${delta} vs prev call` : undefined}
        />
      </div>

      {/* ── Score history chart ── */}
      {chartData.length > 0 ? (
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-white text-[15px]">Score History</h3>
              <p className="text-gray-500 text-xs mt-0.5">Each point is one analyzed call · dashed line = 7.0 target</p>
            </div>
            <span className="text-xs text-gray-500">{chartData.length} scored call{chartData.length !== 1 ? 's' : ''}</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
              <defs>
                <linearGradient id="memberScoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,32%,16%)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: 'hsl(222,32%,18%)' }} tickLine={false} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(222,47%,8%)', border: '1px solid hsl(222,32%,22%)', borderRadius: 8, fontSize: 12, color: '#e2e8f0' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: any, _name: any, props: any) => [`${v}/10 · ${props.payload.type?.replace(/_/g, ' ')}`, 'Score']}
              />
              <ReferenceLine y={7} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Area type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} fill="url(#memberScoreGrad)"
                dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: 'hsl(222,47%,8%)' }}
                activeDot={{ r: 6, fill: '#60a5fa' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* ── Call type breakdown ── */}
        {Object.keys(typeMap).length > 0 && (
          <div className="card p-6">
            <h3 className="font-semibold text-white text-[15px] mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" /> Call Type Breakdown
            </h3>
            <div className="space-y-3">
              {Object.entries(typeMap)
                .sort(([, a], [, b]) => b.count - a.count)
                .map(([type, { count }]) => {
                  const pct = Math.round(count / calls.length * 100)
                  const color = CALL_TYPE_COLORS[type] ?? '#6b7280'
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${CALL_TYPE_TINT[type] ?? CALL_TYPE_TINT.other}`}>
                            {type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[12px] text-gray-400">{count} call{count !== 1 ? 's' : ''}</span>
                        </div>
                        <span className="text-[12px] font-semibold text-gray-300 font-mono">{pct}%</span>
                      </div>
                      <div className="bg-[hsl(222,47%,5%)] rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* ── Skills / Criteria ── */}
        {criteriaStats.length > 0 && (
          <div className="card p-6">
            <h3 className="font-semibold text-white text-[15px] mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" /> Skills Breakdown
            </h3>
            <div className="space-y-2.5">
              {criteriaStats.slice(0, 8).map(c => (
                <div key={c.criterion} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] text-gray-300 font-medium capitalize truncate">
                        {c.criterion.replace(/_/g, ' ')}
                      </span>
                      <span
                        className="text-[12px] font-bold font-mono ml-2 shrink-0"
                        style={{ color: scoreHex(c.avg) }}
                      >
                        {c.avg}/10
                      </span>
                    </div>
                    <div className="bg-[hsl(222,47%,5%)] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${c.avg * 10}%`,
                          background: c.type === 'strength' ? '#10b981' : '#f59e0b',
                        }}
                      />
                    </div>
                  </div>
                  <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                    c.type === 'strength' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {c.type === 'strength' ? 'strength' : 'improve'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Recent meetings table ── */}
      {calls.length > 0 && (
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-[hsl(222,32%,15%)] flex items-center justify-between">
            <h3 className="font-semibold text-white text-[15px] flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" /> Recent Meetings
            </h3>
            <span className="text-xs text-gray-500">{calls.length} total</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(222,47%,6%)] border-b border-[hsl(222,32%,15%)]">
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Date</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Client</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Type</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Score</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Summary</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {calls.slice(0, 20).map(c => (
                <tr key={c.call_id} className="border-t border-[hsl(222,32%,12%)] hover:bg-white/[0.02] transition group">
                  <td className="px-5 py-3.5 text-gray-400 text-[12px] whitespace-nowrap">
                    {c.recorded_at ? formatDateTime(c.recorded_at) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-gray-300 text-[12px] max-w-[120px] truncate">
                    {c.client_name ?? <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    {c.call_type ? (
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${CALL_TYPE_TINT[c.call_type] ?? CALL_TYPE_TINT.other}`}>
                        {c.call_type.replace(/_/g, ' ')}
                      </span>
                    ) : <span className="text-gray-600 text-[12px]">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    {c.overall_score !== null ? (
                      <div className="flex items-center gap-1.5">
                        <ScoreRing score={c.overall_score} size="sm" />
                        <span className="text-[12px] font-bold font-mono" style={{ color: scoreHex(c.overall_score) }}>
                          {c.overall_score.toFixed(1)}
                        </span>
                      </div>
                    ) : <span className="text-gray-600 text-[12px]">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_TINT[c.status] ?? STATUS_TINT.pending}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-[12px] max-w-[220px] truncate">
                    {c.summary ? c.summary.split('.')[0].slice(0, 70) : <span className="italic">No summary</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/calls/${c.call_id}`}
                      className="inline-flex items-center gap-1 text-[12px] text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition"
                    >
                      View <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Coaching insights ── */}
      {criteriaStats.filter(c => c.type === 'improvement').length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold text-white text-[15px] mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" /> Coaching Insights
          </h3>
          <div className="grid md:grid-cols-2 gap-3">
            {criteriaStats.filter(c => c.type === 'improvement').slice(0, 4).map(c => (
              <div key={c.criterion} className="bg-[hsl(222,47%,5%)] border border-amber-500/20 border-l-2 border-l-amber-500 rounded-lg px-4 py-3">
                <p className="text-[13px] font-semibold text-white capitalize mb-0.5">
                  {c.criterion.replace(/_/g, ' ')}
                </p>
                <p className="text-[11px] text-gray-500">
                  Avg <span className="text-amber-400 font-bold">{c.avg}/10</span> across {c.count} call{c.count !== 1 ? 's' : ''}. Focus area for improvement.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── StatTile ─────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, accent = 'text-white', borderColor = 'border-l-gray-600', sub }: {
  icon: any; label: string; value: string | number; accent?: string; borderColor?: string; sub?: string
}) {
  return (
    <div className={`card p-4 border-l-2 ${borderColor}`}>
      <div className="flex items-center gap-1.5 text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}
