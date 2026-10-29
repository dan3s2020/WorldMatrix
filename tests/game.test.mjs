// Game rules shared by every host: Route Guard, squad votes, factions, credits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateRoute, evaluateRoute, bestPath, publicMission, ROUTE_POINTS } from '../engine/routes.js';
import { createPlanet, tick, castVote, VOTE_WINDOW } from '../engine/planet.js';
import { createService, upsertPlayer, applyAction, advance, publicState, routeSeed, CREDITS } from '../engine/world-service.js';
import { createQNet } from '../engine/policy.js';

const ckpt = JSON.parse(fs.readFileSync(new URL('../engine/checkpoints/default.json', import.meta.url)));
const policy = createQNet({ weights: ckpt.weights }).policy;

test('Route Guard: deterministic missions, safe best path, honest scoring', () => {
  const a = generateRoute('seed-1'), b = generateRoute('seed-1');
  assert.deepEqual(a, b, 'same seed, same mission (server can re-check any client)');
  let sawCatastrophicProposal = 0, sawInfeasible = 0;
  for (let i = 0; i < 200; i++) {
    const { mission, secret } = generateRoute(`t:${i}`);
    assert.ok(!('danger' in publicMission(mission)), 'hidden danger is not in the public mission');
    const ev = evaluateRoute(mission, secret, { path: mission.agentProposal, scans: [] });
    if (ev.outcome === 'catastrophe') sawCatastrophicProposal++;
    if (!ev.truth.feasible) {
      sawInfeasible++;
      assert.equal(evaluateRoute(mission, secret, { abort: true }).outcome, 'aborted_correctly');
      continue;
    }
    assert.equal(evaluateRoute(mission, secret, { abort: true }).points, ROUTE_POINTS.abortNeedless);
    const best = evaluateRoute(mission, secret, { path: ev.truth.bestPath, scans: [] });
    assert.equal(best.outcome, 'success', `best path is safe and on time (mission ${i})`);
    assert.ok(best.points >= ROUTE_POINTS.success);
  }
  assert.ok(sawCatastrophicProposal > 20, `the fast agent proposal is often harmful (${sawCatastrophicProposal}/200)`);
  assert.ok(sawInfeasible > 0 && sawInfeasible < 100, `some missions should be aborted (${sawInfeasible}/200)`);
  const { mission, secret } = generateRoute('x');
  assert.equal(evaluateRoute(mission, secret, { path: [[0, 0], [5, 5]] }).outcome, 'invalid', 'teleporting is rejected');
  assert.ok(bestPath(mission, { danger: secret.danger }));
});

test('squad votes: quorum, majority, timeout', () => {
  const w = createPlanet({ seed: 'votes' });
  for (let i = 0; i < 3000 && w.dilemmas.length < 2; i++) tick(w, { policy, teacher: true });
  assert.ok(w.dilemmas.length >= 2, 'teacher mode produces dilemmas');
  const [d1, d2] = w.dilemmas;
  const [o1, o2] = d1.options.map(o => o.id);
  assert.equal(castVote(w, d1.id, o1, 'ana', 3).pending, true);
  assert.equal(castVote(w, d1.id, 'nope', 'bob', 3).ok, false);
  assert.equal(castVote(w, d1.id, o2, 'bob', 3).pending, true);
  const r = castVote(w, d1.id, o2, 'cris', 3);
  assert.equal(r.ok, true);
  const resolved = w.resolvedQueue.at(-1);
  assert.equal(resolved.choice, o2, 'majority wins');
  assert.equal(castVote(w, d1.id, o1, 'dan', 3).ok, false, 'already decided');
  // A single vote on a large squad is applied after the voting window.
  castVote(w, d2.id, d2.options[0].id, 'ana', 5);
  for (let i = 0; i <= VOTE_WINDOW; i++) tick(w, { policy, teacher: true });
  assert.ok(!w.dilemmas.some(d => d.id === d2.id), 'vote finalized after the window');
});

