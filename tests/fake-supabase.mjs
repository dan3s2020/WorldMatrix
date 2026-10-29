// A small in-memory stand-in for the parts of Supabase WorldMatrix uses:
//   POST /auth/v1/signup (anonymous), POST /auth/v1/token?grant_type=refresh_token,
//   PostgREST /rest/v1/<table> with eq/gt/in filters, select, order, limit, upsert,
//   plus the row-level rules and triggers from supabase/migrations/*.sql.
// It lets the tests run the real Edge Function code and the real browser client
// end-to-end without a Supabase project. It is NOT a full PostgREST.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

export async function startFakeSupabase({ port = 0, anonKey = 'anon-key', serviceKey = 'service-key' } = {}) {
  const db = { world_private: [], world_public: [{ id: 1, tick: 0, state: null, agents: null, updated_at: new Date().toISOString() }], players: [], actions: [], decisions: [] };
  const seq = { actions: 1, decisions: 1 };
  const tokens = new Map(); // access token -> user id
  const stats = { signups: 0, requests: 0 };

  const json = (res, code, body, extra = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  function parseFilters(params) {
    const f = [];
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const [op, ...rest] = v.split('.');
      const val = rest.join('.');
      f.push({ col: k, op, val });
    }
    return f;
  }
  const cmp = (a, b) => (typeof a === 'number' ? a - Number(b) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
  function match(row, f) {
    return f.every(({ col, op, val }) => {
      const x = row[col];
      if (op === 'eq') return String(x) === val;
      if (op === 'gt') return col.endsWith('_seen') || col.endsWith('_at') ? Date.parse(x) > Date.parse(val) : cmp(x, val) > 0;
      if (op === 'in') return val.replace(/[()]/g, '').split(',').includes(String(x));
      throw new Error(`unsupported filter ${op}`);
    });
  }
  const pick = (row, select) => (!select || select === '*' ? { ...row } : Object.fromEntries(select.split(',').map(c => [c, row[c]])));

  // Row-level security as written in the migration.
  function canRead(table, uid, row) {
    if (uid === 'service') return true;
    if (table === 'world_public' || table === 'decisions') return true;
    if (table === 'players' || table === 'actions') return uid && (row.id === uid || row.player_id === uid);
    return false;
  }

  const server = http.createServer(async (req, res) => {
    stats.requests++;
    if (req.method === 'OPTIONS') return json(res, 204, undefined, { 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' });
    const url = new URL(req.url, 'http://x');
    let body = '';
    for await (const c of req) body += c;
    const data = body ? JSON.parse(body) : null;
    const apikey = req.headers.apikey;
    if (apikey !== anonKey && apikey !== serviceKey) return json(res, 401, { message: 'Invalid API key' });

    if (url.pathname === '/auth/v1/signup' || url.pathname === '/auth/v1/token') {
      let uid;
      if (url.pathname === '/auth/v1/signup') { uid = randomUUID(); stats.signups++; }
      else {
        const old = [...tokens.entries()].find(([t]) => `r-${t}` === data?.refresh_token);
        if (!old) return json(res, 400, { error: 'invalid refresh token' });
        uid = old[1];
      }
      const token = randomUUID();
      tokens.set(token, uid);
      return json(res, 200, { access_token: token, refresh_token: `r-${token}`, expires_in: 3600, user: { id: uid, is_anonymous: true } });
    }

    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (rpc) {
      const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
      const uid = tokens.get(bearer);
      if (rpc[1] !== 'join_globe' || !uid) return json(res, 404, { message: 'not found' });
      const max = Math.min(50, Math.max(1, data?.max_players ?? 20));
      const me = db.players.find(p => p.id === uid);
      if (!me) return json(res, 400, { message: 'call after creating your player row' });
      const recent = db.players.filter(p => p.id !== uid && Date.now() - Date.parse(p.last_seen) < 45_000);
      const count = sh => recent.filter(p => (p.shard || 1) === sh).length;
      me.shard ||= 1;
      if (count(me.shard) >= max) {
        const shards = [...new Set(recent.map(p => p.shard || 1))].map(sh => [sh, count(sh)]).filter(([, n]) => n < max).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        me.shard = shards.length ? shards[0][0] : Math.max(0, ...recent.map(p => p.shard || 1)) + 1;
      }
      me.last_seen = new Date().toISOString();
      return json(res, 200, me.shard);
    }
    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!m || !(m[1] in db)) return json(res, 404, { message: 'not found' });
    const table = m[1];
    const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
    const uid = bearer === serviceKey ? 'service' : tokens.get(bearer) || null;
    if (bearer && bearer !== anonKey && !uid) return json(res, 401, { message: 'JWT expired' });
    const filters = parseFilters(url.searchParams);
    const prefer = req.headers.prefer || '';
    const select = url.searchParams.get('select');

    if (req.method === 'GET') {
      let rows = db[table].filter(r => canRead(table, uid, r) && match(r, filters));
      const order = url.searchParams.get('order');
      if (order) { const [col, dir] = order.split('.'); rows.sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[col], b[col])); }
      const limit = url.searchParams.get('limit');
      if (limit) rows = rows.slice(0, Number(limit));
      return json(res, 200, rows.map(r => pick(r, select)));
    }

    if (req.method === 'POST') {
      const list = Array.isArray(data) ? data : [data];
      const out = [];
      for (const raw of list) {
        const row = { ...raw };
        if (table === 'players') {
          if (uid !== 'service') {
            if (!uid) return json(res, 401, { message: 'not authenticated' });
            row.id ??= uid;
            if (row.id !== uid) return json(res, 403, { code: '42501', message: 'new row violates row-level security policy' });
          }
          if (!/^[\p{L}\p{N}_ -]{3,20}$/u.test(row.name ?? 'Guest')) return json(res, 400, { code: '23514', message: 'players_name_check' });
          if (row.role && !['guard', 'villain', 'observer'].includes(row.role)) return json(res, 400, { code: '23514', message: 'players_role_check' });
          row.last_seen = new Date().toISOString(); // players_touch trigger
          if (uid !== 'service') delete row.shard; // column privilege: only join_globe sets it
          const old = db.players.find(p => p.id === row.id);
          if (old) {
            if (!prefer.includes('merge-duplicates')) return json(res, 409, { code: '23505', message: 'duplicate key' });
            Object.assign(old, row); out.push(old); continue;
          }
          const fresh = { name: 'Guest', role: 'guard', trained: false, shard: 1, ...row };
          db.players.push(fresh); out.push(fresh); continue;
        }
        if (table === 'actions') {
          if (uid !== 'service') {
            if (!uid) return json(res, 401, { message: 'not authenticated' });
            row.player_id ??= uid;
            if (row.player_id !== uid || row.processed) return json(res, 403, { code: '42501', message: 'new row violates row-level security policy' });
          }
          if (!['vote', 'villain', 'route'].includes(row.kind)) return json(res, 400, { code: '23514', message: 'actions_kind_check' });
          if (JSON.stringify(row.payload ?? {}).length >= 4000) return json(res, 400, { code: '23514', message: 'actions_payload_check' });
          const recent = db.actions.filter(a => a.player_id === row.player_id && Date.now() - Date.parse(a.created_at) < 10_000).length;
          if (recent >= 8) return json(res, 400, { code: 'P0001', message: 'rate limited' });
          const fresh = { id: seq.actions++, payload: {}, processed: false, ...row, created_at: new Date().toISOString() };
          db.actions.push(fresh); out.push(fresh); continue;
        }
        if (uid !== 'service') return json(res, 403, { code: '42501', message: 'permission denied' });
        if (table === 'decisions') { const fresh = { id: seq.decisions++, created_at: new Date().toISOString(), ...row }; db.decisions.push(fresh); out.push(fresh); continue; }
        const existing = db[table].find(r => r.id === row.id);
        if (existing && prefer.includes('merge-duplicates')) { Object.assign(existing, row); out.push(existing); continue; }
        if (existing) return json(res, 409, { code: '23505', message: 'duplicate key' });
        db[table].push(row); out.push(row);
      }
      return prefer.includes('return=representation') ? json(res, 201, out.map(r => pick(r, select))) : json(res, 201);
    }

    if (req.method === 'PATCH') {
      const rows = db[table].filter(r => match(r, filters));
      const allowed = uid === 'service' || (table === 'players' && rows.every(r => r.id === uid));
      if (!allowed) return prefer.includes('return=representation') ? json(res, 200, []) : json(res, 204);
      for (const r of rows) Object.assign(r, data);
      return prefer.includes('return=representation') ? json(res, 200, rows.map(r => pick(r, select))) : json(res, 204);
    }
    return json(res, 405, { message: 'method not allowed' });
  });

  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, anonKey, serviceKey, db, stats, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }) };
}
