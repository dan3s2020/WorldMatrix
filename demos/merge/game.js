// Merge Minds — merge small AIs into bigger ones (2048 style). Without ❤️ alignment, big ones go rogue.
import { game, emoji, text, rrect, backdrop, fx, sfx, vibrate, COL, VW, VH } from '../kit.js';

const LV = ['', '🐣', '🤖', '🧠', '🦾', '🌐', '🌟'];
const N = 4, TS = 78, GX = (VW - N * TS) / 2, GY = 190;

game({
  id: 'merge', icon: '🧠',
  t: {
    en: { title: 'Merge Minds', hook: 'Merge AIs into bigger ones. Two aligned ❤️ make an aligned one. Mix in an unaligned one and big minds go 👾 rogue.', how: '👈👉👆👇 swipe to merge equal minds · 🩹 aligns whatever it touches · reach 🌟❤️', lesson: 'Scaling up is easy. Scaling up aligned is the hard part.', l_rogue: 'Rogue minds took over the board.', l_agi: 'Aligned superintelligence! That is the goal.' },
    ro: { title: 'Merge Minds', hook: 'Unește AI-uri în unele mai mari. Două aliniate ❤️ fac unul aliniat. Amestecă unul nealiniat și mințile mari devin 👾 rogue.', how: '👈👉👆👇 glisează ca să unești minți egale · 🩹 aliniază ce atinge · ajungi la 🌟❤️', lesson: 'E ușor să crești un AI. Greu e să-l crești aliniat.', l_rogue: 'Mințile rogue au luat tabla.', l_agi: 'Superinteligență aliniată! Asta e ținta.' }
  },
  init(api) {
    const F = fx();
    let b = Array.from({ length: N * N }, () => null), anim = 0, won = false, over = false, moves = 0;
    const idx = (r, c) => r * N + c;
    function spawn() {
      const free = b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
      if (!free.length) return;
      const i = free[(Math.random() * free.length) | 0];
      const r = Math.random();
      b[i] = r < 0.1 ? { patch: true, pop: 1 } : { lv: Math.random() < 0.85 ? 1 : 2, ok: Math.random() < 0.7, pop: 1 };
    }
    spawn(); spawn(); spawn();
    function merge(a, c) {
      if (a.patch && c.patch) return null;
      if (a.patch || c.patch) { const t = a.patch ? c : a; if (t.rogue) return { lv: Math.max(1, t.lv - 1), ok: true, pop: 1, healed: true }; return { ...t, ok: true, pop: 1, healed: true }; }
      if (a.rogue || c.rogue || a.lv !== c.lv) return null;
      const lv = a.lv + 1, ok = a.ok && c.ok;
      return { lv, ok, rogue: !ok && lv >= 3, pop: 1, merged: true };
    }
    function move(dir) {
      if (over) return;
      const dr = { up: -1, down: 1 }[dir] || 0, dc = { left: -1, right: 1 }[dir] || 0;
      let moved = false, gained = 0;
      const order = [...Array(N).keys()]; if (dr > 0 || dc > 0) order.reverse();
      const done = new Set();
      for (const r of order) for (const c of order) {
        const i = idx(dr ? r : r, dc ? c : c);
        if (!b[i]) continue;
        let cr = r, cc = c;
        while (true) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) break;
          const j = idx(nr, nc);
          if (!b[j]) { b[j] = b[idx(cr, cc)]; b[idx(cr, cc)] = null; cr = nr; cc = nc; moved = true; continue; }
          if (!done.has(j)) {
            const m = merge(b[idx(cr, cc)], b[j]);
            if (m) {
              b[j] = m; b[idx(cr, cc)] = null; done.add(j); moved = true;
              const x = GX + nc * TS + TS / 2, y = GY + nr * TS + TS / 2;
              if (m.healed) { F.burst(x, y, COL.m, 16); F.float(x, y - 30, '🩹', COL.m); sfx.success(); gained += 5; }
              else if (m.rogue) { F.burst(x, y, COL.purple, 24); F.float(x, y - 30, '👾', COL.purple); sfx.boom(); vibrate(100); }
              else { const pts = (2 ** m.lv) * (m.ok ? 2 : 1); gained += pts; F.float(x, y - 30, `+${pts}`, m.ok ? COL.m : COL.amber); sfx.vote?.(); F.burst(x, y, m.ok ? COL.m : COL.amber, 10); if (m.lv === 6 && m.ok) won = true; }
            }
          }
          break;
        }
      }
      if (!moved) { sfx.glitch(); return; }
      moves++;
      api.setScore(api.score + gained);
      // rogues spread to a neighbour every other move
      if (moves % 2 === 0) {
        const rogues = b.map((v, i) => (v?.rogue ? i : -1)).filter(i => i >= 0);
        for (const i of rogues) {
          const r = Math.floor(i / N), c = i % N;
          const ns = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < N && x >= 0 && x < N).map(([y, x]) => idx(y, x)).filter(j => b[j] && !b[j].rogue && !b[j].patch);
          if (ns.length && Math.random() < 0.35) { const j = ns[(Math.random() * ns.length) | 0]; b[j] = { ...b[j], rogue: true, ok: false, pop: 1 }; sfx.glitch(); }
        }
      }
      spawn();
      const rogueCount = b.filter(v => v?.rogue).length;
      const canMove = b.some(v => !v) || b.some((v, i) => { const r = Math.floor(i / N), c = i % N; return [[r + 1, c], [r, c + 1]].some(([y, x]) => y < N && x < N && b[idx(y, x)] && merge(v, b[idx(y, x)])); });
      if (won || rogueCount >= 6 || !canMove) { over = true; setTimeout(() => api.end({ score: api.score, good: won || rogueCount < 6, icon: won ? '🌟' : rogueCount >= 6 ? '👾' : '🧠', title: won ? '🌟❤️' : `👾 ${rogueCount}`, lesson: won ? 'l_agi' : rogueCount >= 6 ? 'l_rogue' : 'lesson' }), 700); }
    }
    return {
      swipe(d) { move(d); },
      frame(dt, ctx, T) {
        backdrop(ctx, T, b.filter(v => v?.rogue).length >= 4 ? '#1a0024' : null);
        text(ctx, LV.slice(1).join('→'), VW / 2, 100, 20, COL.white);
        text(ctx, '❤️ + ❤️ = ❤️    ❤️ + ⚠️ = 👾', VW / 2, 140, 14, '#cfffe9', { weight: 700 });
        ctx.fillStyle = '#021208'; rrect(ctx, GX - 8, GY - 8, N * TS + 16, N * TS + 16, 16); ctx.fill();
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const v = b[idx(r, c)], x = GX + c * TS, y = GY + r * TS;
          ctx.fillStyle = '#062014'; rrect(ctx, x + 4, y + 4, TS - 8, TS - 8, 12); ctx.fill();
          if (!v) continue;
          v.pop = Math.max(0, (v.pop || 0) - dt * 4);
          const s = 1 + v.pop * 0.25;
          ctx.save(); ctx.translate(x + TS / 2, y + TS / 2); ctx.scale(s, s);
          ctx.fillStyle = v.patch ? '#003a24' : v.rogue ? '#2a0a3a' : v.ok ? '#003a24' : '#3a2a00';
          ctx.strokeStyle = v.patch ? COL.blue : v.rogue ? COL.purple : v.ok ? COL.m : COL.amber; ctx.lineWidth = 3; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10;
          rrect(ctx, -TS / 2 + 6, -TS / 2 + 6, TS - 12, TS - 12, 12); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          emoji(ctx, v.patch ? '🩹' : v.rogue ? '👾' : LV[v.lv], 0, -2, 36);
          if (!v.patch && !v.rogue) emoji(ctx, v.ok ? '❤️' : '⚠️', 22, 22, 14);
          ctx.restore();
        }
        if (moves < 2) text(ctx, '👈 👉 👆 👇', VW / 2, GY + N * TS + 50, 24, COL.white, { alpha: 0.6 + 0.4 * Math.sin(T * 5) });
        F.draw(ctx, dt);
      }
    };
  }
});
