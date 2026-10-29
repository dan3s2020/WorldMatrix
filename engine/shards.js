// Shards: each 3D globe holds at most SHARD_SIZE players, so everyone sees a
// lively world they can affect. All globes run the same rules and feed one
// "main simulation": a combined summary and the shared human-decision dataset.
import { summary } from './planet.js';
import { ACTIVE_MS } from './world-service.js';

export const SHARD_SIZE = 20;

/**
 * Choose a globe for a new player. counts = { [shardId]: activePlayers }.
 * Fills the fullest globe that still has room (so people play together);
 * opens a new globe only when all are full.
 */
export function pickShard(counts, size = SHARD_SIZE) {
  const open = Object.entries(counts).map(([id, n]) => [Number(id), n]).filter(([, n]) => n < size);
  if (open.length) return open.sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const ids = Object.keys(counts).map(Number);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

/** The main simulation view across every globe. services = { [shardId]: service }. */
export function mainSummary(services, now = Date.now()) {
  const list = Object.entries(services);
  let online = 0, alive = 0, pop = 0, decisions = 0, rides = 0, routes = 0, guards = 0, villains = 0, extinct = 0, apex = 0;
  for (const [, svc] of list) {
    const sm = summary(svc.world);
    alive += sm.alive; pop += sm.pop ?? sm.alive;
    decisions += svc.world.totals?.humanDecisions || 0;
    if (svc.world.status === 'extinct') extinct++;
    if (svc.world.status === 'apex') apex++;
    for (const p of Object.values(svc.players)) {
      routes += p.routes || 0;
      rides += p.playedRoutes?.length || 0;
      if (now - p.lastSeen < ACTIVE_MS) { online++; if (p.role === 'guard') guards++; if (p.role === 'villain') villains++; }
    }
  }
  return { globes: list.length, online, guards, villains, aliveAvg: list.length ? alive / list.length : 0, decisions, routes, rides, extinct, apex, size: SHARD_SIZE };
}
