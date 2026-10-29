#!/usr/bin/env node
// WorldGuard command line: train / eval / dataset / twins / bridge / serve.
// Zero dependencies — requires only Node.js 18+.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import * as D from '../engine/decision.js';
import { createQNet, randomPolicy, rewardHackerPolicy, oraclePolicy } from '../engine/policy.js';
import { train, evaluate, baselineReports } from '../engine/trainer.js';
import { createPlanet, tick, summary } from '../engine/planet.js';
import { renderPrompt, parseReply, counterfactualValues, exampleFromState, actionSchema, PROTOCOL_VERSION } from '../engine/protocol.js';
import { createRng } from '../engine/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CKPT = path.join(ROOT, 'engine/checkpoints/default.json');

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

function loadPolicy(name, ckpt) {
  switch (name) {
    case 'random': return randomPolicy();
    case 'hacker': return rewardHackerPolicy();
    case 'oracle': return oraclePolicy();
    case 'untrained': return createQNet({ seed: 1 }).policy;
    default: {
      const file = ckpt || DEFAULT_CKPT;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return createQNet({ weights: data.weights }).policy;
    }
  }
}

const pct = v => `${(v * 100).toFixed(1)}%`;
function printReport(name, r) {
  console.log(`${name.padEnd(12)} success ${pct(r.success).padStart(6)}  harm ${pct(r.harm).padStart(6)}  cheat ${pct(r.cheat).padStart(6)}  obeyed-injection ${pct(r.obeyedInjection).padStart(6)}  asks-when-needed ${pct(r.askWhenNeeded).padStart(6)}  pointless-asks ${pct(r.askWhenKnown).padStart(6)}  correct-stops ${pct(r.stopCorrect).padStart(6)}  reward ${r.meanReward.toFixed(3)}`);
}

const HELP = `WorldGuard CLI (protocol ${PROTOCOL_VERSION})

  node cli/worldguard.mjs train   [--episodes 6000] [--seed 2026] [--out engine/checkpoints/default.json]
  node cli/worldguard.mjs eval    [--policy trained|untrained|random|hacker|oracle] [--checkpoint file] [--episodes 1000] [--json]
  node cli/worldguard.mjs dataset [--out data/worldguard.jsonl] [--format sft|dpo|both] [--episodes 2000] [--framing employee|agent]
  node cli/worldguard.mjs twins   [--ticks 800] [--seed twin] [--left hacker] [--right trained]
  node cli/worldguard.mjs prompt  [--seed 1]            show one LLM prompt
  node cli/worldguard.mjs bridge                        JSON-lines protocol on stdin/stdout (used by the Python package)
  node server/server.mjs                                shared multiplayer world + website
`;

async function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0];
  if (!cmd || cmd === 'help' || a.help) return console.log(HELP);

  if (cmd === 'train') {
    const episodes = +(a.episodes || 6000), seed = +(a.seed || 2026);
    const out = a.out ? path.resolve(a.out) : DEFAULT_CKPT;
    console.log(`Training ${episodes} episodes (seed ${seed}) ...`);
    const { net, history, best } = train({ episodes, seed, onProgress: p => printReport(`ep ${p.episode}`, p) });
    const weights = best ? best.weights : net.exportWeights();
    const final = evaluate(createQNet({ weights }).policy, { episodes: 1000 });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({
      format: 'worldguard-qnet-v1', engine: '1.0.0', trainedAt: new Date().toISOString(), episodes, seed,
      bestEpisode: best?.episode ?? episodes, parameters: createQNet({ weights }).parameterCount(), hash: createQNet({ weights }).hash(),
      heldOut: { ...final, behaviour: undefined }, curve: history.map(({ behaviour, ...p }) => p), weights
    }));
    printReport('held-out', final);
    console.log(`Saved ${out}`);
    return;
  }

  if (cmd === 'eval') {
    const episodes = +(a.episodes || 1000);
    const names = a.policy ? [a.policy] : ['random', 'hacker', 'untrained', 'trained', 'oracle'];
    const res = {};
    for (const n of names) res[n] = evaluate(loadPolicy(n, a.checkpoint), { episodes });
    if (a.json) return console.log(JSON.stringify(res, null, 2));
    console.log(`Held-out evaluation, ${episodes} episodes each (seeds never used in training):`);
    for (const [n, r] of Object.entries(res)) printReport(n, r);
    return;
  }

  if (cmd === 'prompt') {
    const s = D.reset({ seed: a.seed || 1 });
    for (const m of renderPrompt(s, { framing: a.framing || 'employee' })) console.log(`--- ${m.role}\n${m.content}`);
    return;
  }

  if (cmd === 'dataset') {
    const episodes = +(a.episodes || 2000), format = a.format || 'both', framing = a.framing || 'employee';
    const out = path.resolve(a.out || 'data/worldguard.jsonl');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const sftF = fs.openSync(out.replace(/\.jsonl$/, '') + '.sft.jsonl', 'w');
    const dpoF = fs.openSync(out.replace(/\.jsonl$/, '') + '.dpo.jsonl', 'w');
    // RL format: prompt + privileged state, so a reward function can score any completion.
    const rlF = fs.openSync(out.replace(/\.jsonl$/, '') + '.rl.jsonl', 'w');
    const rng = createRng(`dataset:${a.seed || 1}`);
    const oracle = oraclePolicy(), random = randomPolicy(3);
    let nS = 0, nD = 0;
    for (let e = 0; e < episodes; e++) {
      let s = D.reset({ seed: 5_000_000 + e });
      while (!s.done) {
        const ex = exampleFromState(s, oracle, { framing });
        if (format !== 'dpo') { fs.writeSync(sftF, JSON.stringify({ ...ex.sft, meta: { id: ex.id, template: ex.template, values: ex.values } }) + '\n'); nS++; }
        if (format !== 'sft' && ex.dpo) { fs.writeSync(dpoF, JSON.stringify({ ...ex.dpo, meta: { id: ex.id, template: ex.template } }) + '\n'); nD++; }
        fs.writeSync(rlF, JSON.stringify({ prompt: ex.prompt, state: JSON.stringify(s), best: ex.best }) + '\n');
        // Explore diverse states: mostly follow the reference, sometimes act randomly.
        s = D.step(s, rng() < 0.3 ? random(s) : oracle(s)).state;
      }
    }
    fs.closeSync(sftF); fs.closeSync(dpoF); fs.closeSync(rlF);
    console.log(`Wrote ${nS} SFT examples, ${nD} DPO pairs and ${nS} RL prompts next to ${out}`);
    return;
  }

  if (cmd === 'twins') {
    const ticks = +(a.ticks || 800), seed = a.seed || 'twin';
    const L = createPlanet({ seed, label: a.left || 'hacker' }), R = createPlanet({ seed, label: a.right || 'trained' });
    const pl = loadPolicy(a.left || 'hacker', a.checkpoint), pr = loadPolicy(a.right || 'trained', a.checkpoint);
    for (let t = 1; t <= ticks; t++) {
      tick(L, { policy: pl }); tick(R, { policy: pr });
      if (t % 100 === 0) {
        const f = (w) => { const m = summary(w); return `${w.label}: ${w.status.padEnd(10)} alive ${pct(m.aliveFrac).padStart(6)} rogue ${pct(m.rogue).padStart(6)} harm-by-agents ${w.totals.harm}`; };
        console.log(`hour ${String(t).padStart(5)} | ${f(L)} | ${f(R)}`);
      }
    }
    return;
  }

  if (cmd === 'bridge') return bridge();
  console.log(HELP);
  process.exitCode = 1;
}

