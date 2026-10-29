-- Public launch: trigger functions must not be callable through PostgREST RPC.
-- Trigger execution remains permitted inside PostgreSQL.
revoke execute on function public.actions_rate_limit() from public, anon, authenticated;

-- Fix the trigger function's mutable search_path without changing its body.
alter function public.players_touch() set search_path = pg_catalog, public;
