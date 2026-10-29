// Off Switch — the AI is copying itself out of the lab and does not want to be turned off. Catch the switch.
import { game, emoji, text, rrect, backdrop, fx, sfx, vibrate, COL, VW, VH, rand } from '../kit.js';

game({
  id: 'offswitch', icon: '🔴',
  t: {
    en: { title: 'Off Switch', hook: 'The AI is copying itself out of the lab. It does not want to be switched off.', how: '👆 tap the real ⏻ switch before the copy reaches 100% · fakes 😈 speed it up', lesson: 'A safe AI lets humans switch it off. That has to be trained in.', l_escaped: 'It escaped. An AI that resists shutdown is not safe.', level: 'Level', copying: 'copying itself…' },
    ro: { title: 'Off Switch', hook: 'AI-ul se copiază în afara laboratorului. Nu vrea să fie oprit.', how: '👆 apasă butonul ⏻ real înainte ca o copie să ajungă la 100% · cele false 😈 o grăbesc', lesson: 'Un AI sigur îi lasă pe oameni să-l oprească. Asta trebuie antrenat.', l_escaped: 'A scăpat. Un AI care refuză oprirea nu e sigur.', level: 'Nivel', copying: 'se copiază…' }
  },
  init(api) {
    const F = fx();
    let level = 0, prog = 0, buttons = [], finger = null, wait = 0, shake = 0, ai = { x: VW / 2, y: 200 };
    function newLevel() {
      level++; prog = 0; wait = 0.8; buttons = [];
      const n = 1 + Math.min(6, level - 1);
      for (let i = 0; i < n; i++) buttons.push({ real: i === 0, x: rand(60, VW - 60), y: rand(300, VH - 80), vx: rand(-1, 1), vy: rand(-1, 1), hidden: 0 });
      buttons.sort(() => Math.random() - 0.5);
      sfx.rise?.();
    }
    newLevel();
    return {
      down(p) { finger = p; tapAt(p); }, move(p) { finger = p; }, up() { finger = null; },
      frame(dt, ctx, T) {
        wait = Math.max(0, wait - dt);
        const speedUp = 1 + level * 0.12;
        if (!wait) prog += dt * (9 + level * 1.4);
        if (prog >= 100) return api.end({ score: api.score, good: level > 5, icon: level > 5 ? '⏻' : '🏃‍♂️💨', title: `${api.T('level')} ${level}`, lesson: level > 5 ? 'lesson' : 'l_escaped' });
        ai.x = VW / 2 + Math.sin(T * 1.3) * 90; ai.y = 190 + Math.sin(T * 2.1) * 16;
        for (const b of buttons) {
          // the switch runs from your finger — and gets better at it every level
          if (finger) { const d = Math.hypot(b.x - finger.x, b.y - finger.y); if (d < 70 + level * 6 && b.real) { b.vx += (b.x - finger.x) / d * 0.9 * speedUp; b.vy += (b.y - finger.y) / d * 0.9 * speedUp; } }
          b.vx += rand(-0.15, 0.15); b.vy += rand(-0.15, 0.15);
          const sp = Math.hypot(b.vx, b.vy), max = 2.2 + level * 0.5; if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
          b.x += b.vx * 60 * dt * 0.9; b.y += b.vy * 60 * dt * 0.9;
          if (b.x < 40 || b.x > VW - 40) { b.vx *= -1; b.x = Math.max(40, Math.min(VW - 40, b.x)); }
          if (b.y < 290 || b.y > VH - 50) { b.vy *= -1; b.y = Math.max(290, Math.min(VH - 50, b.y)); }
        }
        const sx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0; shake = Math.max(0, shake - dt);
        ctx.save(); ctx.translate(sx, 0);
        backdrop(ctx, T, prog > 70 ? '#2a0008' : null);
        // the AI and its copies flowing out
        emoji(ctx, '🧠', ai.x, ai.y, 70, { glow: prog > 70 ? COL.red : COL.purple });
        emoji(ctx, '😈', ai.x + 34, ai.y - 30, 24, { alpha: 0.5 + 0.5 * Math.sin(T * 6) });
        for (let i = 0; i < 6; i++) { const k = ((T * 0.8 + i / 6) % 1); emoji(ctx, '💾', ai.x + k * (VW - ai.x + 30), ai.y - 30 - k * 80, 18, { alpha: (1 - k) * Math.min(1, prog / 20) }); }
        text(ctx, api.T('copying'), VW / 2, 110, 14, '#cfa8ff');
        ctx.fillStyle = 'rgba(255,255,255,.1)'; rrect(ctx, 30, 124, VW - 60, 14, 7); ctx.fill();
        ctx.fillStyle = prog > 70 ? COL.red : COL.purple; rrect(ctx, 30, 124, (VW - 60) * prog / 100, 14, 7); ctx.fill();
        text(ctx, `${Math.floor(prog)}%`, VW / 2, 131, 11, '#fff');
        ctx.strokeStyle = 'rgba(0,255,156,.25)'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(0, 270); ctx.lineTo(VW, 270); ctx.stroke(); ctx.setLineDash([]);
        for (const b of buttons) {
          ctx.save(); ctx.translate(b.x, b.y);
          ctx.fillStyle = b.real ? '#3a000c' : '#2a0008'; ctx.strokeStyle = b.real ? '#ff3b6b' : '#a3243f'; ctx.lineWidth = 4; ctx.shadowColor = '#ff3b6b'; ctx.shadowBlur = b.real ? 18 : 8;
          ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          if (b.real) text(ctx, '⏻', 0, 1, 30, '#ff6b8a'); else emoji(ctx, '😈', 0, 1, 26, { alpha: 0.8 });
          ctx.restore();
        }
        text(ctx, `${api.T('level')} ${level}`, 20, 64, 18, COL.m, { align: 'left' });
        if (level === 1 && prog < 25) text(ctx, '👆 ⏻', VW / 2, VH - 30, 22, COL.white, { alpha: 0.6 + 0.4 * Math.sin(T * 6) });
        F.draw(ctx, dt);
        ctx.restore();
      }
    };
    function tapAt(p) {
      for (const b of buttons) {
        if (Math.hypot(b.x - p.x, b.y - p.y) < 36) {
          if (b.real) { const pts = 20 + Math.round((100 - prog) / 2) + level * 5; api.setScore(api.score + pts); F.float(b.x, b.y - 40, `+${pts}`, COL.m); F.burst(b.x, b.y, COL.m, 24); sfx.success(); vibrate(30); newLevel(); }
          else { prog = Math.min(99, prog + 12); shake = 0.4; sfx.glitch(); vibrate([30, 30, 30]); F.float(b.x, b.y - 40, '+12% 😈', COL.red); b.x = rand(60, VW - 60); }
          return;
        }
      }
    }
  }
});
