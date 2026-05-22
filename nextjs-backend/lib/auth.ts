import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { supabase } from './supabase'

export interface AuthUser {
  id: string
  role: string
  department_id?: string
}

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!

function verifyToken(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, any>
    if (payload['exp'] && payload['exp'] < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null

  // 1. Try custom JWT first (fast, no network call)
  const custom = verifyToken(token)
  if (custom && custom['sub']) {
    return {
      id:            custom['sub'] as string,
      role:          custom['role'] as string,
      department_id: custom['department_id'] as string | undefined,
    }
  }

  // 2. Fallback: Supabase JWT
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    const { data: member } = await supabase
      .from('team_members')
      .select('id, role, department_id, supabase_user_id')
      .or(`supabase_user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle()

    if (!member) return null

    if (!member.supabase_user_id) {
      supabase.from('team_members').update({ supabase_user_id: user.id }).eq('id', member.id).then(() => {})
    }

    return { id: member.id, role: member.role, department_id: member.department_id }
  } catch {
    return null
  }
}

export function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

export function forbidden(msg = 'Access denied') {
  return Response.json({ error: msg }, { status: 403 })
}
