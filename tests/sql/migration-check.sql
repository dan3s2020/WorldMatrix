\set ON_ERROR_STOP 0
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
-- player 1
set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into players (id, name, role) values ('11111111-1111-1111-1111-111111111111', 'Neo', 'guard')
  on conflict (id) do update set id = excluded.id, name = excluded.name, role = excluded.role;
insert into players (id, name, role) values ('11111111-1111-1111-1111-111111111111', 'Neo One', 'villain')
  on conflict (id) do update set id = excluded.id, name = excluded.name, role = excluded.role;
select 'own player row', name, role from players;
insert into players (id, name) values ('22222222-2222-2222-2222-222222222222', 'Fake');   -- expect RLS error
insert into players (id, name) values ('11111111-1111-1111-1111-111111111111', 'x');      -- expect check / conflict error
insert into actions (kind, payload) values ('vote', '{"dilemma":1,"choice":"abort"}') returning id, player_id;
insert into actions (kind, payload, player_id) values ('vote', '{}', '22222222-2222-2222-2222-222222222222'); -- expect RLS error
insert into actions (kind, payload) values ('admin', '{}');                                   -- expect check error
select 'private rows visible to client', count(*) from world_private;                         -- expect permission denied
select 'public rows', count(*) from world_public;
update world_public set tick = 99;                                                            -- expect permission denied
insert into actions (kind) select 'villain' from generate_series(1, 9);                      -- expect rate limited
reset role;
set role anon;
select 'anon public', count(*) from world_public;
select 'anon decisions', count(*) from decisions;
insert into actions (kind) values ('vote');                                                   -- expect denied
reset role;
set role service_role;
insert into world_private (id, state, version) values (1, '{}', 1);
update world_private set version = 2 where id = 1 and version = 1 returning version;
update world_public set tick = 5 where id = 1;
insert into decisions (record) values ('{"type":"route"}');
update actions set processed = true where not processed returning id;
reset role;
select 'cron jobs', name, schedule from cron.jobs;
-- globes (second migration)
set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select 'globe for player 1', join_globe(1);
update players set shard = 99;                                               -- expect permission denied (column)
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into players (id, name) values ('22222222-2222-2222-2222-222222222222', 'Morpheus');
select 'globe for player 2', join_globe(1);
reset role;
