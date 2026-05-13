import { Request, Response, NextFunction } from 'express';
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

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  const { data: member } = await supabase
    .from('team_members')
    .select('id, role, department_id')
    .eq('supabase_user_id', user.id)
    .single();

  if (!member) {
    res.status(403).json({ error: 'Not a registered team member' });
    return;
  }

  req.user = { id: member.id, role: member.role, department_id: member.department_id };
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
