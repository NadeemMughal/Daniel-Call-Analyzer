import { Router, Response } from 'express';
import { supabase } from '../db/client.js';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (_req, res: Response) => {
  const { data, error } = await supabase
    .from('rubrics')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.get('/active', requireAuth, async (_req, res: Response) => {
  const { data, error } = await supabase
    .from('rubrics')
    .select('*')
    .eq('is_active', true)
    .single();
  if (error) { res.status(404).json({ error: 'No active rubric found' }); return; }
  res.json(data);
});

router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { name, version, content } = req.body;
  if (!name || !content) { res.status(400).json({ error: 'name and content are required' }); return; }

  const { data, error } = await supabase
    .from('rubrics')
    .insert({ name, version: version ?? 1, content, is_active: false })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.put('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, content, is_active } = req.body;

  if (is_active) {
    await supabase.from('rubrics').update({ is_active: false }).neq('id', id);
  }

  const { data, error } = await supabase
    .from('rubrics')
    .update({ ...(name && { name }), ...(content && { content }), ...(is_active !== undefined && { is_active }) })
    .eq('id', id)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
