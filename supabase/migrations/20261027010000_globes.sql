-- WorldMatrix globes (shards): at most 20 players share one 3D globe; every globe
-- feeds the main simulation (combined summary + the open decisions dataset).
-- world_private / world_public rows are keyed by globe id (1, 2, 3, ...).

alter table public.players add column if not exists shard int not null default 1 check (shard between 1 and 10000);

-- Players may write their name / role / badge, never their globe (assigned below).
revoke insert, update on public.players from authenticated;
grant insert (id, name, role, trained) on public.players to authenticated;
grant update (id, name, role, trained) on public.players to authenticated; -- PostgREST upserts also SET the key column

-- Join (or stay on) a globe with room. Fills the fullest globe that is not full,
-- so people play together; opens a new globe when all are full.
create or replace function public.join_globe(max_players int default 20) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cur int;
  pick int;
  active interval := interval '45 seconds';
begin
  if me is null then raise exception 'not authenticated'; end if;
  max_players := least(greatest(max_players, 1), 50);
  select shard into cur from public.players where id = me;
  if cur is null then raise exception 'call after creating your player row'; end if;
  if (select count(*) from public.players where shard = cur and id <> me and last_seen > now() - active) < max_players then
    update public.players set last_seen = now() where id = me;
    return cur;
  end if;
  select s into pick from (
    select shard as s, count(*) as n from public.players where id <> me and last_seen > now() - active group by shard
  ) t where n < max_players order by n desc, s limit 1;
  if pick is null then
    select coalesce(max(shard), 0) + 1 into pick from public.players where id <> me and last_seen > now() - active;
  end if;
  update public.players set shard = pick, last_seen = now() where id = me;
  return pick;
end $$;
revoke all on function public.join_globe(int) from public, anon;
grant execute on function public.join_globe(int) to authenticated;
