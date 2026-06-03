import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Temporary debug endpoint — diagnoses env vars and team_members table.
// Protected by a secret header; remove this file once login is confirmed working.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-debug-secret')
  if (secret !== 'wbt-debug-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? ''

  const envStatus = {
    SUPABASE_URL_set: supabaseUrl.length > 0,
    SUPABASE_URL_prefix: supabaseUrl.substring(0, 30),
    SUPABASE_SERVICE_ROLE_KEY_set: serviceKey.length > 0,
    SUPABASE_ANON_KEY_set: anonKey.length > 0,
    PORTAL_CREDENTIALS_set: (process.env.PORTAL_CREDENTIALS ?? '').length > 0,
    PORTAL_CREDENTIALS_keys: (() => { try { return Object.keys(JSON.parse(process.env.PORTAL_CREDENTIALS ?? '{}')).length } catch { return -1 } })(),
  }

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ env: envStatus, error: 'Missing Supabase env vars' }, { status: 500 })
  }

  // Raw fetch test to see if Supabase host is reachable at all
  let rawFetchStatus: string
  try {
    const ping = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(5000),
    })
    rawFetchStatus = `HTTP ${ping.status}`
  } catch (e: any) {
    rawFetchStatus = `FAILED: ${e.message}`
  }

  const client = createClient(supabaseUrl, serviceKey)
  const { data, error } = await client
    .from('team_members')
    .select('id, name, email, role')
    .order('name')

  if (error) return NextResponse.json({ env: envStatus, raw_fetch: rawFetchStatus, supabase_error: error.message }, { status: 500 })

  const portalKeys = (() => { try { return Object.keys(JSON.parse(process.env.PORTAL_CREDENTIALS ?? '{}')) } catch { return [] } })()

  const members = (data ?? []).map((m: any) => ({
    name: m.name,
    email: m.email,
    role: m.role,
    in_portal_creds: portalKeys.includes((m.email ?? '').toLowerCase()),
  }))

  return NextResponse.json({ env: envStatus, members, portal_cred_emails: portalKeys })
}
