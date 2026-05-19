import { Router } from 'express'
import { supabase } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

/**
 * GET /analytics/overview
 * Weekly call volume + avg score for the last N weeks.
 * Uses the get_weekly_stats Supabase RPC (0006 migration).
 */
router.get('/overview', requireAuth, async (req, res) => {
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
router.get('/leaderboard', requireAuth, async (_req, res) => {
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

/**
 * GET /analytics/member-cards
 * Rich per-member stats for the dashboard card grid.
 * Uses the get_member_cards Supabase RPC (0008 migration).
 */
router.get('/member-cards', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await (supabase as any)
      .rpc('get_member_cards')
    if (error) throw error
    res.json(data ?? [])
  } catch (err: any) {
    console.error('[analytics/member-cards]', err.message)
    res.status(500).json({ error: 'Failed to load member cards' })
  }
})

/**
 * GET /analytics/clients
 * Per-client aggregated stats for the clients list page.
 * Uses the get_client_stats Supabase RPC (0008 migration).
 */
router.get('/clients', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await (supabase as any)
      .rpc('get_client_stats')
    if (error) throw error
    res.json(data ?? [])
  } catch (err: any) {
    console.error('[analytics/clients]', err.message)
    res.status(500).json({ error: 'Failed to load client stats' })
  }
})

export default router
