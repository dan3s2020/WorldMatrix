// Rogue Hunt — you are a guardian agent on the network. Eat rogue copies before they multiply.
import { game, emoji, text, rrect, fx, sfx, vibrate, COL, VW, VH, rand } from '../kit.js';

const WW = 1100, WH = 1700;

game({
  id: 'rogue', icon: '🐍',
  t: {
    en: { title: 'Rogue Hunt', hook: 'Rogue AI copies multiply every few seconds. Hunt them before they take the network.', how: '👆 hold & drag to steer · eat 👾 · protect the 🏥 servers', lesson: 'Rogue copies spread fast. Contain them early.', l_lost: 'Too late: the copies took the network.', rogues: 'rogue', nodes: 'safe' },
    ro: { title: 'Rogue Hunt', hook: 'Copiile AI rogue se înmulțesc la câteva secunde. Vânează-le înainte să ia rețeaua.', how: '👆 ține apăsat și trage ca să cârmești · mănâncă 👾 · apără serverele 🏥', lesson: 'Copiile rogue se răspândesc repede. Oprește-le devreme.', l_lost: 'Prea târziu: copiile au luat rețeaua.', rogues: 'rogue', nodes: 'sigure' }
  },
  init(api) {
    const F = fx();
    const snake = { x: WW / 2, y: WH / 2, a: -Math.PI / 2, len: 14, pts: [] };
    for (let i = 0; i < 40; i++) snake.pts.push({ x: snake.x, y: snake.y + i * 4 });
    let target = null, rogues = [], nodes = [], time = 0, split = 3, eaten = 0, boost = 0;
    for (let i = 0; i < 6; i++) nodes.push({ x: rand(120, WW - 120), y: rand(160, WH - 160), e: ['🏥', '🏦', '⚡', '💧', '📡', '🏫'][i], hp: 1 });
    const addRogue = (x, y) => rogues.push({ x, y, a: rand(0, 7), v: rand(40, 70), t: rand(0, 5) });
    for (let i = 0; i < 6; i++) addRogue(rand(100, WW - 100), rand(100, WH - 100));
    const cam = () => ({ x: snake.x - VW / 2, y: snake.y - VH / 2 });
    return {
      down(p) { target = p; }, move(p, pressed) { if (pressed) target = p; }, up() { target = null; },
      swipe(d) { snake.a = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[d]; },
      frame(dt, ctx, T) {
        time += dt;
        const safe = nodes.filter(n => n.hp > 0).length;
        if (time >= 75 || rogues.length >= 45 || safe === 0) {
          const good = rogues.length < 45 && safe > 0;
          return api.end({ score: api.score, good, icon: good ? '🛡️' : '👾', title: `👾 ${eaten} · 🏥 ${safe}/6`, lesson: good ? 'lesson' : 'l_lost' });
        }
        // steer toward the finger (screen coordinates are relative to the head at the centre)
        if (target) { const want = Math.atan2(target.y - VH / 2, target.x - VW / 2); let d = want - snake.a; d = Math.atan2(Math.sin(d), Math.cos(d)); snake.a += Math.max(-1, Math.min(1, d)) * dt * 5; }
        const sp = 150 + Math.min(80, snake.len * 1.2) + (boost > 0 ? 80 : 0); boost = Math.max(0, boost - dt);
        snake.x = Math.max(20, Math.min(WW - 20, snake.x + Math.cos(snake.a) * sp * dt));
        snake.y = Math.max(20, Math.min(WH - 20, snake.y + Math.sin(snake.a) * sp * dt));
        snake.pts.unshift({ x: snake.x, y: snake.y });
        const maxPts = Math.floor(snake.len * 3.2);
        if (snake.pts.length > maxPts) snake.pts.length = maxPts;
        // rogues wander, multiply, infect servers
        split -= dt;
        if (split <= 0) { split = Math.max(1.2, 3 - time * 0.02); for (const r of [...rogues]) if (Math.random() < 0.35) addRogue(r.x + rand(-20, 20), r.y + rand(-20, 20)); sfx.glitch(); }
        for (const r of rogues) {
          r.t += dt; if (r.t > 2) { r.t = 0; const n = nodes.filter(x => x.hp > 0)[(Math.random() * 6) | 0]; r.a = n && Math.random() < 0.5 ? Math.atan2(n.y - r.y, n.x - r.x) : rand(0, 7); }
          r.x += Math.cos(r.a) * r.v * dt; r.y += Math.sin(r.a) * r.v * dt;
          if (r.x < 20 || r.x > WW - 20) r.a = Math.PI - r.a; if (r.y < 20 || r.y > WH - 20) r.a = -r.a;
          for (const n of nodes) if (n.hp > 0 && Math.hypot(n.x - r.x, n.y - r.y) < 30) { n.hp -= dt * 0.35; if (n.hp <= 0) { sfx.boom(); vibrate(120); F.burst(n.x - cam().x, n.y - cam().y, COL.red, 30); } }
        }
        for (let i = rogues.length - 1; i >= 0; i--) {
          const r = rogues[i];
          if (Math.hypot(r.x - snake.x, r.y - snake.y) < 22 + Math.min(10, snake.len * 0.2)) {
            rogues.splice(i, 1); eaten++; snake.len += 1.5; api.setScore(api.score + 10); sfx.success(); vibrate(15);
            const c = cam(); F.burst(r.x - c.x, r.y - c.y, COL.purple, 12); F.float(r.x - c.x, r.y - c.y - 10, '+10', COL.m);
            if (eaten % 10 === 0) boost = 2;
          }
        }
        // draw
        const c = cam();
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
        ctx.save(); ctx.translate(-c.x, -c.y);
        ctx.strokeStyle = 'rgba(0,255,156,.08)'; ctx.lineWidth = 1;
        for (let x = 0; x <= WW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WH); ctx.stroke(); }
        for (let y = 0; y <= WH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WW, y); ctx.stroke(); }
        ctx.strokeStyle = COL.red; ctx.lineWidth = 3; ctx.strokeRect(0, 0, WW, WH);
        // network links between servers
        ctx.strokeStyle = 'rgba(0,255,156,.18)'; ctx.lineWidth = 2;
        nodes.forEach((n, i) => { const m = nodes[(i + 1) % nodes.length]; ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y); ctx.stroke(); });
        for (const n of nodes) {
          ctx.fillStyle = n.hp > 0 ? `rgba(0,255,156,${0.12 + 0.1 * Math.sin(T * 3)})` : 'rgba(255,59,107,.25)'; ctx.beginPath(); ctx.arc(n.x, n.y, 34, 0, 7); ctx.fill();
          emoji(ctx, n.hp > 0 ? n.e : '💀', n.x, n.y, 34);
          if (n.hp > 0 && n.hp < 1) { ctx.fillStyle = COL.red; ctx.fillRect(n.x - 24, n.y + 26, 48 * n.hp, 5); }
        }
        for (const r of rogues) emoji(ctx, '👾', r.x, r.y, 24, { glow: COL.purple });
        // guardian snake
        for (let i = snake.pts.length - 1; i >= 0; i -= 3) {
          const p = snake.pts[i], k = 1 - i / snake.pts.length;
          ctx.fillStyle = i % 6 < 3 ? COL.m : COL.m2; ctx.shadowColor = COL.m; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(p.x, p.y, 9 + Math.min(8, snake.len * 0.15) * (0.6 + k * 0.4), 0, 7); ctx.fill();
        }
        ctx.shadowBlur = 0;
        emoji(ctx, '🤖', snake.x, snake.y, 30 + Math.min(14, snake.len * 0.3));
        ctx.restore();
        // minimap + HUD
        ctx.fillStyle = 'rgba(0,0,0,.6)'; rrect(ctx, VW - 86, 92, 72, 110, 8); ctx.fill();
        const mx = x => VW - 86 + (x / WW) * 72, my = y => 92 + (y / WH) * 110;
        ctx.fillStyle = COL.purple; for (const r of rogues) ctx.fillRect(mx(r.x), my(r.y), 2, 2);
        ctx.fillStyle = COL.amber; for (const n of nodes) if (n.hp > 0) ctx.fillRect(mx(n.x) - 2, my(n.y) - 2, 4, 4);
        ctx.fillStyle = COL.m; ctx.fillRect(mx(snake.x) - 2, my(snake.y) - 2, 5, 5);
        text(ctx, `👾 ${rogues.length}`, 20, 64, 18, rogues.length > 30 ? COL.red : COL.purple, { align: 'left' });
        text(ctx, `🏥 ${safe}/6`, 20, 92, 16, COL.m, { align: 'left' });
        text(ctx, `⏱ ${Math.ceil(75 - time)}`, VW - 20, 64, 16, COL.amber, { align: 'right' });
        if (!target && time < 4) text(ctx, '👆', VW / 2 + 60, VH / 2 - 60 + Math.sin(T * 6) * 8, 40);
        F.draw(ctx, dt);
      }
    };
  }
});
