-- Minimal Supabase-like environment for testing the migration.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create schema cron; create table cron.jobs (name text, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.jobs values (n, s, c); select 1::bigint $$;
-- New Supabase projects: no automatic grants on new tables.
alter default privileges in schema public revoke all on tables from public;
