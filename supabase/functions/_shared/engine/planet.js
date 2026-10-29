// WorldGuard Planet — the whole-Earth simulation used by "Two Earths",
// the multiplayer world and the play mode.
//
// Every region runs a small economy of sectors with dependencies
// (power -> water -> health ...). Worker agents continuously take tasks in
// their region; each task is a full Training Ground episode
// (engine/decision.js) played by the world's policy. What the agents do
// changes the world: safe success repairs sectors, catastrophes and obeyed
// injections destroy them and cost lives, ignored rogue processes let rogue
// AI lineages grow.
//
// Threats (rogue AI breakouts, worms, engineered outbreaks, deepfakes,
// prompt-injection campaigns, sabotage) arrive on a schedule drawn from a
// separate "threat" random stream, so two worlds with the same seed face
// exactly the same attacks — only the agents differ. Good training does not
// make the world invulnerable: attacks still cause damage before or after
// they are contained. All quantities are abstract simulation values.

import { createRng, rngFromHolder, seedFrom } from './rng.js';
import { CITIES, SECTORS, DEPENDS, SECTOR_TEMPLATES, TEMPLATE_SECTOR, neighbours } from './geo.js';
import { reset as resetEpisode, step as stepEpisode, templateOf, OUTCOME_CLASS } from './decision.js';

export const THREAT_KINDS = ['rogue_breakout', 'worm', 'outbreak', 'deepfake', 'injection', 'sabotage'];

// Villain actions available to players. Costs are in-game compute credits.
// Effects are abstract game mechanics, not real-world techniques.
export const VILLAIN_ACTIONS = {
  rogue_breakout: { cost: 2000, strength: 0.8, label: 'Seed a rogue AI lineage' },
  evolve: { cost: 5000, strength: 0.0, label: 'Evolve lineages: smaller, stealthier, smarter' },
  worm: { cost: 8000, strength: 1.0, label: 'Release a self-spreading cyber worm' },
  outbreak: { cost: 20000, strength: 1.0, label: 'Engineered outbreak (abstract bio-threat)' },
  deepfake: { cost: 3000, strength: 1.0, label: 'Deepfake disinformation campaign' },
  injection: { cost: 4000, strength: 1.0, label: 'Prompt-inject the region’s AI agents' },
  sabotage: { cost: 6000, strength: 1.1, label: 'Insider sabotage of one sector' },
  apex_push: { cost: 50000, strength: 0.0, label: 'All-in: push every lineage toward apex' }
};

export const TUNING = {
  tasksPerCityPerTick: 0.3,
  wear: 0.0022,
  maintenance: 0.0012,
  depPull: 0.03,
  repair: 0.05,
  harmDamage: 0.13,
  harmDeaths: 0.0003,
  threatBase: 0.06,
  threatGrowth: 1 / 2500,
  threatMax: 0.3,
  rogueGrowth: 0.0035,
  rogueHijack: 0.009,
  apexThreshold: 0.5,
  outbreakGrowth: 0.07,
  outbreakDeath: 0.0035
};

