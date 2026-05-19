/**
 * Pulls real calls from Fathom API and ingests them into the Call Analyzer pipeline.
 *
 * Usage:
 *   node scripts/ingest-from-fathom.mjs            # ingest latest 5 calls
 *   node scripts/ingest-from-fathom.mjs 10          # ingest latest 10 calls
 *   node scripts/ingest-from-fathom.mjs 5 <cursor>  # paginate
 *
 * Requires n8n workflow 01-ingest to be ACTIVE in n8n dashboard.
 * For testing with inactive workflow use --test flag (hits webhook-test endpoint).
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// Load env from root .env
let env = {}
try {
  const raw = readFileSync(resolve(__dir, '../.env'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"#\n]+)"?/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
} catch {}

const FATHOM_API_KEY = env.FATHOM_API_KEY || 'K-HPjs0BOjDorjFRHVD6uQ.JLh6tRksEYkNbzTcRVyQqYsT81mqF9lQVKILdOsIdX4'
const N8N_BASE      = (env.N8N_BASE_URL || 'https://n8nserver.metaviz.pro').replace(/\/$/, '')

const args   = process.argv.slice(2)
const isTest = args.includes('--test')
const posArgs = args.filter(a => !a.startsWith('--'))
const LIMIT  = parseInt(posArgs[0] || '5', 10)
const CURSOR = posArgs[1] || ''

const WEBHOOK_PATH = isTest ? 'webhook-test' : 'webhook'
const N8N_URL      = `${N8N_BASE}/${WEBHOOK_PATH}/fathom-call-completed`

// ── helpers ──────────────────────────────────────────────────────────────────

function tsToSeconds(ts = '00:00:00') {
  const [h, m, s] = ts.split(':').map(Number)
  return h * 3600 + m * 60 + (s || 0)
}

function transformForN8n(meeting) {
  const segs = meeting.transcript || []

  const fullTranscript = segs
    .map(s => `${s.speaker.display_name}: ${s.text}`)
    .join('\n')

  const segments = segs.map((seg, i) => {
    const startSec = tsToSeconds(seg.timestamp)
    const nextSec  = segs[i + 1] ? tsToSeconds(segs[i + 1].timestamp) : startSec + 3
    return {
      speaker:    seg.speaker.display_name,
      start_time: startSec,
      end_time:   nextSec,
      text:       seg.text,
    }
  })

  const start    = new Date(meeting.recording_start_time)
  const end      = new Date(meeting.recording_end_time)
  const duration = Math.round((end - start) / 1000)

  const attendees = (meeting.calendar_invitees || []).map(inv => ({
    name:  inv.name,
    email: inv.email || '',
  }))

  return {
    id:           String(meeting.recording_id),
    meeting_title: meeting.title,
    transcript: { full_transcript: fullTranscript, segments },
    recording_url: meeting.share_url || meeting.url || null,
    start_time:   meeting.recording_start_time,
    duration,
    attendees,
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function fetchMeetings() {
  const params = new URLSearchParams({ include_transcript: 'true', limit: String(LIMIT) })
  if (CURSOR) params.set('cursor', CURSOR)

  const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${params}`, {
    headers: { 'X-Api-Key': FATHOM_API_KEY },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Fathom API ${res.status}: ${txt}`)
  }
  return res.json()
}

async function postToN8n(payload) {
  const res = await fetch(N8N_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  return { status: res.status, body: await res.text() }
}

async function main() {
  console.log(`\nFathom → n8n ingest`)
  console.log(`  Mode:    ${isTest ? 'TEST (webhook-test)' : 'LIVE (webhook)'}`)
  console.log(`  n8n URL: ${N8N_URL}`)
  console.log(`  Limit:   ${LIMIT} calls\n`)

  const data = await fetchMeetings()
  console.log(`Fetched ${data.items.length} calls from Fathom. Next cursor: ${data.next_cursor || 'none'}\n`)

  for (const meeting of data.items) {
    const payload = transformForN8n(meeting)
    const segCount = (meeting.transcript || []).length
    const names    = payload.attendees.map(a => a.name).join(', ') || '(no invitees)'

    console.log(`▸ [${meeting.recording_id}] ${meeting.title}`)
    console.log(`  Duration: ${payload.duration}s | Segments: ${segCount} | Attendees: ${names}`)

    try {
      const result = await postToN8n(payload)
      const icon   = result.status < 300 ? '✓' : '✗'
      console.log(`  ${icon} n8n → ${result.status} ${result.body.slice(0, 120)}`)
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`)
    }

    // 2s gap so n8n doesn't get flooded
    await new Promise(r => setTimeout(r, 2000))
    console.log()
  }

  if (data.next_cursor) {
    console.log('More calls available. Run:')
    console.log(`  node scripts/ingest-from-fathom.mjs ${LIMIT} "${data.next_cursor}"`)
  }
}

main().catch(err => { console.error(err.message); process.exit(1) })
