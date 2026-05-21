-- =============================================================
-- 0012_create_clients_from_participants.sql  (v3)
-- =============================================================
-- Uses team_member_id IS NULL as the proxy for "external participant"
-- because n8n never populated is_external=true — it just left
-- team_member_id blank for non-WBT attendees.
-- =============================================================

-- ── Step 0: Mark external participants (backfill is_external) ─────────────────
UPDATE call_participants
SET is_external = true
WHERE team_member_id IS NULL
  AND is_external IS NOT TRUE;

-- ── Step 1: Create clients from business email domains ────────────────────────

INSERT INTO clients (name, leadhub_id, created_at)
WITH personal_domains AS (
  SELECT unnest(ARRAY[
    'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
    'live.com','msn.com','aol.com','protonmail.com','googlemail.com',
    'yahoo.co.uk','hotmail.co.uk','outlook.co.uk','me.com',
    'mail.com','ymail.com','zoho.com'
  ]) AS domain
),
external_by_domain AS (
  SELECT
    LOWER(TRIM(SPLIT_PART(cp.email, '@', 2))) AS email_domain
  FROM call_participants cp
  WHERE cp.team_member_id IS NULL           -- external = not a WBT team member
    AND cp.email IS NOT NULL
    AND cp.email LIKE '%@%'
    AND LOWER(TRIM(SPLIT_PART(cp.email, '@', 2))) NOT IN (SELECT domain FROM personal_domains)
    AND LOWER(TRIM(SPLIT_PART(cp.email, '@', 2))) != 'webuildtrades.com'
    AND LOWER(TRIM(SPLIT_PART(cp.email, '@', 2))) != ''
  GROUP BY LOWER(TRIM(SPLIT_PART(cp.email, '@', 2)))
)
SELECT
  INITCAP(REPLACE(REPLACE(SPLIT_PART(email_domain, '.', 1), '-', ' '), '_', ' ')) AS name,
  email_domain AS leadhub_id,
  NOW()        AS created_at
FROM external_by_domain
WHERE email_domain IS NOT NULL
  AND email_domain != ''
ON CONFLICT DO NOTHING;

-- ── Step 2: Create clients from personal emails that appear in 2+ calls ───────

INSERT INTO clients (name, leadhub_id, created_at)
WITH personal_domains AS (
  SELECT unnest(ARRAY[
    'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
    'live.com','msn.com','aol.com','protonmail.com','googlemail.com',
    'yahoo.co.uk','hotmail.co.uk','outlook.co.uk','me.com',
    'mail.com','ymail.com','zoho.com'
  ]) AS domain
),
personal_contacts AS (
  SELECT
    LOWER(TRIM(cp.email))      AS email,
    MIN(cp.name)               AS contact_name,
    COUNT(DISTINCT cp.call_id) AS call_count
  FROM call_participants cp
  WHERE cp.team_member_id IS NULL
    AND cp.email IS NOT NULL
    AND cp.email LIKE '%@%'
    AND LOWER(TRIM(SPLIT_PART(cp.email, '@', 2))) IN (SELECT domain FROM personal_domains)
  GROUP BY LOWER(TRIM(cp.email))
  HAVING COUNT(DISTINCT cp.call_id) >= 2
)
SELECT
  COALESCE(NULLIF(TRIM(contact_name), ''), SPLIT_PART(email, '@', 1)) AS name,
  email AS leadhub_id,
  NOW() AS created_at
FROM personal_contacts
ON CONFLICT DO NOTHING;

-- ── Step 3: Link calls to clients via external participant email domain ────────

UPDATE calls c
SET client_id = matched.client_id
FROM (
  SELECT DISTINCT ON (cp.call_id)
    cp.call_id,
    cl.id AS client_id
  FROM call_participants cp
  JOIN clients cl
    ON cl.leadhub_id = LOWER(TRIM(SPLIT_PART(cp.email, '@', 2)))
    OR cl.leadhub_id = LOWER(TRIM(cp.email))
  WHERE cp.team_member_id IS NULL
    AND cp.email IS NOT NULL
  ORDER BY cp.call_id, cl.leadhub_id ASC
) matched
WHERE c.id = matched.call_id
  AND c.client_id IS NULL;

-- ── Verify results ────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM clients)                        AS total_clients,
  (SELECT COUNT(*) FROM calls WHERE client_id IS NOT NULL) AS calls_linked,
  (SELECT COUNT(*) FROM call_participants WHERE team_member_id IS NULL) AS external_participants;
