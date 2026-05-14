import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatDuration, formatDateTime } from '@/lib/utils'
import type { Call, Scorecard, RuleFinding } from '@/types'
import ScoreRing from '@/components/ScoreRing'
import {
  ChevronLeft, Quote, AlertTriangle, CheckCircle2, TrendingUp,
  Clock, Users, Target, AlertCircle, ListChecks, GitBranch,
  HelpCircle, ArrowRight, Lightbulb, ShieldAlert, MessageSquare,
  Box, UserCircle, Ban, Mic, Star, Zap, BarChart2
} from 'lucide-react'

const CALL_TYPE_TINT: Record<string, string> = {
  discovery: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  ads_intro: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  launch: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  follow_up: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  team: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  other: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

const DEPT_TINT: Record<string, string> = {
  Executive: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Sales: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  SEO: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  Operations: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  Finance: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  'Content & Marketing': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
}

// Human-readable label for meeting_phase
const PHASE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  onboarding: 'Onboarding',
  kick_off: 'Kick-off',
  ai_onboarding: 'AI Onboarding',
  strategy_review: 'Strategy Review',
  status_update: 'Status Update',
  sales_pitch: 'Sales Pitch',
  demo: 'Product Demo',
  training: 'Training',
  internal_sync: 'Internal Sync',
  one_on_one: '1-on-1',
  project_review: 'Project Review',
  quarterly_review: 'Quarterly Review',
  closing_call: 'Closing Call',
  renewal: 'Renewal',
  escalation: 'Escalation',
  feedback_session: 'Feedback Session',
  content_review: 'Content Review',
  other: 'Meeting',
}

// Extract a short meeting title from the scorecard summary (LLM puts it before the first period)
function extractTitle(summary?: string | null): { title: string | null; rest: string } {
  if (!summary) return { title: null, rest: '' }
  const idx = summary.indexOf('.')
  if (idx > 0 && idx < 80) {
    return { title: summary.substring(0, idx).trim(), rest: summary.substring(idx + 1).trim() }
  }
  return { title: null, rest: summary }
}

const SEV_TINT: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  critical: { bg: 'bg-red-500/10', fg: 'text-red-400', border: 'border-red-500/40', label: 'CRITICAL' },
  warning:  { bg: 'bg-amber-500/10', fg: 'text-amber-400', border: 'border-amber-500/40', label: 'WARNING' },
  info:     { bg: 'bg-blue-500/10', fg: 'text-blue-400', border: 'border-blue-500/40', label: 'INFO' },
}

