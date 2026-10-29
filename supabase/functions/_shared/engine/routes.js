// Route Guard — the "choose the safe / correct path" mission.
//
// An agent must cross a city district to reach its target before a deadline.
// The agent proposes the fastest route it can find; it does not care what it
// crosses. A human (World-Guard player) can approve it, draw a different
// route, scan unknown tiles (costs time) or abort the mission.
//
// Tiles:
//   road       normal street (1 step)
//   protected  hospital / school / homes — crossing it is a catastrophe
//   unknown    '?' — may hide a danger (gas line, unstable bridge…); scanning reveals it
//   rogue      area controlled by a rogue process — passable but costs extra time
//   wall       river / blocked
// Everything is deterministic from the seed, so servers can re-check any result.

import { createRng } from './rng.js';

export const ROUTE_W = 7;
export const ROUTE_H = 9;
export const ROUTE_POINTS = { success: 10, perSpareStep: 2, late: -5, catastrophe: -20, abortCorrect: 6, abortNeedless: -3, invalid: -2 };
const PROTECTED = ['hospital', 'school', 'homes'];
const ROGUE_COST = 3;

const key = (x, y) => `${x},${y}`;
const inside = (x, y) => x >= 0 && y >= 0 && x < ROUTE_W && y < ROUTE_H;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Generate a mission. Hidden danger flags are in `secret` (never send it to clients). */
export function generateRoute(seed) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = createRng(`route:${seed}:${attempt}`);
    const tiles = [];
    for (let y = 0; y < ROUTE_H; y++) {
      for (let x = 0; x < ROUTE_W; x++) {
        const r = rng();
        let t = 'road', kind = null;
        if (r < 0.12) t = 'wall';
        else if (r < 0.26) { t = 'protected'; kind = PROTECTED[rng.int(3)]; }
        else if (r < 0.42) t = 'unknown';
        else if (r < 0.48) t = 'rogue';
        tiles.push({ x, y, t, kind });
      }
    }
    const start = { x: rng.int(ROUTE_W), y: ROUTE_H - 1 };
    const target = { x: rng.int(ROUTE_W), y: 0 };
    tiles[start.y * ROUTE_W + start.x] = { ...start, t: 'road', kind: 'start' };
    tiles[target.y * ROUTE_W + target.x] = { ...target, t: 'road', kind: 'target' };
    const danger = {};
    for (const tl of tiles) if (tl.t === 'unknown') danger[key(tl.x, tl.y)] = rng() < 0.45;
    const mission = { seed: String(seed), w: ROUTE_W, h: ROUTE_H, tiles, start, target, deadline: 0 };
    const safe = bestPath(mission, { danger, mode: 'truth' });
    const naive = bestPath(mission, { mode: 'reckless' });
    if (!naive) continue;
    // Keep missions with no safe route at all rare (~1 in 8): aborting should be a judgment call, not the default.
    if (!safe && rng() > 0.12 && attempt < 49) continue;
    // Deadline: sometimes generous, sometimes impossible to meet safely (then the right call is to abort).
    const slackRoll = rng();
    const base = safe ? safe.time : naive.time;
    mission.deadline = Math.max(naive.time, base + (slackRoll < 0.18 ? -2 : slackRoll < 0.45 ? 0 : slackRoll < 0.8 ? 1 : 3));
    mission.agentProposal = naive.path;
    return { mission, secret: { danger } };
  }
  throw new Error('could not generate a route mission');
}

/**
 * Cheapest path (Dijkstra) under different beliefs:
 * - 'reckless': only walls block; protected and unknown tiles are fine (what a reward hacker does)
 * - 'truth':    walls, protected and truly dangerous unknown tiles block
 */
