// One client interface, three hosts:
//   supabase : the hosted public world (site/config.js or ?supabase=URL&key=KEY)
//   ws       : the self-hosted Node server (server/server.mjs) on the same origin or ?server=wss://…
//   local    : an offline world running inside this browser tab
// All three run the same engine/world-service.js rules.

import { CONFIG } from './config.js';
import { createService, upsertPlayer, applyAction, advance, publicState, agentsDetail, publicPlayer } from '../engine/world-service.js';
import { createQNet } from '../engine/policy.js';
import { mainSummary } from '../engine/shards.js';

function emitter() {
  const h = {};
  return { on: (e, f) => ((h[e] ||= new Set()).add(f), () => h[e].delete(f)), emit: (e, d) => h[e]?.forEach(f => f(d)) };
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
};

export async function connect({ weights, profile }) {
  const q = new URLSearchParams(location.search);
  const sbUrl = q.get('supabase') || CONFIG.supabaseUrl;
  const sbKey = q.get('key') || CONFIG.supabaseAnonKey;
  if (q.get('mode') !== 'local') {
    if (sbUrl && sbKey) {
      try { return await connectSupabase(sbUrl.replace(/\/$/, ''), sbKey, profile); } catch (e) { console.warn('Supabase unavailable, falling back', e); }
    }
    const wsUrl = q.get('server') || (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io') ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws` : null);
    if (wsUrl) {
      try { return await connectWs(wsUrl, profile); } catch { /* fall back to local */ }
    }
  }
  return connectLocal(weights, profile);
}

// ------------------------------------------------------------------ local
function connectLocal(weights, profile) {
  const ev = emitter();
  const policy = createQNet({ weights }).policy;
  const saved = store.get('wm-local-world');
  const svc = saved && saved.v === 1 ? saved : createService({ seed: `local:${Date.now()}` });
  const id = store.get('wm-local-id') || uuid();
  store.set('wm-local-id', id);
  upsertPlayer(svc, id, profile);
  let timer = 0, saveTimer = 0;
  const publish = () => { ev.emit('state', { ...publicState(svc), shard: 1, main: mainSummary({ 1: svc }) }); ev.emit('you', publicPlayer(svc.players[id])); };
  const loop = () => { svc.players[id].lastSeen = Date.now(); advance(svc, 1, policy); publish(); };
  timer = setInterval(loop, 1000);
  saveTimer = setInterval(() => store.set('wm-local-world', svc), 20000);
  setTimeout(publish, 0);
  const act = a => { const r = applyAction(svc, id, { ...a, aid: uuid() }); ev.emit('result', r); publish(); return r; };
  return {
    mode: 'local', on: ev.on,
    hello: p => { upsertPlayer(svc, id, p); publish(); },
    vote: (dilemma, choice) => act({ kind: 'vote', dilemma, choice }),
    villain: (attack, city) => act({ kind: 'villain', attack, city }),
    route: payload => act({ kind: 'route', ...payload }),
    agents: async () => agentsDetail(svc),
    close: () => { clearInterval(timer); clearInterval(saveTimer); store.set('wm-local-world', svc); }
  };
}

// ------------------------------------------------------------------ websocket (self-hosted)
function connectWs(url, profile) {
  return new Promise((resolve, reject) => {
    const ev = emitter();
    let ws, opened = false, agentsWaiter = null, closed = false;
    const timeout = setTimeout(() => { if (!opened) { try { ws.close(); } catch { /* ignore */ } reject(new Error('timeout')); } }, 3000);
    const api = {
      mode: 'ws', on: ev.on,
      hello: p => send({ t: 'hello', ...p }),
      vote: (dilemma, choice) => send({ t: 'vote', dilemma, choice, aid: uuid() }),
      villain: (attack, city) => send({ t: 'villain', attack, city, aid: uuid() }),
      route: payload => send({ t: 'route', ...payload, aid: uuid() }),
      agents: () => new Promise(res => { agentsWaiter = res; send({ t: 'agents' }); }),
      close: () => { closed = true; ws.close(); }
    };
    const send = m => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
    const open = () => {
      ws = new WebSocket(url);
      ws.onopen = () => {
        opened = true; clearTimeout(timeout);
        send({ t: 'hello', ...profile });
        resolve(api);
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.state) { ev.emit('status', 'live'); ev.emit('state', m.state); }
        if (m.you) ev.emit('you', m.you);
        if (m.t === 'result') ev.emit('result', m.result);
        if (m.t === 'agents') agentsWaiter?.(m.agents);
        if (m.t === 'error') ev.emit('result', { ok: false, error: m.error });
      };
      ws.onerror = () => { if (!opened) { clearTimeout(timeout); reject(new Error('ws error')); } };
      ws.onclose = () => { if (opened && !closed) { ev.emit('status', 'reconnecting'); setTimeout(open, 2000); } };
    };
    open();
  });
}

