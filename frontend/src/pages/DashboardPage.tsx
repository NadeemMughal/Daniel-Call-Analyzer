import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'
import {
  Activity, Users, ListChecks, TrendingUp, AlertTriangle,
  ArrowRight, Clock, Briefcase
} from 'lucide-react'
import ScoreRing from '@/components/ScoreRing'

const CALL_TYPE_TINT: Record<string, string> = {
  discovery: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  ads_intro: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  launch: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  follow_up: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  team: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  other: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
}

interface DashboardData {
  totalCalls: number
  scoredCalls: number
  weekCalls: number
  avgScore: number | null
  byDept: Array<{ name: string; count: number; avg: number | null }>
  byPhase: Array<{ phase: string; count: number }>
  topActions: Array<{ task: string; call_id: string; call_type: string | null }>
  recentCalls: Array<{
    id: string; call_type: string | null; status: string;
    recorded_at: string | null; score: number | null;
    department_name: string | null; summary_first_line: string;
  }>
  failures24h: number
}

const PHASE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  onboarding: 'Onboarding',
  kick_off: 'Kick-off',
  ai_onboarding: 'AI Onboarding',
  strategy_review: 'Strategy Review',
  status_update: 'Status Update',
  sales_pitch: 'Sales Pitch',
  demo: 'Demo',
  training: 'Training',
  internal_sync: 'Internal Sync',
  one_on_one: '1-on-1',
  project_review: 'Project Review',
  quarterly_review: 'Quarterly Review',
  closing_call: 'Closing Call',
  renewal: 'Renewal',
  escalation: 'Escalation',
  feedback_session: 'Feedback',
  content_review: 'Content Review',
  other: 'Other',
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [callsRes, scoresRes, weekRes, deptRes, actionRes, recentRes, failRes, phaseRes] = await Promise.all([
        supabase.from('calls').select('id', { count: 'exact', head: true }),
        supabase.from('scorecards').select('overall_score').not('overall_score', 'is', null),
        supabase.from('calls').select('id', { count: 'exact', head: true }).gte('recorded_at', sevenDaysAgo),
        supabase.from('departments').select('id, name, calls(id, scorecards(overall_score))'),
        supabase
          .from('scorecard_evidence')
          .select('quote, scorecards(call_id, calls(call_type))')
          .eq('criterion_key', 'action_item')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('calls')
          .select('id, call_type, status, recorded_at, departments(name), scorecards(overall_score, summary)')
          .order('recorded_at', { ascending: false, nullsFirst: false })
          .limit(5),
        supabase.from('failed_executions').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
        supabase
          .from('scorecard_evidence')
          .select('quote')
          .eq('criterion_key', 'meeting_phase'),
      ])

      const allScores = (scoresRes.data || []).map(d => d.overall_score as number).filter(Boolean)
      const avg = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null

      const byDept = (deptRes.data || []).map((d: any) => {
        const calls = d.calls || []
        const scs = calls
          .map((c: any) => c.scorecards?.[0]?.overall_score)
          .filter((s: any) => typeof s === 'number') as number[]
        return {
          name: d.name as string,
          count: calls.length,
          avg: scs.length ? scs.reduce((a, b) => a + b, 0) / scs.length : null,
        }
      }).filter(d => d.count > 0).sort((a, b) => b.count - a.count)

      const topActions = (actionRes.data || []).map((r: any) => ({
        task: String(r.quote || '').split(' - Owner:')[0].split(' [')[0],
        call_id: r.scorecards?.call_id || '',
        call_type: r.scorecards?.calls?.call_type ?? null,
      })).filter(a => a.call_id)

      const recentCalls = (recentRes.data || []).map((c: any) => ({
        id: c.id,
        call_type: c.call_type,
        status: c.status,
        recorded_at: c.recorded_at,
        score: c.scorecards?.[0]?.overall_score ?? null,
        department_name: c.departments?.name ?? null,
        summary_first_line: (c.scorecards?.[0]?.summary || '').split('.')[0].slice(0, 80),
      }))

      // Phase distribution
      const phaseCounts: Record<string, number> = {}
      for (const row of (phaseRes.data || []) as any[]) {
        const p = String(row.quote || '').trim().toLowerCase()
        if (!p) continue
        phaseCounts[p] = (phaseCounts[p] || 0) + 1
      }
      const byPhase = Object.entries(phaseCounts)
        .map(([phase, count]) => ({ phase, count }))
        .sort((a, b) => b.count - a.count)

      setData({
        totalCalls: callsRes.count || 0,
        scoredCalls: allScores.length,
        weekCalls: weekRes.count || 0,
        avgScore: avg,
        byDept,
        byPhase,
        topActions,
        recentCalls,
        failures24h: failRes.count || 0,
      })
      setLoading(false)
    }
    load().catch(err => { console.error(err); setLoading(false) })
  }, [])

  if (loading) return <div className="min-h-screen p-12 text-gray-500 text-sm">Loading dashboard…</div>
  if (!data) return <div className="min-h-screen p-12 text-gray-500 text-sm">No data.</div>

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto fade-up">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
          <span className="text-xs text-emerald-400 font-medium uppercase tracking-wider">Live</span>
        </div>
        <h1 className="text-3xl font-bold text-white">Command Center</h1>
        <p className="text-gray-500 text-sm mt-1">Pipeline health, recent activity, and what needs attention.</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPI icon={Activity} label="Total calls" value={data.totalCalls} />
        <KPI icon={ListChecks} label="Calls scored" value={data.scoredCalls} accent="text-emerald-400" />
        <KPI icon={Clock} label="Last 7 days" value={data.weekCalls} accent="text-blue-400" />
        <KPI
          icon={AlertTriangle}
          label="Failures 24h"
          value={data.failures24h}
          accent={data.failures24h ? 'text-red-400' : 'text-gray-400'}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* Avg score */}
        <div className="card p-5 flex items-center gap-4">
          <ScoreRing score={data.avgScore} size="lg" showLabel />
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Org avg score</p>
            <p className="text-2xl font-bold text-white mt-1">{data.avgScore !== null ? `${data.avgScore.toFixed(1)} / 10` : '—'}</p>
            <p className="text-xs text-gray-500 mt-1">{data.scoredCalls} sales calls scored to date</p>
          </div>
        </div>

        {/* Departments */}
        <div className="card p-5 md:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" /> Department activity
          </h2>
          {data.byDept.length === 0 ? (
            <p className="text-gray-600 text-xs italic">No calls assigned to departments yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {data.byDept.slice(0, 6).map(d => (
                <div key={d.name} className="bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,15%)] rounded-md px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-gray-200">{d.name}</span>
                    <span className="font-mono text-sm font-bold text-white">{d.count}</span>
                  </div>
                  {d.avg !== null && (
                    <p className="text-[10px] text-gray-500 mt-0.5">avg {d.avg.toFixed(1)} / 10</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Meeting phase distribution */}
      {data.byPhase.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Meeting phases — what your team spends time on
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {data.byPhase.map(p => (
              <Link
                key={p.phase}
                to={`/calls`}
                className="bg-[hsl(222,47%,5%)] border border-violet-500/30 rounded-md px-3 py-2.5 hover:border-violet-500/60 transition group"
              >
                <p className="text-[10px] uppercase tracking-wider text-violet-300 font-semibold truncate">
                  {PHASE_LABELS[p.phase] || p.phase}
                </p>
                <p className="text-2xl font-bold text-white mt-1 font-mono group-hover:text-violet-200 transition">{p.count}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Top open actions */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5" /> Recent action items across all calls
          </h2>
          <Link to="/calls" className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
            All calls <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {data.topActions.length === 0 ? (
          <p className="text-gray-600 text-xs italic py-4">No action items recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.topActions.map((a, i) => (
              <li key={i}>
                <Link to={`/calls/${a.call_id}`} className="flex items-start gap-2.5 px-3 py-2 hover:bg-white/[0.02] rounded-md transition group">
                  <span className="text-amber-400/70 mt-0.5">▸</span>
                  <span className="text-[13px] text-gray-300 flex-1 leading-snug group-hover:text-white">{a.task}</span>
                  {a.call_type && (
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${CALL_TYPE_TINT[a.call_type] || CALL_TYPE_TINT.other}`}>
                      {a.call_type.replace(/_/g, ' ')}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent calls */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(222,32%,15%)] flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Most recent calls
          </h2>
          <Link to="/calls" className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div>
          {data.recentCalls.length === 0 ? (
            <p className="text-gray-600 text-xs italic px-5 py-6">No calls yet.</p>
          ) : data.recentCalls.map(c => (
            <Link key={c.id} to={`/calls/${c.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 border-b border-[hsl(222,32%,12%)] last:border-0 hover:bg-white/[0.02] transition group">
              <ScoreRing score={c.score} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {c.call_type && (
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${CALL_TYPE_TINT[c.call_type] || CALL_TYPE_TINT.other}`}>
                      {c.call_type.replace(/_/g, ' ')}
                    </span>
                  )}
                  {c.department_name && (
                    <span className="text-[10px] text-gray-500 font-medium">{c.department_name}</span>
                  )}
                  <span className="text-[10px] text-gray-600">·</span>
                  <span className="text-[10px] text-gray-500">{c.recorded_at ? formatDateTime(c.recorded_at) : '—'}</span>
                </div>
                <p className="text-[13px] text-gray-300 group-hover:text-white truncate">{c.summary_first_line || '(no summary)'}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function KPI({ icon: Icon, label, value, accent = 'text-white' }: any) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  )
}