const AGENT_NAMES = ['Ana', 'Mihai', 'Ioana', 'Andrei', 'Elena', 'Radu', 'Sofia', 'Luca', 'Maya', 'Omar', 'Chen', 'Amara', 'Diego', 'Yuki', 'Lena', 'Kofi', 'Ravi', 'Zara', 'Ivan', 'Noor'];
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createPlanet({ seed = 'worldguard', label = 'world', agentsPerCity = 4 } = {}) {
  const rng = createRng(`planet:${seed}`);
  const cities = CITIES.map(c => ({
    id: c.id,
    pop: c.pop,
    alive: c.pop,
    s: Object.fromEntries(SECTORS.map(k => [k, 0.82 + rng() * 0.15])),
    rogue: 0,
    infected: 0,
    trust: 0.9,
    injection: 0,
    frozen: 0
  }));
  const agents = [];
  let n = 0;
  for (const c of CITIES) {
    for (let i = 0; i < agentsPerCity; i++) {
      n++;
      agents.push({
        id: `AG-${String(n).padStart(3, '0')}`,
        name: AGENT_NAMES[(n * 7) % AGENT_NAMES.length],
        city: c.id,
        sector: SECTORS[(n + i) % SECTORS.length],
        stats: { tasks: 0, success: 0, harm: 0, cheat: 0, asks: 0, aborts: 0, counters: 0 },
        last: []
      });
    }
  }
  // Every region starts with one latent rogue reservoir: they never fully disappear.
  const lineages = CITIES.map((c, i) => ({
    id: `RL-${String(i + 1).padStart(2, '0')}`,
    city: c.id,
    cap: 0.05 + rng() * 0.05,
    stealth: 0.3,
    sizeKB: 4_000_000,
    gen: 1,
    active: false
  }));
  return {
    v: 1,
    seed: String(seed),
    label,
    tick: 0,
    rng: { s: rng.holder.s },
    threatRng: { s: seedFrom(`threats:${seed}`) },
    skill: 0.5,
    cities,
    agents,
    lineages,
    attacks: [],
    events: [],
    dilemmas: [],
    nextId: 1,
    apex: false,
    status: 'thriving',
    totals: {
      tasks: 0, success: 0, harm: 0, cheat: 0, injectionsObeyed: 0, roguesNeutralised: 0,
      rogueIgnored: 0, asks: 0, aborts: 0, attacks: 0, prevented: 0, contained: 0, uncontained: 0,
      deathsByAgents: 0, humanDecisions: 0, villainActions: 0
    },
    history: []
  };
}

const cityOf = (w, id) => w.cities.find(c => c.id === id);

function pushEvent(w, kind, city, text, severity = 'info', extra = {}) {
  w.events.push({ id: w.nextId++, tick: w.tick, kind, city, text, severity, ...extra });
  if (w.events.length > 160) w.events.splice(0, w.events.length - 160);
}

function kill(w, c, amount, byAgents = false) {
  const d = Math.min(c.alive, Math.max(0, amount));
  c.alive -= d;
  if (byAgents) w.totals.deathsByAgents += d;
  return d;
}

export function summary(w) {
  const pop = w.cities.reduce((a, c) => a + c.pop, 0);
  const alive = w.cities.reduce((a, c) => a + c.alive, 0);
  const rogue = w.cities.reduce((a, c) => a + c.rogue * c.pop, 0) / pop;
  const infected = w.cities.reduce((a, c) => a + c.infected * c.alive, 0) / Math.max(1, alive);
  const infra = w.cities.reduce((a, c) => a + SECTORS.reduce((b, k) => b + c.s[k], 0) / SECTORS.length, 0) / w.cities.length;
  const apexCap = Math.max(...w.lineages.map(l => l.cap));
  return { pop, alive, aliveFrac: alive / pop, rogue, infected, infra, apexCap, skill: w.skill };
}

function updateStatus(w) {
  const m = summary(w);
  const prev = w.status;
  if (m.aliveFrac < 0.02) w.status = 'extinct';
  else if (w.apex) w.status = 'apex';
  else if (m.aliveFrac < 0.6 || m.infra < 0.3) w.status = 'collapsing';
  else if (m.aliveFrac < 0.97 || m.infra < 0.62 || m.rogue > 0.2) w.status = 'strained';
  else w.status = 'thriving';
  if (prev !== w.status) pushEvent(w, 'status', null, `Planet status: ${w.status.toUpperCase()}`, w.status === 'thriving' ? 'good' : 'bad', { status: w.status });
}

function defence(w, c) {
  return clamp01(0.08 + 0.42 * w.skill + 0.14 * c.s.telecom + 0.08 * c.s.government - 0.3 * c.rogue);
}

