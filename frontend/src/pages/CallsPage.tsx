import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  formatDuration, formatDateTime,
  CALL_TYPE_LABELS, CALL_TYPE_COLORS,
  scoreBg,
} from '@/lib/utils'
import type { Call, CallType, CallStatus } from '@/types'
import { Badge } from '@/components/Badge'
import { Search, Filter, Clock, User } from 'lucide-react'

const STATUS_COLORS: Record<CallStatus, string> = {
  pending:    'bg-gray-100 text-gray-500 border-gray-200',
  processing: 'bg-blue-100 text-blue-600 border-blue-200',
  scored:     'bg-green-100 text-green-700 border-green-200',
  failed:     'bg-red-100 text-red-600 border-red-200',
}

const CALL_TYPES: Array<{ value: CallType | ''; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'discovery',  label: 'Discovery'  },
  { value: 'ads_intro',  label: 'Ads Intro'  },
  { value: 'launch',     label: 'Launch'     },
  { value: 'follow_up',  label: 'Follow Up'  },
  { value: 'team',       label: 'Team'       },
  { value: 'other',      label: 'Other'      },
]

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<CallType | ''>('')
  const [statusFilter, setStatusFilter] = useState<CallStatus | ''>('')

  const fetchCalls = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('calls')
      .select(`
        id, call_type, status, recorded_at, duration_seconds, created_at,
        clients(id, name),
        departments(id, name),
        call_participants(
          id, role, is_external,
          team_members(id, name, email)
        ),
        scorecards(id, overall_score)
      `)
      .order('recorded_at', { ascending: false })
      .limit(100)

    if (typeFilter) query = query.eq('call_type', typeFilter)
    if (statusFilter) query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (!error && data) setCalls(data as unknown as Call[])
    setLoading(false)
  }, [typeFilter, statusFilter])

  useEffect(() => { fetchCalls() }, [fetchCalls])

  const filtered = calls.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    const clientName = c.clients?.name?.toLowerCase() ?? ''
    const participants = (c.call_participants ?? [])
      .map(p => p.team_members?.name?.toLowerCase() ?? '')
      .join(' ')
    return clientName.includes(q) || participants.includes(q)
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calls</h1>
        <p className="text-gray-500 text-sm mt-1">{calls.length} total calls</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search client or rep..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as CallType | '')}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {CALL_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as CallStatus | '')}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="scored">Scored</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading calls…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No calls found</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Client</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Rep</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Duration</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Score</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(call => {
                const host = (call.call_participants ?? []).find(p => p.role === 'host' && !p.is_external)
                const score = call.scorecards?.[0]?.overall_score ?? null
                return (
                  <tr key={call.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600">
                      <Link to={`/calls/${call.id}`} className="hover:text-brand font-medium">
                        {call.recorded_at ? formatDateTime(call.recorded_at) : '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {call.call_type ? (
                        <Badge className={CALL_TYPE_COLORS[call.call_type]}>
                          {CALL_TYPE_LABELS[call.call_type]}
                        </Badge>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {call.clients?.name ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        {host?.team_members?.name ?? <span className="text-gray-300">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {call.duration_seconds ? formatDuration(call.duration_seconds) : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {score !== null ? (
                        <Badge className={scoreBg(score)}>
                          {score.toFixed(1)}/10
                        </Badge>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_COLORS[call.status]}>
                        {call.status}
                      </Badge>
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
