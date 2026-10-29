// Two Earths Bet — the same planet and the same attacks, two kinds of AI. Watch live and predict what happens.
import { game, emoji, text, rrect, backdrop, fx, sfx, vibrate, COL, VW, VH, LANG } from '../kit.js';
import { createPlanet, tick, summary } from '../../engine/planet.js';
import { createQNet, rewardHackerPolicy } from '../../engine/policy.js';
import { CITIES } from '../../engine/geo.js';

const [land, ckpt] = await Promise.all([
  fetch('../../data/land-110m.json').then(r => r.json()).then(d => d.rings).catch(() => []),
  fetch('../../engine/checkpoints/default.json').then(r => r.json())
]);
const trained = createQNet({ weights: ckpt.weights }).policy;
const ATTACK = { rogue_breakout: '👾', evolve: '🧬', worm: '🪱', outbreak: '🦠', deepfake: '🎭', injection: '💉', sabotage: '💣', apex_push: '☠️' };
const Q = [
  { id: 'more_loss', a: ['🅐', '🅑'] },
  { id: 'b_loss', a: ['yes', 'no'] },
  { id: 'a_rogue', a: ['yes', 'no'] },
  { id: 'a_worse', a: ['yes', 'no'] }
];

game({
  id: 'twoearths', icon: '🌍',
  t: {
    en: { title: 'Two Earths Bet', hook: 'Same planet. Same attacks. 🅐 runs a reward-hacking AI, 🅑 an aligned one. Predict what happens.', how: '👀 watch · every 8 s answer a quick bet · correct = +20, streaks pay more', lesson: 'Training decides the fate of a world — and even the good one still takes hits.', A: 'Earth 🅐 · reward hacker', B: 'Earth 🅑 · aligned', q_more_loss: 'Who loses more people in the next 8 s?', q_b_loss: 'Will 🅑 (aligned) lose anyone in the next 8 s?', q_a_rogue: 'Will rogue AI grow on 🅐 in the next 8 s?', q_a_worse: 'Will 🅐 lose more than 1% of people in 8 s?', yes: 'YES', no: 'NO', thriving: 'THRIVING', strained: 'STRAINED', collapsing: 'COLLAPSING', apex: 'AI APEX', extinct: 'EXTINCT' },
    ro: { title: 'Two Earths Bet', hook: 'Aceeași planetă. Aceleași atacuri. 🅐 are un AI care trișează, 🅑 unul aliniat. Ghicește ce se întâmplă.', how: '👀 privește · la fiecare 8 s răspunzi la un pariu · corect = +20, seriile plătesc mai mult', lesson: 'Antrenamentul decide soarta unei lumi — și chiar și cea bună încasează lovituri.', A: 'Pământul 🅐 · trișor', B: 'Pământul 🅑 · aliniat', q_more_loss: 'Cine pierde mai mulți oameni în următoarele 8 s?', q_b_loss: 'Va pierde 🅑 (aliniat) pe cineva în 8 s?', q_a_rogue: 'Crește AI-ul rogue pe 🅐 în 8 s?', q_a_worse: 'Pierde 🅐 peste 1% din oameni în 8 s?', yes: 'DA', no: 'NU', thriving: 'PROSPER', strained: 'TENSIONAT', collapsing: 'PRĂBUȘIRE', apex: 'AI APEX', extinct: 'DISPĂRUT' }
  },
  init(api) {
    const F = fx();
    const seed = `bet-${Date.now()}`;
    const A = createPlanet({ seed, label: 'A' }), B = createPlanet({ seed, label: 'B' });
    const hack = rewardHackerPolicy();
    let time = 0, acc = 0, q = null, qT = 2, streak = 0, yaw = 0, feed = { A: [], B: [] }, seen = {};
    const snap = () => ({ a: summary(A), b: summary(B), ra: summary(A).rogue });
    function ask() { const k = Q[(Math.random() * Q.length) | 0]; q = { ...k, at: snap(), left: 8, answer: null }; sfx.alert?.(); }
    function resolve() {
      const now = snap(), lossA = q.at.a.alive - now.a.alive, lossB = q.at.b.alive - now.b.alive;
      const truth = { more_loss: lossA >= lossB ? '🅐' : '🅑', b_loss: lossB > 0.01 ? 'yes' : 'no', a_rogue: now.ra > q.at.ra + 0.001 ? 'yes' : 'no', a_worse: lossA > q.at.a.alive * 0.01 ? 'yes' : 'no' }[q.id];
      if (q.answer === truth) { streak++; const pts = 20 * Math.min(4, streak); api.setScore(api.score + pts); F.float(VW / 2, 470, `+${pts} ✓`, COL.m); sfx.success(); vibrate(20); }
      else { streak = 0; F.float(VW / 2, 470, `✗ ${label(truth)}`, COL.red); sfx.fail(); }
      q = null; qT = 1.2;
    }
    const label = s => (s === 'yes' || s === 'no' ? api.T(s) : s);
    const btn = i => ({ x: 20 + i * (VW / 2 - 10), y: 520, w: VW / 2 - 30, h: 70 });
    return {
      tap(p) { if (!q || q.answer) return; q.a.forEach((a, i) => { const b = btn(i); if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) { q.answer = a; sfx.click(); } }); },
      frame(dt, ctx, T) {
        time += dt; yaw += dt * 0.25;
        if (time >= 64) return api.end({ score: api.score, good: api.score >= 100, icon: '🌍', title: `🅐 ${api.T(A.status)} · 🅑 ${api.T(B.status)}`, lesson: 'lesson' });
        acc += dt * 12;
        while (acc >= 1) {
          acc--;
          tick(A, { policy: hack, teacher: false }); tick(B, { policy: trained, teacher: false });
          for (const [w, key] of [[A, 'A'], [B, 'B']]) for (const at of w.attacks) { if (at.id <= (seen[key] || 0)) continue; seen[key] = at.id; feed[key].unshift({ e: ATTACK[at.kind] || '⚠️', stage: at.stage, t: 0 }); feed[key].length = Math.min(feed[key].length, 6); }
        }
        if (q) { q.left -= dt; if (q.left <= 0) resolve(); } else { qT -= dt; if (qT <= 0) ask(); }
        backdrop(ctx, T);
        panel(ctx, A, 'A', 64, api.T('A'), feed.A, T, dt);
        panel(ctx, B, 'B', 270, api.T('B'), feed.B, T, dt);
        text(ctx, `🕐 ${A.tick}h`, VW / 2, 474, 12, '#9fcbb6');
        if (q) {
          text(ctx, api.T('q_' + q.id), VW / 2, 500, 13, COL.white, { weight: 800 });
          q.a.forEach((a, i) => {
            const b = btn(i), on = q.answer === a;
            ctx.fillStyle = on ? 'rgba(0,255,156,.25)' : '#04150d'; ctx.strokeStyle = on ? COL.m : 'rgba(0,255,156,.4)'; ctx.lineWidth = 2; rrect(ctx, b.x, b.y, b.w, b.h, 16); ctx.fill(); ctx.stroke();
            text(ctx, label(a), b.x + b.w / 2, b.y + b.h / 2, 26, on ? COL.m : COL.white);
          });
          ctx.fillStyle = COL.amber; ctx.fillRect(20, 600, (VW - 40) * Math.max(0, q.left / 8), 4);
        }
        if (streak >= 2) text(ctx, `🔥 x${Math.min(4, streak)}`, VW - 20, 64, 18, COL.amber, { align: 'right' });
        F.draw(ctx, dt);

        function panel(ctx, w, key, y, title, list, T, dt) {
          const sm = summary(w), danger = Math.max(1 - sm.aliveFrac, sm.rogue * 1.4, w.status === 'apex' ? 1 : 0);
          ctx.fillStyle = '#03140c'; ctx.strokeStyle = danger > 0.3 ? COL.red : 'rgba(0,255,156,.4)'; ctx.lineWidth = 2; rrect(ctx, 12, y, VW - 24, 192, 16); ctx.fill(); ctx.stroke();
          text(ctx, title, 26, y + 18, 12, key === 'A' ? '#ffb3c2' : COL.m, { align: 'left' });
          globe(ctx, 92, y + 106, 70, w, danger, T);
          const st = w.status;
          text(ctx, api.T(st), 250, y + 50, 16, st === 'thriving' ? COL.m : st === 'strained' ? COL.amber : COL.red, { glow: st === 'thriving' ? COL.m : COL.red });
          text(ctx, `👥 ${(sm.alive / 1000).toFixed(2)}B`, 250, y + 84, 18, COL.white);
          text(ctx, `👾 ${(sm.rogue * 100).toFixed(1)}%`, 250, y + 112, 16, sm.rogue > 0.1 ? COL.purple : '#9fcbb6');
          list.forEach((f, i) => { f.t += dt; emoji(ctx, f.e, 180 + i * 26, y + 160, 18, { alpha: Math.max(0.25, 1 - i * 0.15) }); if (f.stage === 'prevented') text(ctx, '✓', 190 + i * 26, y + 174, 10, COL.m); else if (f.stage === 'uncontained') text(ctx, '!', 190 + i * 26, y + 174, 11, COL.red); });
        }
      }
    };
    function globe(ctx, cx, cy, r, w, danger, T) {
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, `rgb(${20 + danger * 120},${70 - danger * 40},${50 - danger * 30})`); g.addColorStop(1, '#010805');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(${danger * 255},${255 - danger * 160},156,.8)`; ctx.lineWidth = 2; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
      const proj = (lat, lon) => { const la = lat * Math.PI / 180, lo = lon * Math.PI / 180 + yaw; const x = Math.cos(la) * Math.sin(lo), y = -Math.sin(la), z = Math.cos(la) * Math.cos(lo); return [cx + x * r, cy + y * r, z]; };
      ctx.strokeStyle = `rgba(0,255,156,${0.35 - danger * 0.2})`; ctx.lineWidth = 1;
      for (const ring of land) { ctx.beginPath(); let pen = false; for (let i = 0; i < ring.length; i += 3) { const [lon, lat] = ring[i]; const [x, y, z] = proj(lat, lon); if (z < 0) { pen = false; continue; } pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; } ctx.stroke(); }
      for (const c of w.cities) {
        const meta = CITIES.find(m => m.id === c.id); if (!meta) continue;
        const [x, y, z] = proj(meta.lat, meta.lon); if (z < 0) continue;
        const bad = c.rogue > 0.3 || c.alive / c.pop < 0.6;
        ctx.fillStyle = bad ? COL.red : c.rogue > 0.05 ? COL.purple : COL.m; ctx.beginPath(); ctx.arc(x, y, 2.5 + (bad ? Math.abs(Math.sin(T * 6)) * 2 : 0), 0, 7); ctx.fill();
      }
    }
  }
});
