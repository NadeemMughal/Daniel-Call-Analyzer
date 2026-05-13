import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  Ban, Volume2, MessageSquare, TrendingDown, User, AlertTriangle,
  ArrowRight
} from 'lucide-react'

interface RuleFindingsByRep {
  rep_name: string
  rep_id: string | null
  total_findings: number
  by_rule: Record<string, { count: number; severity: string; call_ids: Set<string> }>
}

interface BannedPhraseEntry {
  phrase: string
  count: number
  calls: Array<{ id: string; recorded_at: string | null }>
}

export default function CoachingPage() {
  const [byRep, setByRep] = useState<RuleFindingsByRep[]>([])
  const [bannedAggregate, setBannedAggregate] = useState<BannedPhraseEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [findingsRes, evidenceRes] = await Promise.all([
        // All rule findings with the call's host participant info
        supabase
          .from('rule_findings')
          .select(`
            rule_key, severity, value, call_id,
            calls!inner(
              recorded_at,
              call_participants(role, is_external, team_members(id, name))
            )
          `)
          .order('created_at', { ascending: false })
          .limit(500),
        // All banned phrases captured by the LLM
        supabase
          .from('scorecard_evidence')
          .select('quote, scorecards(call_id, calls(recorded_at))')
          .eq('criterion_key', 'banned_phrase')
          .order('created_at', { ascending: false })
          .limit(500),
      ])

      // Group rule_findings by rep
      const byRepMap: Record<string, RuleFindingsByRep> = {}
      for (const f of (findingsRes.data || []) as any[]) {
        const call = f.calls
        if (!call) continue
        const host = (call.call_participants || []).find((p: any) => p.role === 'host' && !p.is_external)
        const name = host?.team_members?.name || 'Unknown rep'
        const id = host?.team_members?.id || null
        const key = id || name
        if (!byRepMap[key]) {
          byRepMap[key] = { rep_name: name, rep_id: id, total_findings: 0, by_rule: {} }
        }
        byRepMap[key].total_findings += 1
        if (!byRepMap[key].by_rule[f.rule_key]) {
          byRepMap[key].by_rule[f.rule_key] = { count: 0, severity: f.severity, call_ids: new Set() }
        }
        byRepMap[key].by_rule[f.rule_key].count += 1
        byRepMap[key].by_rule[f.rule_key].call_ids.add(f.call_id)
      }
      const reps = Object.values(byRepMap).sort((a, b) => b.total_findings - a.total_findings)
      setByRep(reps)

      // Aggregate banned phrases across all calls
      const bannedMap: Record<string, BannedPhraseEntry> = {}
      for (const e of (evidenceRes.data || []) as any[]) {
        const phraseText = String(e.quote || '').split('(')[0].trim().toLowerCase()
        const phrase = phraseText || 'unknown'
        if (!bannedMap[phrase]) {
          bannedMap[phrase] = { phrase, count: 0, calls: [] }
        }
        bannedMap[phrase].count += 1
        if (e.scorecards?.call_id) {
          bannedMap[phrase].calls.push({
            id: e.scorecards.call_id,
            recorded_at: e.scorecards?.calls?.recorded_at ?? null,
          })
        }
      }
      const bannedSorted = Object.values(bannedMap).sort((a, b) => b.count - a.count)
      setBannedAggregate(bannedSorted)

      setLoading(false)
    }
    load().catch(err => { console.error(err); setLoading(false) })
  }, [])

  if (loading) return <div className="min-h-screen p-12 text-gray-500 text-sm">Loading coaching insights…</div>

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto fade-up">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-amber-400 font-medium uppercase tracking-wider">Coaching Insights</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Patterns Across Calls</h1>
        <p className="text-gray-500 text-sm mt-1">
          What individual reps and the whole team need to fix — aggregated from every analyzed call.
        </p>
      </div>

      {/* By rep section */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" /> Findings by team member
        </h2>
        {byRep.length === 0 ? (
          <div className="card p-8 text-center text-gray-500 text-sm">
            No rule findings yet. They appear here as reps' calls get analyzed.
          </div>
        ) : (
          <div className="space-y-3">
            {byRep.map(rep => (
              <div key={rep.rep_id || rep.rep_name} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-sm font-bold">
                      {rep.rep_name.split(' ').map(p => p[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{rep.rep_name}</p>
                      <p className="text-gray-500 text-xs">
                        {rep.total_findings} finding{rep.total_findings !== 1 ? 's' : ''} across {Object.values(rep.by_rule).reduce((s, r) => s + r.call_ids.size, 0)} call{Object.values(rep.by_rule).reduce((s, r) => s + r.call_ids.size, 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-amber-400 font-mono">{rep.total_findings}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(rep.by_rule)
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 6)
                    .map(([key, info]) => (
                      <div key={key} className="bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,15%)] rounded-md px-3 py-2">
                        <p className="text-[11px] text-gray-400 font-medium leading-tight">{humanize(key)}</p>
                        <p className="text-sm font-bold text-white mt-0.5">{info.count}<span className="text-xs text-gray-500 font-normal"> on {info.call_ids.size} call{info.call_ids.size !== 1 ? 's' : ''}</span></p>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Banned phrases aggregate */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
          <Ban className="w-3.5 h-3.5" /> Banned phrases — across all calls
        </h2>
        {bannedAggregate.length === 0 ? (
          <div className="card p-8 text-center text-gray-500 text-sm">No banned phrases caught yet.</div>
        ) : (
          <div className="card p-5">
            <div className="space-y-3">
              {bannedAggregate.map(p => (
                <div key={p.phrase} className="flex items-center gap-4 pb-3 border-b border-[hsl(222,32%,12%)] last:border-0 last:pb-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/10 text-red-400 shrink-0">BANNED</span>
                  <span className="font-mono text-white font-bold flex-1">{p.phrase}</span>
                  <span className="text-xs text-gray-400">on <span className="text-white font-bold">{new Set(p.calls.map(c => c.id)).size}</span> call{new Set(p.calls.map(c => c.id)).size !== 1 ? 's' : ''}</span>
                  <div className="flex gap-1.5">
                    {p.calls.slice(0, 3).map(c => (
                      <Link key={c.id} to={`/calls/${c.id}`} className="text-[11px] bg-[hsl(222,47%,5%)] hover:bg-[hsl(222,47%,10%)] border border-[hsl(222,32%,18%)] rounded px-2 py-0.5 text-gray-400 hover:text-blue-400 transition">
                        view <ArrowRight className="w-2.5 h-2.5 inline" />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function humanize(key: string) {
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