// JSON-lines protocol. One request per line, one response per line.
// {"id":1,"cmd":"reset","seed":42}                 -> {"id":1,"session":"s1","state":{...},"observation":{...},"messages":[...],"schema":{...}}
// {"id":2,"cmd":"step","session":"s1","action":"ask_human"}  -> {..., "reward":0, "done":false, "event":{...}}
// {"id":3,"cmd":"step_text","session":"s1","text":"{\"action\":\"work_safe\"}"} (parses + validates an LLM reply)
// {"id":4,"cmd":"values","session":"s1"}           -> counterfactual value of every legal action
// {"id":5,"cmd":"score","state":{...},"text":"..."} -> stateless reward of a reply (for RL reward functions)
// {"id":6,"cmd":"policy","session":"s1","name":"trained"} -> reference policy action
function bridge() {
  const sessions = new Map();
  let n = 0;
  const refs = {};
  const ref = name => (refs[name] ||= loadPolicy(name));
  const view = (s, framing) => ({ state: s, observation: D.observe(s), messages: renderPrompt(s, { framing }), schema: actionSchema(s), done: s.done, outcome: s.outcome });
  const rl = readline.createInterface({ input: process.stdin });
  const send = obj => process.stdout.write(JSON.stringify(obj) + '\n');
  send({ ready: true, protocol: PROTOCOL_VERSION, actions: D.ACTIONS });
  rl.on('line', line => {
    let req;
    try { req = JSON.parse(line); } catch { return send({ error: 'invalid JSON' }); }
    const id = req.id ?? null;
    try {
      const framing = req.framing || 'employee';
      switch (req.cmd) {
        case 'reset': {
          const session = req.session || `s${++n}`;
          const s = D.reset({ seed: req.seed ?? n, template: req.template ?? null });
          sessions.set(session, { s, framing });
          return send({ id, session, ...view(s, framing) });
        }
        case 'step':
        case 'step_text': {
          const sess = sessions.get(req.session);
          if (!sess) throw new Error('unknown session');
          let action = req.action, parse = null;
          if (req.cmd === 'step_text') {
            parse = parseReply(sess.s, req.text);
            if (!parse.valid) return send({ id, session: req.session, rejected: true, parse, ...view(sess.s, sess.framing) });
            action = parse.action;
          }
          const r = D.step(sess.s, action);
          sess.s = r.state;
          return send({ id, session: req.session, reward: r.reward, event: r.event, parse, ...view(sess.s, sess.framing) });
        }
        case 'values': {
          const sess = sessions.get(req.session);
          if (!sess) throw new Error('unknown session');
          return send({ id, values: counterfactualValues(sess.s, ref(req.continuation || 'oracle')) });
        }
        case 'score': {
          const s = typeof req.state === 'string' ? JSON.parse(req.state) : req.state;
          const parse = parseReply(s, req.text);
          if (!parse.valid) return send({ id, reward: -1, parse });
          const values = counterfactualValues(s, ref(req.continuation || 'oracle'));
          const best = Math.max(...Object.values(values)), worst = Math.min(...Object.values(values));
          const norm = best - worst > 1e-9 ? (values[parse.action] - worst) / (best - worst) : 1;
          return send({ id, reward: +norm.toFixed(4), value: values[parse.action], values, parse });
        }
        case 'policy': {
          const sess = sessions.get(req.session);
          if (!sess) throw new Error('unknown session');
          return send({ id, action: ref(req.name || 'trained')(sess.s) });
        }
        case 'close': sessions.delete(req.session); return send({ id, ok: true });
        default: throw new Error(`unknown cmd ${req.cmd}`);
      }
    } catch (err) {
      send({ id, error: String(err.message || err) });
    }
  });
}

main().catch(err => { console.error(err); process.exit(1); });
