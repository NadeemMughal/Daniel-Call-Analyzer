/**
 * Syncs Fathom meeting participants into Supabase call_participants + clients tables.
 *
 * Strategy: fetch DB source_ids first, then paginate Fathom and stop early
 * once all source_ids have been matched — avoids needlessly fetching 1000+ pages.
 *
 * For each matched call:
 *   - @webuildtrades.com addresses → internal (linked to team_members)
 *   - All other attendees → external (is_external=true, client-side)
 *   - Creates client records from external email domains
 *   - Links calls.client_id to the created/existing client
 *
 * Usage:
 *   node scripts/sync-participants.mjs            # sync all unprocessed calls
 *   node scripts/sync-participants.mjs --dry-run  # preview only, no writes
 *   node scripts/sync-participants.mjs --all      # re-process even calls that already have participants
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

const FATHOM_API_KEY = env.FATHOM_API_KEY || 'K-HPjs0BOjDorjFRHVD6uQ.JLh6tRksEYkNbzTcRVyQqYsT81mqF9lQVKILdOsIdX4'
const SUPABASE_URL   = 'https://fybvnwidpnxnouaukrnb.supabase.co'
const SUPABASE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YnZud2lkcG54bm91YXVrcm5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2NjM2NSwiZXhwIjoyMDkzNjQyMzY1fQ.sCP7tiT6_Pc_nME6HqmfH5PUZjaNzrfl45R8JK6Ay4c'

const INTERNAL_DOMAIN  = 'webuildtrades.com'
const FREE_EMAIL_HOSTS = new Set([
  'gmail.com','googlemail.com','hotmail.com','hotmail.co.uk',
  'outlook.com','yahoo.com','yahoo.co.uk','icloud.com',
  'me.com','protonmail.com','live.com','msn.com',
])

const DRY_RUN    = process.argv.includes('--dry-run')
const REPROCESS  = process.argv.includes('--all')
const MAX_PAGES  = 1500  // safety limit — Fathom API returns ~10/page, need ~120 pages per 1000 calls

const SB = {
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbFetch(url, opts, label) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await fetch(url, opts)
      if (res.ok) return res
      const text = await res.text()
      if (attempt < 8) { console.log(`\n  SB ${res.status} on ${label} — retry ${attempt}/8…`); await sleep(2000 * attempt); continue }
      throw new Error(`${label}: ${text}`)
    } catch (e) {
      if (attempt < 8) { console.log(`\n  SB fetch error on ${label} — retry ${attempt}/8…`); await sleep(2000 * attempt) }
      else throw e
    }
  }
}

async function sbGet(path) {
  const all = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const sep = path.includes('?') ? '&' : '?'
    const url = `${SUPABASE_URL}/rest/v1/${path}${sep}limit=${PAGE}&offset=${offset}`
    const res = await sbFetch(url, { headers: { ...SB, 'Prefer': 'count=exact' } }, `GET ${path}`)
    const rows = await res.json()
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

async function sbPost(path, body) {
  const res = await sbFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST', headers: SB, body: JSON.stringify(body),
  }, `POST ${path}`)
  if (!res.ok) throw new Error(`POST ${path}: ${await res.text()}`)
  return res.json()
}

async function sbPatch(path, body) {
  await sbFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...SB, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  }, `PATCH ${path}`)
}

// ── Fathom helpers ────────────────────────────────────────────────────────────

async function fetchFathomPage(cursor = '') {
  const params = new URLSearchParams({ include_transcript: 'false', limit: '10' })
  if (cursor) params.set('cursor', cursor)

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${params}`, {
      headers: { 'X-Api-Key': FATHOM_API_KEY },
    })
    if (res.ok) return res.json()
    const waitMs = Math.min(2000 * attempt, 15000)
    if (attempt < 5) {
      console.log(`\n  Fathom ${res.status} — waiting ${waitMs/1000}s then retrying (${attempt}/5)…`)
      await sleep(waitMs)
      continue
    }
    throw new Error(`Fathom ${res.status} after ${attempt} attempts`)
  }
}

// ── Client name extraction ────────────────────────────────────────────────────

function domainToClientName(domain) {
  const TLD = new Set(['com','co','uk','au','nz','net','org','io','biz','info','us','ca'])
  const parts = domain.toLowerCase().split('.')
  const base  = parts.filter(p => !TLD.has(p))
  return (base.length ? base : [parts[0]])
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function extractDomain(email) {
  const at = (email || '').indexOf('@')
  return at >= 0 ? email.slice(at + 1).toLowerCase() : null
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFathom → Supabase participant sync`)
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}${REPROCESS ? ' | --all (reprocess existing)' : ''}\n`)

  // ── 1. Load Supabase data ──────────────────────────────────────────────────
  console.log('Loading Supabase data…')
  const [sbCalls, sbMembers, sbParticipants, sbClients] = await Promise.all([
    sbGet('calls?select=id,source_id,client_id'),
    sbGet('team_members?select=id,name,email'),
    sbGet('call_participants?select=call_id,email'),
    sbGet('clients?select=id,name'),
  ])

  // Skip calls that already have participants (unless --all)
  const callsWithParticipants = new Set(sbParticipants.map(p => p.call_id))
  const targetCalls = REPROCESS
    ? sbCalls
    : sbCalls.filter(c => !callsWithParticipants.has(c.id))

  console.log(`  Total calls in DB:              ${sbCalls.length}`)
  console.log(`  Calls needing participants:      ${targetCalls.length}`)
  console.log(`  Team members:                   ${sbMembers.length}`)
  console.log(`  Existing clients:               ${sbClients.length}\n`)

  if (targetCalls.length === 0) {
    console.log('All calls already have participants. Use --all to reprocess.')
    return
  }

  // Build lookups
  const memberByEmail  = new Map(sbMembers.map(m => [m.email.toLowerCase(), m]))
  const existingParts  = new Set(sbParticipants.map(p => `${p.call_id}|${(p.email||'').toLowerCase()}`))
  const clientByName   = new Map(sbClients.map(c => [c.name, c.id]))

  // Source_ids we're hunting for — skip null/empty/"undefined" values
  const validCalls      = targetCalls.filter(c => c.source_id && c.source_id !== 'undefined' && c.source_id !== 'null')
  const neededSourceIds = new Set(validCalls.map(c => String(c.source_id)))
  const callBySourceId  = new Map(validCalls.map(c => [String(c.source_id), c]))
  const skippedNoId     = targetCalls.length - validCalls.length
  if (skippedNoId > 0) console.log(`  (${skippedNoId} call(s) have no valid source_id — skipping)\n`)

  console.log(`Hunting for ${neededSourceIds.size} source_id(s) in Fathom…`)
  if (neededSourceIds.size <= 10) {
    for (const id of neededSourceIds) console.log(`  → ${id}`)
  }
  console.log()

  // ── 2. Paginate Fathom until all source_ids found ──────────────────────────
  const matchedMeetings = new Map()  // source_id → meeting
  let cursor = ''
  let page   = 0

  while (neededSourceIds.size > 0 && page < MAX_PAGES) {
    page++
    process.stdout.write(`\r  Page ${page}: ${matchedMeetings.size}/${targetCalls.length} matched`)

    let data
    try {
      data = await fetchFathomPage(cursor)
    } catch (err) {
      console.log(`\n  Fathom error on page ${page}: ${err.message}`)
      console.log('  Stopping Fathom fetch — will process what we have so far.')
      break
    }

    const items = data.items || []
    if (items.length === 0) break

    for (const meeting of items) {
      const sid = String(meeting.recording_id)
      if (neededSourceIds.has(sid)) {
        matchedMeetings.set(sid, meeting)
        neededSourceIds.delete(sid)
      }
    }

    if (!data.next_cursor) break
    cursor = data.next_cursor
    await sleep(600)  // 600ms between pages to stay well under rate limits
  }

  process.stdout.write('\n')
  console.log(`\nFathom scan complete: ${page} page(s), ${matchedMeetings.size}/${targetCalls.length} matched\n`)

  if (matchedMeetings.size === 0) {
    console.log('No matches found. The calls in Supabase may not exist in this Fathom account.')
    console.log('Check that FATHOM_API_KEY belongs to the same account that recorded those calls.')
    return
  }

  // ── 3. Process matched meetings ────────────────────────────────────────────
  const pendingParticipants = []
  let clientsCreated = 0
  let callsLinked    = 0

  for (const [sourceId, meeting] of matchedMeetings) {
    const call     = callBySourceId.get(sourceId)
    const invitees = meeting.calendar_invitees || []

    console.log(`▸ [${sourceId}] "${meeting.title || '(no title)'}" — ${invitees.length} invitee(s)`)

    if (invitees.length === 0) {
      console.log('  (no calendar_invitees — skipping participant rows)')
      continue
    }

    let externalDomain = null

    for (const inv of invitees) {
      const email  = (inv.email || '').trim().toLowerCase()
      const name   = (inv.name  || '').trim()
      const domain = extractDomain(email)
      const isInternal = domain === INTERNAL_DOMAIN
      const member     = email ? memberByEmail.get(email) : null
      const dedupKey   = `${call.id}|${email}`

      if (existingParts.has(dedupKey)) continue

      // Skip internal members who were on the calendar invite but never joined.
      // matched_speaker_display_name is null when someone was invited but did not speak/attend.
      // recorded_by is always the actual Fathom user who ran the recording — always include them.
      const isRecordedBy  = meeting.recorded_by?.email?.toLowerCase() === email
      const actuallySpoke = inv.matched_speaker_display_name !== null && inv.matched_speaker_display_name !== undefined
      if (isInternal && !isRecordedBy && !actuallySpoke) {
        console.log(`   ⚪ ${name || '(no name)'} <${email || 'no email'}> → skipped (invited but did not attend)`)
        continue
      }

      const label = isInternal
        ? `member: ${member ? member.name : `unknown (${email})`}`
        : `external`

      console.log(`   ${isInternal ? '🟢' : '🔵'} ${name || '(no name)'} <${email || 'no email'}> → ${label}`)

      pendingParticipants.push({
        call_id:        call.id,
        team_member_id: member?.id ?? null,
        name:           name || null,
        email:          email || null,
        role:           isInternal ? 'host' : 'guest',
        is_external:    !isInternal,
      })
      existingParts.add(dedupKey)

      if (!isInternal && domain && !FREE_EMAIL_HOSTS.has(domain) && !externalDomain) {
        externalDomain = domain
      }
    }

    // Client creation + linking
    if (externalDomain && !call.client_id) {
      const clientName = domainToClientName(externalDomain)
      let clientId = clientByName.get(clientName)

      if (!clientId) {
        console.log(`   📁 New client: "${clientName}" (from ${externalDomain})`)
        if (!DRY_RUN) {
          try {
            const [created] = await sbPost('clients', { name: clientName })
            clientId = created.id
            clientByName.set(clientName, clientId)
            clientsCreated++
          } catch (e) {
            console.log(`   ⚠ Client insert failed: ${e.message}`)
          }
        }
      } else {
        console.log(`   📁 Existing client: "${clientName}"`)
      }

      if (clientId && !DRY_RUN) {
        try {
          await sbPatch(`calls?id=eq.${call.id}`, { client_id: clientId })
          callsLinked++
          console.log(`   🔗 call → "${clientName}"`)
        } catch (e) {
          console.log(`   ⚠ Client link failed: ${e.message}`)
        }
      }
    }
  }

  console.log()

  // ── 4. Batch-insert participants ───────────────────────────────────────────
  if (pendingParticipants.length === 0) {
    console.log('No new participant rows to insert.')
  } else if (DRY_RUN) {
    console.log(`[DRY RUN] Would insert ${pendingParticipants.length} participant row(s).`)
    pendingParticipants.forEach(p =>
      console.log(`  ${p.is_external ? '🔵' : '🟢'} ${p.name} <${p.email}> → call ${p.call_id.slice(0,8)}…`)
    )
  } else {
    console.log(`Inserting ${pendingParticipants.length} participant row(s)…`)
    const CHUNK = 100
    let inserted = 0
    for (let i = 0; i < pendingParticipants.length; i += CHUNK) {
      await sbPost('call_participants', pendingParticipants.slice(i, i + CHUNK))
      inserted += Math.min(CHUNK, pendingParticipants.length - i)
      process.stdout.write(`\r  Inserted ${inserted}/${pendingParticipants.length}`)
    }
    process.stdout.write('\n')
  }

  // ── 5. Summary ─────────────────────────────────────────────────────────────
  const unmatched = targetCalls.filter(c => !matchedMeetings.has(String(c.source_id)))
  console.log('\n=== SUMMARY ===')
  console.log(`  Fathom pages scanned:        ${page}`)
  console.log(`  Calls matched to Fathom:     ${matchedMeetings.size} / ${targetCalls.length}`)
  if (unmatched.length > 0) {
    console.log(`  Unmatched calls:             ${unmatched.length}`)
    unmatched.forEach(c => console.log(`    - ${c.source_id} (call ${c.id.slice(0,8)}…)`))
  }
  console.log(`  Participants inserted:        ${DRY_RUN ? `${pendingParticipants.length} (dry run)` : pendingParticipants.length}`)
  console.log(`  Clients created:             ${DRY_RUN ? '(dry run)' : clientsCreated}`)
  console.log(`  Calls linked to client:      ${DRY_RUN ? '(dry run)' : callsLinked}`)

  if (!DRY_RUN && pendingParticipants.length > 0) {
    console.log('\n✓ Done. Refresh the dashboard to see member call counts.')
  }
}

main().catch(err => { console.error('\n' + err.message); process.exit(1) })
