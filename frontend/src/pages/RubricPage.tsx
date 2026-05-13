import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Rubric } from '@/types'
import { Save, Plus, Trash2, BookOpen, Sparkles, Loader2, Check, AlertCircle } from 'lucide-react'

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:4000'

interface AssistSuggestion {
  action: 'upsert' | 'remove'
  criterion?: Record<string, unknown>
  key?: string
  weight_warning?: string | null
}

const SEV_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
]

export default function RubricPage() {
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [content, setContent] = useState('')
  const [assistInput, setAssistInput] = useState('')
  const [assisting, setAssisting] = useState(false)
  const [assistError, setAssistError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<AssistSuggestion | null>(null)
  const [view, setView] = useState<'editor' | 'json'>('editor')

  useEffect(() => {
    supabase.from('rubrics').select('*').eq('is_active', true).single().then(({ data }) => {
      if (data) { setRubric(data as Rubric); setContent(JSON.stringify(data.content, null, 2)) }
      setLoading(false)
    })
  }, [])

  async function handleAssist() {
    if (!assistInput.trim()) return
    setAssisting(true); setAssistError(null); setSuggestion(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const currentCriteria = (() => {
        try { return (JSON.parse(content) as Record<string, unknown>)?.scoring_criteria ?? [] } catch { return [] }
      })()
      const res = await fetch(`${BACKEND_URL}/rubric/assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ current_criteria: currentCriteria, user_request: assistInput.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { suggestion: AssistSuggestion }
      setSuggestion(data.suggestion)
    } catch (err: unknown) {
      setAssistError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setAssisting(false)
    }
  }

  function applyAssistSuggestion() {
    if (!suggestion) return
    let updated: Record<string, unknown>
    try { updated = JSON.parse(content) } catch { return }
    if (!Array.isArray(updated.scoring_criteria)) updated.scoring_criteria = []
    const criteria = updated.scoring_criteria as Record<string, unknown>[]
    if (suggestion.action === 'upsert' && suggestion.criterion) {
      const idx = criteria.findIndex(c => c.key === suggestion.criterion!.key)
      if (idx >= 0) { criteria[idx] = suggestion.criterion } else { criteria.push(suggestion.criterion) }
    } else if (suggestion.action === 'remove' && suggestion.key) {
      updated.scoring_criteria = criteria.filter(c => c.key !== suggestion.key)
    }
    setContent(JSON.stringify(updated, null, 2))
    setSuggestion(null); setAssistInput('')
  }

  async function handleSave() {
    if (!rubric) return
    let parsed
    try { parsed = JSON.parse(content) } catch {
      alert('Invalid JSON — please check your edits.'); return
    }
    setSaving(true)
    const { error } = await supabase.from('rubrics').update({ content: parsed }).eq('id', rubric.id)
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    else alert('Save failed: ' + error.message)
  }

  if (loading) return <div className="p-12 text-gray-500 text-sm">Loading rubric…</div>
  if (!rubric) return (
    <div className="p-12">
      <div className="card p-8 text-center max-w-lg mx-auto">
        <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
        <h2 className="text-white font-semibold mb-2">No active rubric found</h2>
        <p className="text-gray-400 text-sm mb-4">The rubric table is empty or no row has <code className="text-amber-400">is_active = true</code>.</p>
        <p className="text-gray-500 text-xs">Run <code className="text-amber-400">supabase/seed.sql</code> in the Supabase SQL Editor.</p>
      </div>
    </div>
  )

  const parsedContent = (() => { try { return JSON.parse(content) } catch { return null } })()
  const jsonValid = parsedContent !== null

  function update(mutator: (d: any) => void) {
    const u = JSON.parse(content); mutator(u); setContent(JSON.stringify(u, null, 2))
  }

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto fade-up">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">Coaching Playbook</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Rubric Editor</h1>
          <p className="text-gray-500 text-sm mt-1">
            {rubric.name} <span className="text-gray-600">·</span> v{rubric.version}
            {rubric.is_active && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 uppercase tracking-wider">Active</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[hsl(222,47%,8%)] border border-[hsl(222,32%,18%)] rounded-lg p-1">
            <button onClick={() => setView('editor')} className={`px-3 py-1 rounded text-xs font-medium ${view==='editor' ? 'bg-blue-500/15 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>Editor</button>
            <button onClick={() => setView('json')} className={`px-3 py-1 rounded text-xs font-medium ${view==='json' ? 'bg-blue-500/15 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>Raw JSON</button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !jsonValid}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {!jsonValid && (
        <div className="card border-red-500/40 bg-red-500/5 p-3 mb-4 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" /> JSON is invalid — fix it in the Raw JSON view before saving.
        </div>
      )}

      {view === 'editor' && parsedContent && (
        <div className="space-y-4">
          {/* AI Assistant — top */}
          <div className="card border-l-4 border-purple-500/40 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h3 className="font-semibold text-white text-sm">AI Rubric Assistant</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">Describe a criterion change in plain English — the AI generates the JSON.</p>
            <div className="flex gap-2">
              <textarea
                className="flex-1 bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded-md px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 resize-none"
                rows={2}
                placeholder='e.g. "Add a criterion for handling price objections, weight 10"'
                value={assistInput}
                disabled={assisting}
                onChange={e => setAssistInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAssist() }}
              />
              <button
                onClick={handleAssist}
                disabled={assisting || !assistInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/40 text-white rounded-md text-sm font-medium transition self-start"
              >
                {assisting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {assisting ? 'Thinking…' : 'Ask'}
              </button>
            </div>
            {assistError && <p className="text-xs text-red-400 mt-2">{assistError}</p>}
            {suggestion && (
              <div className="mt-4 rounded-md border border-purple-500/30 bg-purple-500/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Suggestion</span>
                  <div className="flex gap-2">
                    <button onClick={applyAssistSuggestion} className="text-xs px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded font-medium">Apply</button>
                    <button onClick={() => setSuggestion(null)} className="text-xs px-3 py-1 text-gray-500 hover:text-gray-300">Dismiss</button>
                  </div>
                </div>
                {suggestion.weight_warning && <p className="text-xs text-amber-400 mb-2">{suggestion.weight_warning}</p>}
                <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap overflow-auto max-h-64">{JSON.stringify(suggestion, null, 2)}</pre>
              </div>
            )}
          </div>

          {/* Banned words */}
          <SectionCard
            title="Banned Words"
            badge="critical / warning"
            color="red"
            description="Words the rep should never say on specific call types. The rule engine flags every occurrence."
            onAdd={() => update(d => d.banned_words.push({ word: '', applies_to_call_types: [], severity: 'critical', reason: '' }))}
          >
            <div className="space-y-2">
              {(parsedContent.banned_words ?? []).map((bw: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={bw.word} placeholder="word" onChange={v => update(d => { d.banned_words[i].word = v })} className="w-40" />
                  <Select value={bw.severity} options={SEV_OPTIONS} onChange={v => update(d => { d.banned_words[i].severity = v })} />
                  <Input value={bw.reason} placeholder="why it's banned" onChange={v => update(d => { d.banned_words[i].reason = v })} className="flex-1" />
                  <IconBtn onClick={() => update(d => { d.banned_words.splice(i, 1) })}><Trash2 className="w-4 h-4" /></IconBtn>
                </div>
              ))}
              {(!parsedContent.banned_words || parsedContent.banned_words.length === 0) && (
                <p className="text-gray-600 text-xs italic">No banned words yet. Click "Add" to define one.</p>
              )}
            </div>
          </SectionCard>

          {/* Filler words */}
          <SectionCard
            title="Filler Words"
            badge="threshold-based"
            color="amber"
            description="Words tracked with a maximum per-call threshold. Above that count, the rule engine flags it."
            onAdd={() => update(d => d.filler_words.push({ word: '', threshold_per_call: 5, severity: 'warning' }))}
          >
            <div className="space-y-2">
              {(parsedContent.filler_words ?? []).map((fw: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={fw.word} placeholder="word" onChange={v => update(d => { d.filler_words[i].word = v })} className="w-40" />
                  <span className="text-xs text-gray-500">max</span>
                  <Input type="number" value={fw.threshold_per_call} onChange={v => update(d => { d.filler_words[i].threshold_per_call = parseInt(v) || 0 })} className="w-20" />
                  <span className="text-xs text-gray-500">per call</span>
                  <Select value={fw.severity} options={SEV_OPTIONS} onChange={v => update(d => { d.filler_words[i].severity = v })} />
                  <IconBtn onClick={() => update(d => { d.filler_words.splice(i, 1) })}><Trash2 className="w-4 h-4" /></IconBtn>
                </div>
              ))}
              {(!parsedContent.filler_words || parsedContent.filler_words.length === 0) && (
                <p className="text-gray-600 text-xs italic">No filler words yet. Click "Add" to define one.</p>
              )}
            </div>
          </SectionCard>

          {/* Talk ratio */}
          {parsedContent.talk_ratio && (
            <SectionCard title="Talk Ratio" badge="speaker analysis" color="blue" description="The maximum percentage of speaking time allowed for the rep before it's flagged.">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">Max rep talk time:</span>
                <Input
                  type="number"
                  value={parsedContent.talk_ratio.max_rep_percentage}
                  onChange={v => update(d => { d.talk_ratio.max_rep_percentage = parseInt(v) || 0 })}
                  className="w-20"
                />
                <span className="text-sm text-gray-400">%</span>
              </div>
            </SectionCard>
          )}

          {/* Scoring criteria readout */}
          {Array.isArray(parsedContent.scoring_criteria) && parsedContent.scoring_criteria.length > 0 && (
            <SectionCard title="LLM Scoring Criteria" badge={`${parsedContent.scoring_criteria.length} criteria · ${parsedContent.scoring_criteria.reduce((s: number, c: any) => s + (c.weight || 0), 0)}% total weight`} color="emerald" description="Used by the LLM scorer to assign per-criterion scores 0-10. Edit weights and descriptions in Raw JSON view.">
              <div className="space-y-2">
                {parsedContent.scoring_criteria.map((c: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,15%)] rounded-md">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white text-sm">{c.label || c.key}</span>
                        <span className="text-[10px] text-gray-500 font-mono">{c.key}</span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{c.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-blue-400">{Math.round((c.weight || 0) * 100)}%</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">weight</div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Coaching principles */}
          {Array.isArray(parsedContent.coaching_principles) && parsedContent.coaching_principles.length > 0 && (
            <SectionCard title="Coaching Principles" badge="LLM context" color="cyan" description="System-prompt guidance passed to the scoring LLM with every call.">
              <ul className="space-y-2">
                {parsedContent.coaching_principles.map((p: string, i: number) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] text-gray-300 leading-relaxed">
                    <span className="text-cyan-400 font-bold mt-0.5">◇</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      )}

      {view === 'json' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white text-sm">Raw JSON</h3>
            <span className="text-[11px] text-gray-500">Edit the full rubric directly</span>
          </div>
          <textarea
            className="w-full h-[600px] font-mono text-xs bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded-md p-3 text-gray-200 focus:outline-none focus:border-blue-500/50 resize-none"
            value={content}
            onChange={e => setContent(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  )
}

function SectionCard({ title, badge, color, description, onAdd, children }: any) {
  const tints: Record<string, string> = {
    red: 'border-red-500/40',
    amber: 'border-amber-500/40',
    blue: 'border-blue-500/40',
    emerald: 'border-emerald-500/40',
    cyan: 'border-cyan-500/40',
    purple: 'border-purple-500/40',
  }
  return (
    <div className={`card border-l-4 ${tints[color] || 'border-blue-500/40'} p-5`}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="font-semibold text-white text-sm">{title}</h3>
          {badge && <span className="text-[10px] text-gray-500 uppercase tracking-wider">{badge}</span>}
        </div>
        {onAdd && (
          <button onClick={onAdd} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>
      {description && <p className="text-[12px] text-gray-500 mb-4">{description}</p>}
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, className = '', type = 'text' }: any) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded-md px-3 py-1.5 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 ${className}`}
    />
  )
}

function Select({ value, options, onChange }: any) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-[hsl(222,47%,5%)] border border-[hsl(222,32%,18%)] rounded-md px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50"
    >
      {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function IconBtn({ onClick, children }: any) {
  return (
    <button onClick={onClick} className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded transition">
      {children}
    </button>
  )
}
