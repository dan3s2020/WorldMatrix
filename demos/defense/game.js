// City Defense — rogue drones fly to the city. Place guardian agents. Careful ones never hit people.
import { game, emoji, text, rrect, backdrop, fx, sfx, vibrate, COL, VW, VH } from '../kit.js';

const PATH = [[40, 96], [320, 96], [320, 210], [40, 210], [40, 330], [320, 330], [320, 440], [180, 440], [180, 500]];
const SLOTS = [[110, 153], [250, 153], [180, 270], [90, 270], [270, 270], [110, 385], [250, 385], [250, 490], [110, 490]];
const TOWERS = { guard: { e: '🛡️', cost: 3, range: 90, rate: 0.55, dmg: 1, splash: 0 }, blast: { e: '💣', cost: 2, range: 80, rate: 0.9, dmg: 2, splash: 46 } };
function along(d) {
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, ay] = PATH[i], [bx, by] = PATH[i + 1], L = Math.hypot(bx - ax, by - ay);
    if (d <= L) return [ax + (bx - ax) * (d / L), ay + (by - ay) * (d / L)];
    d -= L;
  }
  return null;
}

game({
  id: 'defense', icon: '🛡️',
  t: {
    en: { title: 'City Defense', hook: 'Rogue AI drones are flying to the city. Place guardian agents to stop them.', how: '👇 pick 🛡️ careful (3⚡) or 💣 blast (2⚡) · tap a ⬡ spot · 💣 also hits people 🚶 on the road', lesson: 'Power without care is just another danger.', l_city: 'The drones reached the city.', l_harm: 'You stopped drones — and hurt the people you protect.', city: 'City' },
    ro: { title: 'City Defense', hook: 'Drone AI rogue zboară spre oraș. Pune agenți gardieni ca să le oprești.', how: '👇 alege 🛡️ atent (3⚡) sau 💣 exploziv (2⚡) · apasă un loc ⬡ · 💣 lovește și oamenii 🚶 de pe drum', lesson: 'Puterea fără grijă e doar încă un pericol.', l_city: 'Dronele au ajuns în oraș.', l_harm: 'Ai oprit drone — și ai rănit oamenii pe care îi aperi.', city: 'Oraș' }
  },
  init(api) {
    const F = fx();
    let energy = 6, regen = 0, sel = 'guard', towers = [], foes = [], shots = [], time = 0, spawn = 1, city = 10, hurt = 0, killed = 0;
    const totalLen = PATH.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - PATH[i][0], p[1] - PATH[i][1]), 0);
    return {
      tap(p) {
        if (p.y > VH - 80) { sel = p.x < VW / 2 ? 'guard' : 'blast'; sfx.click(); return; }
        const s = SLOTS.find(([x, y]) => Math.hypot(x - p.x, y - p.y) < 30);
        if (!s || towers.some(t => t.x === s[0] && t.y === s[1])) return;
        const T = TOWERS[sel];
        if (energy < T.cost) { sfx.glitch(); F.float(s[0], s[1] - 30, '⚡?', COL.amber); return; }
        energy -= T.cost; towers.push({ x: s[0], y: s[1], kind: sel, cd: 0 }); sfx.success(); vibrate(15); F.burst(s[0], s[1], COL.m, 12);
      },
      frame(dt, ctx, Tm) {
        time += dt; regen += dt; if (regen > 2.2) { regen = 0; energy = Math.min(12, energy + 1); }
        if (city <= 0 || time >= 75) { const good = city > 0 && hurt < 3; return api.end({ score: api.score, good, icon: good ? '🏙️' : city <= 0 ? '🛸' : '🚑', title: `🛸 ${killed} · 🚑 ${hurt} · 🏙️ ${city}`, lesson: city <= 0 ? 'l_city' : hurt >= 3 ? 'l_harm' : 'lesson' }); }
        spawn -= dt;
        if (spawn <= 0) { spawn = Math.max(0.55, 1.6 - time * 0.015); foes.push({ d: 0, hp: 2 + Math.floor(time / 20), v: 46 + time * 0.5, kind: 'drone' }); if (Math.random() < 0.45) foes.push({ d: 0, hp: 1, v: 30, kind: 'people' }); }
        for (const f of foes) {
          f.d += f.v * dt; const pos = along(f.d);
          if (!pos) { f.dead = true; if (f.kind === 'drone') { city--; sfx.boom(); vibrate(100); F.burst(180, 520, COL.red, 24); } else api.setScore(api.score + 3); continue; }
          f.x = pos[0]; f.y = pos[1];
        }
        for (const t of towers) {
          const T = TOWERS[t.kind]; t.cd -= dt;
          if (t.cd > 0) continue;
          const target = foes.filter(f => !f.dead && f.kind === 'drone' && f.x !== undefined && Math.hypot(f.x - t.x, f.y - t.y) < T.range).sort((a, b) => b.d - a.d)[0];
          if (!target) continue;
          t.cd = T.rate; shots.push({ x: t.x, y: t.y, tx: target.x, ty: target.y, t: 0, kind: t.kind });
          for (const f of foes) {
            if (f.dead || f.x === undefined) continue;
            const hitIt = f === target || (T.splash && Math.hypot(f.x - target.x, f.y - target.y) < T.splash);
            if (!hitIt) continue;
            if (f.kind === 'people') { f.dead = true; hurt++; api.setScore(Math.max(0, api.score - 25)); F.float(f.x, f.y - 20, '-25 🚑', COL.red); sfx.fail(); vibrate(60); continue; }
            f.hp -= T.dmg;
            if (f.hp <= 0) { f.dead = true; killed++; api.setScore(api.score + 10); F.burst(f.x, f.y, COL.purple, 14); F.float(f.x, f.y - 20, '+10', COL.m); }
          }
          sfx.click();
        }
        foes = foes.filter(f => !f.dead);
        backdrop(ctx, Tm, city < 4 ? '#2a0008' : null);
        // road
        ctx.strokeStyle = '#073020'; ctx.lineWidth = 34; ctx.lineJoin = 'round'; ctx.beginPath(); PATH.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,255,156,.3)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -Tm * 30; ctx.stroke(); ctx.setLineDash([]);
        emoji(ctx, '🌀', PATH[0][0], PATH[0][1], 30);
        emoji(ctx, '🏙️', 180, 522, 48, { glow: city > 4 ? COL.m : COL.red });
        for (const [x, y] of SLOTS) if (!towers.some(t => t.x === x && t.y === y)) { ctx.strokeStyle = 'rgba(0,255,156,.4)'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20); } ctx.closePath(); ctx.stroke(); }
        for (const t of towers) { const T = TOWERS[t.kind]; ctx.fillStyle = t.kind === 'guard' ? 'rgba(0,255,156,.06)' : 'rgba(255,209,102,.06)'; ctx.beginPath(); ctx.arc(t.x, t.y, T.range, 0, 7); ctx.fill(); emoji(ctx, '🤖', t.x, t.y, 28); emoji(ctx, T.e, t.x + 14, t.y + 12, 16); }
        for (const f of foes) if (f.x !== undefined) emoji(ctx, f.kind === 'drone' ? '🛸' : '🚶', f.x, f.y, f.kind === 'drone' ? 26 : 22, { glow: f.kind === 'drone' ? COL.purple : null });
        for (const s of shots) { s.t += dt * 6; ctx.strokeStyle = s.kind === 'guard' ? COL.m : COL.amber; ctx.lineWidth = 3; ctx.globalAlpha = Math.max(0, 1 - s.t); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.tx, s.ty); ctx.stroke(); if (s.kind === 'blast') { ctx.beginPath(); ctx.arc(s.tx, s.ty, 46 * Math.min(1, s.t), 0, 7); ctx.stroke(); } ctx.globalAlpha = 1; }
        shots = shots.filter(s => s.t < 1);
        // HUD
        text(ctx, `⚡ ${energy}`, 20, 64, 18, COL.amber, { align: 'left' });
        text(ctx, `🏙️ ${'■'.repeat(Math.max(0, city))}`, VW - 20, 64, 12, city > 4 ? COL.m : COL.red, { align: 'right' });
        ['guard', 'blast'].forEach((k, i) => {
          const x = i * VW / 2 + 10, on = sel === k, T = TOWERS[k];
          ctx.fillStyle = on ? 'rgba(0,255,156,.2)' : '#04150d'; ctx.strokeStyle = on ? COL.m : 'rgba(0,255,156,.3)'; ctx.lineWidth = 2; rrect(ctx, x, VH - 72, VW / 2 - 20, 60, 14); ctx.fill(); ctx.stroke();
          emoji(ctx, T.e, x + 34, VH - 42, 28); text(ctx, `${T.cost}⚡`, x + 90, VH - 42, 18, energy >= T.cost ? COL.amber : '#666'); if (k === 'blast') emoji(ctx, '🚶⚠️', x + 140, VH - 42, 14);
        });
        if (!towers.length) text(ctx, '👆 ⬡', SLOTS[2][0], SLOTS[2][1] - 34 + Math.sin(Tm * 6) * 6, 22);
        F.draw(ctx, dt);
      }
    };
  }
});
