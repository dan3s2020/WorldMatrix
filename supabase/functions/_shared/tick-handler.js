// World clock for Supabase: for every globe (shard) with players —
// load -> apply queued actions -> advance -> save -> publish; plus the main summary.
// Plain JavaScript (runs in the Supabase Edge Runtime and in Node tests).
import { createService, upsertPlayer, applyAction, advance, publicState, agentsDetail, takeDecisionLog, ACTIVE_MS } from './engine/world-service.js';
import { mainSummary } from './engine/shards.js';
import { createQNet } from './engine/policy.js';
import { CHECKPOINT } from './engine/checkpoint.js';

const policy = createQNet({ weights: CHECKPOINT.weights }).policy;

export async function runTick({ url, serviceKey, fetchImpl = fetch, now = Date.now(), tickMs = 1000, maxTicks = 30 }) {
  const rest = async (path, init = {}) => {
    const res = await fetchImpl(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
    });
    if (!res.ok) throw new Error(`${init.method || 'GET'} ${path.split('?')[0]} -> ${res.status} ${await res.text()}`);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  };

  const rows = await rest('world_private?select=id,state,version');
  const loaded = Object.fromEntries(rows.map(r => [r.id, r]));

  const since = new Date(now - ACTIVE_MS).toISOString();
  const players = await rest(`players?select=id,name,role,trained,last_seen,shard&last_seen=gt.${encodeURIComponent(since)}`);
  const actions = await rest('actions?processed=eq.false&select=id,player_id,kind,payload,created_at&order=id.asc&limit=300');
  // Globe of each acting player (they may have gone quiet since).
  const shardOf = Object.fromEntries(players.map(p => [p.id, p.shard || 1]));
  const unknown = [...new Set(actions.map(a => a.player_id).filter(id => !(id in shardOf)))];
  if (unknown.length) for (const p of await rest(`players?select=id,shard&id=in.(${unknown.join(',')})`)) shardOf[p.id] = p.shard || 1;

  const active = new Set([1, ...players.map(p => p.shard || 1)]);
  const services = {};
  for (const [id, r] of Object.entries(loaded)) if (r.state) services[id] = r.state;
  const report = { ok: true, globes: 0, ticks: 0, actions: actions.length, players: players.length, decisions: 0, skipped: [] };
  const decisions = [];
  const saved = [];

  for (const id of active) {
    const row = loaded[id];
    const svc = services[id] || (services[id] = createService({ seed: `world:${now}:${id}` }));
    for (const p of players) if ((p.shard || 1) === id) upsertPlayer(svc, p.id, { name: p.name, role: p.role, trained: p.trained }, Date.parse(p.last_seen));
    for (const a of actions) if ((shardOf[a.player_id] || 1) === id) applyAction(svc, a.player_id, { ...(a.payload || {}), kind: a.kind, aid: a.id }, Date.parse(a.created_at));
    const last = svc.lastTickAt || now - tickMs;
    const n = Math.max(1, Math.min(maxTicks, Math.round((now - last) / tickMs)));
    advance(svc, n, policy, now);
    svc.lastTickAt = Math.max(last + n * tickMs, now - maxTicks * tickMs);
    for (const record of takeDecisionLog(svc)) decisions.push({ record: { shard: id, ...record } });

    // Optimistic concurrency per globe: if another invocation saved first, skip this globe.
    const stamp = new Date(now).toISOString();
    if (!row) {
      try { await rest('world_private', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id, state: svc, version: 1, updated_at: stamp }) }); }
      catch { report.skipped.push(id); continue; }
    } else {
      const ok = await rest(`world_private?id=eq.${id}&version=eq.${row.version}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ state: svc, version: row.version + 1, updated_at: stamp }) });
      if (!ok.length) { report.skipped.push(id); continue; }
    }
    saved.push(id);
    report.globes++; report.ticks += n;
  }
  if (!saved.length) return { ok: false, skipped: 'concurrent update' };

  const main = mainSummary(services, now);
  const stamp = new Date(now).toISOString();
  for (const id of saved) {
    const svc = services[id];
    await rest('world_public?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, tick: svc.world.tick, state: { ...publicState(svc, now), shard: id, main }, agents: agentsDetail(svc), updated_at: stamp }) });
  }
  const done = actions.filter(a => saved.includes(shardOf[a.player_id] || 1)).map(a => a.id);
  if (done.length) await rest(`actions?id=in.(${done.join(',')})`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ processed: true }) });
  if (decisions.length) await rest('decisions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(decisions) });
  report.decisions = decisions.length;
  report.tick = services[1]?.world.tick ?? 0;
  report.main = main;
  return report;
}
