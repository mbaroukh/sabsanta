-- Les Edge Functions écrivent avec le rôle service_role. Sur le cloud, avec « Automatically expose new tables »
-- désactivé, les tables créées par les migrations n'ont AUCUN droit par défaut : il faut les accorder.
-- (En local, Supabase accorde ces droits d'office, d'où un oubli invisible jusque-là.)
-- anon et authenticated restent sans accès direct aux tables (révoqués dans la migration init).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