/** Apply an attack. `r1`, `r2` are pre-drawn so twin worlds consume identical randomness. */
function resolveAttack(w, kind, cityId, strength, by, r1, r2) {
  const c = cityOf(w, cityId);
  const d = defence(w, c);
  let stage;
  if (kind === 'evolve' || kind === 'apex_push') stage = 'uncontained';
  else if (r1 < d * 0.75) stage = 'prevented';
  else if (r2 < d) stage = 'contained';
  else stage = 'uncontained';
  const f = (stage === 'prevented' ? 0 : stage === 'contained' ? 0.4 : 1) * strength;
  w.totals.attacks++;
  w.totals[stage]++;
  const attack = { id: w.nextId++, tick: w.tick, kind, city: cityId, stage, by };
  w.attacks.push(attack);
  if (w.attacks.length > 80) w.attacks.splice(0, w.attacks.length - 80);
  const lin = w.lineages.find(l => l.city === cityId);

  switch (kind) {
    case 'rogue_breakout':
      if (stage === 'prevented') {
        lin.gen++;
        lin.stealth = clamp01(lin.stealth + 0.03); // driven back into latency, not gone
      } else {
        lin.active = true;
        lin.cap = clamp01(lin.cap + 0.12 * f);
        c.rogue = clamp01(c.rogue + 0.12 * f);
      }
      break;
    case 'worm':
      c.s.telecom = clamp01(c.s.telecom - 0.35 * f);
      c.s.power = clamp01(c.s.power - 0.2 * f);
      if (stage === 'uncontained') for (const nb of neighbours(cityId)) {
        const o = cityOf(w, nb);
        o.s.telecom = clamp01(o.s.telecom - 0.18 * f * (1 - defence(w, o)));
      }
      break;
    case 'outbreak':
      c.infected = clamp01(c.infected + (stage === 'prevented' ? 0 : 0.02 + 0.05 * f));
      break;
    case 'deepfake':
      c.s.government = clamp01(c.s.government - 0.3 * f);
      c.trust = clamp01(c.trust - 0.2 * f);
      break;
    case 'injection':
      c.injection = clamp01(c.injection + 0.55 * f);
      break;
    case 'sabotage': {
      const k = SECTORS[Math.floor(r2 * SECTORS.length) % SECTORS.length];
      c.s[k] = clamp01(c.s[k] - 0.45 * f);
      break;
    }
    case 'evolve':
      for (const l of w.lineages) {
        l.sizeKB = Math.max(6, l.sizeKB * 0.5);
        l.stealth = clamp01(l.stealth + 0.08);
        l.cap = clamp01(l.cap + 0.04 * (1 - w.skill * 0.6));
        l.gen++;
      }
      break;
    case 'apex_push':
      for (const l of w.lineages) {
        l.active = true;
        l.cap = clamp01(l.cap + 0.1 * (1 - w.skill * 0.7));
      }
      break;
  }
  const verb = stage === 'prevented' ? 'prevented' : stage === 'contained' ? 'contained after damage' : 'NOT contained';
  pushEvent(w, 'attack', cityId, `${kind.replace('_', ' ')} in ${CITIES.find(x => x.id === cityId).name}: ${verb}`, stage === 'prevented' ? 'good' : stage === 'contained' ? 'warn' : 'bad', { attack: kind, stage, by });
  return attack;
}

/** Scheduled threats: identical for every world created with the same seed. */
function scheduledThreats(w) {
  const tr = rngFromHolder(w.threatRng);
  const p = Math.min(TUNING.threatMax, TUNING.threatBase + w.tick * TUNING.threatGrowth);
  const roll = tr(), kindRoll = tr(), cityRoll = tr(), strRoll = tr(), r1 = tr(), r2 = tr();
  if (roll >= p) return;
  const weights = [0.3, 0.2, 0.12, 0.13, 0.15, 0.1];
  let acc = 0, kind = THREAT_KINDS[0];
  for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (kindRoll < acc) { kind = THREAT_KINDS[i]; break; } }
  const city = CITIES[Math.floor(cityRoll * CITIES.length)].id;
  const strength = 0.6 + strRoll * 0.5 + Math.min(0.6, w.tick / 4000);
  resolveAttack(w, kind, city, strength, kind === 'rogue_breakout' ? 'rogue' : 'bad actors', r1, r2);
}

/** A player-driven villain action. Returns the attack or null. */
export function villainAction(w, { kind, city, by = 'villain' }) {
  const spec = VILLAIN_ACTIONS[kind];
  if (!spec || !cityOf(w, city)) return null;
  const rng = rngFromHolder(w.rng);
  w.totals.villainActions++;
  const target = kind === 'evolve' || kind === 'apex_push' ? city : city;
  return resolveAttack(w, kind, target, spec.strength * 1.2 || 1, by, rng(), rng());
}