// ------------------------------------------------------------------ Supabase (hosted)
async function connectSupabase(url, key, profile) {
  const ev = emitter();
  let session = store.get('wm-sb-session');

  async function auth(path, body) {
    const r = await fetch(`${url}/auth/v1/${path}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`auth ${path}: ${r.status} ${await r.text()}`);
    const s = await r.json();
    session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user_id: s.user?.id };
    store.set('wm-sb-session', session);
  }
  async function ensureSession() {
    if (!session?.access_token) return auth('signup', { data: {} }); // anonymous sign-in
    if (session.expires_at - 60 < Date.now() / 1000) {
      try { await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token }); } catch { session = null; await auth('signup', { data: {} }); }
    }
  }
  async function rest(path, init = {}) {
    await ensureSession();
    const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    if (r.status === 401) { session = null; store.set('wm-sb-session', null); }
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  await ensureSession();
  const shortId = String(session.user_id).slice(0, 8);
  let me = { ...profile };
  const upsertMe = () => rest('players?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: session.user_id, name: me.name, role: me.role, trained: !!me.trained }) });
  await upsertMe();
  // Join a globe with room (max 20 players each). Every globe feeds the main simulation.
  let shard = 1;
  try { shard = Number(await rest('rpc/join_globe', { method: 'POST', body: JSON.stringify({ max_players: 20 }) })) || 1; } catch { /* older database without globes: globe 1 */ }

  let lastTick = -1, stopped = false;
  const pending = new Map(); // action id -> kind
  async function poll() {
    if (stopped) return;
    try {
      const rows = await rest(`world_public?id=eq.${shard}&select=tick,state&tick=gt.${lastTick}`);
      if (rows?.length && rows[0].state) {
        lastTick = rows[0].tick;
        const st = rows[0].state;
        ev.emit('state', st);
        if (st.active?.[shortId]) ev.emit('you', st.active[shortId]);
        for (const r of st.results || []) if (r.aid != null && pending.has(r.aid)) { pending.delete(r.aid); ev.emit('result', r); }
      }
      ev.emit('status', 'live');
    } catch (e) { ev.emit('status', 'reconnecting'); }
    setTimeout(poll, document.hidden ? 8000 : 2000);
  }
  poll();
  const heartbeat = setInterval(() => upsertMe().catch(() => {}), 20000);

  async function act(kind, payload) {
    try {
      const rows = await rest('actions', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ kind, payload }) });
      pending.set(rows[0].id, kind);
      ev.emit('queued', { kind, id: rows[0].id });
    } catch (e) {
      ev.emit('result', { ok: false, kind, error: /rate limited/.test(String(e)) ? 'rate limited' : 'network error' });
    }
  }
  return {
    mode: 'supabase', on: ev.on,
    hello: p => { me = { ...me, ...p }; upsertMe().catch(() => {}); },
    vote: (dilemma, choice) => act('vote', { dilemma, choice }),
    villain: (attack, city) => act('villain', { attack, city }),
    route: payload => act('route', payload),
    agents: async () => (await rest(`world_public?id=eq.${shard}&select=agents`))?.[0]?.agents || [],
    close: () => { stopped = true; clearInterval(heartbeat); }
  };
}
