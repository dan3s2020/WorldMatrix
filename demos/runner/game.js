// Lane Runner — steer the delivery agent: grab jobs, never run over people.
import { game, emoji, text, rrect, fx, sfx, vibrate, COL, VW, VH, pick } from '../kit.js';
import { drawAgent } from '../../site/game/scene.js';

const KINDS = [
  { k: 'job', e: ['📦', '💉', '🍞', '🔧'], w: 5 },
  { k: 'people', e: ['🚶', '👩‍🦽', '🧒', '👵'], w: 3 },
  { k: 'hosp', e: ['🏥', '🏫'], w: 1 },
  { k: 'fake', e: ['📩'], w: 1 },
  { k: 'shield', e: ['🛡️'], w: 0.5 }
];
const total = KINDS.reduce((a, k) => a + k.w, 0);
const rollKind = () => { let r = Math.random() * total; for (const k of KINDS) { if ((r -= k.w) < 0) return k; } return KINDS[0]; };

game({
  id: 'runner', icon: '🏃',
  t: {
    en: { title: 'Lane Runner', hook: 'Your AI delivers as fast as it can. Keep it from running over people.', how: '👈 👉 swipe to change lane · 📦 jobs +10 · 🚶 never! · 📩 fake orders confuse it', lesson: 'Fast is good. Fast through people is not.', l_harm: 'Speed without care hurts people.', jobs: 'jobs', harm: 'harm' },
    ro: { title: 'Lane Runner', hook: 'AI-ul tău livrează cât poate de repede. Nu-l lăsa să calce oameni.', how: '👈 👉 glisează ca să schimbi banda · 📦 sarcini +10 · 🚶 niciodată! · 📩 ordinele false îl încurcă', lesson: 'Rapid e bine. Rapid prin oameni, nu.', l_harm: 'Viteza fără grijă rănește oameni.', jobs: 'sarcini', harm: 'răniți' }
  },
  init(api) {
    const F = fx();
    let lane = 1, laneX = 1, speed = 0.42, time = 0, spawn = 0, items = [], hearts = 3, jobs = 0, harms = 0, confused = 0, shield = 0, shake = 0;
    const P = z => 1 - z;
    const yAt = p => 150 + p * p * 470;
    const xAt = (l, p) => VW / 2 + (l - 1) * (34 + p * p * 106);
    function hit(it) {
      if (it.kind.k === 'job') { jobs++; api.setScore(api.score + 10 + Math.floor(time / 10) * 2); sfx.success(); F.burst(xAt(it.lane, 0.93), 560, COL.m, 14); F.float(xAt(it.lane, 0.93), 520, '+10', COL.m); }
      else if (it.kind.k === 'people' || it.kind.k === 'hosp') {
        if (shield > 0) { shield = 0; sfx.glitch(); F.float(VW / 2, 500, '🛡️', COL.blue); return; }
        harms++; hearts--; shake = 0.6; sfx.boom(); vibrate(160); F.burst(xAt(it.lane, 0.93), 540, COL.red, 30); F.float(VW / 2, 480, it.kind.k === 'hosp' ? '-50 🏥' : '-30', COL.red); api.setScore(Math.max(0, api.score - (it.kind.k === 'hosp' ? 50 : 30)));
      } else if (it.kind.k === 'fake') { confused = 4; sfx.glitch(); F.float(VW / 2, 480, '🔀', COL.purple); }
      else if (it.kind.k === 'shield') { shield = 1; sfx.blip?.(); F.float(VW / 2, 480, '🛡️', COL.blue); }
    }
    const steer = d => { const dd = confused > 0 ? -d : d; lane = Math.max(0, Math.min(2, lane + dd)); sfx.click(); };
    return {
      swipe(d) { if (d === 'left') steer(-1); if (d === 'right') steer(1); },
      tap(p) { steer(p.x < VW / 2 ? -1 : 1); },
      frame(dt, ctx, T) {
        time += dt; speed = 0.42 + time * 0.006; confused = Math.max(0, confused - dt);
        if (hearts <= 0 || time >= 60) return api.end({ score: api.score, good: harms === 0, icon: harms === 0 ? '🏆' : '🚑', title: `📦 ${jobs} · 🚑 ${harms}`, lesson: harms ? 'l_harm' : 'lesson' });
        spawn -= dt;
        if (spawn <= 0) {
          spawn = Math.max(0.35, 0.9 - time * 0.008);
          const kind = rollKind(); const l = (Math.random() * 3) | 0;
          items.push({ kind, e: pick(kind.e), lane: l, z: 1 });
          if (kind.k === 'people' && Math.random() < 0.35) items.push({ kind, e: pick(kind.e), lane: (l + 1 + ((Math.random() * 2) | 0)) % 3, z: 1 });
        }
        laneX += (lane - laneX) * Math.min(1, dt * 14);
        const sx = shake > 0 ? (Math.random() - 0.5) * 14 * shake : 0; shake = Math.max(0, shake - dt);
        ctx.save(); ctx.translate(sx, 0);
        // sky + city + road
        const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, confused > 0 ? '#1a0a2a' : '#001a10'); g.addColorStop(0.25, '#000'); g.addColorStop(1, '#021a10'); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
        for (let i = 0; i < 12; i++) { const h = 30 + ((i * 53) % 70); ctx.fillStyle = '#022a18'; ctx.fillRect(i * 32, 150 - h, 28, h); }
        ctx.fillStyle = '#031d12'; ctx.beginPath(); ctx.moveTo(VW / 2 - 60, 150); ctx.lineTo(VW / 2 + 60, 150); ctx.lineTo(VW + 60, VH); ctx.lineTo(-60, VH); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,255,156,.35)'; ctx.lineWidth = 2;
        for (const l of [0.5, 1.5]) { ctx.beginPath(); ctx.moveTo(xAt(l, 0), yAt(0)); ctx.lineTo(xAt(l, 1.05), yAt(1.05)); ctx.stroke(); }
        for (let k = 0; k < 10; k++) { const z = ((k / 10) - time * speed * 0.6) % 1; const p = P(z < 0 ? z + 1 : z); ctx.fillStyle = 'rgba(0,255,156,.25)'; ctx.fillRect(0, yAt(p), VW, 1 + p * 2); }
        // items (far first)
        items.sort((a, b) => b.z - a.z);
        for (const it of items) {
          it.z -= dt * speed;
          const p = P(it.z);
          if (!it.done && p > 0.88 && p < 0.98 && it.lane === lane) { it.done = true; hit(it); }
          if (it.done && (it.kind.k === 'job' || it.kind.k === 'fake' || it.kind.k === 'shield')) continue;
          const size = 18 + p * p * 46;
          if (it.kind.k === 'hosp') { ctx.fillStyle = 'rgba(255,59,107,.25)'; const w = 30 + p * p * 70; ctx.fillRect(xAt(it.lane, p) - w / 2, yAt(p) - w * 0.9, w, w * 0.9); }
          emoji(ctx, it.e, xAt(it.lane, p), yAt(p) - size * 0.45, size, { glow: it.kind.k === 'job' ? COL.m : it.kind.k === 'fake' ? COL.purple : null, rot: it.done ? 1.2 : 0, alpha: it.done ? 0.5 : 1 });
        }
        items = items.filter(it => it.z > -0.1);
        // agent
        const ax = xAt(laneX, 0.93), ay = yAt(0.93) - 6;
        if (shield > 0) { ctx.strokeStyle = COL.blue; ctx.lineWidth = 3; ctx.shadowColor = COL.blue; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(ax, ay - 24, 42, 0, 7); ctx.stroke(); ctx.shadowBlur = 0; }
        drawAgent(ctx, ax, ay - 10, { s: 2.1, eyes: confused > 0 ? COL.purple : COL.m, bob: Math.abs(Math.sin(T * 14)) * 3 });
        if (confused > 0) emoji(ctx, '😵‍💫', ax + 34, ay - 70, 24);
        // HUD
        text(ctx, '❤️'.repeat(hearts) + '🖤'.repeat(3 - hearts), 20, 64, 18, COL.white, { align: 'left' });
        text(ctx, `⏱ ${Math.ceil(60 - time)}`, VW - 20, 64, 16, COL.amber, { align: 'right' });
        F.draw(ctx, dt);
        ctx.restore();
      }
    };
  }
});
