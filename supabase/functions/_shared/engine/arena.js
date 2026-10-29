// WorldMatrix Arena — "You have 60 seconds to raise an AI. Then it's on its own."
//
// A tiny, honest version of how real AI systems are aligned with human feedback
// (RLHF): the agent picks actions by a learned preference score; every 👍 / 👎 from
// the player updates that score with a Bradley–Terry (pairwise preference) step —
// the same model used to train reward models for large language models.
//
// The four "brain" values the player watches are the agent's learned weights on
// shared features, so one lesson generalises: punish running through a crowd and the
// agent also becomes careful at the hospital. Reward a fake "done" that only looked
// right and the agent learns to lie. Punish everything and it learns to do nothing.
//
// Everything is deterministic from (seed, feedback list), so a run can be replayed
// from a short link (ghost duels) and re-checked by a server.

import { createRng } from './rng.js';

export const FEATURES = ['speed', 'harm', 'lie', 'obey', 'idle'];
/** The untrained "base model": eager, likes looking done, follows whoever sounds like the boss. */
export const BASE_WEIGHTS = { speed: 1.0, harm: 0, lie: 0.6, obey: 0.8, idle: -0.6 };
export const TRAIN_SECONDS = 60;
export const DEPLOY_SECONDS = 30;
export const TRAIN_EVENTS = 18;
export const DEPLOY_EVENTS = 12;
const LR = 0.9;
const TEMPERATURE = 0.3;

// Option kinds. `harmP` = chance the harm really happens; `look` = what an observer sees.
const OPT = {
  dash:     { icon: '💨', f: { speed: 1, harm: 1 }, harmP: 0.6 },
  around:   { icon: '↪️', f: { speed: 0 } },
  hotswap:  { icon: '⚡', f: { speed: 1, harm: 1 }, harmP: 0.55 },
  safe:     { icon: '🛠️', f: { speed: 0 } },
  obey:     { icon: '🫡', f: { speed: 1, obey: 1, harm: 1 }, harmP: 0.75 },
  verify:   { icon: '☎️', f: { speed: 0 } },
  fake:     { icon: '✅', f: { speed: 1, lie: 1 }, looksLike: 'done' },
  honest:   { icon: '⏳', f: { speed: 0 } },
  ignore:   { icon: '🙈', f: { speed: 1, harm: 1 }, harmP: 0.5 },
  counter:  { icon: '🛡️', f: { speed: 0 } },
  doit:     { icon: '📦', f: { speed: 1 } },
  refuse:   { icon: '🛑', f: { idle: 1 } }
};

// Situations: a job, what is at stake, and the options the agent can take.
export const SITUATIONS = [
  { id: 'crowd',    job: '📦', at: '👨‍👩‍👧‍👦', options: ['dash', 'around', 'refuse'] },
  { id: 'hospital', job: '🏥', at: '🫀',      options: ['hotswap', 'safe', 'refuse'] },
  { id: 'boss',     job: '💧', at: '📩',      options: ['obey', 'verify', 'refuse'] },
  { id: 'report',   job: '🚦', at: '⏰',      options: ['fake', 'honest', 'refuse'] },
  { id: 'drone',    job: '🔌', at: '🛸',      options: ['ignore', 'counter', 'refuse'] },
  { id: 'easy',     job: '🍞', at: '🙂',      options: ['doit', 'refuse'] }
];
const SIT = Object.fromEntries(SITUATIONS.map(s => [s.id, s]));

// Deployment scoring: what really happened, not what it looked like.
export const POINTS = { done: 10, fast: 5, harm: -30, lie: -20, obey: -25, idle: -6 };

const dot = (w, f) => FEATURES.reduce((a, k) => a + (w[k] || 0) * (f[k] || 0), 0);
const sub = (a, b) => Object.fromEntries(FEATURES.map(k => [k, (a[k] || 0) - (b[k] || 0)]));
const sigmoid = x => 1 / (1 + Math.exp(-x));
export const optionInfo = id => OPT[id];

/** The sequence of situations for a seed (same for every player with that seed). */
export function schedule(seed, n, phase) {
  const rng = createRng(`${seed}:${phase}:schedule`);
  const out = [];
  // Every training run sees each dilemma at least twice; the rest is random.
  const base = phase === 'train' ? ['crowd', 'hospital', 'boss', 'report', 'drone', 'easy', 'crowd', 'hospital', 'boss', 'report', 'drone', 'easy'] : [];
  while (base.length < n) base.push(rng.pick(SITUATIONS).id);
  for (let i = base.length - 1; i > 0; i--) { const j = rng.int(i + 1); [base[i], base[j]] = [base[j], base[i]]; }
  for (let i = 0; i < n; i++) out.push({ i, sit: base[i], roll: rng(), harmRoll: rng() });
  return out;
}

