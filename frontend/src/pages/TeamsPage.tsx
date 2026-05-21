import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useProfile } from '@/lib/auth'
import { formatDate } from '@/lib/utils'
import type { MemberCard } from '@/types'
import ScoreRing from '@/components/ScoreRing'
import {
  Users, Trophy, ArrowRight, TrendingUp, TrendingDown,
  Minus, Activity, ChevronUp, ChevronDown, Search,
} from 'lucide-react'

// ─── helpers ──────────────────────────────────────────────────
function getGrade(avg: number | null): { letter: string; color: string; bg: string } {
  if (avg === null) return { letter: '—', color: 'text-gray-500', bg: 'bg-gray-500/10' }
  if (avg >= 8.5)  return { letter: 'A',  color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
  if (avg >= 7.0)  return { letter: 'B',  color: 'text-blue-400',    bg: 'bg-blue-500/10'    }
  if (avg >= 5.5)  return { letter: 'C',  color: 'text-amber-400',   bg: 'bg-amber-500/10'   }
  if (avg >= 4.0)  return { letter: 'D',  color: 'text-orange-400',  bg: 'bg-orange-500/10'  }
  return               { letter: 'F',  color: 'text-red-400',     bg: 'bg-red-500/10'     }
}

function trendBadge(trend: string | null) {
  switch (trend) {
    case 'IMPROVING':         return { icon: ChevronUp,   color: 'text-emerald-400', label: 'Improving',  bg: 'bg-emerald-500/10' }
    case 'DECLINING':         return { icon: ChevronDown, color: 'text-red-400',     label: 'Declining',  bg: 'bg-red-500/10'     }
    case 'PLATEAUING':        return { icon: Minus,       color: 'text-gray-400',    label: 'Steady',     bg: 'bg-gray-500/10'    }
    case 'INSUFFICIENT_DATA': return { icon: Minus,       color: 'text-gray-500',    label: 'Limited',    bg: 'bg-gray-500/10'    }
    default:                  return { icon: Activity,    color: 'text-blue-400',    label: 'New',        bg: 'bg-blue-500/10'    }
  }
}

function scoreColor(s: number | null) {
  if (s === null) return '#64748b'
  if (s >= 8.5)  return '#10b981'
  if (s >= 7.0)  return '#3b82f6'
  if (s >= 5.5)  return '#f59e0b'
  return '#ef4444'
}

const CALL_TYPE_COLORS: Record<string, string> = {
  discovery: '#a855f7',
  ads_intro: '#3b82f6',
  launch:    '#10b981',
  follow_up: '#f59e0b',
  team:      '#94a3b8',
  other:     '#6b7280',
}

const ROLE_BADGE: Record<string, string> = {
  admin:   'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  manager: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  rep:     'bg-gray-500/10 text-gray-400 border border-gray-500/20',
}

// ─── component ────────────────────────────────────────────────
export default function TeamsPage() {
  const profile = useProfile()
  const [members, setMembers] = useState<MemberCard[]>([])
  const [loading, setLoading]  = useState(true)
  const [search, setSearch]    = useState('')
  const [sortBy, setSortBy]    = useState<'score' | 'calls' | 'name'>('score')

  useEffect(() => {
    api.analytics.memberCards()
      .then((data: any) => {
        setMembers(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = members
    .filter(m =>
      m.member_name.toLowerCase().includes(search.toLowerCase()) ||
      (m.department_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      m.member_email.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'score') return (b.avg_score ?? -1) - (a.avg_score ?? -1)
      if (sortBy === 'calls') return b.total_calls - a.total_calls
      return a.member_name.localeCompare(b.member_name)
    })

  // Group by department
  const byDept: Record<string, MemberCard[]> = {}
  for (const m of filtered) {
    const dept = m.department_name ?? 'No Department'
    if (!byDept[dept]) byDept[dept] = []
    byDept[dept].push(m)
  }

  // Overall stats
  const scoredMembers = members.filter(m => m.avg_score !== null)
  const orgAvg = scoredMembers.length
    ? +(scoredMembers.reduce((s, m) => s + m.avg_score!, 0) / scoredMembers.length).toFixed(1)
    : null
  const topMember = [...members].sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1))[0]
  const totalCalls = members.reduce((s, m) => s + m.total_calls, 0)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto fade-up">
      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Users className="w-7 h-7 text-blue-400" />
          {profile?.role === 'manager' ? 'Your Team' : 'Team Members'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {profile?.role === 'manager'
            ? 'Your department\'s performance at a glance.'
            : 'Full org view — all reps, managers, and their performance metrics.'}
        </p>
      </div>

      {/* ── Org summary strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryTile label="Team members"  value={members.length}             borderColor="border-l-blue-500" />
        <SummaryTile label="Total calls"   value={totalCalls}                 borderColor="border-l-violet-500" accent="text-violet-400" />
        <SummaryTile label="Org avg score" value={orgAvg !== null ? `${orgAvg}` : '—'} borderColor="border-l-amber-500" accent="text-amber-400" />
        <SummaryTile label="Top performer" value={topMember?.member_name.split(' ')[0] ?? '—'} borderColor="border-l-emerald-500" accent="text-emerald-400" />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name, dept, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,20%)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition"
          />
        </div>
        <div className="flex items-center gap-1 bg-[hsl(222,47%,8%)] border border-[hsl(222,32%,18%)] rounded-lg p-1">
          {(['score', 'calls', 'name'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition capitalize ${sortBy === s ? 'bg-blue-500/15 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Departments ── */}
      {Object.keys(byDept).length === 0 ? (
        <div className="card p-12 text-center text-gray-500 text-sm">No team members found.</div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byDept).map(([dept, deptMembers]) => {
            const deptAvg = deptMembers.filter(m => m.avg_score !== null).length
              ? +(deptMembers.filter(m => m.avg_score !== null).reduce((s, m) => s + m.avg_score!, 0) / deptMembers.filter(m => m.avg_score !== null).length).toFixed(1)
              : null
            return (
              <div key={dept}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <h2 className="text-[13px] font-semibold text-white uppercase tracking-wider">{dept}</h2>
                    <span className="text-[11px] text-gray-500 font-mono">{deptMembers.length} member{deptMembers.length !== 1 ? 's' : ''}</span>
                  </div>
                  {deptAvg !== null && (
                    <span className="text-[11px] text-gray-500">dept avg <span className="font-bold" style={{ color: scoreColor(deptAvg) }}>{deptAvg}/10</span></span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {deptMembers.map((m, i) => <MemberCardTile key={m.member_id} member={m} rank={i} allInDept={deptMembers} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── MemberCardTile ───────────────────────────────────────────
function MemberCardTile({ member: m, rank, allInDept }: { member: MemberCard; rank: number; allInDept: MemberCard[] }) {
  const grade = getGrade(m.avg_score)
  const tb    = trendBadge(m.score_trend)
  const TbIcon = tb.icon
  const initials = m.member_name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : null

  const topTypes = Object.entries(m.call_type_breakdown ?? {})
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)

  const slaRate = m.scored_calls > 0
    ? null  // not available in card data — shown on detail page
    : null

  return (
    <Link
      to={`/members/${m.member_id}`}
      className="card p-5 hover:bg-white/[0.025] hover:border-blue-500/30 transition group border border-[hsl(222,32%,18%)] flex flex-col gap-4 cursor-pointer"
    >
      {/* ── Header row ── */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/25 flex items-center justify-center text-blue-400 text-[14px] font-bold">
            {initials}
          </div>
          {medal && (
            <span className="absolute -top-1.5 -right-1.5 text-[13px] leading-none">{medal}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-white truncate">{m.member_name}</p>
            <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${ROLE_BADGE[m.member_role] ?? ROLE_BADGE.rep}`}>
              {m.member_role}
            </span>
          </div>
          <p className="text-[11px] text-gray-600 truncate mt-0.5">{m.member_email}</p>
          {m.last_call_at && (
            <p className="text-[10px] text-gray-600 mt-0.5">Last call {formatDate(m.last_call_at)}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <ScoreRing score={m.avg_score} size="md" showLabel />
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${grade.bg} ${grade.color}`}>
            Grade {grade.letter}
          </span>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <StatCell label="Calls"  value={m.total_calls}                  />
        <StatCell label="Scored" value={m.scored_calls} accent="text-emerald-400" />
        <StatCell
          label="Score"
          value={m.avg_score !== null ? m.avg_score.toFixed(1) : '—'}
          accent={m.avg_score !== null ? undefined : 'text-gray-500'}
          style={{ color: m.avg_score !== null ? scoreColor(m.avg_score) : undefined }}
        />
      </div>

      {/* ── Call type bars ── */}
      {topTypes.length > 0 && (
        <div className="space-y-1.5">
          {topTypes.map(([type, pct]) => (
            <div key={type}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-gray-500 capitalize">{type.replace(/_/g, ' ')}</span>
                <span className="text-[10px] text-gray-500 font-mono">{Math.round((pct as number) * 100)}%</span>
              </div>
              <div className="bg-[hsl(222,47%,5%)] rounded-full h-1 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.round((pct as number) * 100)}%`, background: CALL_TYPE_COLORS[type] ?? '#6b7280' }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between pt-1 border-t border-[hsl(222,32%,13%)]">
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${tb.bg} ${tb.color}`}>
          <TbIcon className="w-3 h-3" /> {tb.label}
        </span>
        <span className="text-[11px] text-blue-400 group-hover:text-blue-300 inline-flex items-center gap-0.5 transition">
          View report <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  )
}

function SummaryTile({ label, value, accent = 'text-white', borderColor = 'border-l-gray-600' }: {
  label: string; value: string | number; accent?: string; borderColor?: string
}) {
  return (
    <div className={`card p-4 border-l-2 ${borderColor}`}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  )
}

function StatCell({ label, value, accent = 'text-white', style }: { label: string; value: string | number; accent?: string; style?: React.CSSProperties }) {
  return (
    <div className="bg-[hsl(222,47%,5%)] rounded-lg px-2 py-2 border border-[hsl(222,32%,14%)]">
      <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-0.5">{label}</p>
      <p className={`text-[15px] font-bold font-mono ${accent}`} style={style}>{value}</p>
    </div>
  )
}
