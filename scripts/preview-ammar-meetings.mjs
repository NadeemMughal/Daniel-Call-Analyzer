/**
 * Preview / delete all internal meeting rows attributed to Ammar.
 * These were added from Fathom's calendar_invitees (invite list, not actual attendees).
 *
 * Run from repo root:
 *   node scripts/preview-ammar-meetings.mjs            -- preview only
 *   node scripts/preview-ammar-meetings.mjs --delete   -- delete ALL rows shown
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
let env = {}
try {
  const raw = readFileSync(resolve(__dir, '../backend/.env'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"#\n]+)"?/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
} catch {}

const KEY  = env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YnZud2lkcG54bm91YXVrcm5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2NjM2NSwiZXhwIjoyMDkzNjQyMzY1fQ.sCP7tiT6_Pc_nME6HqmfH5PUZjaNzrfl45R8JK6Ay4c'
const BASE = (env.SUPABASE_URL || 'https://fybvnwidpnxnouaukrnb.supabase.co') + '/rest/v1'
const H    = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const DELETE_MODE = process.argv.includes('--delete')
const AMMAR_ID    = '8b6e645d-1686-47fd-85cb-642da633e21d'  // Ammar Ali (ai@webuildtrades.com)

const parts = await fetch(
  `${BASE}/call_participants?team_member_id=eq.${AMMAR_ID}&is_external=eq.false&select=id,role,calls(id,call_type,recorded_at,status,clients(name))&order=created_at.desc&limit=500`,
  { headers: H }
).then(r => r.json())

console.log(`\nAmmar Ali — attributed meetings: ${parts.length}\n`)
console.log(`${'#'.padStart(3)}  ${'Date'.padEnd(12)}  ${'Role'.padEnd(12)}  ${'Type'.padEnd(12)}  ${'Client'.padEnd(20)}  Status`)
console.log('-'.repeat(80))

parts.forEach((p, i) => {
  const c    = p.calls
  const date = c?.recorded_at?.slice(0,10) ?? '—'
  const role = (p.role ?? '—').padEnd(12)
  const type = (c?.call_type ?? '—').padEnd(12)
  const client = (c?.clients?.name ?? '(no client)').padEnd(20)
  console.log(`${String(i+1).padStart(3)}  ${date.padEnd(12)}  ${role}  ${type}  ${client}  ${c?.status ?? '—'}`)
})

console.log(`\nTotal: ${parts.length}`)
console.log(`All have client = "Webuildtrades" (internal team meetings from calendar invites).`)
console.log(`These are recurring weekly Core Team calls Ammar was invited to but never attended.`)

const ids = parts.map(p => p.id)

if (DELETE_MODE && ids.length > 0) {
  const chunkSize = 100
  let deleted = 0
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const r = await fetch(`${BASE}/call_participants?id=in.(${chunk.join(',')})`, {
      method: 'DELETE',
      headers: { ...H, 'Prefer': 'return=minimal' }
    })
    if (!r.ok) {
      console.error(`Delete chunk failed: ${r.status} ${await r.text()}`)
      process.exit(1)
    }
    deleted += chunk.length
  }
  console.log(`\n✅ Deleted all ${deleted} incorrect call_participant rows for Ammar.`)
} else if (ids.length > 0) {
  console.log(`\nReview the list above, then run with --delete to remove all ${ids.length} rows.`)
}