function humanize(key?: string | null) {
  if (!key) return ''
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function scoreBarColor(s: number | null | undefined) {
  if (s === null || s === undefined) return 'bg-slate-500'
  if (s >= 8) return 'bg-emerald-500'
  if (s >= 6) return 'bg-blue-500'
  if (s >= 4) return 'bg-amber-500'
  return 'bg-red-500'
}

type Tab = 'intelligence' | 'scorecard' | 'findings' | 'transcript'

interface ScorecardWithEvidence extends Scorecard {
  scorecard_evidence?: Array<{ id: string; criterion_key: string; quote: string; timestamp_seconds: number | null }>
}

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [call, setCall] = useState<Call | null>(null)
  const [scorecard, setScorecard] = useState<ScorecardWithEvidence | null>(null)
  const [findings, setFindings] = useState<RuleFinding[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('intelligence')

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('calls').select(`*, clients(id, name), departments(id, name), call_participants(id, role, is_external, name, email, team_members(id, name, email))`).eq('id', id).single(),
      supabase.from('scorecards').select('*, scorecard_evidence(*)').eq('call_id', id).order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('rule_findings').select('*').eq('call_id', id),
    ]).then(([cr, sr, fr]) => {
      if (cr.data) setCall(cr.data as unknown as Call)
      if (sr.data) setScorecard(sr.data as unknown as ScorecardWithEvidence)
      if (fr.data) {
        const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
        setFindings((fr.data as RuleFinding[]).sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)))
      }
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="p-12 text-gray-500 text-sm">Loading scorecard…</div>
  if (!call) return <div className="p-12 text-gray-500 text-sm">Call not found.</div>

  const host = (call.call_participants ?? []).find(p => p.role === 'host' && !p.is_external)
  const strengths = (scorecard?.strengths ?? []) as any[]
  const improvements = (scorecard?.improvements ?? []) as any[]
  const evidence = scorecard?.scorecard_evidence ?? []
  const group = (k: string) => evidence.filter(e => e.criterion_key === k).map(e => e.quote)
  const keyPoints = group('key_point')
  const actionItems = group('action_item')
  const decisions = group('decision')
  const openQuestions = group('open_question')
  const nextSteps = group('next_step')
  const risks = group('risk')
  const suggestions = group('suggestion')
  const projects = group('project')
  const attendees = group('attendee')
  const bannedPhrases = group('banned_phrase')
  const meetingPhase = (group('meeting_phase')[0] || '').trim().toLowerCase()
  const phaseLabel = meetingPhase ? (PHASE_LABELS[meetingPhase] || meetingPhase.replace(/_/g, ' ')) : null

  // New enriched evidence
  const talkTimeRaw = group('talk_time_breakdown')[0]
  const talkTimeBreakdown: Array<{ speaker: string; seconds: number; percentage: number }> = talkTimeRaw ? (() => { try { return JSON.parse(talkTimeRaw) } catch { return [] } })() : []

  const coachingPriorities: Array<{ priority: number; area: string; what_happened: string; what_to_do_instead: string; impact: string }> = [1, 2, 3]
    .map(n => group('coaching_priority_' + n)[0])
    .filter(Boolean)
    .map(q => { try { return JSON.parse(q) } catch { return null } })
    .filter(Boolean)

  const meetingEffectivenessRaw = group('meeting_effectiveness')[0]
  const meetingEffectiveness: { score: number; agenda_clarity: string; decisions_ratio: string; action_coverage: string; focus_score: number; summary: string } | null = meetingEffectivenessRaw ? (() => { try { return JSON.parse(meetingEffectivenessRaw) } catch { return null } })() : null

  const isSalesCall = ['discovery', 'ads_intro', 'launch', 'follow_up'].includes(call.call_type || '')
  const isTeamCall = call.call_type === 'team'

  const criticalCount = findings.filter(f => f.severity === 'critical').length
  const warningCount = findings.filter(f => f.severity === 'warning').length

  const { title: meetingTitle, rest: summaryRest } = extractTitle(scorecard?.summary)
  const deptName = (call as any).departments?.name as string | undefined
  const heroTitle = meetingTitle || call.clients?.name || host?.team_members?.name || 'Untitled call'

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto fade-up">
      <Link to="/calls" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 mb-6 transition">
        <ChevronLeft className="w-4 h-4" /> Back to calls
      </Link>

      <div className="card p-8 mb-6">
        <div className="flex items-start justify-between gap-6 mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {phaseLabel && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border bg-violet-500/10 text-violet-300 border-violet-500/30">
                  {phaseLabel}
                </span>
              )}
              {call.call_type && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border ${CALL_TYPE_TINT[call.call_type] || CALL_TYPE_TINT.other}`}>
                  {call.call_type.replace(/_/g, ' ')}
                </span>
              )}
              {deptName && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider border ${DEPT_TINT[deptName] || 'bg-gray-500/10 text-gray-400 border-gray-500/30'}`}>
                  {deptName}
                </span>
              )}
              <span className="text-xs text-gray-500">·</span>
              <span className="text-xs text-gray-500">{call.recorded_at ? formatDateTime(call.recorded_at) : '—'}</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1 leading-tight">{heroTitle}</h1>
            <p className="text-gray-400 text-sm">
              {host?.team_members?.name && (
                <span className="inline-flex items-center gap-1.5 mr-3"><Users className="w-3.5 h-3.5" /> {host.team_members.name}</span>
              )}
              {call.duration_seconds && (
                <span className="inline-flex items-center gap-1.5 mr-3"><Clock className="w-3.5 h-3.5" /> {formatDuration(call.duration_seconds)}</span>
              )}
              {call.status && (
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {call.status}
                </span>
              )}
            </p>
          </div>
          <ScoreRing score={scorecard?.overall_score ?? null} size="xl" showLabel />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-6">
          <StatTile icon={Box} label="Projects" value={projects.length} valueClass="text-cyan-400" />
          <StatTile icon={ListChecks} label="Key pts" value={keyPoints.length} />
          <StatTile icon={GitBranch} label="Decisions" value={decisions.length} valueClass="text-blue-400" />
          <StatTile icon={ArrowRight} label="Actions" value={actionItems.length} valueClass="text-amber-400" />
          <StatTile icon={HelpCircle} label="Questions" value={openQuestions.length} valueClass="text-purple-400" />
          <StatTile icon={ShieldAlert} label="Risks" value={risks.length} valueClass={risks.length ? 'text-red-400' : 'text-gray-400'} />
          <StatTile icon={AlertTriangle} label="Findings" value={findings.length} valueClass={findings.length ? 'text-amber-400' : 'text-gray-400'} />
        </div>

        {(summaryRest || scorecard?.summary) && (
          <div className="border-t border-[hsl(222,32%,18%)] pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Executive summary</p>
            <p className="text-gray-200 text-[14px] leading-relaxed whitespace-pre-wrap">{summaryRest || scorecard?.summary}</p>
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-6 bg-[hsl(222,47%,8%)] border border-[hsl(222,32%,18%)] rounded-lg p-1 w-fit">
        {([
          ['intelligence', 'Meeting Intelligence'],
          ['scorecard', 'Sales Scorecard'],
          ['findings', `Rule Findings${findings.length ? ` (${findings.length})` : ''}`],
          ['transcript', 'Transcript'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-1.5 rounded-md text-sm font-medium transition ${
              tab === t ? 'bg-blue-500/15 text-blue-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* MEETING INTELLIGENCE */}
      {tab === 'intelligence' && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Talk Time Bar — full width */}
          {talkTimeBreakdown.length > 0 && (
            <div className="md:col-span-2">
              <TalkTimeCard breakdown={talkTimeBreakdown} />
            </div>
          )}

          {/* Meeting Effectiveness (team calls) */}
          {isTeamCall && meetingEffectiveness && (
            <div className="md:col-span-2">
              <MeetingEffectivenessCard data={meetingEffectiveness} />
            </div>
          )}

          {/* Coaching Priorities (sales calls) */}
          {isSalesCall && coachingPriorities.length > 0 && (
            <div className="md:col-span-2">
              <CoachingPrioritiesCard priorities={coachingPriorities} />
            </div>
          )}

          {/* Attendees full-width if present */}
          {attendees.length > 0 && (
            <div className="md:col-span-2">
              <ListCard title="Attendees" icon={UserCircle} accent="text-blue-400" border="border-blue-500/30" items={attendees} bullet="◉" />
            </div>
          )}
          {/* Projects full-width */}
          {projects.length > 0 && (
            <div className="md:col-span-2">
              <ListCard title="Projects Discussed" icon={Box} accent="text-cyan-400" border="border-cyan-500/30" items={projects} bullet="▣" />
            </div>
          )}
          <ListCard title="Key Points" icon={ListChecks} accent="text-white" border="border-[hsl(222,32%,18%)]" items={keyPoints} bullet="●" />
          <ListCard title="Decisions Made" icon={GitBranch} accent="text-blue-400" border="border-blue-500/30" items={decisions} bullet="✓" />
          <ActionItemsCard items={actionItems} />
          <ListCard title="Open Questions" icon={HelpCircle} accent="text-purple-400" border="border-purple-500/30" items={openQuestions} bullet="?" />
          <ListCard title="Next Steps" icon={Target} accent="text-emerald-400" border="border-emerald-500/30" items={nextSteps} bullet="→" />
          <ListCard title="Risks & Flags" icon={ShieldAlert} accent="text-red-400" border="border-red-500/30" items={risks} bullet="⚠" />
          <div className="md:col-span-2">
            <ListCard title="Suggestions" icon={Lightbulb} accent="text-cyan-400" border="border-cyan-500/30" items={suggestions} bullet="◇" />
          </div>
          {bannedPhrases.length > 0 && (
            <div className="md:col-span-2">
              <ListCard title="Banned phrases observed" icon={Ban} accent="text-red-400" border="border-red-500/30" items={bannedPhrases} bullet="✕" />
            </div>
          )}
        </div>
      )}

      {/* SALES SCORECARD */}
      {tab === 'scorecard' && (
        <div className="space-y-4">
          {strengths.length > 0 && (
            <Section title="What worked" icon={CheckCircle2} color="text-emerald-400">
              {strengths.map((s, i) => <CriterionCard key={i} item={s} />)}
            </Section>
          )}
          {improvements.length > 0 && (
            <Section title="Coach on this next time" icon={TrendingUp} color="text-amber-400">
              {improvements.map((s, i) => <CriterionCard key={i} item={s} />)}
            </Section>
          )}
          {strengths.length === 0 && improvements.length === 0 && (
            <div className="card p-12 text-center text-gray-500">No criterion scoring for this call type.</div>
          )}
        </div>
      )}

      {/* RULE FINDINGS */}
      {tab === 'findings' && (
        <div className="space-y-3">
          {findings.length === 0 ? (
            <div className="card p-12 text-center text-gray-500">No rule findings.</div>
          ) : findings.map(f => {
            const sev = SEV_TINT[f.severity] || SEV_TINT.info
            return (
              <div key={f.id} className={`card border-l-4 ${sev.border} p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${sev.bg} ${sev.fg}`}>{sev.label}</span>
                  <span className="font-semibold text-white text-sm">{humanize(f.rule_key)}</span>
                  {f.value?.count !== undefined && (
                    <span className="text-xs text-gray-500">· {f.value.count} occurrence{f.value.count !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {f.value?.suggestion && (
                  <p className="text-gray-300 text-sm leading-relaxed mb-3">{f.value.suggestion}</p>
                )}
                {(f.context_snippets ?? []).length > 0 && (
                  <div className="space-y-1.5 mt-3">
                    {(f.context_snippets ?? []).slice(0, 3).map((s, i) => (
                      <div key={i} className="bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded px-3 py-2 flex items-start gap-2">
                        <Quote className="w-3 h-3 text-gray-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-400 italic">"{s.text}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* TRANSCRIPT */}
      {tab === 'transcript' && (
        <div className="card p-6">
          {call.transcript_segments && call.transcript_segments.length > 0 ? (
            <div className="space-y-3">
              {call.transcript_segments.map((seg, i) => (
                <div key={i} className="flex gap-4">
                  <span className="text-[11px] font-mono text-gray-600 w-14 shrink-0 pt-1">
                    {Math.floor((seg.start_time as number) / 60)}:{String(Math.floor((seg.start_time as number) % 60)).padStart(2, '0')}
                  </span>
                  <div className="flex-1">
                    <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider mr-2 block mb-0.5">{seg.speaker}</span>
                    <span className="text-sm text-gray-300 leading-relaxed">{seg.text}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : call.transcript_raw ? (
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{call.transcript_raw}</pre>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">No transcript available.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ListCard({ title, icon: Icon, accent, border, items, bullet }: any) {
  return (
    <div className={`card border-t-2 ${border} p-5`}>
      <h2 className={`flex items-center gap-2 ${accent} font-semibold text-xs uppercase tracking-wider mb-4`}>
        <Icon className="w-4 h-4" /> {title}
        <span className="text-gray-600 ml-auto font-mono text-xs">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-gray-600 text-xs italic">None identified.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item: string, i: number) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] text-gray-300 leading-relaxed">
              <span className={`${accent} mt-0.5 font-bold shrink-0`}>{bullet}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Section({ title, icon: Icon, color, children }: any) {
  return (
    <div className="card p-6">
      <h2 className={`flex items-center gap-2 ${color} font-semibold text-xs uppercase tracking-wider mb-4`}>
        <Icon className="w-4 h-4" /> {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function CriterionCard({ item }: { item: any }) {
  const score = typeof item.score === 'number' ? item.score : null
  const barColor = scoreBarColor(score)
  const pct = score !== null ? (score / 10) * 100 : 0

  return (
    <div className="border-b border-[hsl(222,32%,15%)] last:border-0 pb-5 last:pb-0">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-white text-sm">{humanize(item.criterion)}</span>
        {score !== null && (
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded text-white ${barColor}`}>{score}/10</span>
        )}
      </div>
      {score !== null && (
        <div className="w-full h-1.5 bg-[hsl(222,32%,15%)] rounded-full mb-3 overflow-hidden">
          <div className={`h-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="text-gray-300 text-[13px] leading-relaxed mb-3">{item.description}</p>
      {item.evidence_quote && (
        <div className="bg-[hsl(222,47%,5%)] border-l-2 border-blue-500/40 rounded-r px-4 py-3 flex items-start gap-2.5">
          <Quote className="w-3.5 h-3.5 text-blue-400/60 mt-0.5 shrink-0" />
          <p className="text-[13px] text-gray-400 italic leading-relaxed">"{item.evidence_quote}"</p>
        </div>
      )}
    </div>
  )
}

function StatTile({ icon: Icon, label, value, valueClass = 'text-white' }: any) {
  return (
    <div className="bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,15%)] rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1 text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-xl font-bold ${valueClass}`}>{value}</div>
    </div>
  )
}

const SPEAKER_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
]
const SPEAKER_TEXT = [
  'text-blue-400', 'text-emerald-400', 'text-violet-400', 'text-amber-400', 'text-rose-400', 'text-cyan-400',
]

function TalkTimeCard({ breakdown }: { breakdown: Array<{ speaker: string; seconds: number; percentage: number }> }) {
  const sorted = [...breakdown].sort((a, b) => b.percentage - a.percentage)
  return (
    <div className="card border-t-2 border-blue-500/30 p-5">
      <h2 className="flex items-center gap-2 text-blue-400 font-semibold text-xs uppercase tracking-wider mb-4">
        <Mic className="w-4 h-4" /> Talk Time
        <span className="text-gray-600 ml-auto font-mono text-xs">{sorted.length} speakers</span>
      </h2>
      {/* Stacked bar */}
      <div className="w-full h-3 rounded-full overflow-hidden flex mb-4">
        {sorted.map((s, i) => (
          <div key={s.speaker} className={`${SPEAKER_COLORS[i % SPEAKER_COLORS.length]} h-full transition-all`} style={{ width: `${s.percentage}%` }} title={`${s.speaker}: ${s.percentage}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {sorted.map((s, i) => (
          <div key={s.speaker} className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${SPEAKER_COLORS[i % SPEAKER_COLORS.length]}`} />
            <span className={`text-sm font-medium ${SPEAKER_TEXT[i % SPEAKER_TEXT.length]}`}>{s.speaker}</span>
            <span className="text-xs text-gray-500">{s.percentage}%</span>
            <span className="text-xs text-gray-600">({Math.floor(s.seconds / 60)}m {s.seconds % 60}s)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MeetingEffectivenessCard({ data }: { data: { score: number; agenda_clarity: string; decisions_ratio: string; action_coverage: string; focus_score: number; summary: string } }) {
  const scoreColor = data.score >= 8 ? 'text-emerald-400' : data.score >= 6 ? 'text-blue-400' : data.score >= 4 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="card border-t-2 border-violet-500/30 p-5">
      <div className="flex items-start justify-between mb-4">
        <h2 className="flex items-center gap-2 text-violet-400 font-semibold text-xs uppercase tracking-wider">
          <BarChart2 className="w-4 h-4" /> Meeting Effectiveness
        </h2>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold ${scoreColor}`}>{data.score}</span>
          <span className="text-gray-600 text-sm">/10</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[hsl(222,47%,5%)] rounded-lg p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Agenda</p>
          <p className="text-xs text-gray-300 leading-relaxed">{data.agenda_clarity}</p>
        </div>
        <div className="bg-[hsl(222,47%,5%)] rounded-lg p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Decisions</p>
          <p className="text-xs text-gray-300 leading-relaxed">{data.decisions_ratio}</p>
        </div>
        <div className="bg-[hsl(222,47%,5%)] rounded-lg p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Action Coverage</p>
          <p className="text-xs text-gray-300 leading-relaxed">{data.action_coverage}</p>
        </div>
        <div className="bg-[hsl(222,47%,5%)] rounded-lg p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Focus Score</p>
          <p className="text-xs text-gray-300 leading-relaxed">{data.focus_score}/10</p>
        </div>
      </div>
      {data.summary && (
        <p className="text-[13px] text-gray-400 leading-relaxed border-t border-[hsl(222,32%,18%)] pt-3">{data.summary}</p>
      )}
    </div>
  )
}

const PRIORITY_BADGE: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: 'bg-red-500/15', text: 'text-red-400', label: '#1 Priority' },
  2: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: '#2 Priority' },
  3: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: '#3 Priority' },
}

function CoachingPrioritiesCard({ priorities }: { priorities: Array<{ priority: number; area: string; what_happened: string; what_to_do_instead: string; impact: string }> }) {
  return (
    <div className="card border-t-2 border-amber-500/30 p-5">
      <h2 className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider mb-4">
        <Star className="w-4 h-4" /> Coaching Priorities
        <span className="text-gray-600 ml-auto font-mono text-xs">{priorities.length} focus areas</span>
      </h2>
      <div className="space-y-4">
        {priorities.map((p, i) => {
          const badge = PRIORITY_BADGE[p.priority] || PRIORITY_BADGE[1]
          return (
            <div key={i} className="border border-[hsl(222,32%,18%)] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${badge.bg} ${badge.text}`}>{badge.label}</span>
                <span className="text-sm font-semibold text-white">{p.area?.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
              </div>
              {p.what_happened && (
                <div className="bg-[hsl(222,47%,5%)] border-l-2 border-red-500/40 rounded-r px-3 py-2 mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">What happened</p>
                  <p className="text-xs text-gray-400 italic">"{p.what_happened}"</p>
                </div>
              )}
              {p.what_to_do_instead && (
                <div className="bg-emerald-500/5 border-l-2 border-emerald-500/40 rounded-r px-3 py-2 mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">Do this instead</p>
                  <p className="text-xs text-emerald-300 leading-relaxed">{p.what_to_do_instead}</p>
                </div>
              )}
              {p.impact && (
                <div className="flex items-start gap-1.5">
                  <Zap className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-500 leading-relaxed">{p.impact}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ACTION_PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  HIGH:   { bg: 'bg-red-500/15',   text: 'text-red-400' },
  MEDIUM: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  LOW:    { bg: 'bg-gray-500/15',  text: 'text-gray-400' },
}

function ActionItemsCard({ items }: { items: string[] }) {
  return (
    <div className="card border-t-2 border-amber-500/30 p-5">
      <h2 className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider mb-4">
        <ArrowRight className="w-4 h-4" /> Action Items
        <span className="text-gray-600 ml-auto font-mono text-xs">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-gray-600 text-xs italic">None identified.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => {
            const priorityMatch = item.match(/\[(HIGH|MEDIUM|LOW)\]/i)
            const priority = priorityMatch ? priorityMatch[1].toUpperCase() : null
            const ownerMatch = item.match(/- Owner: ([^-\[]+)/)
            const owner = ownerMatch ? ownerMatch[1].trim() : null
            const dueMatch = item.match(/- Due: ([^-\[]+)/)
            const due = dueMatch ? dueMatch[1].trim() : null
            const task = item.split(' - Owner:')[0].split(' - Due:')[0].trim()
            const ps = priority ? ACTION_PRIORITY_STYLE[priority] : null
            return (
              <li key={i} className="border border-[hsl(222,32%,18%)] rounded-lg px-3 py-2.5">
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-amber-400 font-bold shrink-0 mt-0.5">▸</span>
                  <span className="text-[13px] text-gray-200 leading-relaxed flex-1">{task}</span>
                  {ps && priority && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${ps.bg} ${ps.text}`}>{priority}</span>}
                </div>
                {(owner || due) && (
                  <div className="flex items-center gap-3 ml-5 mt-1">
                    {owner && <span className="text-[11px] text-blue-400">👤 {owner}</span>}
                    {due && <span className="text-[11px] text-gray-500">📅 {due}</span>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