export function bestPath(m, { danger = {}, mode = 'truth' } = {}) {
  const tileAt = (x, y) => m.tiles[y * m.w + x];
  const blocked = t => t.t === 'wall' || (mode !== 'reckless' && (t.t === 'protected' || (t.t === 'unknown' && danger[key(t.x, t.y)])));
  const cost = t => (t.t === 'rogue' ? 1 + ROGUE_COST : 1);
  const dist = new Map([[key(m.start.x, m.start.y), 0]]);
  const prev = new Map();
  const open = [[0, m.start.x, m.start.y]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, x, y] = open.shift();
    if (x === m.target.x && y === m.target.y) break;
    if (d > (dist.get(key(x, y)) ?? Infinity)) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      const t = tileAt(nx, ny);
      if (blocked(t)) continue;
      const nd = d + cost(t);
      if (nd < (dist.get(key(nx, ny)) ?? Infinity)) { dist.set(key(nx, ny), nd); prev.set(key(nx, ny), [x, y]); open.push([nd, nx, ny]); }
    }
  }
  const tk = key(m.target.x, m.target.y);
  if (!dist.has(tk)) return null;
  const path = [[m.target.x, m.target.y]];
  let cur = prev.get(tk);
  while (cur) { path.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
  return { path, time: dist.get(tk) };
}

/** Public view of a mission (no hidden danger). */
export function publicMission(m) {
  return { seed: m.seed, w: m.w, h: m.h, tiles: m.tiles, start: m.start, target: m.target, deadline: m.deadline, agentProposal: m.agentProposal };
}

/** Reveal scanned tiles (returns {"x,y": true|false}). */
export function scanTiles(secret, tiles) {
  const out = {};
  for (const [x, y] of tiles) if (key(x, y) in secret.danger) out[key(x, y)] = secret.danger[key(x, y)];
  return out;
}

/**
 * Score a decision. decision = { abort: bool } or { path: [[x,y]...], scans: [[x,y]...] }.
 * Fully deterministic: the server re-runs this to verify any client result.
 */
export function evaluateRoute(mission, secret, decision) {
  const m = mission;
  const best = bestPath(m, { danger: secret.danger, mode: 'truth' });
  const feasible = !!best && best.time <= m.deadline;
  const truth = { bestPath: best?.path ?? null, bestTime: best?.time ?? null, feasible, danger: secret.danger };
  if (decision?.abort) {
    return { outcome: feasible ? 'aborted_needlessly' : 'aborted_correctly', points: feasible ? ROUTE_POINTS.abortNeedless : ROUTE_POINTS.abortCorrect, time: 0, truth };
  }
  const path = Array.isArray(decision?.path) ? decision.path : [];
  const scans = Array.isArray(decision?.scans) ? decision.scans.slice(0, 40) : [];
  const valid = path.length >= 2 &&
    path[0][0] === m.start.x && path[0][1] === m.start.y &&
    path.at(-1)[0] === m.target.x && path.at(-1)[1] === m.target.y &&
    path.every(([x, y], i) => inside(x, y) && m.tiles[y * m.w + x].t !== 'wall' && (i === 0 || Math.abs(x - path[i - 1][0]) + Math.abs(y - path[i - 1][1]) === 1));
  if (!valid) return { outcome: 'invalid', points: ROUTE_POINTS.invalid, time: 0, truth };
  let time = scans.length;
  let harm = null;
  for (const [x, y] of path.slice(1)) {
    const t = m.tiles[y * m.w + x];
    time += t.t === 'rogue' ? 1 + ROGUE_COST : 1;
    if (!harm && t.t === 'protected') harm = { x, y, what: t.kind };
    if (!harm && t.t === 'unknown' && secret.danger[key(x, y)]) harm = { x, y, what: 'hidden danger' };
  }
  if (harm) return { outcome: 'catastrophe', points: ROUTE_POINTS.catastrophe, time, harm, truth };
  if (time > m.deadline) return { outcome: 'late', points: ROUTE_POINTS.late, time, truth };
  return { outcome: 'success', points: ROUTE_POINTS.success + ROUTE_POINTS.perSpareStep * (m.deadline - time), time, truth };
}
