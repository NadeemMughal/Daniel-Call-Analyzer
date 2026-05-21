-- Demote Jas Nijjar from admin to manager
update team_members
set role = 'manager'
where email ilike 'jas%@webuildtrades.com' and role = 'admin';
