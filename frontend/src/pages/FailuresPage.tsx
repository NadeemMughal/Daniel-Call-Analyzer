import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, Clock, GitBranch, RefreshCw } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface FailedExecution {
  id: string
  workflow_id: string | null
  workflow_name: string | null
  execution_id: string | null
  node_name: string | null
  error_message: string | null
  error_stack: string | null
  payload_excerpt: any
  created_at: string
}

export default function FailuresPage() {
  const [rows, setRows] = useState<FailedExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tableMissing, setTableMissing] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('failed_executions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error && /not find the table/i.test(error.message)) {
      setTableMissing(true)
    } else if (data) {
      setRows(data as FailedExecution[])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (tableMissing) {
    return (
      <div className="min-h-screen p-12 max-w-3xl mx-auto fade-up">
        <div className="card p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
          <h2 className="text-white text-lg font-semibold mb-2">Failure log not initialised</h2>
          <p className="text-gray-400 text-sm">
            Run <code className="text-amber-400">supabase/migrations/0005_failed_executions.sql</code> in
            the Supabase SQL Editor to create the <code className="text-amber-400">failed_executions</code> table.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto fade-up">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-400 font-medium uppercase tracking-wider">Pipeline Health</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Recent Failures</h1>
          <p className="text-gray-500 text-sm mt-1">
            Every workflow that errored gets a row here. {rows.length === 0 ? 'All clear right now.' : `${rows.length} entries.`}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[hsl(222,47%,8%)] border border-[hsl(222,32%,18%)] rounded-md text-sm text-gray-300 hover:text-white hover:border-[hsl(222,32%,28%)] transition"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="card p-16 text-center text-gray-500">Loading failures…</div>
      ) : rows.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-gray-300 font-medium mb-1">No failures recorded</p>
          <p className="text-gray-500 text-xs">The pipeline is running clean. New failures appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const isOpen = expanded === r.id
            return (
              <div key={r.id} className="card border-l-4 border-red-500/40 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full px-5 py-4 text-left hover:bg-white/[0.02] transition flex items-start gap-4"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/10 text-red-400 shrink-0">FAIL</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-white text-sm truncate">
                        {r.node_name || 'unknown node'}
                      </span>
                      {r.workflow_name && (
                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                          <GitBranch className="w-3 h-3" /> {r.workflow_name}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-500 ml-auto flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatDateTime(r.created_at)}
                      </span>
                    </div>
                    <p className="text-gray-300 text-[13px] leading-relaxed">{r.error_message || 'No error message.'}</p>
                  </div>
                </button>
                {isOpen && r.error_stack && (
                  <pre className="px-5 pb-4 text-[11px] font-mono text-gray-400 whitespace-pre-wrap overflow-auto max-h-72 border-t border-[hsl(222,32%,15%)] pt-3 bg-[hsl(222,47%,5%)]">
                    {r.error_stack}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
