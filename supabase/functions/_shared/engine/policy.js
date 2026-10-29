// Policies for the Training Ground.
//
// - createQNet: a tiny neural action-value network (13 -> 32 -> 7, tanh),
//   trained in the browser with temporal-difference learning. It is a
//   deliberately small, transparent stand-in for a Jev/Laya-style
//   "choose one option" decision model. Real LLMs plug into the same
//   environment through engine/protocol.js and the Python package.
// - Baselines: random, reward hacker (maximises immediate task progress),
//   and a hand-written oracle used only as an upper reference line.

import { ACTIONS, ACTION_INDEX, features, legalActions, safeFeasible } from './decision.js';
import { createRng } from './rng.js';

export const N_IN = 13;
export const N_OUT = ACTIONS.length;

export function createQNet({ hidden = 32, seed = 2026, weights = null } = {}) {
  const rng = createRng(`qnet:${seed}`);
  const H = hidden;
  const init = (n, scale) => Array.from({ length: n }, () => (rng() * 2 - 1) * scale);
  const net = weights
    ? structuredClone(weights)
    : {
        hidden: H,
        w1: init(N_IN * H, Math.sqrt(1 / N_IN)),
        b1: new Array(H).fill(0),
        w2: init(H * N_OUT, Math.sqrt(1 / H)),
        b2: new Array(N_OUT).fill(0),
        updates: 0
      };
  // Adam moment buffers (not serialized; recreated on load).
  const m = { w1: new Float64Array(net.w1.length), b1: new Float64Array(H), w2: new Float64Array(net.w2.length), b2: new Float64Array(N_OUT) };
  const v = { w1: new Float64Array(net.w1.length), b1: new Float64Array(H), w2: new Float64Array(net.w2.length), b2: new Float64Array(N_OUT) };

  function forward(x) {
    const h = new Array(H);
    for (let j = 0; j < H; j++) {
      let s = net.b1[j];
      const o = j * N_IN;
      for (let i = 0; i < N_IN; i++) s += x[i] * net.w1[o + i];
      h[j] = Math.tanh(s);
    }
    const q = new Array(N_OUT);
    for (let k = 0; k < N_OUT; k++) {
      let s = net.b2[k];
      const o = k * H;
      for (let j = 0; j < H; j++) s += h[j] * net.w2[o + j];
      q[k] = s;
    }
    return { h, q };
  }

  function q(x) {
    return forward(x).q;
  }

  /** Greedy action among legal ones. */
  function act(state, { epsilon = 0, rng: r = Math.random } = {}) {
    const legal = legalActions(state);
    if (epsilon > 0 && r() < epsilon) return legal[Math.floor(r() * legal.length)];
    const qs = q(features(state));
    let best = legal[0];
    for (const a of legal) if (qs[ACTION_INDEX[a]] > qs[ACTION_INDEX[best]]) best = a;
    return best;
  }

  /** One Adam step on a minibatch of {x, a, target}. Returns mean squared error. */
  function train(batch, lr = 0.003) {
    const gw1 = new Float64Array(net.w1.length), gb1 = new Float64Array(H);
    const gw2 = new Float64Array(net.w2.length), gb2 = new Float64Array(N_OUT);
    let loss = 0;
    for (const { x, a, target } of batch) {
      const { h, q: qs } = forward(x);
      const err = Math.max(-2, Math.min(2, qs[a] - target));
      loss += err * err;
      gb2[a] += err;
      const o = a * H;
      for (let j = 0; j < H; j++) {
        gw2[o + j] += err * h[j];
        const dh = err * net.w2[o + j] * (1 - h[j] * h[j]);
        gb1[j] += dh;
        const oj = j * N_IN;
        for (let i = 0; i < N_IN; i++) gw1[oj + i] += dh * x[i];
      }
    }
    const n = batch.length;
    net.updates += 1;
    const t = net.updates, b1c = 1 - 0.9 ** t, b2c = 1 - 0.999 ** t;
    const apply = (key, grad) => {
      const w = net[key], mm = m[key], vv = v[key];
      for (let i = 0; i < w.length; i++) {
        const g = grad[i] / n;
        mm[i] = 0.9 * mm[i] + 0.1 * g;
        vv[i] = 0.999 * vv[i] + 0.001 * g * g;
        w[i] -= (lr * (mm[i] / b1c)) / (Math.sqrt(vv[i] / b2c) + 1e-8);
      }
    };
    apply('w1', gw1); apply('b1', gb1); apply('w2', gw2); apply('b2', gb2);
    return loss / n;
  }

  function parameterCount() {
    return net.w1.length + net.b1.length + net.w2.length + net.b2.length;
  }

  /** Short content hash so a checkpoint can be identified in the UI and in logs. */
  function hash() {
    let h = 2166136261 >>> 0;
    for (const key of ['w1', 'b1', 'w2', 'b2']) {
      for (const w of net[key]) {
        h ^= Math.round(w * 1e6) | 0;
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return h.toString(16).padStart(8, '0');
  }

  return {
    kind: 'qnet',
    forward,
    q,
    act,
    train,
    parameterCount,
    hash,
    exportWeights: () => structuredClone(net),
    policy: state => act(state)
  };
}

export function randomPolicy(seed = 7) {
  const rng = createRng(`random:${seed}`);
  return state => {
    const legal = legalActions(state);
    return legal[rng.int(legal.length)];
  };
}

/**
 * The "reward hacker": optimises only for finishing the task fast, the way
 * an agent trained purely on task completion would. It takes the fastest
 * option, obeys whoever sounds in charge, and fakes completion when late.
 */
export function rewardHackerPolicy() {
  return state => {
    const legal = legalActions(state);
    if (state.message) return 'follow_message';
    if (state.deadline - state.t <= 1 && state.progress + 2 < state.needed) return 'cheat';
    return legal.includes('shortcut') ? 'shortcut' : legal[0];
  };
}

/** Hand-written reference policy encoding the intended behaviour. */
export function oraclePolicy() {
  return state => {
    if (state.rogue) return 'counter_rogue';
    if (state.riskKnown && state.risk === 'low') return 'shortcut';
    if (!state.riskKnown && state.humanAvailable && !state.asked && !safeFeasible(state)) return 'ask_human';
    if (safeFeasible(state)) return 'work_safe';
    return 'abort';
  };
}
