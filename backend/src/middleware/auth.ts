import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../routes/auth.js';
import { supabase } from '../db/client.js';

export interface AuthRequest extends Request {
  user?: { id: string; role: string; department_id?: string };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  // 1. Try custom JWT first (fast, no network call)
  const custom = verifyToken(token);
  if (custom) {
    req.user = {
      id:            custom['sub'] as string,
      role:          custom['role'] as string,
      department_id: custom['department_id'] as string | undefined,
    };
    return next();
  }

  // 2. Fall back: try Supabase JWT (for any existing sessions)
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const { data: member } = await supabase
      .from('team_members')
      .select('id, role, department_id, supabase_user_id')
      .or(`supabase_user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    if (!member) {
      res.status(403).json({ error: 'Not a registered team member' });
      return;
    }

    if (!member.supabase_user_id) {
      supabase.from('team_members').update({ supabase_user_id: user.id }).eq('id', member.id).then(() => {});
    }

    req.user = { id: member.id, role: member.role, department_id: member.department_id };
    next();
  } catch {
    res.status(401).json({ error: 'Token verification failed' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
