import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../db/client.js';

const router = Router();

// Known team credentials — no external auth service needed
const CREDENTIALS: Record<string, string> = {
  'ai@webuildtrades.com':     'WBT-Ammar-2026!',
  'aisupport@webuildtrades.com': 'WBT-Ammar-2026!',
  'jas@webuildtrades.com':    'WBT-Jas-2026!',
  'zain@webuildtrades.com':   'WBT-Zain-2026!',
  'daniel@webuildtrades.com': 'WBT-Daniel-2026!',
};

export const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TOKEN_TTL = 7 * 24 * 3600; // 7 days

export function signToken(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig    = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, any>;
    if (payload['exp'] && payload['exp'] < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalised = email.toLowerCase().trim();
  const expected   = CREDENTIALS[normalised];
  if (!expected || password !== expected) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Look up team member via data API (never touches auth API)
  const { data: member, error } = await supabase
    .from('team_members')
    .select('id, name, email, role, department_id, departments(name)')
    .ilike('email', normalised)
    .maybeSingle();

  if (error || !member) {
    return res.status(403).json({ error: 'No team member account found for this email' });
  }

  const now   = Math.floor(Date.now() / 1000);
  const token = signToken({
    sub:           member.id,
    email:         member.email,
    role:          member.role,
    department_id: member.department_id ?? null,
    iat:           now,
    exp:           now + TOKEN_TTL,
  });

  return res.json({
    access_token: token,
    member: {
      id:              member.id,
      name:            member.name,
      email:           member.email,
      role:            member.role,
      department_id:   member.department_id,
      departments:     member.departments,
    },
  });
});

export default router;
