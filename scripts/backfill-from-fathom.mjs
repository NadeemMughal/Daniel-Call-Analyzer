/**
 * Backfill all Fathom calls directly into Supabase, bypassing n8n ingest.
 * Inserts calls that don't already exist (deduped by source_id),
 * then triggers the classify webhook for each new call.
 *
 * Usage:
 *   node scripts/backfill-from-fathom.mjs          # all calls
 *   node scripts/backfill-from-fathom.mjs --dry-run # preview only, no inserts
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

let env = {}
try {
  const raw = readFileSync(resolve(__dir, '../.env'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"#\n]+)"?/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
} catch {}

const FATHOM_API_KEY   = env.FATHOM_API_KEY || 'K-HPjs0BOjDorjFRHVD6uQ.JLh6tRksEYkNbzTcRVyQqYsT81mqF9lQVKILdOsIdX4'
const SUPABASE_URL     = 'https://fybvnwidpnxnouaukrnb.supabase.co'
const SUPABASE_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YnZud2lkcG54bm91YXVrcm5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2NjM2NSwiZXhwIjoyMDkzNjQyMzY1fQ.sCP7tiT6_Pc_nME6HqmfH5PUZjaNzrfl45R8JK6Ay4c'
const N8N_BASE         = 'https://n8nserver.metaviz.pro'
const DRY_RUN          = process.argv.includes('--dry-run')

const SB_HEADERS = {
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
}

// ── helpers ──────────────────────────────────────────────────────────────────

function tsToSeconds(ts = '00:00:00') {
  const [h, m, s] = ts.split(':').map(Number)
  return h * 3600 + m * 60 + (s || 0)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Fathom ───────────────────────────────────────────────────────────────────

async function fetchAllFathomCalls() {
  const all = []
  let cursor = ''
  let page = 1

  while (true) {
    const params = new URLSearchParams({ include_transcript: 'true', limit: '10' })
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${params}`, {
      headers: { 'X-Api-Key': FATHOM_API_KEY },
    })
    if (!res.ok) throw new Error(`Fathom API ${res.status}: ${await res.text()}`)

    const data = await res.json()
    all.push(...data.items)
    console.log(`  Page ${page}: fetched ${data.items.length} calls (total so far: ${all.length})`)

    if (!data.next_cursor) break
    cursor = data.next_cursor
    page++
    await sleep(500)
  }

  return all
}

// ── Supabase ─────────────────────────────────────────────────────────────────

async function getExistingSourceIds() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/calls?select=source_id&source=eq.fathom`,
    { headers: SB_HEADERS }
  )
  if (!res.ok) throw new Error(`Supabase fetch existing: ${await res.text()}`)
  const rows = await res.json()
  return new Set(rows.map(r => r.source_id))
}

async function insertCall(meeting) {
  const segs = meeting.transcript || []
  const fullTranscript = segs.map(s => `${s.speaker.display_name}: ${s.text}`).join('\n')
  const segments = segs.map((seg, i) => ({
    speaker:    seg.speaker.display_name,
    start_time: tsToSeconds(seg.timestamp),
    end_time:   segs[i + 1] ? tsToSeconds(segs[i + 1].timestamp) : tsToSeconds(seg.timestamp) + 3,
    text:       seg.text,
  }))

  const start    = new Date(meeting.recording_start_time)
  const end      = new Date(meeting.recording_end_time)
  const duration = Math.round((end - start) / 1000)

  const body = {
    source:               'fathom',
    source_id:            String(meeting.recording_id),
    status:               'pending',
    transcript_raw:       fullTranscript,
    transcript_segments:  segments,
    audio_url:            meeting.share_url || meeting.url || null,
    recorded_at:          meeting.recording_start_time || null,
    duration_seconds:     duration,
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/calls`, {
    method:  'POST',
    headers: SB_HEADERS,
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Insert failed (${res.status}): ${txt}`)
  }
  const rows = await res.json()
  return rows[0]
}

async function triggerClassify(callId) {
  const res = await fetch(`${N8N_BASE}/webhook/call-classify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ call_id: callId }),
  })
  return res.status
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFathom → Supabase direct backfill`)
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no inserts)' : 'LIVE'}\n`)

  console.log('Fetching all Fathom calls...')
  const meetings = await fetchAllFathomCalls()
  console.log(`\nTotal calls from Fathom: ${meetings.length}`)

  console.log('Checking existing calls in Supabase...')
  const existing = await getExistingSourceIds()
  console.log(`Already in DB: ${existing.size}\n`)

  const toInsert = meetings.filter(m => !existing.has(String(m.recording_id)))
  console.log(`New calls to insert: ${toInsert.length}\n`)

  if (toInsert.length === 0) {
    console.log('Nothing to do — all Fathom calls already in Supabase.')
    return
  }

  let inserted = 0, failed = 0

  for (const meeting of toInsert) {
    const segs = (meeting.transcript || []).length
    console.log(`▸ [${meeting.recording_id}] ${meeting.title}`)
    console.log(`  Segments: ${segs} | Duration: ${Math.round((new Date(meeting.recording_end_time) - new Date(meeting.recording_start_time)) / 1000)}s`)

    if (DRY_RUN) {
      console.log(`  [DRY RUN] would insert\n`)
      continue
    }

    try {
      const row = await insertCall(meeting)
      console.log(`  ✓ Inserted → call id: ${row.id}`)

      // Trigger classify pipeline
      const status = await triggerClassify(row.id)
      console.log(`  ✓ Classify triggered → n8n ${status}`)
      inserted++
    } catch (err) {
      console.error(`  ✗ ${err.message}`)
      failed++
    }

    await sleep(2000)
    console.log()
  }

  console.log(`\nDone. Inserted: ${inserted} | Failed: ${failed}`)
  if (inserted > 0) {
    console.log('Calls are now in Supabase with status=pending.')
    console.log('The classify → rule-engine → scorecard → notify chain will run for each.')
  }
}

main().catch(err => { console.error(err.message); process.exit(1) })
