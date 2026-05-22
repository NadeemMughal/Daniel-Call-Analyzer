import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabase } from '@/lib/supabase'

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!
const TOKEN_TTL  = 7 * 24 * 3600

const CREDENTIALS: Record<string, string> = {
  'ai@webuildtrades.com':         'WBT-Ammar-2026!',
  'aisupport@webuildtrades.com':  'WBT-Ammar-2026!',
  'jas@webuildtrades.com':        'WBT-Jas-2026!',
  'zain@webuildtrades.com':       'WBT-Zain-2026!',
  'daniel@webuildtrades.com':     'WBT-Daniel-2026!',
}

function signToken(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig    = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export async function OPTIONS() {
  return new Response(null, { status: 204 })
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })

  const normalised = (email as string).toLowerCase().trim()
  const expected   = CREDENTIALS[normalised]
  if (!expected || password !== expected) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

  const { data: member, error } = await supabase
    .from('team_members')
    .select('id, name, email, role, department_id, departments(name)')
    .ilike('email', normalised)
    .maybeSingle()

  if (error || !member) return NextResponse.json({ error: 'No team member found for this email' }, { status: 403 })

  const now   = Math.floor(Date.now() / 1000)
  const token = signToken({ sub: member.id, email: member.email, role: member.role, department_id: member.department_id ?? null, iat: now, exp: now + TOKEN_TTL })

  return NextResponse.json({ access_token: token, member: { id: member.id, name: member.name, email: member.email, role: member.role, department_id: member.department_id, departments: member.departments } })
}
