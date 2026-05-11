import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  formatDuration, formatDateTime,
  CALL_TYPE_LABELS, CALL_TYPE_COLORS,
  SEVERITY_COLORS, scoreBg,
} from '@/lib/utils'
import type { Call, Scorecard, RuleFinding } from '@/types'
import { Badge } from '@/components/Badge'
import ScoreRing from '@/components/ScoreRing'
import { ChevronLeft, Quote, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react'

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [call, setCall] = useState<Call | null>(null)
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [findings, setFindings] = useState<RuleFinding[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'scorecard' | 'transcript' | 'findings'>('scorecard')

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase
        .from('calls')
        .select(`
          *,
          clients(id, name),
          departments(id, name),
          call_participants(
            id, role, is_external, name, email,
            team_members(id, name, email)
          )
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('scorecards')
        .select('*, scorecard_evidence(*)')
        .eq('call_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('rule_findings')
        .select('*')
        .eq('call_id', id),
    ]).then(([callRes, scRes, findRes]) => {
      if (callRes.data) setCall(callRes.data as unknown as Call)
      if (scRes.data) setScorecard(scRes.data as unknown as Scorecard)
      if (findRes.data) {
        const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
        setFindings((findRes.data as RuleFinding[]).sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)))
      }
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (!call) return <div className="p-8 text-gray-400">Call not found.</div>

  const host = (call.call_participants ?? []).find(p => p.role === 'host' && !p.is_external)
  const criticalFindings = findings.filter(f => f.severity === 'critical')
  const warningFindings = findings.filter(f => f.severity !== 'critical')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link to="/calls" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ChevronLeft className="w-4 h-4" /> Back to calls
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {call.call_type && (
                <Badge className={CALL_TYPE_COLORS[call.call_type]}>
                  {CALL_TYPE_LABELS[call.call_type]}
                </Badge>
              )}
              {call.clients?.name && (
                <span className="text-gray-700 font-medium">{call.clients.name}</span>
              )}
            </div>
            <p className="text-gray-500 text-sm">
              {call.recorded_at ? formatDateTime(call.recorded_at) : '—'}
              {call.duration_seconds ? ` · ${formatDuration(call.duration_seconds)}` : ''}
              {host?.team_members?.name ? ` · ${host.team_members.name}` : ''}
            </p>
            {findings.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                {criticalFindings.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    {criticalFindings.length} critical
                  </span>
                )}
                {warningFindings.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    <AlertTriangle className="w-3 h-3" />
                    {warningFindings.length} warnings
                  </span>
                )}
              </div>
            )}
          </div>
          <ScoreRing score={scorecard?.overall_score ?? null} size="lg" />
        </div>

        {scorecard?.summary && (
          <p className="mt-4 text-gray-700 text-sm leading-relaxed border-t border-gray-100 pt-4">
            {scorecard.summary}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(['scorecard', 'findings', 'transcript'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}{tab === 'findings' && findings.length > 0 ? ` (${findings.length})` : ''}
          </button>
        ))}
      </div>

      {/* Scorecard tab */}
      {activeTab === 'scorecard' && scorecard && (
        <div className="space-y-4">
          {/* Strengths */}
          {(scorecard.strengths ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-green-600" /> Strengths
              </h3>
              <div className="space-y-4">
                {(scorecard.strengths ?? []).map((s, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 capitalize">
                        {s.criterion.replace(/_/g, ' ')}
                      </span>
                      <Badge className={scoreBg(s.score)}>{s.score}/10</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{s.description}</p>
                    {s.evidence_quote && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-start gap-2">
                        <Quote className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-600 italic">"{s.evidence_quote}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Improvements */}
          {(scorecard.improvements ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-amber-500" /> Areas to Improve
              </h3>
              <div className="space-y-4">
                {(scorecard.improvements ?? []).map((imp, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 capitalize">
                        {imp.criterion.replace(/_/g, ' ')}
                      </span>
                      <Badge className={scoreBg(imp.score)}>{imp.score}/10</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{imp.description}</p>
                    {imp.evidence_quote && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                        <Quote className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-800 italic">"{imp.evidence_quote}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rule findings tab */}
      {activeTab === 'findings' && (
        <div className="space-y-3">
          {findings.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              No rule findings for this call.
            </div>
          ) : (
            findings.map(f => (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="text-sm font-semibold text-gray-800 capitalize">
                    {f.rule_key.replace(/_/g, ' ')}
                  </span>
                  <Badge className={SEVERITY_COLORS[f.severity]}>{f.severity}</Badge>
                </div>
                {f.value?.suggestion && (
                  <p className="text-sm text-gray-600 leading-relaxed">{f.value.suggestion}</p>
                )}
                {(f.context_snippets ?? []).length > 0 && (
                  <div className="mt-3 space-y-1">
                    {(f.context_snippets ?? []).map((s, i) => (
                      <div key={i} className="bg-gray-50 rounded-md px-3 py-1.5 flex items-start gap-2">
                        <Quote className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-600 italic">"{s.text}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Transcript tab */}
      {activeTab === 'transcript' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {call.transcript_segments && call.transcript_segments.length > 0 ? (
            <div className="space-y-3">
              {call.transcript_segments.map((seg, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-xs font-medium text-gray-400 w-16 shrink-0 pt-0.5">
                    {Math.floor(seg.start_time / 60)}:{String(Math.floor(seg.start_time % 60)).padStart(2, '0')}
                  </span>
                  <div>
                    <span className="text-xs font-semibold text-brand uppercase tracking-wide mr-2">
                      {seg.speaker}
                    </span>
                    <span className="text-sm text-gray-700">{seg.text}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : call.transcript_raw ? (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {call.transcript_raw}
            </pre>
          ) : (
            <p className="text-gray-400 text-sm">No transcript available.</p>
          )}
        </div>
      )}
    </div>
  )
}
