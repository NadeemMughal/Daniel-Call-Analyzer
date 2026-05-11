import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Rubric } from '@/types'
import { Save, Plus, Trash2, BookOpen } from 'lucide-react'

export default function RubricPage() {
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [content, setContent] = useState('')

  useEffect(() => {
    supabase
      .from('rubrics')
      .select('*')
      .eq('is_active', true)
      .single()
      .then(({ data }) => {
        if (data) {
          setRubric(data as Rubric)
          setContent(JSON.stringify(data.content, null, 2))
        }
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    if (!rubric) return
    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      alert('Invalid JSON — please check your edits.')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('rubrics')
      .update({ content: parsed })
      .eq('id', rubric.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      alert('Save failed: ' + error.message)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading rubric…</div>
  if (!rubric) return <div className="p-8 text-gray-400">No active rubric found.</div>

  const parsedContent = (() => {
    try { return JSON.parse(content) } catch { return null }
  })()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-brand" />
            <h1 className="text-2xl font-bold text-gray-900">Rubric Editor</h1>
          </div>
          <p className="text-gray-500 text-sm">
            {rubric.name} — v{rubric.version}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Quick-edit panels */}
      {parsedContent && (
        <div className="space-y-4 mb-6">
          {/* Banned words */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center justify-between">
              Banned Words
              <button
                onClick={() => {
                  const updated = JSON.parse(content)
                  updated.banned_words.push({ word: '', applies_to_call_types: [], severity: 'critical', reason: '' })
                  setContent(JSON.stringify(updated, null, 2))
                }}
                className="text-xs text-brand hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </h3>
            <div className="space-y-2">
              {(parsedContent.banned_words ?? []).map((bw: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="border border-gray-200 rounded-md px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-brand/30"
                    value={bw.word}
                    placeholder="word"
                    onChange={e => {
                      const updated = JSON.parse(content)
                      updated.banned_words[i].word = e.target.value
                      setContent(JSON.stringify(updated, null, 2))
                    }}
                  />
                  <select
                    className="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                    value={bw.severity}
                    onChange={e => {
                      const updated = JSON.parse(content)
                      updated.banned_words[i].severity = e.target.value
                      setContent(JSON.stringify(updated, null, 2))
                    }}
                  >
                    <option value="critical">critical</option>
                    <option value="warning">warning</option>
                    <option value="info">info</option>
                  </select>
                  <input
                    className="border border-gray-200 rounded-md px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
                    value={bw.reason}
                    placeholder="reason"
                    onChange={e => {
                      const updated = JSON.parse(content)
                      updated.banned_words[i].reason = e.target.value
                      setContent(JSON.stringify(updated, null, 2))
                    }}
                  />
                  <button
                    onClick={() => {
                      const updated = JSON.parse(content)
                      updated.banned_words.splice(i, 1)
                      setContent(JSON.stringify(updated, null, 2))
                    }}
                    className="text-red-400 hover:text-red-600 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Filler words */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center justify-between">
              Filler Words
              <button
                onClick={() => {
                  const updated = JSON.parse(content)
                  updated.filler_words.push({ word: '', threshold_per_call: 5, severity: 'warning' })
                  setContent(JSON.stringify(updated, null, 2))
                }}
                className="text-xs text-brand hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </h3>
            <div className="space-y-2">
              {(parsedContent.filler_words ?? []).map((fw: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="border border-gray-200 rounded-md px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-brand/30"
                    value={fw.word}
                    placeholder="word"
                    onChange={e => {
                      const updated = JSON.parse(content)
                      updated.filler_words[i].word = e.target.value
                      setContent(JSON.stringify(updated, null, 2))
                    }}
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">max</span>
                    <input
                      type="number"
                      className="border border-gray-200 rounded-md px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-brand/30"
                      value={fw.threshold_per_call}
                      onChange={e => {
                        const updated = JSON.parse(content)
                        updated.filler_words[i].threshold_per_call = parseInt(e.target.value) || 0
                        setContent(JSON.stringify(updated, null, 2))
                      }}
                    />
                    <span className="text-xs text-gray-500">per call</span>
                  </div>
                  <select
                    className="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                    value={fw.severity}
                    onChange={e => {
                      const updated = JSON.parse(content)
                      updated.filler_words[i].severity = e.target.value
                      setContent(JSON.stringify(updated, null, 2))
                    }}
                  >
                    <option value="warning">warning</option>
                    <option value="info">info</option>
                    <option value="critical">critical</option>
                  </select>
                  <button
                    onClick={() => {
                      const updated = JSON.parse(content)
                      updated.filler_words.splice(i, 1)
                      setContent(JSON.stringify(updated, null, 2))
                    }}
                    className="text-red-400 hover:text-red-600 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Talk ratio */}
          {parsedContent.talk_ratio && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Talk Ratio</h3>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Max rep talk time:</span>
                <input
                  type="number"
                  className="border border-gray-200 rounded-md px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  value={parsedContent.talk_ratio.max_rep_percentage}
                  onChange={e => {
                    const updated = JSON.parse(content)
                    updated.talk_ratio.max_rep_percentage = parseInt(e.target.value) || 0
                    setContent(JSON.stringify(updated, null, 2))
                  }}
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw JSON editor */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-3 text-sm">Raw JSON</h3>
        <textarea
          className="w-full h-96 font-mono text-xs border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
        />
        {(() => { try { JSON.parse(content); return null } catch { return <p className="text-xs text-red-500 mt-1">Invalid JSON</p> } })()}
      </div>
    </div>
  )
}
