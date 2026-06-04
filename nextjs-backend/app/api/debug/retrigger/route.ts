import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Re-triggers scoring for all calls stuck as pending/failed that have a transcript.
// Protected by secret header. Call once after Supabase is restored.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-debug-secret')
  if (secret !== 'wbt-debug-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const n8nWebhook = process.env.N8N_BASE_URL
    ? `${process.env.N8N_BASE_URL}/webhook/call-scorecard`
    : null

  if (!n8nWebhook) {
    return NextResponse.json({ error: 'N8N_BASE_URL not set' }, { status: 500 })
  }

  // batch param limits how many to trigger per call (default 5 to respect Groq rate limits)
  const batch = Math.min(parseInt(new URL(req.url).searchParams.get('batch') ?? '5'), 20)

  // Find calls that are pending/failed and have a transcript
  const { data: calls, error } = await supabase
    .from('calls')
    .select('id, status, transcript_raw')
    .in('status', ['pending', 'failed'])
    .not('transcript_raw', 'is', null)
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const eligible = (calls ?? []).filter((c: any) => (c.transcript_raw || '').trim().length >= 50).slice(0, batch)

  const results: { id: string; triggered: boolean; error?: string }[] = []

  for (const call of eligible) {
    try {
      const r = await fetch(n8nWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: call.id }),
      })
      results.push({ id: call.id, triggered: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` })
      // Small delay between triggers to avoid hitting Groq rate limits on concurrent executions
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (e: any) {
      results.push({ id: call.id, triggered: false, error: e.message })
    }
  }

  return NextResponse.json({
    total_pending: (calls ?? []).length,
    eligible_with_transcript: eligible.length,
    triggered: results.filter(r => r.triggered).length,
    failed_to_trigger: results.filter(r => !r.triggered).length,
    results,
  })
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-debug-secret')
  if (secret !== 'wbt-debug-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('calls')
    .select('id, status, recorded_at, transcript_raw')
    .in('status', ['pending', 'failed'])
    .order('recorded_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    pending_or_failed: (data ?? []).length,
    calls: (data ?? []).map((c: any) => ({
      id: c.id,
      status: c.status,
      recorded_at: c.recorded_at,
      has_transcript: (c.transcript_raw || '').trim().length >= 50,
    })),
  })
}
