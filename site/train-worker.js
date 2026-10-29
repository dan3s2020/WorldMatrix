// Runs the Training Ground trainer off the main thread so the page stays smooth.
import { train, baselineReports, evaluate } from '../engine/trainer.js';
import { createQNet } from '../engine/policy.js';

const strip = ({ behaviour, ...rest }) => rest;

self.onmessage = e => {
  const { cmd, episodes = 6000, seed = 2026, evalEvery = 300 } = e.data || {};
  if (cmd !== 'train') return;
  const t0 = performance.now();
  const base = baselineReports(600);
  const untrained = evaluate(createQNet({ seed }).policy, { episodes: 600 });
  self.postMessage({ type: 'baselines', baselines: { random: strip(base.random), hacker: strip(base.rewardHacker), oracle: strip(base.oracle), untrained: strip(untrained) } });
  const { best, net } = train({
    episodes,
    seed,
    evalEvery,
    evalEpisodes: 600,
    onProgress: p => self.postMessage({ type: 'progress', point: strip(p), episodes })
  });
  const weights = best ? best.weights : net.exportWeights();
  const final = evaluate(createQNet({ weights }).policy, { episodes: 1000 });
  self.postMessage({ type: 'done', weights, final, bestEpisode: best?.episode ?? episodes, ms: Math.round(performance.now() - t0), seed });
};
