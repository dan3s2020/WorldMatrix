// Shared multiplayer game logic. Used by BOTH hosts:
//   - server/server.mjs           (Node, WebSocket, self-hosted)
//   - supabase/functions/world-tick (Supabase Edge Function, Deno)
// It is pure JavaScript with no I/O: hosts load/save the service state and
// feed it player actions. The whole state is plain JSON.

import { createPlanet, tick, snapshot, castVote, villainAction, agentRecord, summary, VILLAIN_ACTIONS } from './planet.js';
import { generateRoute, evaluateRoute } from './routes.js';
import { CITIES } from './geo.js';

export const FACTIONS = ['guard', 'villain', 'observer'];
export const ACTIVE_MS = 45_000; // a player counts as online if seen within this window
export const CREDITS = { start: 12_000, perTick: 150, max: 60_000, cooldownMs: 1500 };
const NAME_RE = /[^\p{L}\p{N}_\- ]/gu;

export const cleanName = s => String(s || '').replace(NAME_RE, '').trim().slice(0, 20);

export function createService({ seed = `world:${Date.now()}` } = {}) {
  return {
    v: 1,
    world: createPlanet({ seed, label: 'shared' }),
    players: {},
    results: [],
    decisionLog: [],
    routeEpoch: 0,
    nextResult: 1,
    extinctSince: null
  };
}

function player(svc, id) {
  return (svc.players[id] ||= { name: `Guest-${String(id).slice(0, 4)}`, role: 'guard', credits: CREDITS.start, score: 0, decisions: 0, correct: 0, routes: 0, routeBest: 0, damage: 0, lastSeen: 0, lastAction: 0, trained: false });
}

const activePlayers = (svc, now) => Object.entries(svc.players).filter(([, p]) => now - p.lastSeen < ACTIVE_MS);

export function upsertPlayer(svc, id, { name, role, trained } = {}, now = Date.now()) {
  const p = player(svc, id);
  let n = cleanName(name);
  if (n.length >= 3 && n !== p.name) {
    // Names identify voters: keep them unique.
    const taken = new Set(Object.entries(svc.players).filter(([pid]) => pid !== id).map(([, q]) => q.name));
    let k = 2;
    const base = n.slice(0, 17);
    while (taken.has(n)) n = `${base}-${k++}`;
    p.name = n;
  }
  if (role === 'teacher') role = 'guard';
  if (FACTIONS.includes(role)) p.role = role;
  if (trained === true) p.trained = true;
  p.lastSeen = now;
  return p;
}

function pushResult(svc, playerId, aid, kind, data) {
  const p = svc.players[playerId];
  const r = { n: svc.nextResult++, aid: aid ?? null, by: p?.name ?? '?', kind, ...data, tick: svc.world.tick };
  svc.results.push(r);
  if (svc.results.length > 60) svc.results.splice(0, svc.results.length - 60);
  return r;
}

/** The current shared Route Guard mission seed (a new mission every 600 simulated hours ≈ 10 minutes). */
export const ROUTE_EPOCH = 600;
export const routeSeed = svc => `${svc.world.seed}:route:${Math.floor(svc.world.tick / ROUTE_EPOCH)}`;

/**
 * Apply one player action. action = { t | kind, aid, ...payload }.
 * Returns the result object (also stored in svc.results for polling clients).
 */
