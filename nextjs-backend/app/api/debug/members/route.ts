import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Temporary debug endpoint — returns team_members emails to diagnose login mismatches.
// Protected by a secret header; remove this file once login is confirmed working.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-debug-secret')
  if (secret !== 'wbt-debug-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, email, role')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const envCreds = (() => {
    try { return Object.keys(JSON.parse(process.env.PORTAL_CREDENTIALS ?? '{}')) } catch { return [] }
  })()

  const members = (data ?? []).map((m: any) => ({
    name: m.name,
    email: m.email,
    role: m.role,
    in_portal_creds: envCreds.includes((m.email ?? '').toLowerCase()),
  }))

  return NextResponse.json({ members, portal_cred_emails: envCreds })
}
