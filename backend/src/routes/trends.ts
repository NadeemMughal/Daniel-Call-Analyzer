import { Router, Response } from 'express';
import { supabase } from '../db/client.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/:member_id', requireAuth, async (req: AuthRequest, res: Response) => {
  const { member_id } = req.params;

  if (req.user!.role === 'rep' && req.user!.id !== member_id) {
    res.status(403).json({ error: 'Cannot view other members\' trends' });
    return;
  }

  const { data, error } = await supabase
    .from('member_trends')
    .select('*')
    .eq('member_id', member_id)
    .order('period_end', { ascending: false })
    .limit(1)
    .single();

  if (error) { res.status(404).json({ error: 'No trend data found for this member' }); return; }
  res.json(data);
});

export default router;
