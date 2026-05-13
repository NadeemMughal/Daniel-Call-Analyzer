import { Router, Response } from 'express';
import { assistRubricEdit } from '../services/rubricAssist.js';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { current_criteria, user_request } = req.body;
  if (!user_request || typeof user_request !== 'string') {
    res.status(400).json({ error: 'user_request string is required' });
    return;
  }

  try {
    const suggestion = await assistRubricEdit(current_criteria ?? [], user_request);
    res.json({ suggestion });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
