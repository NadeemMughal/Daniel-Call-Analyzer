import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Called by a cron job (or n8n schedule) every 3 days to keep the Supabase
// free-tier project active and prevent it from being paused.
export async function GET() {
  const { error } = await supabase.from('team_members').select('id').limit(1)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