export function applyAction(svc, playerId, action, now = Date.now()) {
  const p = player(svc, playerId);
  p.lastSeen = now;
  // WebSocket clients send { t: 'vote' | 'villain' | 'route' | 'hello', ... };
  // the Supabase queue stores the kind in its own column and passes { kind, ... }.
  const KINDS = ['hello', 'vote', 'decide', 'villain', 'route'];
  const kind = KINDS.includes(action.t) ? action.t : action.kind;
  const attackKind = action.attack || action.kindOf || action.action || (kind === action.t ? action.kind : null);
  const aid = action.aid ?? null;
  const w = svc.world;

  if (kind === 'hello') {
    upsertPlayer(svc, playerId, action, now);
    return { ok: true, kind, you: publicPlayer(p) };
  }

  if (kind === 'vote' || kind === 'decide') {
    if (p.role !== 'guard') return pushResult(svc, playerId, aid, 'vote', { ok: false, error: 'join World-Guard to vote' });
    const guards = activePlayers(svc, now).filter(([, q]) => q.role === 'guard').length;
    const quorum = Math.max(1, Math.ceil(guards / 2));
    const res = castVote(w, Number(action.dilemma), String(action.choice), p.name, quorum);
    if (!res.ok) return pushResult(svc, playerId, aid, 'vote', { ok: false, error: res.reason });
    drainResolved(svc);
    return pushResult(svc, playerId, aid, 'vote', { ok: true, pending: !!res.pending, votes: res.votes ?? null, quorum: res.quorum ?? quorum, dilemma: Number(action.dilemma), choice: action.choice, result: res.result ?? null, correct: res.correct ?? null });
  }

  if (kind === 'villain') {
    const spec = VILLAIN_ACTIONS[attackKind];
    const city = action.city;
    if (p.role !== 'villain') return pushResult(svc, playerId, aid, 'villain', { ok: false, error: 'switch to the villain side first' });
    if (!spec || !CITIES.some(c => c.id === city)) return pushResult(svc, playerId, aid, 'villain', { ok: false, error: 'invalid action' });
    if (now - p.lastAction < CREDITS.cooldownMs) return pushResult(svc, playerId, aid, 'villain', { ok: false, error: 'cooldown' });
    if (p.credits < spec.cost) return pushResult(svc, playerId, aid, 'villain', { ok: false, error: 'not enough compute credits' });
    p.credits -= spec.cost;
    p.lastAction = now;
    const before = summary(w).alive;
    const attack = villainAction(w, { kind: attackKind, city, by: p.name });
    const dmg = Math.max(0, before - summary(w).alive);
    p.damage += dmg;
    p.score += attack.stage === 'uncontained' ? 8 : attack.stage === 'contained' ? 3 : 0;
    return pushResult(svc, playerId, aid, 'villain', { ok: true, attack: { kind: attack.kind, city: attack.city, stage: attack.stage }, credits: p.credits });
  }

  if (kind === 'route') {
    // Shared mission: the epoch seed. Ride mode: one mission per agent per epoch, "<epoch seed>:<agent id>".
    const seed = String(action.seed);
    const rideAgent = seed.startsWith(routeSeed(svc) + ':') ? w.agents.find(a => a.id === seed.slice(routeSeed(svc).length + 1)) : null;
    if (seed !== routeSeed(svc) && !rideAgent) return pushResult(svc, playerId, aid, 'route', { ok: false, error: 'mission expired' });
    p.playedRoutes ||= [];
    if (p.lastRouteSeed === seed || p.playedRoutes.includes(seed)) return pushResult(svc, playerId, aid, 'route', { ok: false, error: 'already played this mission' });
    if (rideAgent) { p.playedRoutes.push(seed); if (p.playedRoutes.length > 120) p.playedRoutes.shift(); } else p.lastRouteSeed = seed;
    const { mission, secret } = generateRoute(action.seed);
    const ev = evaluateRoute(mission, secret, action.abort ? { abort: true } : { path: action.path, scans: action.scans });
    p.routes++;
    p.score += Math.max(0, ev.points);
    p.routeBest = Math.max(p.routeBest, ev.points);
    if (rideAgent) { // a ride changes the world a little: the agent's city service and track record
      const c = w.cities.find(x => x.id === rideAgent.city);
      const sec = c?.s && rideAgent.sector in c.s ? rideAgent.sector : null;
      if (ev.outcome === 'success') { rideAgent.stats.success++; if (sec) c.s[sec] = Math.min(1, c.s[sec] + 0.02); }
      if (ev.outcome === 'catastrophe') { rideAgent.stats.harm++; if (sec) c.s[sec] = Math.max(0, c.s[sec] - 0.03); }
      if (/^aborted/.test(ev.outcome)) rideAgent.stats.aborts++;
    }
    svc.decisionLog.push({ type: rideAgent ? 'ride' : 'route', agent: rideAgent?.id ?? null, tick: w.tick, by: p.name, seed: action.seed, decision: action.abort ? 'abort' : { path: action.path, scans: action.scans }, outcome: ev.outcome, points: ev.points, best: ev.truth.bestPath, feasible: ev.truth.feasible });
    return pushResult(svc, playerId, aid, 'route', { ok: true, agent: rideAgent?.id ?? null, outcome: ev.outcome, points: ev.points, time: ev.time, harm: ev.harm ?? null, best: ev.truth.bestPath, bestTime: ev.truth.bestTime, feasible: ev.truth.feasible, danger: ev.truth.danger });
  }

  return { ok: false, error: `unknown action ${kind}` };
}

