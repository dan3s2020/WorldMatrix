-- WorldMatrix shared world on Supabase.
-- One authoritative world, advanced by the `world-tick` Edge Function (scheduled by Supabase Cron).
-- Players are anonymous Supabase Auth users (enable "Anonymous Sign-Ins" in Authentication -> Providers).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Private full state (contains hidden simulator variables). No client access.
create table if not exists public.world_private (
  id int primary key default 1,
  state jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.world_private enable row level security;

-- Public state polled by every client.
create table if not exists public.world_public (
  id int primary key default 1,
  tick bigint not null default 0,
  state jsonb,
  agents jsonb,
  updated_at timestamptz not null default now()
);
alter table public.world_public enable row level security;
create policy "world_public readable by everyone" on public.world_public for select to anon, authenticated using (true);
insert into public.world_public (id, tick) values (1, 0) on conflict do nothing;

-- Players: each anonymous user owns exactly one row.
create table if not exists public.players (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Guest' check (char_length(name) between 3 and 20 and name ~ '^[[:alnum:]_ -]+$'),
  role text not null default 'guard' check (role in ('guard', 'villain', 'observer')),
  trained boolean not null default false,
  last_seen timestamptz not null default now()
);
alter table public.players enable row level security;
create policy "players read own" on public.players for select to authenticated using (id = (select auth.uid()));
create policy "players insert own" on public.players for insert to authenticated with check (id = (select auth.uid()));
create policy "players update own" on public.players for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function public.players_touch() returns trigger language plpgsql as $$
begin
  new.last_seen := now();  -- never trust the client clock
  return new;
end $$;
drop trigger if exists players_touch on public.players;
create trigger players_touch before insert or update on public.players for each row execute function public.players_touch();

-- Action queue: votes, villain actions, Route Guard results. Validated by the game engine in world-tick.
create table if not exists public.actions (
  id bigint generated always as identity primary key,
  player_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('vote', 'villain', 'route')),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) < 4000),
  created_at timestamptz not null default now(),
  processed boolean not null default false
);
create index if not exists actions_pending on public.actions (id) where not processed;
alter table public.actions enable row level security;
create policy "actions insert own" on public.actions for insert to authenticated with check (player_id = (select auth.uid()) and processed = false);
create policy "actions read own" on public.actions for select to authenticated using (player_id = (select auth.uid()));

-- Rate limit: at most 8 actions per player per 10 seconds.
create or replace function public.actions_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.actions a where a.player_id = new.player_id and a.created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'rate limited' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists actions_rate_limit on public.actions;
create trigger actions_rate_limit before insert on public.actions for each row execute function public.actions_rate_limit();

-- Open human-oversight dataset: every resolved decision and Route Guard result.
create table if not exists public.decisions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  record jsonb not null
);
alter table public.decisions enable row level security;
create policy "decisions readable by everyone" on public.decisions for select to anon, authenticated using (true);

-- Explicit Data API grants (Supabase no longer exposes new tables automatically; RLS still applies).
revoke all on public.world_private from anon, authenticated;
grant select, insert, update, delete on public.world_private to service_role;
grant select on public.world_public to anon, authenticated;
grant select, insert, update, delete on public.world_public to service_role;
grant select, insert, update on public.players to authenticated;
grant select, insert, update, delete on public.players to service_role;
grant select, insert on public.actions to authenticated;
grant select, insert, update, delete on public.actions to service_role;
grant select on public.decisions to anon, authenticated;
grant select, insert, update, delete on public.decisions to service_role;
grant usage, select on sequence public.actions_id_seq to authenticated, service_role;
grant usage, select on sequence public.decisions_id_seq to service_role;

-- Housekeeping: processed actions older than one day are deleted.
select cron.schedule('worldmatrix-cleanup', '17 * * * *', $$ delete from public.actions where processed and created_at < now() - interval '1 day' $$);

-- The world clock. Run AFTER storing two Vault secrets (see docs/SUPABASE.md):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as WORLD_TICK_SECRET>', 'world_tick_secret');
-- then:
--   select cron.schedule('worldmatrix-tick', '6 seconds', $$
--     select net.http_post(
--       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/world-tick',
--       headers := jsonb_build_object('Content-Type', 'application/json',
--                  'x-tick-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'world_tick_secret')),
--       body := '{}'::jsonb) $$);
