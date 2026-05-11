import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate, scoreColor, CALL_TYPE_LABELS } from '@/lib/utils'
import type { TeamMember, CallType } from '@/types'
import ScoreRing from '@/components/ScoreRing'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface TrendRow {
  call_id: string
  recorded_at: string
  overall_score: number
  call_type: CallType
}

export default function TrendsPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [selectedMember, setSelectedMember] = useState<string>('')
  const [trends, setTrends] = useState<TrendRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('team_members')
      .select('id, name, email, role, department_id')
      .order('name')
      .then(({ data }) => {
        if (data) {
          setMembers(data as TeamMember[])
          if (data.length > 0) setSelectedMember(data[0].id)
        }
      })
  }, [])

  useEffect(() => {
    if (!selectedMember) return
    setLoading(true)
    supabase
      .from('call_participants')
      .select(`
        call_id,
        calls(id, recorded_at, call_type, scorecards(overall_score))
      `)
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
          rows.push({
            call_id: call.id,
            recorded_at: call.recorded_at,
            overall_score: score,
            call_type: call.call_type,
          })
        }
        rows.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
        setTrends(rows)
        setLoading(false)
      })
  }, [selectedMember])

  const avg = trends.length > 0
    ? trends.reduce((s, t) => s + t.overall_score, 0) / trends.length
    : null

  const chartData = trends.map(t => ({
    date: formatDate(t.recorded_at),
    score: t.overall_score,
    type: CALL_TYPE_LABELS[t.call_type] ?? t.call_type,
  }))

  const member = members.find(m => m.id === selectedMember)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trends</h1>
        <p className="text-gray-500 text-sm mt-1">Score history per team member</p>
      </div>

      {/* Member picker */}
      <div className="flex gap-2 flex-wrap mb-6">
        {members.map(m => (
          <button
            key={m.id}
            onClick={() => setSelectedMember(m.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              selectedMember === m.id
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
              <ScoreRing score={avg} size="md" />
              <div>
                <p className="text-xs text-gray-500">Average score</p>
                <p className={`text-2xl font-bold ${scoreColor(avg)}`}>
                  {avg !== null ? avg.toFixed(1) : '—'}
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 mb-1">Total calls scored</p>
              <p className="text-2xl font-bold text-gray-900">{trends.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 mb-1">Latest score</p>
              <p className={`text-2xl font-bold ${scoreColor(trends.at(-1)?.overall_score ?? null)}`}>
                {trends.at(-1)?.overall_score?.toFixed(1) ?? '—'}
              </p>
            </div>
          </div>

          {/* Chart */}
          {chartData.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">
                {member?.name} — score over time
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(value: number) => [`${value.toFixed(1)}/10`, 'Score']}
                  />
                  <ReferenceLine y={7} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#1a1a2e"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#1a1a2e' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 mt-2">Green dashed line = target score (7.0)</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              No scored calls yet for {member?.name}.
            </div>
          )}

          {/* Recent calls table */}
          {trends.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trends].reverse().map(t => (
                    <tr key={t.call_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formatDate(t.recorded_at)}</td>
                      <td className="px-4 py-3 text-gray-500">{CALL_TYPE_LABELS[t.call_type]}</td>
                      <td className={`px-4 py-3 font-semibold ${scoreColor(t.overall_score)}`}>
                        {t.overall_score.toFixed(1)}/10
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
