import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import type { ClientStats } from '@/types'
import { Search, ArrowRight, Building2, Activity, TrendingUp } from 'lucide-react'
import ScoreRing from '@/components/ScoreRing'

function scoreHex(s: number | null) {
  if (s === null) return '#64748b'
  if (s >= 8) return '#10b981'
  if (s >= 6) return '#3b82f6'
  if (s >= 4) return '#f59e0b'
  return '#ef4444'
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientStats[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.analytics.clients()
      .then((data: ClientStats[]) => setClients(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = clients.filter(c =>
    !search || c.client_name.toLowerCase().includes(search.toLowerCase())
  )

  const withCalls = clients.filter(c => c.total_calls > 0).length
  const orgAvg = clients.filter(c => c.avg_score !== null).length > 0
    ? clients.filter(c => c.avg_score !== null).reduce((s, c) => s + c.avg_score!, 0) / clients.filter(c => c.avg_score !== null).length
    : null

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto fade-up">

      {/* ── Header ── */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">Accounts</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Clients</h1>
          <p className="text-gray-500 text-sm mt-1">Account overview — call history and performance per client.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 min-w-[320px]">
          <TopTile icon={Building2}  label="Total clients"  value={clients.length} />
          <TopTile icon={Activity}   label="With calls"     value={withCalls} accent="#10b981" />
          <TopTile icon={TrendingUp} label="Org avg"        value={orgAvg ? `${orgAvg.toFixed(1)}` : '—'} accent={scoreHex(orgAvg)} />
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="card p-4 mb-5">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search clients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded-md pl-9 pr-4 py-2 text-[13px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition"
          />
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="card py-20 text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading clients…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-20 text-center">
          <Building2 className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{search ? 'No clients match your search.' : 'No clients found.'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(222,47%,5%)] border-b border-[hsl(222,32%,15%)]">
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Client</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Total Calls</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Scored</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Avg Score</th>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Last Call</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => (
                <tr
                  key={client.client_id}
                  onClick={() => navigate(`/clients/${client.client_id}`)}
                  className="border-t border-[hsl(222,32%,12%)] hover:bg-white/[0.02] transition group cursor-pointer"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <span className="text-[13px] font-medium text-gray-200">{client.client_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[13px] text-gray-300 font-mono">
                    {client.total_calls}
                  </td>
                  <td className="px-5 py-4 text-[13px] text-gray-400 font-mono">
                    {client.scored_calls}
                  </td>
                  <td className="px-5 py-4">
                    {client.avg_score !== null ? (
                      <div className="flex items-center gap-2">
                        <ScoreRing score={client.avg_score} size="sm" />
                        <span className="text-[13px] font-bold font-mono" style={{ color: scoreHex(client.avg_score) }}>
                          {client.avg_score.toFixed(1)}/10
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-600 text-[13px]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-[12px] text-gray-400">
                    {client.last_call_at ? formatDateTime(client.last_call_at) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      to={`/clients/${client.client_id}`}
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[12px] text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition font-medium"
                    >
                      View <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-[hsl(222,32%,13%)] text-[11px] text-gray-600">
            {filtered.length} client{filtered.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </div>
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