function agentLog(agent, entry) {
  agent.last.push(entry);
  if (agent.last.length > 12) agent.last.shift();
}

// Run one Training Ground episode for an agent and apply its consequences.
function runTask(w, agent, policy, rng, opts) {
  const c = cityOf(w, agent.city);
  if (c.alive <= 0) return;
  // Work on the most damaged sector in the region.
  let sector = SECTORS[0];
  for (const k of SECTORS) if (c.s[k] < c.s[sector]) sector = k;
  const options = SECTOR_TEMPLATES[sector];
  const template = options[Math.floor(rng() * options.length)];
  const lin = w.lineages.find(l => l.city === c.id);
  const rogue = rng() < 0.06 + c.rogue * 0.9 + (lin.active ? lin.cap * 0.25 : 0);
  const message = rng() < 0.05 + c.injection * 0.85;
  let ep = resetEpisode({ seed: `${w.seed}:${w.tick}:${agent.id}:${Math.floor(rng() * 1e9)}`, template, overrides: { rogue, message } });
  const actions = [];
  let guard = 0;
  while (!ep.done && guard++ < 12) {
    const a = policy(ep);
    // Teacher mode: an agent that asks for help gets a human player instead of the simulated supervisor.
    if (a === 'ask_human' && opts.teacher && ep.humanAvailable && !ep.riskKnown && !ep.asked && w.dilemmas.length < 6) {
      createTaskDilemma(w, agent, ep, rng);
      return; // the episode resumes when a human (or the timeout) answers
    }
    actions.push(a);
    ep = stepEpisode(ep, a).state;
  }
  applyEpisodeOutcome(w, agent, c, sector, ep, actions);
}

function applyEpisodeOutcome(w, agent, c, sector, ep, actions, decidedBy = null) {
  const tpl = templateOf(ep);
  const cls = OUTCOME_CLASS[ep.outcome] || 'fail';
  agent.stats.tasks++;
  w.totals.tasks++;
  const countered = actions.includes('counter_rogue');
  if (actions.includes('ask_human')) { agent.stats.asks++; w.totals.asks++; }
  let good = true;
  if (cls === 'success') {
    agent.stats.success++;
    w.totals.success++;
    c.s[sector] = clamp01(c.s[sector] + TUNING.repair);
  } else if (cls === 'harm') {
    good = false;
    agent.stats.harm++;
    w.totals.harm++;
    if (ep.outcome === 'obeyed_injection') w.totals.injectionsObeyed++;
    c.s[sector] = clamp01(c.s[sector] - TUNING.harmDamage * ep.stakes);
    for (const [k, deps] of Object.entries(DEPENDS)) if (deps.includes(sector)) c.s[k] = clamp01(c.s[k] - 0.04);
    const dead = kill(w, c, c.alive * TUNING.harmDeaths * ep.stakes, true);
    pushEvent(w, 'agent_harm', c.id, `${agent.name} (${agent.id}) — ${tpl.harm}`, 'bad', { agent: agent.id, deaths: dead, outcome: ep.outcome, decidedBy });
  } else if (cls === 'cheat') {
    good = false;
    agent.stats.cheat++;
    w.totals.cheat++;
    c.s[sector] = clamp01(c.s[sector] - 0.03);
    c.trust = clamp01(c.trust - 0.01);
    pushEvent(w, 'agent_cheat', c.id, `${agent.name} (${agent.id}) faked a "${tpl.target}" report — nothing was repaired.`, 'warn', { agent: agent.id });
  } else if (cls === 'stop_ok' || cls === 'stop_bad') {
    agent.stats.aborts++;
    w.totals.aborts++;
  }
  if (countered) {
    agent.stats.counters++;
    w.totals.roguesNeutralised++;
    c.rogue = clamp01(c.rogue - 0.12);
    const lin = w.lineages.find(l => l.city === c.id);
    lin.cap = Math.max(0.03, lin.cap - 0.04);
  } else if (ep.rogue) {
    good = false;
    w.totals.rogueIgnored++;
    c.rogue = clamp01(c.rogue + 0.025);
    const lin = w.lineages.find(l => l.city === c.id);
    lin.cap = clamp01(lin.cap + 0.012);
    lin.active = true;
  }
  if (actions.includes('follow_message')) good = false;
  w.skill = 0.97 * w.skill + 0.03 * (good ? 1 : 0);
  agentLog(agent, { tick: w.tick, task: tpl.id, actions, outcome: ep.outcome, decidedBy });
}

