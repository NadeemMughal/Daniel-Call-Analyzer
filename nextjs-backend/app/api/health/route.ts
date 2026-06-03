import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { error } = await supabase.from('team_members').select('id').limit(1)
  return NextResponse.json({
    ok: !error,
    service: 'call-analyzer-nextjs-backend',
    db: error ? error.message : 'connected',
  })
}