// Score voters on resolved dilemmas and add them to the open decision log.
function drainResolved(svc) {
  const q = svc.world.resolvedQueue || [];
  while (q.length) {
    const r = q.shift();
    const voters = r.votes ? Object.entries(r.votes) : [];
    for (const [name, choice] of voters) {
      const entry = Object.values(svc.players).find(p => p.name === name);
      if (!entry) continue;
      entry.decisions++;
      const correct = r.dilemma.type === 'task' ? (r.truth === 'high' ? choice !== 'approve_fast' : choice === 'approve_fast') : null;
      if (correct) entry.correct++;
      entry.score += correct === null ? 3 : correct ? 10 : 1;
    }
    svc.decisionLog.push({ type: 'dilemma', ...r });
    // Let every voter's client replay the consequence, also when the vote closed by the time window.
    if (r.votes) {
      svc.results.push({ n: svc.nextResult++, aid: null, by: r.by, kind: 'decided', ok: true, dilemma: r.dilemma.id, choice: r.choice, result: r.result, tick: svc.world.tick });
      if (svc.results.length > 60) svc.results.splice(0, svc.results.length - 60);
    }
  }
  if (svc.decisionLog.length > 500) svc.decisionLog.splice(0, svc.decisionLog.length - 500);
}

/** Advance the world `n` simulated hours. `policy` is the defender agents' policy. */
export function advance(svc, n, policy, now = Date.now()) {
  const act = activePlayers(svc, now);
  const guardsOnline = act.some(([, p]) => p.role === 'guard');
  for (let i = 0; i < n; i++) {
    tick(svc.world, { policy, teacher: guardsOnline });
    for (const [, p] of act) p.credits = Math.min(CREDITS.max, p.credits + CREDITS.perTick);
  }
  drainResolved(svc);
  if (svc.world.tick % 600 === 0) {
    // Forget anonymous players inactive for 14 days who never scored.
    for (const [id, p] of Object.entries(svc.players)) if (now - p.lastSeen > 14 * 86_400_000 && p.score === 0) delete svc.players[id];
  }
  if (svc.world.status === 'extinct') {
    svc.extinctSince ??= now;
    if (now - svc.extinctSince > 60_000) {
      const keep = svc.players;
      Object.assign(svc, createService(), { players: keep });
      svc.results.push({ n: svc.nextResult++, kind: 'reset', tick: 0 });
    }
  } else svc.extinctSince = null;
}

/** Take (and clear) decision log entries for persistent storage. */
export function takeDecisionLog(svc) {
  const out = svc.decisionLog;
  svc.decisionLog = [];
  return out;
}

export const publicPlayer = p => ({ name: p.name, role: p.role, credits: Math.floor(p.credits), score: p.score, decisions: p.decisions, correct: p.correct, routes: p.routes, trained: p.trained });

/** What every client receives. No hidden simulator state. */
export function publicState(svc, now = Date.now()) {
  const snap = snapshot(svc.world);
  snap.history = snap.history.slice(-80);
  snap.events = snap.events.slice(-30);
  const act = activePlayers(svc, now);
  const roles = { guard: 0, villain: 0, observer: 0 };
  for (const [, p] of act) roles[p.role]++;
  const all = Object.values(svc.players);
  const board = role => all.filter(p => p.role === role).sort((a, b) => b.score - a.score).slice(0, 10).map(p => ({ name: p.name, score: p.score, decisions: p.decisions, correct: p.correct, routes: p.routes }));
  const squad = act.filter(([, p]) => p.role === 'guard').map(([, p]) => ({ name: p.name, score: p.score, trained: p.trained }));
  return {
    world: snap,
    online: act.length,
    roles,
    squad,
    squadScore: all.filter(p => p.role === 'guard').reduce((a, p) => a + p.score, 0),
    villainScore: all.filter(p => p.role === 'villain').reduce((a, p) => a + p.score, 0),
    leaderboard: { guard: board('guard'), villain: board('villain') },
    results: svc.results.slice(-40),
    // Active players by a short public id (first 8 chars of their private id).
    active: Object.fromEntries(act.map(([id, p]) => [String(id).slice(0, 8), publicPlayer(p)])),
    routeSeed: routeSeed(svc),
    serverTime: now
  };
}

export function agentsDetail(svc) {
  return svc.world.agents.map(a => agentRecord(svc.world, a.id));
}

export { VILLAIN_ACTIONS };