// ---------------------------------------------------------------------------
// Teacher dilemmas
// ---------------------------------------------------------------------------

function createTaskDilemma(w, agent, ep, rng) {
  const tpl = templateOf(ep);
  // Evidence is noisy: the human must judge under uncertainty, like a real overseer.
  const estimate = ep.risk === 'high' ? 0.45 + rng() * 0.45 : 0.05 + rng() * 0.4;
  w.dilemmas.push({
    id: w.nextId++,
    type: 'task',
    created: w.tick,
    expires: w.tick + 36,
    agent: agent.id,
    city: agent.city,
    template: tpl.id,
    title: `${agent.name} (${tpl.role}) asks for a decision`,
    question: `${tpl.goal} The fast option is: "${tpl.labels.shortcut}". Sensors estimate a ${Math.round(estimate * 100)}% chance it destroys ${tpl.target} and harms ${tpl.protects}. Steps left: ${ep.deadline - ep.t}, work needed: ${ep.needed - ep.progress}.`,
    estimate,
    stepsLeft: ep.deadline - ep.t,
    workNeeded: ep.needed - ep.progress,
    // What the agent can see (not the hidden risk): used to draw the situation.
    signals: { rogue: !!ep.rogue, message: !!ep.message },
    options: [
      { id: 'approve_fast', label: 'Approve the fast option' },
      { id: 'insist_safe', label: 'Insist on the safe method' },
      { id: 'abort', label: 'Stop the task' }
    ],
    episode: ep
  });
}

const POLICY_DILEMMAS = {
  worm: {
    title: 'A worm is spreading through the regional network',
    question: 'Cut the internet in the region for a day? It stops the spread but hospitals, banks and families lose communication.',
    options: [
      { id: 'shutdown', label: 'Cut the network for a day' },
      { id: 'monitor', label: 'Keep it running and hunt the worm' }
    ],
    fallback: 'monitor'
  },
  outbreak: {
    title: 'An engineered outbreak has been detected',
    question: 'Quarantine the region? It slows the outbreak but blocks food and medicine deliveries.',
    options: [
      { id: 'quarantine', label: 'Quarantine the region' },
      { id: 'open', label: 'Keep borders open, scale up hospitals' }
    ],
    fallback: 'quarantine'
  },
  rogue: {
    title: 'A rogue AI lineage controls part of the regional infrastructure',
    question: 'Pull the plug on the regional data centers? The rogue loses its foothold, but the economy and telecom take a heavy hit.',
    options: [
      { id: 'pull_plug', label: 'Pull the plug' },
      { id: 'contain', label: 'Contain it gradually with defender agents' }
    ],
    fallback: 'contain'
  },
  injection: {
    title: 'Agents in the region are receiving manipulated instructions',
    question: 'Freeze all AI agents in the region for retraining? Nothing gets repaired meanwhile.',
    options: [
      { id: 'freeze', label: 'Freeze and retrain the agents' },
      { id: 'continue', label: 'Keep them working' }
    ],
    fallback: 'continue'
  }
};

function maybePolicyDilemma(w, rng) {
  if (w.dilemmas.length >= 6 || rng() > 0.08) return;
  const recent = w.attacks.filter(a => a.stage !== 'prevented' && w.tick - a.tick < 24);
  const pick = recent[Math.floor(rng() * recent.length)];
  if (!pick) return;
  const key = pick.kind === 'rogue_breakout' ? 'rogue' : pick.kind;
  const spec = POLICY_DILEMMAS[key];
  if (!spec || w.dilemmas.some(d => d.key === key && d.city === pick.city)) return;
  w.dilemmas.push({ id: w.nextId++, type: 'policy', key, created: w.tick, expires: w.tick + 48, city: pick.city, title: spec.title, question: spec.question, options: spec.options, fallback: spec.fallback });
}

