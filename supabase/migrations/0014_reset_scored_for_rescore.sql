-- =============================================================
-- 0014_reset_scored_for_rescore.sql
-- Reset all currently-scored calls back to pending so they get
-- re-scored by the updated pipeline (which now extracts full
-- intelligence: attendees, key points, decisions, action items,
-- talk time, coaching priorities, meeting effectiveness, etc.)
-- =============================================================

-- Delete all scorecard evidence first (CASCADE would handle this
-- but being explicit for safety)
DELETE FROM scorecard_evidence
WHERE scorecard_id IN (SELECT id FROM scorecards);

-- Delete all scorecards
DELETE FROM scorecards;

-- Reset all scored/failed calls to pending
UPDATE calls
SET status = 'pending'
WHERE status IN ('scored', 'failed', 'processing');

-- Confirm counts
SELECT
  status,
  COUNT(*) as count
FROM calls
GROUP BY status
ORDER BY status;
