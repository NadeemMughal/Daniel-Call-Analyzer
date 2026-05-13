import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import type { TeamMember, CallType } from '@/types'
import ScoreRing from '@/components/ScoreRing'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Activity, Award, ArrowRight, Users } from 'lucide-react'

interface TrendRow {
  call_id: string
  recorded_at: string
  overall_score: number
  call_type: CallType | null
}

const CALL_TYPE_TINT: Record<string, string> = {
  discovery: 'bg-purple-500/10 text-purple-400',
  ads_intro: 'bg-blue-500/10 text-blue-400',
  launch: 'bg-emerald-500/10 text-emerald-400',
  follow_up: 'bg-amber-500/10 text-amber-400',
  team: 'bg-slate-500/10 text-slate-400',
  other: 'bg-gray-500/10 text-gray-400',
}

function scoreHex(s: number | null) {
  if (s === null || s === undefined) return '#64748b'
  if (s >= 8) return '#10b981'
  if (s >= 6) return '#3b82f6'
  if (s >= 4) return '#f59e0b'
  return '#ef4444'
}

export default function TrendsPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [selectedMember, setSelectedMember] = useState<string>('')
  const [trends, setTrends] = useState<TrendRow[]>([])
  const [loading, setLoading] = useState(false)
  const [overallStats, setOverallStats] = useState<{ total: number; avg: number | null; topPerformer: string | null }>({ total: 0, avg: null, topPerformer: null })

  useEffect(() => {
    supabase.from('team_members').select('id, name, email, role, department_id').order('name')
      .then(({ data }) => {
        if (data) {
          setMembers(data as TeamMember[])
          if (data.length > 0) setSelectedMember(data[0].id)
        }
      })
    // Org-wide stats
    supabase.from('scorecards').select('overall_score').not('overall_score', 'is', null)
      .then(({ data }) => {
        if (data && data.length) {
          const scores = data.map(d => d.overall_score as number).filter(Boolean)
          const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
          setOverallStats(s => ({ ...s, total: scores.length, avg }))
        }
      })
  }, [])

  useEffect(() => {
    if (!selectedMember) return
    setLoading(true)
    supabase
      .from('call_participants')
      .select(`call_id, calls(id, recorded_at, call_type, scorecards(overall_score))`)
      .eq('team_member_id', selectedMember)
      .eq('is_external', false)
      .then(({ data }) => {
        if (!data) { setLoading(false); return }
        const rows: TrendRow[] = []
        for (const p of data) {
          const call = (p as any).calls
          if (!call) continue
          const score = call.scorecards?.[0]?.overall_score
          if (score == null) continue
          rows.push({ call_id: call.id, recorded_at: call.recorded_at, overall_score: score, call_type: call.call_type })
        }
        rows.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
        setTrends(rows)
        setLoading(false)
      })
  }, [selectedMember])

  const avg = trends.length > 0 ? trends.reduce((s, t) => s + t.overall_score, 0) / trends.length : null
  const latest = trends.at(-1)?.overall_score ?? null
  const previous = trends.length >= 2 ? trends[trends.length - 2].overall_score : null
  const delta = latest !== null && previous !== null ? latest - previous : null
  const best = trends.length ? Math.max(...trends.map(t => t.overall_score)) : null
  const worst = trends.length ? Math.min(...trends.map(t => t.overall_score)) : null

  // Trend direction (last 3 vs prior 3)
  let trendDirection: 'up' | 'down' | 'flat' = 'flat'
  if (trends.length >= 4) {
    const recent = trends.slice(-3).reduce((s, t) => s + t.overall_score, 0) / 3
    const prior = trends.slice(-6, -3).reduce((s, t) => s + t.overall_score, 0) / Math.min(3, trends.length - 3)
    if (recent - prior > 0.3) trendDirection = 'up'
    else if (recent - prior < -0.3) trendDirection = 'down'
  }

  const chartData = trends.map((t, i) => ({
    idx: i + 1, date: formatDate(t.recorded_at), score: t.overall_score, type: t.call_type ?? 'other',
  }))

  // Call type distribution
  const typeBreakdown: Record<string, { count: number; sum: number }> = {}
  for (const t of trends) {
    const k = (t.call_type as string) || 'other'
    if (!typeBreakdown[k]) typeBreakdown[k] = { count: 0, sum: 0 }
    typeBreakdown[k].count++
    typeBreakdown[k].sum += t.overall_score
  }

  const member = members.find(m => m.id === selectedMember)

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto fade-up">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">Performance Trends</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Team Performance</h1>
          <p className="text-gray-500 text-sm mt-1">Score history per rep · spot patterns over time</p>
        </div>
        <div className="grid grid-cols-3 gap-3 min-w-[420px]">
          <TopTile icon={Users} label="Team members" value={members.length} />
          <TopTile icon={Activity} label="Calls scored" value={overallStats.total} />
          <TopTile icon={Award} label="Org avg" value={overallStats.avg ? `${overallStats.avg.toFixed(1)}` : '—'} accent={scoreHex(overallStats.avg)} />
        </div>
      </div>

      {/* Member pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        {members.length === 0 ? (
          <div className="card px-4 py-3 text-gray-500 text-sm">
            No team members loaded. Run <code className="text-amber-400">supabase/seed.sql</code> and <code className="text-amber-400">0003_demo_public_read.sql</code> in Supabase.
          </div>
        ) : members.map(m => (
          <button
            key={m.id}
            onClick={() => setSelectedMember(m.id)}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition ${
              selectedMember === m.id
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/40'
                : 'bg-[hsl(222,47%,8%)] text-gray-400 border-[hsl(222,32%,18%)] hover:text-gray-200 hover:border-[hsl(222,32%,28%)]'
            }`}
          >
            {m.name}
            {m.role !== 'rep' && <span className="ml-2 text-[10px] uppercase tracking-wider opacity-70">{m.role}</span>}
          </button>
        ))}
      </div>

      {!selectedMember ? null : loading ? (
        <div className="card py-20 text-center text-gray-500">Loading trends…</div>
      ) : (
        <div className="space-y-4">
          {/* Member header */}
          <div className="card p-6 flex items-center gap-5">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-lg font-bold">
              {member?.name?.split(' ').map(p => p[0]).slice(0, 2).join('') ?? '?'}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">{member?.name}</h2>
              <p className="text-gray-500 text-sm">{member?.email} · {member?.role}</p>
            </div>
            <ScoreRing score={avg} size="lg" showLabel />
          </div>

          {/* KPI strip */}
          <div className="grid md:grid-cols-4 gap-3">
            <KPICard label="Calls scored" value={trends.length} />
            <KPICard
              label="Latest score"
              value={latest !== null ? `${latest.toFixed(1)} / 10` : '—'}
              valueColor={scoreHex(latest)}
              extra={delta !== null && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)} vs prev
                </span>
              )}
            />
            <KPICard label="Best score" value={best !== null ? `${best.toFixed(1)} / 10` : '—'} valueColor={scoreHex(best)} />
            <KPICard
              label="Direction"
              value={trendDirection === 'up' ? 'Improving' : trendDirection === 'down' ? 'Declining' : 'Steady'}
              valueColor={trendDirection === 'up' ? '#10b981' : trendDirection === 'down' ? '#ef4444' : '#64748b'}
              extra={
                <span className="text-[11px] text-gray-500">
                  Best {best?.toFixed(1) ?? '—'} · Worst {worst?.toFixed(1) ?? '—'}
                </span>
              }
            />
          </div>

          {/* Chart */}
          {chartData.length > 0 ? (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-white text-[15px]">Score over time</h3>
                  <p className="text-gray-500 text-xs mt-0.5">Each dot is one analyzed call · dashed line is target (7.0)</p>
                </div>
                <span className="text-xs text-gray-500">{chartData.length} call{chartData.length !== 1 ? 's' : ''}</span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                  <defs>
                    <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 32%, 16%)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: 'hsl(222, 32%, 18%)' }} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(222, 47%, 8%)', border: '1px solid hsl(222, 32%, 22%)', borderRadius: 8, fontSize: 12, color: '#e2e8f0' }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value: number, _name, props: any) => [`${value.toFixed(1)}/10 · ${props.payload.type}`, 'Score']}
                  />
                  <ReferenceLine y={7} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Area type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} fill="url(#scoreFill)" />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={0} dot={{ r: 5, fill: '#3b82f6', strokeWidth: 2, stroke: 'hsl(222, 47%, 8%)' }} activeDot={{ r: 7, fill: '#60a5fa' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="card py-16 text-center">
              <Activity className="w-8 h-8 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No scored calls yet{member?.name ? ` for ${member.name}` : ''}.</p>
              <p className="text-gray-600 text-xs mt-1">Once a call is processed, scores will appear here.</p>
            </div>
          )}

          {/* By call type */}
          {Object.keys(typeBreakdown).length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-white text-[15px] mb-4">By call type</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(typeBreakdown).map(([type, v]) => {
                  const a = v.sum / v.count
                  return (
                    <div key={type} className="bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,15%)] rounded-lg p-4">
                      <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${CALL_TYPE_TINT[type] || CALL_TYPE_TINT.other}`}>
                        {type.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-2xl font-bold text-white">{a.toFixed(1)}</span>
                        <span className="text-xs text-gray-500">/10 avg</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">{v.count} call{v.count !== 1 ? 's' : ''}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent calls table */}
          {trends.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-[hsl(222,32%,15%)]">
                <h3 className="font-semibold text-white text-[15px]">Recent calls</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[hsl(222,47%,6%)]">
                    <th className="text-left px-6 py-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">Date</th>
                    <th className="text-left px-6 py-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">Type</th>
                    <th className="text-left px-6 py-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">Score</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...trends].reverse().map(t => (
                    <tr key={t.call_id} className="border-t border-[hsl(222,32%,12%)] hover:bg-white/[0.02] transition group">
                      <td className="px-6 py-3 text-gray-400">{formatDate(t.recorded_at)}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${CALL_TYPE_TINT[t.call_type as string] || CALL_TYPE_TINT.other}`}>
                          {(t.call_type as string)?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-bold" style={{ color: scoreHex(t.overall_score) }}>
                          {t.overall_score.toFixed(1)} / 10
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link to={`/calls/${t.call_id}`} className="text-blue-400 hover:text-blue-300 text-[13px] inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          View <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TopTile({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="card px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-xl font-bold font-mono" style={{ color: accent || '#fff' }}>{value}</div>
    </div>
  )
}

function KPICard({ label, value, valueColor, extra }: any) {
  return (
    <div className="card p-5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">{label}</div>
      <div className="text-2xl font-bold mb-1" style={{ color: valueColor || '#fff' }}>{value}</div>
      {extra && <div className="mt-1">{extra}</div>}
    </div>
  )
}