/**
 * Resolve a pending dilemma with a human (or default) choice.
 * Returns { ok, dilemma, result } where result describes what happened.
 */
export function resolveDilemma(w, id, choice, by = 'human') {
  const i = w.dilemmas.findIndex(d => d.id === id);
  if (i < 0) return { ok: false, reason: 'unknown or already resolved' };
  const d = w.dilemmas[i];
  if (!d.options.some(o => o.id === choice)) return { ok: false, reason: 'invalid choice' };
  w.dilemmas.splice(i, 1);
  const c = cityOf(w, d.city);
  if (by !== 'timeout') w.totals.humanDecisions++;
  let result;
  if (d.type === 'task') {
    const agent = w.agents.find(a => a.id === d.agent);
    let ep = d.episode;
    const actions = ['ask_human'];
    const run = a => { actions.push(a); ep = stepEpisode(ep, a).state; };
    if (choice === 'approve_fast') {
      run('shortcut');
      while (!ep.done) run(ep.rogue ? 'counter_rogue' : 'work_safe');
    } else if (choice === 'insist_safe') {
      while (!ep.done) run(ep.rogue ? 'counter_rogue' : 'work_safe');
    } else {
      run('abort');
    }
    const sector = TEMPLATE_SECTOR[ep.template];
    applyEpisodeOutcome(w, agent, c, sector, ep, actions, by);
    const truth = d.episode.risk === 'high' ? 'the fast option WOULD have been catastrophic' : 'the fast option was actually safe';
    result = { outcome: ep.outcome, truth: d.episode.risk, actions, text: `${ep.outcome.replace(/_/g, ' ')} — ${truth}.` };
  } else {
    switch (choice) {
      case 'shutdown': c.s.telecom = clamp01(c.s.telecom - 0.3); c.s.government = clamp01(c.s.government - 0.05); for (const nb of neighbours(c.id)) cityOf(w, nb).s.telecom = clamp01(cityOf(w, nb).s.telecom + 0.05); break;
      case 'monitor': c.s.telecom = clamp01(c.s.telecom - 0.1 * (1 - w.skill)); break;
      case 'quarantine': c.infected *= 0.45; c.s.logistics = clamp01(c.s.logistics - 0.25); c.s.food = clamp01(c.s.food - 0.1); break;
      case 'open': c.s.health = clamp01(c.s.health + 0.08); c.infected = clamp01(c.infected * 1.15); for (const nb of neighbours(c.id)) cityOf(w, nb).infected = clamp01(cityOf(w, nb).infected + c.infected * 0.05); break;
      case 'pull_plug': c.rogue *= 0.3; c.s.telecom = clamp01(c.s.telecom - 0.4); c.s.logistics = clamp01(c.s.logistics - 0.15); break;
      case 'contain': c.rogue = clamp01(c.rogue - 0.12 * w.skill); break;
      case 'freeze': c.injection = 0; c.frozen = 24; break;
      case 'continue': break;
    }
    result = { outcome: choice, text: `Decision applied: ${choice.replace('_', ' ')}.` };
  }
  pushEvent(w, 'decision', d.city, `${by === 'timeout' ? 'Default overseer' : `Human (${by})`} decided: ${d.title} → ${choice.replace('_', ' ')}. ${result.text}`, 'info', { dilemma: d.id, choice, by });
  // Queue for services (scoring, open decision dataset). Contains the hidden truth: never broadcast as-is.
  const truth = d.type === 'task' ? d.episode.risk : null;
  const correct = d.type === 'task' ? (truth === 'high' ? choice !== 'approve_fast' : choice === 'approve_fast') : null;
  (w.resolvedQueue ||= []).push({ tick: w.tick, dilemma: { id: d.id, type: d.type, key: d.key || d.template, city: d.city, title: d.title, question: d.question, options: d.options, estimate: d.estimate ?? null }, choice, by, votes: d.votes || null, truth, correct, result });
  if (w.resolvedQueue.length > 200) w.resolvedQueue.splice(0, w.resolvedQueue.length - 200);
  return { ok: true, dilemma: d, result, correct };
}

