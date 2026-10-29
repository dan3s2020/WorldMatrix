// Runs the real Supabase Edge Function logic (supabase/functions/_shared/tick-handler.js)
// against tests/fake-supabase.mjs, with players acting through the REST API the
// browser client uses. Also checks the Edge Function's engine copy is up to date.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { startFakeSupabase } from './fake-supabase.mjs';
import { runTick } from '../supabase/functions/_shared/tick-handler.js';

test('supabase/functions/_shared/engine matches engine/ (run scripts/sync-supabase.mjs)', () => {
  for (const f of fs.readdirSync('engine').filter(f => f.endsWith('.js'))) {
    assert.equal(fs.readFileSync(`supabase/functions/_shared/engine/${f}`, 'utf8'), fs.readFileSync(`engine/${f}`, 'utf8'), `${f} is stale`);
  }
  const ck = JSON.parse(fs.readFileSync('engine/checkpoints/default.json', 'utf8'));
  assert.ok(fs.readFileSync('supabase/functions/_shared/engine/checkpoint.js', 'utf8').includes(ck.hash));
});

test('hosted world: anonymous players, queued actions, tick function, open dataset', async t => {
  const sb = await startFakeSupabase();
  t.after(() => sb.close());
  const anon = async (path, init = {}, token) => {
    const r = await fetch(`${sb.url}${path}`, { ...init, headers: { apikey: sb.anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
    const txt = await r.text();
    return { status: r.status, body: txt ? JSON.parse(txt) : null };
  };
  const join = async (name, role) => {
    const s = (await anon('/auth/v1/signup', { method: 'POST', body: '{"data":{}}' })).body;
    const r = await anon('/rest/v1/players?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: s.user.id, name, role }) }, s.access_token);
    assert.equal(r.status, 201);
    return { id: s.user.id, token: s.access_token };
  };
  const act = (p, kind, payload) => anon('/rest/v1/actions', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ kind, payload }) }, p.token);
  const tickAt = now => runTick({ url: sb.url, serviceKey: sb.serviceKey, now });

  let now = Date.now();
  const first = await tickAt(now);
  assert.equal(first.ok, true);
  assert.equal(sb.db.world_private.length, 1, 'world created on first tick');

  const neo = await join('Neo', 'guard');
  const smith = await join('Smith', 'villain');
  // Clients can never touch the private world or impersonate others.
  assert.equal((await anon('/rest/v1/world_private?select=state', {}, neo.token)).body.length, 0);
  assert.equal((await anon('/rest/v1/actions', { method: 'POST', body: JSON.stringify({ kind: 'vote', payload: {}, player_id: smith.id }) }, neo.token)).status, 403);
  assert.equal((await anon('/rest/v1/actions', { method: 'POST', body: JSON.stringify({ kind: 'admin', payload: {} }) }, neo.token)).status, 400);

  const atk = await act(smith, 'villain', { attack: 'worm', city: 'ro' });
  assert.equal(atk.status, 201);
  now += 1000;
  const t2 = await tickAt(now);
  assert.equal(t2.actions, 1);
  assert.equal(t2.players, 2);
  let pub = (await anon('/rest/v1/world_public?id=eq.1&select=tick,state', {}, neo.token)).body[0];
  const res = pub.state.results.find(r => r.aid === atk.body[0].id);
  assert.ok(res?.ok, 'the villain action result is published for the polling client');
  assert.equal(pub.state.online, 2);
  assert.ok(pub.state.active[smith.id.slice(0, 8)], 'client finds itself by short id');
  assert.ok(!JSON.stringify(pub).includes('"episode"'), 'no hidden state in world_public');

  // Run the clock until a dilemma reaches World-Guard, then vote through the queue.
  let d = null;
  for (let i = 0; i < 400 && !d; i++) {
    now += 6000; // a 6-second cron step = 6 simulated hours
    await tickAt(now);
    if (i % 5 === 0) await join(`Bot${i}`, 'observer').catch(() => {});
    await anon('/rest/v1/players?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: neo.id, name: 'Neo', role: 'guard' }) }, neo.token);
    pub = (await anon('/rest/v1/world_public?id=eq.1&select=state', {}, neo.token)).body[0];
    d = pub.state.world.dilemmas[0];
  }
  assert.ok(d, 'a dilemma appeared');
  const vote = await act(neo, 'vote', { dilemma: d.id, choice: d.options[0].id });
  now += 1000;
  await tickAt(now);
  pub = (await anon('/rest/v1/world_public?id=eq.1&select=state', {}, neo.token)).body[0];
  const vr = pub.state.results.find(r => r.aid === vote.body[0].id);
  assert.ok(vr?.ok && !vr.pending, `vote applied: ${JSON.stringify(vr)}`);
  const decisions = (await anon('/rest/v1/decisions?select=record', {}, null)).body;
  assert.ok(decisions.some(x => x.record.type === 'dilemma'), 'decisions are readable by anyone (open dataset)');

  // Rate limit from the migration trigger.
  let limited = false;
  for (let i = 0; i < 10; i++) if ((await act(smith, 'villain', { attack: 'worm', city: 'ro' })).body?.message === 'rate limited') limited = true;
  assert.ok(limited, 'actions are rate limited');

  // Two overlapping invocations: only one may save.
  const saved = sb.db.world_private[0].version;
  const [a, b] = await Promise.all([tickAt(now + 1000), tickAt(now + 1000)]);
  assert.equal([a, b].filter(x => x.ok).length, 1, 'optimistic concurrency');
  assert.equal(sb.db.world_private[0].version, saved + 1);
});

test('edge function entry point requires the tick secret', () => {
  const src = fs.readFileSync('supabase/functions/world-tick/index.ts', 'utf8');
  assert.match(src, /x-tick-secret/);
  assert.match(src, /403/);
  // Script runs and is idempotent.
  execFileSync(process.execPath, ['scripts/sync-supabase.mjs']);
});

test('globes: at most N players per globe, each globe ticks and publishes, main summary covers all', async t => {
  const sb = await startFakeSupabase();
  t.after(() => sb.close());
  const call = async (path, init = {}, token) => {
    const r = await fetch(`${sb.url}${path}`, { ...init, headers: { apikey: sb.anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
    const txt = await r.text();
    return { status: r.status, body: txt ? JSON.parse(txt) : null };
  };
  const globes = [];
  for (let i = 0; i < 5; i++) {
    const s = (await call('/auth/v1/signup', { method: 'POST', body: '{}' })).body;
    await call('/rest/v1/players?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: s.user.id, name: `P${i}xx`, role: 'guard', shard: 7 }) }, s.access_token);
    globes.push((await call('/rest/v1/rpc/join_globe', { method: 'POST', body: '{"max_players":2}' }, s.access_token)).body);
  }
  assert.deepEqual(globes, [1, 1, 2, 2, 3], 'fill a globe, then open the next; clients cannot pick their globe');
  const r = await runTick({ url: sb.url, serviceKey: sb.serviceKey });
  assert.equal(r.globes, 3);
  assert.equal(r.main.globes, 3);
  assert.equal(r.main.online, 5);
  for (const g of [1, 2, 3]) {
    const row = sb.db.world_public.find(x => x.id === g);
    assert.ok(row?.state, `globe ${g} published`);
    assert.equal(row.state.shard, g);
    assert.equal(row.state.main.online, 5, 'every globe sees the main simulation');
  }
  assert.equal(sb.db.world_public.find(x => x.id === 3).state.online, 1);
});
