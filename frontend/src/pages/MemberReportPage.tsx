import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { useProfile } from '@/lib/auth'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { TeamMember } from '@/types'
import ScoreRing from '@/components/ScoreRing'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  ChevronLeft, Activity, TrendingUp, TrendingDown, Minus,
  ArrowRight, Target, Award, Users, Clock, CheckCircle, MessageSquare, Trash2,
  Star, Zap, BarChart2, ShieldAlert,
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

function getGrade(avg: number | null): { letter: string; color: string; bg: string; border: string; desc: string } {
  if (avg === null) return { letter: '—', color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/30', desc: 'No data yet' }
  if (avg >= 8.5)  return { letter: 'A', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', desc: 'Exceptional' }
  if (avg >= 7.0)  return { letter: 'B', color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    desc: 'Above target' }
  if (avg >= 5.5)  return { letter: 'C', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   desc: 'Developing' }
  if (avg >= 4.0)  return { letter: 'D', color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  desc: 'Needs focus' }
  return               { letter: 'F', color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     desc: 'At risk' }
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

interface Note {
  id: string
  content: string
  created_at: string
  author: { id: string; name: string; role: string } | null
}

// ─── component ────────────────────────────────────────────────
export default function MemberReportPage() {
  const { id } = useParams<{ id: string }>()
  const profile = useProfile()
  const [member, setMember] = useState<TeamMember & { departments?: { name: string } } | null>(null)
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [_trend, setTrend] = useState<any>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [noteText, setNoteText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    api.members.get(id)
      .then(({ member, calls: rows, trend: trendData }: any) => {
        setMember(member)
        setCalls(rows ?? [])
        if (trendData) setTrend(trendData)
        setLoading(false)
      })
      .catch(() => setLoading(false))
    api.members.notes(id).then((n: any) => setNotes(Array.isArray(n) ? n : [])).catch(() => {})
  }, [id])

  async function submitNote() {
    if (!noteText.trim() || !id) return
    setSubmitting(true)
    try {
      const note = await api.members.addNote(id, noteText)
      setNotes(prev => [note as Note, ...prev])
      setNoteText('')
    } catch {}
    setSubmitting(false)
  }

  async function deleteNote(noteId: string) {
    if (!id) return
    try {
      await api.members.deleteNote(id, noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch {}
  }

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
  const grade = getGrade(avgScore)

  // Sales call performance (discovery, ads_intro, launch, follow_up)
  const SALES_TYPES = ['discovery', 'ads_intro', 'launch', 'follow_up']
  const salesCalls = calls.filter(c => SALES_TYPES.includes(c.call_type ?? ''))
  const salesScored = salesCalls.filter(c => c.overall_score !== null)
  const salesAvg = salesScored.length
    ? +(salesScored.reduce((s, c) => s + c.overall_score!, 0) / salesScored.length).toFixed(1)
    : null
  const teamCalls = calls.filter(c => c.call_type === 'team')

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
          <div className="flex flex-col items-center gap-2 shrink-0">
            <ScoreRing score={avgScore} size="xl" showLabel />
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border ${grade.bg} ${grade.border}`}>
              <Star className={`w-3 h-3 ${grade.color}`} />
              <span className={`text-[13px] font-bold ${grade.color}`}>Grade {grade.letter}</span>
              <span className={`text-[10px] ${grade.color} opacity-70`}>· {grade.desc}</span>
            </div>
          </div>
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

      {/* ── Sales & Team Performance ── */}
      {(salesCalls.length > 0 || teamCalls.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Sales performance */}
          {salesCalls.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-white text-[15px] mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" /> Sales Performance
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-[hsl(222,47%,5%)] rounded-lg px-3 py-2.5 border border-[hsl(222,32%,14%)]">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-0.5">Sales Calls</p>
                  <p className="text-xl font-bold text-white font-mono">{salesCalls.length}</p>
                </div>
                <div className="bg-[hsl(222,47%,5%)] rounded-lg px-3 py-2.5 border border-[hsl(222,32%,14%)]">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-0.5">Sales Avg</p>
                  <p className="text-xl font-bold font-mono" style={{ color: salesAvg !== null ? scoreHex(salesAvg) : '#64748b' }}>
                    {salesAvg !== null ? `${salesAvg}` : '—'}
                  </p>
                </div>
              </div>
              <div className="space-y-2.5">
                {SALES_TYPES.map(type => {
                  const typeCalls = salesCalls.filter(c => c.call_type === type)
                  const typeSc    = typeCalls.filter(c => c.overall_score !== null)
                  const typeAvg   = typeSc.length ? +(typeSc.reduce((s, c) => s + c.overall_score!, 0) / typeSc.length).toFixed(1) : null
                  if (typeCalls.length === 0) return null
                  return (
                    <div key={type} className="flex items-center justify-between text-[12px]">
                      <span className="text-gray-400 capitalize">{type.replace(/_/g, ' ')}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-600">{typeCalls.length} call{typeCalls.length !== 1 ? 's' : ''}</span>
                        <span className="font-bold font-mono min-w-[40px] text-right" style={{ color: typeAvg !== null ? scoreHex(typeAvg) : '#64748b' }}>
                          {typeAvg !== null ? `${typeAvg}/10` : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quality / SLA */}
          <div className="card p-6">
            <h3 className="font-semibold text-white text-[15px] mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-violet-400" /> Quality Overview
            </h3>
            <div className="space-y-4">
              {/* Grade gauge */}
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${grade.bg} ${grade.border}`}>
                <div className={`text-4xl font-black ${grade.color}`}>{grade.letter}</div>
                <div>
                  <p className={`text-[13px] font-semibold ${grade.color}`}>{grade.desc}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {avgScore !== null ? `Avg ${avgScore.toFixed(1)}/10` : 'Not enough data'}
                    {scored.length > 0 ? ` across ${scored.length} scored call${scored.length !== 1 ? 's' : ''}` : ''}
                  </p>
                </div>
              </div>
              {/* SLA rate */}
              {slaRate !== null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-gray-400">SLA Rate (≥7.0)</span>
                    <span className="text-[12px] font-bold" style={{ color: slaRate >= 80 ? '#10b981' : slaRate >= 60 ? '#f59e0b' : '#ef4444' }}>
                      {slaRate}%
                    </span>
                  </div>
                  <div className="bg-[hsl(222,47%,5%)] rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${slaRate}%`,
                        background: slaRate >= 80 ? '#10b981' : slaRate >= 60 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1">Target: 80% of scored calls ≥ 7.0</p>
                </div>
              )}
              {/* Team calls */}
              {teamCalls.length > 0 && (
                <div className="flex items-center justify-between text-[12px] pt-2 border-t border-[hsl(222,32%,15%)]">
                  <span className="text-gray-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Team/internal calls
                  </span>
                  <span className="font-semibold text-slate-400">{teamCalls.length}</span>
                </div>
              )}
              {/* Risk flag */}
              {avgScore !== null && avgScore < 5.5 && (
                <div className="flex items-start gap-2 p-2 rounded bg-red-500/5 border border-red-500/20">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-red-300 leading-relaxed">Performance below coaching threshold. Recommend immediate 1-on-1 session.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
        <div className="card p-6 mb-6">
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

      {/* ── Manager Notes ── */}
      <div className="card p-6">
        <h3 className="font-semibold text-white text-[15px] mb-4 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-400" /> Manager Notes
        </h3>

        {/* Write note — admin and manager only */}
        {profile && profile.role !== 'rep' && (
          <div className="mb-5">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Write a coaching note…"
              rows={3}
              className="w-full bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,20%)] rounded-lg px-3 py-2.5 text-[13px] text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={submitNote}
                disabled={!noteText.trim() || submitting}
                className="px-4 py-1.5 rounded-md text-[12px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {submitting ? 'Saving…' : 'Add Note'}
              </button>
            </div>
          </div>
        )}

        {/* Notes list */}
        {notes.length === 0 ? (
          <p className="text-gray-600 text-[12px] italic py-4 text-center">No notes yet.</p>
        ) : (
          <div className="space-y-3">
            {notes.map(note => {
              const authorInitials = note.author?.name?.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() ?? '?'
              const canDelete = profile && (profile.role === 'admin' || profile.id === note.author?.id)
              return (
                <div key={note.id} className="bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded-lg px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/20 flex items-center justify-center text-purple-400 text-[10px] font-bold shrink-0 mt-0.5">
                      {authorInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-gray-200">{note.author?.name ?? 'Unknown'}</span>
                          <span className="text-[10px] text-gray-600">·</span>
                          <span className="text-[11px] text-gray-500">{formatDateTime(note.created_at)}</span>
                        </div>
                        {canDelete && (
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="text-gray-600 hover:text-red-400 transition shrink-0"
                            title="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-[13px] text-gray-300 mt-1.5 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
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