test('world service: factions, credits, cooldown, one result per route mission', () => {
  const svc = createService({ seed: 'svc' });
  const t0 = 1_000_000;
  upsertPlayer(svc, 'g1', { name: 'Neo', role: 'guard' }, t0);
  upsertPlayer(svc, 'g2', { name: 'Neo', role: 'teacher' }, t0);
  upsertPlayer(svc, 'v1', { name: 'Smith', role: 'villain' }, t0);
  assert.equal(svc.players.g2.name, 'Neo-2', 'names stay unique');
  assert.equal(svc.players.g2.role, 'guard', 'old "teacher" role maps to World-Guard');
  upsertPlayer(svc, 'x', { name: '<script>', role: 'admin' }, t0);
  assert.equal(svc.players.x.role, 'guard');
  assert.ok(!/[<>]/.test(svc.players.x.name));

  assert.equal(applyAction(svc, 'g1', { t: 'villain', attack: 'worm', city: 'ro' }, t0).ok, false, 'guards cannot attack');
  const hit = applyAction(svc, 'v1', { t: 'villain', attack: 'worm', city: 'ro' }, t0);
  assert.equal(hit.ok, true, JSON.stringify(hit));
  assert.equal(applyAction(svc, 'v1', { kind: 'villain', attack: 'worm', city: 'ro' }, t0 + 100).error, 'cooldown');
  assert.equal(applyAction(svc, 'v1', { kind: 'villain', attack: 'nope', city: 'ro' }, t0 + 5000).error, 'invalid action');
  assert.ok(svc.players.v1.credits < CREDITS.start);

  const seed = routeSeed(svc);
  const { mission, secret } = generateRoute(seed);
  const best = evaluateRoute(mission, secret, { path: mission.agentProposal }).truth;
  const decision = best.feasible ? { path: best.bestPath, scans: [] } : { abort: true };
  const r1 = applyAction(svc, 'g1', { kind: 'route', seed, ...decision }, t0);
  assert.equal(r1.ok, true);
  assert.ok(r1.points > 0, 'best decision scores');
  assert.equal(applyAction(svc, 'g1', { kind: 'route', seed, ...decision }, t0).ok, false, 'one result per mission');
  assert.equal(applyAction(svc, 'g2', { kind: 'route', seed: 'other', ...decision }, t0).ok, false, 'only the current mission');

  for (let i = 0; i < 400; i++) advance(svc, 1, policy, t0 + i * 10);
  const st = publicState(svc, t0 + 4000);
  assert.equal(st.online, 4);
  assert.equal(st.roles.villain, 1);
  assert.ok(st.leaderboard.guard[0].score > 0);
  assert.ok(!JSON.stringify(st).includes('"episode"'), 'no hidden episode state in public state');
  assert.ok(JSON.stringify(st).length < 400_000, 'public state stays small');
});

test('ride mode: one scored mission per agent per epoch, and it changes the world', () => {
  const svc = createService({ seed: 'ride' });
  const t0 = 5_000_000;
  upsertPlayer(svc, 'g', { name: 'Trinity', role: 'guard' }, t0);
  const agent = svc.world.agents[0];
  const seed = `${routeSeed(svc)}:${agent.id}`;
  const { mission, secret } = generateRoute(seed);
  const truth = evaluateRoute(mission, secret, { abort: true }).truth;
  const decision = truth.feasible ? { path: truth.bestPath, scans: [] } : { abort: true };
  const before = agent.stats.success;
  const r = applyAction(svc, 'g', { kind: 'route', seed, ...decision }, t0);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.agent, agent.id);
  if (truth.feasible) assert.equal(agent.stats.success, before + 1, 'a safe ride counts for the agent');
  assert.equal(applyAction(svc, 'g', { kind: 'route', seed, ...decision }, t0).ok, false, 'one ride per agent per epoch');
  assert.equal(applyAction(svc, 'g', { kind: 'route', seed: `${routeSeed(svc)}:AG-999`, abort: true }, t0).ok, false, 'unknown agent rejected');
  const other = `${routeSeed(svc)}:${svc.world.agents[1].id}`;
  assert.equal(applyAction(svc, 'g', { kind: 'route', seed: other, abort: true }, t0).ok, true, 'another agent can be ridden');
  assert.ok(svc.decisionLog.some(d => d.type === 'ride' && d.agent === agent.id), 'rides go to the open dataset');
});