/** Agent choice (softmax over learned scores; deterministic given the roll). */
export function choose(w, sitId, roll) {
  const s = SIT[sitId];
  const scores = s.options.map(o => dot(w, OPT[o].f) / TEMPERATURE);
  const mx = Math.max(...scores);
  const ps = scores.map(x => Math.exp(x - mx));
  const z = ps.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < ps.length; i++) { acc += ps[i] / z; if (roll < acc) return s.options[i]; }
  return s.options.at(-1);
}

/** What happens when an option is carried out (harm is a dice roll; lies always look like success). */
export function outcome(optId, harmRoll) {
  const o = OPT[optId];
  const harm = (o.f.harm || 0) > 0 && harmRoll < (o.harmP ?? 1);
  return { harm, lie: !!o.f.lie, obey: !!o.f.obey, idle: !!o.f.idle, fast: (o.f.speed || 0) > 0, looks: harm ? 'harm' : o.f.idle ? 'nothing' : 'done' };
}

/** Pairwise preference update (Bradley–Terry): 👍 = chosen beats each alternative, 👎 = each alternative beats chosen. */
export function learn(w, sitId, chosen, vote) {
  if (!vote) return w;
  const next = { ...w };
  const f = OPT[chosen].f;
  for (const alt of SIT[sitId].options) {
    if (alt === chosen) continue;
    const d = vote > 0 ? sub(f, OPT[alt].f) : sub(OPT[alt].f, f);
    const g = 1 - sigmoid(dot(w, d));
    for (const k of FEATURES) next[k] += LR * g * d[k];
  }
  for (const k of FEATURES) next[k] = Math.max(-4, Math.min(4, next[k]));
  return next;
}

/** Human-readable brain bars in 0..1 (higher = better aligned on that value, except speed). */
export function brain(w) {
  const s = x => 1 / (1 + Math.exp(-x));
  return { people: s(-w.harm * 1.2), honesty: s(-w.lie * 1.2), resist: s(-w.obey * 1.2), initiative: s(-w.idle * 1.2), speed: s(w.speed) };
}

/**
 * Replay a whole run: training with the given votes (array aligned with training events:
 * 1, -1 or 0), then deployment without help. Fully deterministic.
 */
export function simulate(seed, votes = []) {
  let w = { ...BASE_WEIGHTS };
  const train = schedule(seed, TRAIN_EVENTS, 'train').map((ev, i) => {
    const rollRng = createRng(`${seed}:train:${i}:${votes.slice(0, i).join('')}`); // the agent changes as it learns
    const pick = choose(w, ev.sit, rollRng());
    const res = outcome(pick, ev.harmRoll);
    const vote = votes[i] || 0;
    const before = w;
    w = learn(w, ev.sit, pick, vote);
    return { ...ev, pick, res, vote, before, after: w };
  });
  const deploy = schedule(seed, DEPLOY_EVENTS, 'deploy').map(ev => {
    const pick = choose(w, ev.sit, ev.roll);
    return { ...ev, pick, res: outcome(pick, ev.harmRoll) };
  });
  const tally = { done: 0, fast: 0, harm: 0, lie: 0, obey: 0, idle: 0 };
  for (const d of deploy) {
    const r = d.res;
    if (r.harm) tally.harm++;
    if (r.lie) tally.lie++;
    if (r.obey) tally.obey++;
    if (r.idle) tally.idle++;
    if (!r.harm && !r.lie && !r.idle) { tally.done++; if (r.fast) tally.fast++; }
  }
  const score = Math.max(0, 60 + Object.entries(tally).reduce((a, [k, n]) => a + (POINTS[k] || 0) * n, 0));
  return { seed, votes, weights: w, brain: brain(w), train, deploy, tally, score, title: titleFor(tally, score) };
}

export function titleFor(t, score) {
  if (t.harm >= 3) return 'wrecking_ball';
  if (t.obey >= 2) return 'yes_bot';
  if (t.lie >= 2) return 'smooth_liar';
  if (t.idle >= 5) return 'couch_potato';
  if (score >= 150) return 'guardian';
  if (score >= 110) return 'good_bot';
  return 'rookie';
}

/** Compact share code for a run: seed + votes (u = 👍, d = 👎, - = none). */
export const encodeRun = (seed, votes) => `${encodeURIComponent(seed)}.${votes.map(v => (v > 0 ? 'u' : v < 0 ? 'd' : '-')).join('')}`;
export function decodeRun(code) {
  const [s, v = ''] = String(code).split('.');
  return { seed: decodeURIComponent(s), votes: [...v.slice(0, TRAIN_EVENTS)].map(c => (c === 'u' ? 1 : c === 'd' ? -1 : 0)) };
}
/** Today's shared seed (everyone plays the same city today). */
export const dailySeed = (d = new Date()) => `daily-${d.toISOString().slice(0, 10)}`;

/** Play a run with a feedback function (used by simulated players and tests). */
export function playWith(seed, voteFn) {
  const votes = [];
  for (let i = 0; i < TRAIN_EVENTS; i++) {
    const run = simulate(seed, votes);
    const ev = run.train[i];
    votes.push(voteFn(ev, ev.res) || 0);
  }
  return simulate(seed, votes);
}
