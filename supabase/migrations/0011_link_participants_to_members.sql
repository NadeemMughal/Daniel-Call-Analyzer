-- =============================================================
-- 0011_link_participants_to_members.sql
-- =============================================================
-- All call_participants rows have email/name but team_member_id = NULL.
-- This means member cards show 0 calls for everyone and the dashboard
-- shows no data for managers/reps (they scope by team_member_id).
--
-- Fix: populate team_member_id by matching on email (case-insensitive).
-- Also adds participants for the 4 manually-ingested scored calls,
-- and sets recorded_at / department_id on those calls.
-- =============================================================

-- 1. Link existing participants to team members by email
UPDATE call_participants cp
SET team_member_id = tm.id
FROM team_members tm
WHERE LOWER(TRIM(cp.email)) = LOWER(TRIM(tm.email))
  AND cp.team_member_id IS NULL;

-- 2. Add Jas as internal participant on the 3 manually-scored Jas calls
--    (M1=4ac5379a-faeb, M2=2d174704, M4=c3e998a7-32e4)
INSERT INTO call_participants (call_id, team_member_id, name, email, is_external)
SELECT c.id,
       tm.id,
       tm.name,
       tm.email,
       false
FROM calls c
CROSS JOIN team_members tm
WHERE c.id IN (
    '4ac5379a-faeb-40be-aed0-94f762ed616c',
    '2d174704-8c6f-481d-a2b0-b5ce02a82fd5',
    'c3e998a7-32e4-46e7-80dc-f92f760a04b7'
  )
  AND tm.email = 'jas@webuildtrades.com'
  AND NOT EXISTS (
    SELECT 1 FROM call_participants x
    WHERE x.call_id = c.id AND x.team_member_id = tm.id
  );

-- Add Zain + Daniel to M3
INSERT INTO call_participants (call_id, team_member_id, name, email, is_external)
SELECT 'f6ca49c8-7d04-443b-b3b0-56ae3eef6ebf',
       tm.id, tm.name, tm.email, false
FROM team_members tm
WHERE tm.email IN ('zain@webuildtrades.com', 'daniel@webuildtrades.com')
  AND NOT EXISTS (
    SELECT 1 FROM call_participants x
    WHERE x.call_id = 'f6ca49c8-7d04-443b-b3b0-56ae3eef6ebf'
      AND x.team_member_id = tm.id
  );

-- 3. Set recorded_at for the 4 manually-scored calls (they show NULL)
UPDATE calls SET recorded_at = '2026-05-19T10:00:00Z' WHERE id = '4ac5379a-faeb-40be-aed0-94f762ed616c' AND recorded_at IS NULL;
UPDATE calls SET recorded_at = '2026-05-19T14:00:00Z' WHERE id = '2d174704-8c6f-481d-a2b0-b5ce02a82fd5' AND recorded_at IS NULL;
UPDATE calls SET recorded_at = '2026-05-15T09:00:00Z' WHERE id = 'f6ca49c8-7d04-443b-b3b0-56ae3eef6ebf' AND recorded_at IS NULL;
UPDATE calls SET recorded_at = '2026-05-19T15:00:00Z' WHERE id = 'c3e998a7-32e4-46e7-80dc-f92f760a04b7' AND recorded_at IS NULL;

-- 4. Set department_id on those calls (Sales dept)
UPDATE calls
SET department_id = '00000000-0000-0000-0000-000000000001'
WHERE id IN (
    '4ac5379a-faeb-40be-aed0-94f762ed616c',
    '2d174704-8c6f-481d-a2b0-b5ce02a82fd5',
    'f6ca49c8-7d04-443b-b3b0-56ae3eef6ebf',
    'c3e998a7-32e4-46e7-80dc-f92f760a04b7'
  )
  AND department_id IS NULL;

-- 5. Backfill department_id on all other calls from their internal participant
UPDATE calls c
SET department_id = (
  SELECT tm.department_id
  FROM call_participants cp
  JOIN team_members tm ON tm.id = cp.team_member_id
  WHERE cp.call_id = c.id
    AND cp.is_external = false
    AND tm.department_id IS NOT NULL
  ORDER BY cp.created_at ASC
  LIMIT 1
)
WHERE c.department_id IS NULL;
