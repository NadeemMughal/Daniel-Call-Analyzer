import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatDuration, formatDateTime } from '@/lib/utils'
import type { Call, CallType, CallStatus } from '@/types'
import { Search, Clock, User, ArrowRight, X } from 'lucide-react'
import ScoreRing from '@/components/ScoreRing'

const CALL_TYPE_TINT: Record<string, string> = {
  discovery: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  ads_intro: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  launch: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  follow_up: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  team: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  other: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

const STATUS_TINT: Record<string, string> = {
  pending: 'bg-gray-500/10 text-gray-400',
  processing: 'bg-blue-500/10 text-blue-400',
  scored: 'bg-emerald-500/10 text-emerald-400',
  failed: 'bg-red-500/10 text-red-400',
}

const CALL_TYPES: Array<{ value: CallType | ''; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'ads_intro', label: 'Ads Intro' },
  { value: 'launch', label: 'Launch' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'team', label: 'Team' },
  { value: 'other', label: 'Other' },
]

export default function CallsPage() {
  const [params, setParams] = useSearchParams()
  const deptId = params.get('dept') || ''
  const [deptName, setDeptName] = useState<string>('')
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<CallType | ''>('')
  const [statusFilter, setStatusFilter] = useState<CallStatus | ''>('')

  useEffect(() => {
    if (!deptId) { setDeptName(''); return }
    supabase.from('departments').select('name').eq('id', deptId).single()
      .then(({ data }) => setDeptName(data?.name || ''))
  }, [deptId])

  const fetchCalls = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('calls')
      .select(`id, call_type, status, recorded_at, duration_seconds, created_at, department_id,
        clients(id, name), departments(id, name),
        call_participants(id, role, is_external, team_members(id, name, email)),
        scorecards(id, overall_score)`)
      .order('recorded_at', { ascending: false })
      .limit(100)
    if (typeFilter) q = q.eq('call_type', typeFilter)
    if (statusFilter) q = q.eq('status', statusFilter)
    if (deptId) q = q.eq('department_id', deptId)
    const { data } = await q
    if (data) setCalls(data as unknown as Call[])
    setLoading(false)
  }, [typeFilter, statusFilter, deptId])

  useEffect(() => { fetchCalls() }, [fetchCalls])

  const filtered = calls.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = c.clients?.name?.toLowerCase() ?? ''
    const reps = (c.call_participants ?? []).map(p => p.team_members?.name?.toLowerCase() ?? '').join(' ')
    return name.includes(q) || reps.includes(q)
  })

  const stats = {
    total: calls.length,
    scored: calls.filter(c => c.status === 'scored').length,
    avg: (() => {
      const ss = calls.map(c => c.scorecards?.[0]?.overall_score).filter(v => typeof v === 'number') as number[]
      if (!ss.length) return null
      return (ss.reduce((a, b) => a + b, 0) / ss.length).toFixed(1)
    })(),
  }

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto fade-up">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {deptName ? `${deptName} — Calls` : 'All Calls'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {deptName ? `Every analyzed call assigned to the ${deptName} team.` : 'Every recorded call, classified and analyzed.'}
          </p>
          {deptName && (
            <button
              onClick={() => { params.delete('dept'); setParams(params) }}
              className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
            >
              <X className="w-3 h-3" /> clear department filter
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <StatTile label="Total" value={stats.total} />
          <StatTile label="Scored" value={stats.scored} accent="emerald" />
          <StatTile label="Avg Score" value={stats.avg ? `${stats.avg}/10` : '—'} accent="blue" />
        </div>
      </div>

      <div className="card p-4 mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search client or rep..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded-md text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as CallType | '')}
          className="bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50"
        >
          {CALL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as CallStatus | '')}
          className="bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="scored">Scored</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {loading ? (
        <div className="card py-20 text-center text-gray-500">Loading calls…</div>
      ) : filtered.length === 0 ? (
        <div className="card py-20 text-center text-gray-500">No calls found</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(222,32%,15%)] bg-[hsl(222,47%,6%)]">
                <th className="text-left px-5 py-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">Score</th>
                <th className="text-left px-5 py-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">Type · Client</th>
                <th className="text-left px-5 py-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">Rep</th>
                <th className="text-left px-5 py-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">Duration</th>
                <th className="text-left px-5 py-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(call => {
                const host = (call.call_participants ?? []).find(p => p.role === 'host' && !p.is_external)
                const score = call.scorecards?.[0]?.overall_score ?? null
                return (
                  <tr key={call.id} className="border-b border-[hsl(222,32%,12%)] last:border-0 hover:bg-white/[0.02] transition group">
                    <td className="px-5 py-4"><ScoreRing score={score} size="sm" /></td>
                    <td className="px-5 py-4">
                      {call.call_type && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border mb-1 ${CALL_TYPE_TINT[call.call_type] || CALL_TYPE_TINT.other}`}>
                          {call.call_type.replace(/_/g, ' ')}
                        </span>
                      )}
                      <div className="text-gray-300 font-medium text-[13px]">{call.clients?.name ?? '—'}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-300">
                      <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-gray-500" />{host?.team_members?.name ?? '—'}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-[13px]">{call.recorded_at ? formatDateTime(call.recorded_at) : '—'}</td>
                    <td className="px-5 py-4 text-gray-500 text-[13px]">
                      <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{call.duration_seconds ? formatDuration(call.duration_seconds) : '—'}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase ${STATUS_TINT[call.status]}`}>{call.status}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link to={`/calls/${call.id}`} className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition text-[13px] font-medium">
                        View <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value, accent }: { label: string; value: any; accent?: 'emerald' | 'blue' }) {
  const c = accent === 'emerald' ? 'text-emerald-400' : accent === 'blue' ? 'text-blue-400' : 'text-white'
  return (
    <div className="card px-4 py-2.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</div>
      <div className={`text-xl font-bold ${c} font-mono`}>{value}</div>
    </div>
  )
}
