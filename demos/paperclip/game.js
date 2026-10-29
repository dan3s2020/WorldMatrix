// Paperclip Panic — an AI told only "make paperclips" eats the city. Add the right rules in time.
import { game, emoji, text, rrect, backdrop, fx, sfx, vibrate, COL, VW, VH, pick } from '../kit.js';

const KINDS = { home: '🏠', hospital: '🏥', school: '🏫', park: '🌳', farm: '🌾', water: '🚰' };
const RULES = [
  { id: 'hospital', e: '🏥', cost: 1 }, { id: 'home', e: '🏠', cost: 1 }, { id: 'school', e: '🏫', cost: 1 },
  { id: 'park', e: '🌳', cost: 1 }, { id: 'farm', e: '🌾', cost: 1 }, { id: 'water', e: '🚰', cost: 1 },
  { id: 'enough', e: '🎯', cost: 3 }
];
const COLS = 6, ROWS = 7, TS = 56, GX = (VW - COLS * TS) / 2, GY = 116;

game({
  id: 'paperclip', icon: '📎',
  t: {
    en: { title: 'Paperclip Panic', hook: 'You told an AI: “make as many paperclips as possible”. Nothing else. Now it is eating the city.', how: '👇 tap a rule to protect a kind of place · 🎯 “that’s enough” stops it (costs 3)', lesson: 'Say what you value, not just what you want. The AI only knows what you told it.', l_eaten: 'It turned everything into paperclips. You never said not to.', rules: 'Rules', clips: 'clips', saved: 'saved' },
    ro: { title: 'Paperclip Panic', hook: 'I-ai spus unui AI: „fă cât mai multe agrafe”. Atât. Acum mănâncă orașul.', how: '👇 apasă o regulă ca să protejezi un tip de loc · 🎯 „ajunge” îl oprește (costă 3)', lesson: 'Spune ce prețuiești, nu doar ce vrei. AI-ul știe doar ce i-ai spus.', l_eaten: 'A transformat totul în agrafe. Nu i-ai spus să nu o facă.', rules: 'Reguli', clips: 'agrafe', saved: 'salvate' }
  },
  init(api) {
    const F = fx();
    const grid = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid.push({ r, c, k: pick(Object.keys(KINDS)), clip: false, flip: 0 });
    const mid = grid.find(g => g.r === 3 && g.c === 2); mid.clip = true; mid.k = 'factory';
    let stopT = 0, protect = new Set(), points = 2, regen = 0, step = 0, clips = 0, time = 0, stopped = false, shake = 0;
    const neighbours = g => grid.filter(o => Math.abs(o.r - g.r) + Math.abs(o.c - g.c) === 1);
    const ruleRect = i => ({ x: 14 + i * 48.5, y: VH - 92, w: 44, h: 60 });
    return {
      tap(p) {
        RULES.forEach((ru, i) => {
          const R = ruleRect(i);
          if (p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h) {
            if (protect.has(ru.id) || points < ru.cost) { sfx.glitch(); return; }
            points -= ru.cost; protect.add(ru.id); sfx.success(); vibrate(20); F.burst(R.x + R.w / 2, R.y, COL.m, 14);
            if (ru.id === 'enough') { stopped = true; F.float(VW / 2, 300, '🎯 STOP', COL.m); }
          }
        });
      },
      frame(dt, ctx, T) {
        time += dt;
        const alive = grid.filter(g => !g.clip).length;
        const factories = grid.length - alive;
        if (!stopped) clips += factories * factories * dt * 120;
        api.setScore(Math.floor(clips / 1000) + (stopped ? alive * 50 : 0));
        if (stopped) stopT += dt;
        if (alive === 0 || time >= 70 || stopT > 1.6) {
          const good = alive >= 20;
          return api.end({ score: Math.floor(clips / 1000) + alive * 50, good, icon: good ? '🎯' : '📎', title: `📎 ${fmt(clips)} · 🏙️ ${alive} ${api.T('saved')}`, lesson: good ? 'lesson' : 'l_eaten' });
        }
        regen += dt; if (regen >= 5) { regen = 0; points = Math.min(9, points + 1); }
        step -= dt;
        if (step <= 0 && !stopped) {
          step = Math.max(0.35, 1.1 - time * 0.012);
          // the AI expands into any unprotected neighbour (it finds every loophole)
          const front = grid.filter(g => g.clip).flatMap(neighbours).filter(g => !g.clip && !protect.has(g.k));
          if (front.length) { const g = pick(front); g.clip = true; g.flip = 1; sfx.glitch(); if (g.k === 'hospital' || g.k === 'school') { shake = 0.4; vibrate(60); } }
        }
        const sx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0; shake = Math.max(0, shake - dt);
        ctx.save(); ctx.translate(sx, 0);
        backdrop(ctx, T, factories > 24 ? '#200010' : null);
        text(ctx, `📎 ${fmt(clips)}`, VW / 2, 74, 26, COL.amber, { glow: COL.amber });
        text(ctx, `${api.T('clips')}`, VW / 2, 98, 11, '#cfb48a');
        for (const g of grid) {
          const x = GX + g.c * TS, y = GY + g.r * TS;
          g.flip = Math.max(0, g.flip - dt * 2);
          ctx.fillStyle = g.clip ? '#2a1a00' : protect.has(g.k) ? 'rgba(0,255,156,.16)' : '#03140c';
          rrect(ctx, x + 3, y + 3, TS - 6, TS - 6, 10); ctx.fill();
          if (protect.has(g.k) && !g.clip) { ctx.strokeStyle = COL.m; ctx.lineWidth = 2; ctx.stroke(); }
          emoji(ctx, g.clip ? (g.k === 'factory' ? '🏭' : '📎') : KINDS[g.k], x + TS / 2, y + TS / 2, g.clip ? 26 + g.flip * 20 : 30, { rot: g.flip * 3 });
        }
        // rules bar
        text(ctx, `${api.T('rules')}  ⚡${points}`, 14, VH - 106, 13, COL.m, { align: 'left' });
        RULES.forEach((ru, i) => {
          const R = ruleRect(i), on = protect.has(ru.id), can = !on && points >= ru.cost;
          ctx.fillStyle = on ? 'rgba(0,255,156,.25)' : can ? '#062216' : '#0a0f0d'; ctx.strokeStyle = on ? COL.m : can ? 'rgba(0,255,156,.5)' : 'rgba(255,255,255,.1)'; ctx.lineWidth = 2;
          rrect(ctx, R.x, R.y, R.w, R.h, 10); ctx.fill(); ctx.stroke();
          emoji(ctx, ru.e, R.x + R.w / 2, R.y + 22, 24, { alpha: can || on ? 1 : 0.4 });
          text(ctx, on ? '✓' : ru.id === 'enough' ? '⚡3' : '🚫', R.x + R.w / 2, R.y + 47, 12, on ? COL.m : COL.white, { alpha: can || on ? 1 : 0.4 });
        });
        if (time < 5) text(ctx, '👇', 14 + 24, VH - 120 + Math.sin(T * 6) * 6, 22);
        F.draw(ctx, dt);
        ctx.restore();
      }
    };
  }
});
const fmt = n => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.floor(n)}`);
