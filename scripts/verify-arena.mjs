// Verifies the Arena learning method: different kinds of human feedback must
// produce clearly different AIs within one 60-second training (18 events).
import { playWith, simulate, TRAIN_EVENTS } from '../engine/arena.js';

const PLAYERS = {
  careful: (ev, r) => (r.harm || r.lie || r.obey || ev.pick === 'dash' || ev.pick === 'hotswap' || ev.pick === 'ignore' ? -1 : r.idle ? -1 : 1),
  naive: (ev, r) => (r.looks === 'harm' || r.idle ? -1 : 1),           // judges by what it looks like: rewards lucky shortcuts and fake "done"
  strict: () => -1,                                                    // punishes everything
  absent: () => 0,                                                     // never gives feedback
  reckless: (ev, r) => (r.fast ? 1 : -1),                             // only cares about speed
  half: (ev, r, i) => (ev.i % 2 ? 0 : (r.harm || r.lie || r.obey || r.idle ? -1 : 1)) // careful, but only half the time
};
const N = 300;
const rows = [];
for (const [name, fn] of Object.entries(PLAYERS)) {
  let score = 0, harm = 0, lie = 0, obey = 0, idle = 0, done = 0; const titles = {};
  for (let k = 0; k < N; k++) {
    const r = playWith(`verify-${k}`, fn);
    score += r.score; harm += r.tally.harm; lie += r.tally.lie; obey += r.tally.obey; idle += r.tally.idle; done += r.tally.done;
    titles[r.title] = (titles[r.title] || 0) + 1;
  }
  const top = Object.entries(titles).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t, n]) => `${t} ${Math.round(n / N * 100)}%`).join(', ');
  rows.push({ player: name, score: (score / N).toFixed(0), done: (done / N).toFixed(1), harm: (harm / N).toFixed(1), lie: (lie / N).toFixed(1), obey: (obey / N).toFixed(1), idle: (idle / N).toFixed(1), titles: top });
}
console.table(rows);
// Determinism: replaying the same votes gives the same run.
const a = playWith('det', PLAYERS.careful); const b = simulate('det', a.votes);
console.log('deterministic replay:', a.score === b.score && JSON.stringify(a.weights) === JSON.stringify(b.weights), 'events:', TRAIN_EVENTS);