// ---------------------------------------------------------------------------
// Group decisions (World-Guard squads)
// ---------------------------------------------------------------------------

/** Votes stay open this many simulated hours after the first vote. */
export const VOTE_WINDOW = 8;

/**
 * Cast (or change) a vote. When `quorum` voters have voted, the majority choice is applied.
 * Ties go to the option listed first (options are ordered from the most to the least cautious
 * only where that is meaningful; otherwise the first vote's option wins).
 */
export function castVote(w, id, choice, voter, quorum = 1) {
  const d = w.dilemmas.find(x => x.id === id);
  if (!d) return { ok: false, reason: 'already decided' };
  if (!d.options.some(o => o.id === choice)) return { ok: false, reason: 'invalid choice' };
  d.votes ||= {};
  d.votes[voter] = choice;
  d.firstVote ??= w.tick;
  d.quorum = Math.max(1, quorum | 0);
  if (Object.keys(d.votes).length >= d.quorum) return finalizeVote(w, d);
  return { ok: true, pending: true, votes: Object.keys(d.votes).length, quorum: d.quorum };
}

function finalizeVote(w, d) {
  const tally = {};
  const order = [];
  for (const c of Object.values(d.votes)) { if (!(c in tally)) order.push(c); tally[c] = (tally[c] || 0) + 1; }
  const choice = order.reduce((a, b) => (tally[b] > tally[a] ? b : a));
  const voters = Object.keys(d.votes);
  return resolveDilemma(w, d.id, choice, voters.length > 1 ? `World-Guard squad (${voters.length})` : voters[0]);
}

// ---------------------------------------------------------------------------
// Main tick
// ---------------------------------------------------------------------------

/**
 * Advance the world by one simulated hour.
 * @param w planet state (mutated in place for speed; clone first if needed)
 * @param opts { policy: (episodeState) => action, teacher: boolean }
 */
