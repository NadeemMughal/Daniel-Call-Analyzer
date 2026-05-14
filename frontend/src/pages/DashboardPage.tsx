import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'
import {
  Activity, Users, ListChecks, TrendingUp, AlertTriangle,
  ArrowRight, Clock, Briefcase, Target, Zap, BarChart2
} from 'lucide-react'
import ScoreRing from '@/components/ScoreRing'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const CALL_TYPE_TINT: Record<string, string> = {
  discovery: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  ads_intro: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  launch: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  follow_up: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  team: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  other: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
}

const CALL_TYPE_BORDER: Record<string, string> = {
  discovery: 'border-l-purple-500',
  ads_intro: 'border-l-blue-500',
  launch: 'border-l-emerald-500',
  follow_up: 'border-l-amber-500',
  team: 'border-l-slate-400',
  other: 'border-l-gray-500',
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
  byCallType: Array<{ call_type: string; count: number; avg: number | null }>
  topFindings: Array<{ rule_key: string; count: number; pct: number }>
  scoreTiers: { excellent: number; good: number; needsWork: number; poor: number }
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

const TIER_COLORS = {
  excellent: '#10b981',
  good: '#3b82f6',
  needsWork: '#f59e0b',
  poor: '#ef4444',
}

function callTypeStatusBadge(avg: number | null) {
  if (avg === null) return { label: 'No data', cls: 'bg-gray-500/10 text-gray-400 border-gray-500/30' }
  if (avg >= 8) return { label: 'Strong', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
  if (avg >= 7) return { label: 'Good', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' }
  if (avg >= 5) return { label: 'Developing', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' }
  return { label: 'Needs Focus', cls: 'bg-red-500/10 text-red-400 border-red-500/30' }
}

function formatRuleKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [
        callsRes, scoresRes, weekRes, deptRes, actionRes,
        recentRes, failRes, phaseRes, callTypeRes, findingsRes
      ] = await Promise.all([
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
        supabase.from('calls').select('call_type, scorecards(overall_score)'),
        supabase.from('rule_findings').select('rule_key'),
      ])

      const allScores = (scoresRes.data || []).map(d => d.overall_score as number).filter(Boolean)
      const avg = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null

      // Score tiers
      const scoreTiers = {
        excellent: allScores.filter(s => s >= 8.5).length,
        good: allScores.filter(s => s >= 7 && s < 8.5).length,
        needsWork: allScores.filter(s => s >= 5 && s < 7).length,
        poor: allScores.filter(s => s < 5).length,
      }

      // By call type
      const ctMap: Record<string, { count: number; scores: number[] }> = {}
      for (const row of (callTypeRes.data || []) as any[]) {
        const ct = row.call_type || 'other'
        if (!ctMap[ct]) ctMap[ct] = { count: 0, scores: [] }
        ctMap[ct].count++
        const s = row.scorecards?.[0]?.overall_score
        if (typeof s === 'number') ctMap[ct].scores.push(s)
      }
      const byCallType = Object.entries(ctMap)
        .map(([call_type, { count, scores }]) => ({
          call_type,
          count,
          avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        }))
        .sort((a, b) => b.count - a.count)

      // Top findings
      const fkMap: Record<string, number> = {}
      for (const row of (findingsRes.data || []) as any[]) {
        const k = row.rule_key || 'unknown'
        fkMap[k] = (fkMap[k] || 0) + 1
      }
      const totalFindings = Object.values(fkMap).reduce((a, b) => a + b, 0)
      const topFindings = Object.entries(fkMap)
        .map(([rule_key, count]) => ({
          rule_key,
          count,
          pct: totalFindings > 0 ? Math.round((count / totalFindings) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)

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
        byCallType,
        topFindings,
        scoreTiers,
      })
      setLoading(false)
    }
    load().catch(err => { console.error(err); setLoading(false) })
  }, [])

  if (loading) return <div className="min-h-screen p-12 text-gray-500 text-sm">Loading dashboard…</div>
  if (!data) return <div className="min-h-screen p-12 text-gray-500 text-sm">No data.</div>

  // Donut chart data
  const tierData = [
    { name: 'Excellent', value: data.scoreTiers.excellent, color: TIER_COLORS.excellent },
    { name: 'Good', value: data.scoreTiers.good, color: TIER_COLORS.good },
    { name: 'Needs Work', value: data.scoreTiers.needsWork, color: TIER_COLORS.needsWork },
    { name: 'Poor', value: data.scoreTiers.poor, color: TIER_COLORS.poor },
  ].filter(t => t.value > 0)

  // Strategic insights (computed from loaded data)
  const bestType = data.byCallType.filter(t => t.avg !== null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))[0]
  const topFinding = data.topFindings[0]
  const topDept = data.byDept[0]
  const insights = [
    bestType ? {
      icon: Target,
      color: 'text-emerald-400',
      title: `${bestType.call_type.replace(/_/g, ' ')} calls score highest`,
      desc: `Average score of ${bestType.avg!.toFixed(1)}/10 across ${bestType.count} calls — your strongest call type.`,
    } : null,
    topFinding ? {
      icon: AlertTriangle,
      color: 'text-amber-400',
      title: `Most common issue: ${formatRuleKey(topFinding.rule_key)}`,
      desc: `Flagged in ${topFinding.count} calls (${topFinding.pct}% of all findings). Prioritise coaching on this area.`,
    } : null,
    topDept ? {
      icon: Zap,
      color: 'text-blue-400',
      title: `${topDept.name} is most active`,
      desc: `${topDept.count} calls recorded${topDept.avg !== null ? ` with an avg score of ${topDept.avg.toFixed(1)}/10` : ''}.`,
    } : null,
  ].filter(Boolean) as Array<{ icon: any; color: string; title: string; desc: string }>

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
        <KPI icon={Activity} label="Total calls" value={data.totalCalls} borderColor="border-l-blue-500" />
        <KPI icon={ListChecks} label="Calls scored" value={data.scoredCalls} accent="text-emerald-400" borderColor="border-l-emerald-500" />
        <KPI icon={Clock} label="Last 7 days" value={data.weekCalls} accent="text-violet-400" borderColor="border-l-violet-500" />
        <KPI
          icon={AlertTriangle}
          label="Failures 24h"
          value={data.failures24h}
          accent={data.failures24h ? 'text-red-400' : 'text-gray-400'}
          borderColor={data.failures24h ? 'border-l-red-500' : 'border-l-gray-600'}
        />
      </div>

      {/* Avg score + Score tier donut */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="card p-5 flex items-center gap-4">
          <ScoreRing score={data.avgScore} size="lg" showLabel />
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Org avg score</p>
            <p className="text-2xl font-bold text-white mt-1">{data.avgScore !== null ? `${data.avgScore.toFixed(1)} / 10` : '—'}</p>
            <p className="text-xs text-gray-500 mt-1">{data.scoredCalls} calls scored to date</p>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Score distribution
          </h2>
          {tierData.length === 0 ? (
            <p className="text-gray-600 text-xs italic pt-4">No scored calls yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={tierData}
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={68}
                  dataKey="value"
                  stroke="none"
                  paddingAngle={2}
                >
                  {tierData.map((t, i) => <Cell key={i} fill={t.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  formatter={(val: any, name: any) => [`${val} calls`, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: '#888' }}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Department activity */}
      <div className="card p-5 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
          <Briefcase className="w-3.5 h-3.5" /> Department activity
        </h2>
        {data.byDept.length === 0 ? (
          <p className="text-gray-600 text-xs italic">No calls assigned to departments yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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

      {/* Call type performance */}
      {data.byCallType.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Call type performance
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data.byCallType.map(ct => {
              const badge = callTypeStatusBadge(ct.avg)
              const borderCls = CALL_TYPE_BORDER[ct.call_type] || 'border-l-gray-500'
              return (
                <div
                  key={ct.call_type}
                  className={`bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,15%)] border-l-2 ${borderCls} rounded-md px-4 py-3`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-semibold text-white capitalize">
                      {ct.call_type.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <div>
                      <span className="text-gray-600">Calls </span>
                      <span className="text-gray-300 font-semibold">{ct.count}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Avg </span>
                      <span
                        className="font-bold"
                        style={{ color: ct.avg === null ? '#6b7280' : ct.avg >= 7 ? '#10b981' : ct.avg >= 5 ? '#f59e0b' : '#ef4444' }}
                      >
                        {ct.avg !== null ? `${ct.avg.toFixed(1)}/10` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top issues + Strategic insights */}
      {(data.topFindings.length > 0 || insights.length > 0) && (
        <div className="grid md:grid-cols-5 gap-4 mb-6">
          {/* Top Issues — 3 cols */}
          {data.topFindings.length > 0 && (
            <div className="card p-5 md:col-span-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Top flagged issues
              </h2>
              <div className="space-y-3">
                {data.topFindings.map((f, i) => (
                  <div key={f.rule_key}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[12px] text-gray-300">{formatRuleKey(f.rule_key)}</span>
                      <span className="text-[11px] text-gray-500">{f.count} ({f.pct}%)</span>
                    </div>
                    <div className="bg-[hsl(222,47%,5%)] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(f.pct * 3, 100)}%`,
                          background: i < 3 ? '#3b82f6' : i < 6 ? '#f59e0b' : '#6b7280',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strategic Insights — 2 cols */}
          {insights.length > 0 && (
            <div className="card p-5 md:col-span-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Strategic insights
              </h2>
              <div className="space-y-0">
                {insights.map((ins, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 py-3 ${i < insights.length - 1 ? 'border-b border-[hsl(222,32%,13%)]' : ''}`}
                  >
                    <ins.icon className={`w-4 h-4 mt-0.5 shrink-0 ${ins.color}`} />
                    <div>
                      <p className="text-[12px] font-semibold text-white leading-snug">{ins.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{ins.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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

function KPI({ icon: Icon, label, value, accent = 'text-white', borderColor = 'border-l-gray-600' }: any) {
  return (
    <div className={`card p-4 border-l-2 ${borderColor}`}>
      <div className="flex items-center gap-1.5 text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  )
}
