-- =============================================================
-- 0013_remove_finance_department.sql
-- Remove Finance department and its placeholder team member
-- =============================================================

-- Unlink any calls from Finance department first (set to NULL)
UPDATE calls SET department_id = NULL
WHERE department_id = '00000000-0000-0000-0000-000000000013';

-- Remove Finance placeholder team member
DELETE FROM team_members
WHERE id = '00000000-0000-0000-0001-00000000000A';

-- Remove Finance department
DELETE FROM departments
WHERE id = '00000000-0000-0000-0000-000000000013';