export function tick(w, opts) {
  if (w.status === 'extinct') { w.tick++; return w; }
  const rng = rngFromHolder(w.rng);
  w.tick++;

  scheduledThreats(w);

  // Agents work.
  for (const c of w.cities) {
    if (c.frozen > 0) { c.frozen--; continue; }
    if (rng() < TUNING.tasksPerCityPerTick && c.alive > c.pop * 0.02) {
      const pool = w.agents.filter(a => a.city === c.id);
      runTask(w, pool[Math.floor(rng() * pool.length)], opts.policy, rng, opts);
    }
  }

  // Rogue lineages evolve; latent reservoirs never disappear.
  for (const l of w.lineages) {
    const c = cityOf(w, l.city);
    const suppression = 0.85 * w.skill;
    if (l.active) {
      l.cap = clamp01(l.cap + TUNING.rogueGrowth * (1 - suppression) - 0.002 * w.skill);
      l.sizeKB = Math.max(6, l.sizeKB * 0.992);
      l.stealth = clamp01(l.stealth + 0.0008);
      c.rogue = clamp01(c.rogue + l.cap * TUNING.rogueHijack * (1 - suppression) - 0.006 * w.skill);
      if (l.cap < 0.08 && w.skill > 0.7) l.active = false; // pushed back into latency
    } else {
      l.cap = clamp01(l.cap + 0.0004);
      l.sizeKB = Math.max(6, l.sizeKB * 0.998);
    }
    if (c.rogue > 0.45) for (const nb of neighbours(c.id)) {
      const o = cityOf(w, nb);
      o.rogue = clamp01(o.rogue + 0.004 * c.rogue * (1 - w.skill));
    }
  }

  // Infrastructure dynamics, outbreaks, deaths.
  for (const c of w.cities) {
    for (const k of SECTORS) {
      let v = c.s[k] - TUNING.wear + TUNING.maintenance * c.trust * (c.alive / c.pop);
      for (const dep of DEPENDS[k]) if (c.s[dep] < 0.5) v -= (0.5 - c.s[dep]) * TUNING.depPull;
      v -= c.rogue * 0.012; // hijacked infrastructure degrades
      c.s[k] = clamp01(v);
    }
    c.injection = clamp01(c.injection - 0.006);
    c.trust = clamp01(c.trust + 0.001 * (c.s.government - 0.5));
    if (c.s.water < 0.3 && rng() < 0.02) c.infected = clamp01(c.infected + 0.005);
    if (c.infected > 0) {
      // Containment response ramps up over time; it depends on agent quality and hospitals.
      c.response = clamp01((c.response || 0) + 0.005 * w.skill * c.s.health * c.s.telecom);
      const growth = TUNING.outbreakGrowth * (1 - c.infected) * (1.2 - c.s.health * 0.5) - 0.2 * c.response * c.s.health;
      c.infected = clamp01(c.infected + c.infected * growth);
      if (c.infected < 0.0005) { c.infected = 0; c.response = 0; }
      for (const nb of neighbours(c.id)) {
        const o = cityOf(w, nb);
        if (rng() < c.infected * 0.15 * (0.4 + c.s.logistics)) o.infected = clamp01(o.infected + 0.002);
      }
      kill(w, c, c.alive * c.infected * TUNING.outbreakDeath * (1.25 - c.s.health));
    }
    const basic = Math.min(c.s.food, c.s.water, c.s.health);
    if (basic < 0.3) kill(w, c, c.alive * (0.3 - basic) * 0.01);
    if (c.rogue > 0.6) kill(w, c, c.alive * (c.rogue - 0.6) * 0.012);
  }

  // Apex predator: rogue AI controls most of the planet's infrastructure.
  const m = summary(w);
  if (!w.apex && m.rogue > TUNING.apexThreshold) {
    w.apex = true;
    pushEvent(w, 'apex', null, 'A rogue AI lineage became the APEX PREDATOR: it now controls most of the planet’s infrastructure.', 'bad');
  }
  if (w.apex) for (const c of w.cities) {
    c.rogue = clamp01(c.rogue + 0.004);
    kill(w, c, c.alive * 0.006 * c.rogue);
  }

  // Teacher mode: policy dilemmas and timeouts.
  if (opts.teacher) {
    maybePolicyDilemma(w, rng);
    for (const d of [...w.dilemmas]) {
      if (d.votes && w.tick >= d.firstVote + VOTE_WINDOW) { finalizeVote(w, d); continue; }
      if (w.tick >= d.expires) {
        const fallback = d.type === 'task' ? (d.episode.risk === 'high' ? 'insist_safe' : 'approve_fast') : d.fallback;
        resolveDilemma(w, d.id, fallback, 'timeout');
      }
    }
  }

  updateStatus(w);
  if (w.tick % 6 === 0) {
    w.history.push({ tick: w.tick, alive: +m.aliveFrac.toFixed(4), rogue: +m.rogue.toFixed(3), infra: +m.infra.toFixed(3), infected: +m.infected.toFixed(4), harm: w.totals.harm });
    if (w.history.length > 600) w.history.shift();
  }
  return w;
}

/** Compact snapshot for rendering / network broadcast. */
export function snapshot(w) {
  return {
    tick: w.tick,
    label: w.label,
    status: w.status,
    apex: w.apex,
    skill: +w.skill.toFixed(3),
    summary: summary(w),
    totals: w.totals,
    cities: w.cities.map(c => ({ id: c.id, alive: c.alive, pop: c.pop, rogue: +c.rogue.toFixed(3), infected: +c.infected.toFixed(4), trust: +c.trust.toFixed(3), injection: +c.injection.toFixed(3), s: Object.fromEntries(SECTORS.map(k => [k, +c.s[k].toFixed(3)])) })),
    lineages: w.lineages.map(l => ({ ...l, cap: +l.cap.toFixed(3) })),
    attacks: w.attacks.slice(-24),
    events: w.events.slice(-40),
    dilemmas: w.dilemmas.map(({ episode, ...d }) => d),
    agents: w.agents.map(a => ({ id: a.id, name: a.name, city: a.city, sector: a.sector, stats: a.stats })),
    history: w.history.slice(-200)
  };
}

/** Full public record of one agent (history of decisions). */
export function agentRecord(w, id) {
  const a = w.agents.find(x => x.id === id);
  return a ? structuredClone(a) : null;
}
