import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatDuration, formatDateTime } from '@/lib/utils'
import type { Client } from '@/types'
import ScoreRing from '@/components/ScoreRing'
import { ChevronLeft, Building2, ArrowRight, Activity, CheckCircle, Clock, TrendingUp } from 'lucide-react'

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

function scoreHex(s: number | null) {
  if (s === null) return '#64748b'
  if (s >= 8) return '#10b981'
  if (s >= 6) return '#3b82f6'
  if (s >= 4) return '#f59e0b'
  return '#ef4444'
}

interface CallRow {
  id: string
  call_type: string | null
  status: string
  recorded_at: string | null
  duration_seconds: number | null
  host_name: string | null
  overall_score: number | null
  summary: string | null
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    api.clients.get(id)
      .then(({ client: c, calls: rows }: any) => {
        if (c) setClient(c as Client)
        if (rows) setCalls(rows as CallRow[])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  const scored = calls.filter(c => c.overall_score != null)
  const avgScore = scored.length
    ? scored.reduce((s, c) => s + c.overall_score!, 0) / scored.length
    : null

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!client) return (
    <div className="min-h-screen p-12 text-gray-500 text-sm">Client not found.</div>
  )

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto fade-up">

      {/* ── Back ── */}
      <Link
        to="/clients"
        className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-300 mb-6 transition"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Clients
      </Link>

      {/* ── Hero card ── */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">{client.name}</h1>
            {client.leadhub_id && (
              <p className="text-gray-500 text-sm mt-0.5">LeadHub ID: <span className="text-gray-400 font-mono">{client.leadhub_id}</span></p>
            )}
          </div>
          <ScoreRing score={avgScore} size="xl" showLabel />
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile icon={Activity}     label="Total Calls"  value={calls.length}    borderColor="border-l-blue-500" />
        <StatTile icon={CheckCircle}  label="Scored"       value={scored.length}   borderColor="border-l-emerald-500" accent="text-emerald-400" />
        <StatTile
          icon={TrendingUp}
          label="Avg Score"
          value={avgScore !== null ? `${avgScore.toFixed(1)}/10` : '—'}
          borderColor="border-l-amber-500"
          accent="text-amber-400"
        />
        <StatTile
          icon={Clock}
          label="Last Call"
          value={calls[0]?.recorded_at ? formatDateTime(calls[0].recorded_at) : '—'}
          borderColor="border-l-violet-500"
          accent="text-violet-400"
        />
      </div>

      {/* ── Calls table ── */}
      {calls.length === 0 ? (
        <div className="card py-20 text-center">
          <Activity className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No calls found for this client.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[hsl(222,32%,15%)] flex items-center justify-between">
            <h3 className="font-semibold text-white text-[15px]">All Calls</h3>
            <span className="text-xs text-gray-500">{calls.length} call{calls.length !== 1 ? 's' : ''}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(222,47%,6%)] border-b border-[hsl(222,32%,15%)]">
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Date</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Type</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rep</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Score</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Duration</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Summary</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {calls.map(c => (
                <tr key={c.id} className="border-t border-[hsl(222,32%,12%)] hover:bg-white/[0.02] transition group">
                  <td className="px-5 py-3.5 text-[12px] text-gray-400 whitespace-nowrap">
                    {c.recorded_at ? formatDateTime(c.recorded_at) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    {c.call_type ? (
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${CALL_TYPE_TINT[c.call_type] ?? CALL_TYPE_TINT.other}`}>
                        {c.call_type.replace(/_/g, ' ')}
                      </span>
                    ) : <span className="text-gray-600 text-[12px]">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-gray-300 max-w-[120px] truncate">
                    {c.host_name ?? <span className="text-gray-600">—</span>}
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
                  <td className="px-5 py-3.5 text-[12px] text-gray-400 font-mono">
                    {c.duration_seconds ? formatDuration(c.duration_seconds) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_TINT[c.status] ?? STATUS_TINT.pending}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-gray-500 max-w-[200px] truncate">
                    {c.summary ? c.summary.split('.')[0].slice(0, 60) : <span className="italic">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/calls/${c.id}`}
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
    </div>
  )
}

function StatTile({ icon: Icon, label, value, accent = 'text-white', borderColor = 'border-l-gray-600' }: {
  icon: any; label: string; value: string | number; accent?: string; borderColor?: string
}) {
  return (
    <div className={`card p-4 border-l-2 ${borderColor}`}>
      <div className="flex items-center gap-1.5 text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-xl font-bold truncate ${accent}`}>{value}</div>
    </div>
  )
}
