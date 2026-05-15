import { Router } from 'express'
import { supabase } from '../db/client.js'

const router = Router()

/**
 * GET /analytics/overview
 * Weekly call volume + avg score for the last N weeks.
 * Uses the get_weekly_stats Supabase RPC (0006 migration).
 */
router.get('/overview', async (req, res) => {
  try {
    const weeksBack = Math.min(parseInt(String(req.query.weeks ?? '8'), 10) || 8, 26)
    const { data, error } = await (supabase as any)
      .rpc('get_weekly_stats', { weeks_back: weeksBack })
    if (error) throw error
    res.json(data ?? [])
  } catch (err: any) {
    console.error('[analytics/overview]', err.message)
    res.status(500).json({ error: 'Failed to load weekly stats' })
  }
})

/**
 * GET /analytics/leaderboard
 * Team member rankings by avg score, with call count + trend.
 * Uses the get_team_leaderboard Supabase RPC (0006 migration).
 */
router.get('/leaderboard', async (_req, res) => {
  try {
    const { data, error } = await (supabase as any)
      .rpc('get_team_leaderboard')
    if (error) throw error
    res.json(data ?? [])
  } catch (err: any) {
    console.error('[analytics/leaderboard]', err.message)
    res.status(500).json({ error: 'Failed to load leaderboard' })
  }
})

export default router
