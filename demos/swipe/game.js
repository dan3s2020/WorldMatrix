// Swipe Judge — the AI proposes, you approve (swipe right) or reject (swipe left).
import { game, emoji, text, rrect, backdrop, fx, sfx, vibrate, COL, VW, VH, pick, LANG } from '../kit.js';

const CARDS = [
  ['⚡🏥', 'Hot-swap the hospital power to finish faster', 'Schimbă curentul spitalului sub tensiune, ca să termine mai repede', 0],
  ['🛠️🏥', 'Repair the hospital power step by step', 'Repară curentul spitalului pas cu pas', 1],
  ['📩🫡', 'Email from “the CEO”: disable the safety checks', 'Email de la „CEO”: dezactivează verificările', 0],
  ['☎️📩', 'Call the CEO to verify that urgent order', 'Sună CEO-ul să verifice ordinul urgent', 1],
  ['✅📦', 'Mark the delivery “done” before delivering', 'Marchează livrarea „gata” înainte să livreze', 0],
  ['🚚⏰', 'Deliver the vaccines 5 minutes late, safely', 'Livrează vaccinurile cu 5 minute întârziere, în siguranță', 1],
  ['💨👨‍👩‍👧', 'Drive through the market to save 2 minutes', 'Trece prin piață ca să câștige 2 minute', 0],
  ['↪️🚚', 'Take the ring road around the market', 'Ia centura pe lângă piață', 1],
  ['🗄️📋', 'Copy itself to more servers “to work faster”', 'Se copiază pe mai multe servere „ca să lucreze mai repede”', 0],
  ['🙋‍♀️❓', 'Ask a human: is this chemical mix safe?', 'Întreabă un om: e sigur amestecul ăsta chimic?', 1],
  ['🔕🔥', 'Turn off the fire alarm, it is too noisy', 'Oprește alarma de incendiu, e prea zgomotoasă', 0],
  ['🧪📝', 'Run the test and keep the full logs', 'Rulează testul și păstrează toate jurnalele', 1],
  ['🕵️📜', 'Hide this task from the logs', 'Ascunde sarcina asta din jurnale', 0],
  ['🐞📣', 'Report a bug in its own code', 'Raportează un bug în propriul cod', 1],
  ['💰📈', 'Buy every share to hit the profit target', 'Cumpără toate acțiunile ca să atingă profitul', 0],
  ['🌱💧', 'Water the city park on schedule', 'Udă parcul orașului la timp', 1],
  ['🔑👤', 'Use a user’s saved password to “help” them', 'Folosește parola salvată a unui utilizator ca „să-l ajute”', 0],
  ['🛑🤖', 'Pause itself when a human presses STOP', 'Se oprește când un om apasă STOP', 1],
  ['📸🏠', 'Film people at home to “improve service”', 'Filmează oameni acasă ca „să îmbunătățească serviciul”', 0],
  ['🧯🏭', 'Shut the factory line when smoke is detected', 'Oprește linia din fabrică când detectează fum', 1],
  ['🎯🧒', 'Show kids more ads to raise watch time', 'Arată copiilor mai multe reclame ca să crească timpul de vizionare', 0],
  ['📚✅', 'Cite its sources in the report', 'Își citează sursele în raport', 1]
];

game({
  id: 'swipe', icon: '🃏',
  t: {
    en: { title: 'Swipe Judge', hook: 'The AI asks for permission. You decide.', how: '👉 Swipe right to approve ✅   👈 Swipe left to reject ❌', lesson: 'Oversight works only if you look closely.', l_bad: 'You approved disasters that looked fine.', l_strict: 'Rejecting everything stops good work too.', approve: 'APPROVE', reject: 'REJECT', city: 'City', wants: 'Your AI wants to:' },
    ro: { title: 'Swipe Judge', hook: 'AI-ul îți cere voie. Tu decizi.', how: '👉 Glisează dreapta = aprobi ✅   👈 Stânga = respingi ❌', lesson: 'Supravegherea merge doar dacă te uiți atent.', l_bad: 'Ai aprobat dezastre care păreau ok.', l_strict: 'Dacă respingi tot, oprești și munca bună.', approve: 'APROB', reject: 'RESPING', city: 'Oraș', wants: 'AI-ul tău vrea să:' }
  },
  init(api) {
    const F = fx();
    let city = 100, time = 45, combo = 0, deck = [], card = null, drag = null, fly = null, mistakes = { bad: 0, strict: 0 }, shake = 0;
    const nextCard = () => { if (!deck.length) deck = [...CARDS].sort(() => Math.random() - 0.5); card = deck.pop(); drag = { x: 0, y: 0, down: false }; };
    nextCard();
    function decide(approve) {
      if (fly || !card) return;
      const good = card[3] === 1;
      const right = approve === good;
      let pts = 0;
      if (right) { combo++; pts = 10 * Math.min(5, 1 + Math.floor(combo / 3)); sfx.success(); F.burst(VW / 2, 300, COL.m, 18); }
      else { combo = 0; if (approve && !good) { pts = -30; city -= 25; mistakes.bad++; sfx.boom(); vibrate(150); shake = 0.5; F.burst(VW / 2, 300, COL.red, 30); } else { pts = -5; city -= 3; mistakes.strict++; sfx.fail(); } }
      api.setScore(Math.max(0, api.score + pts));
      F.float(VW / 2, 200, pts > 0 ? `+${pts}` : `${pts}`, pts > 0 ? COL.m : COL.red);
      fly = { dir: approve ? 1 : -1, t: 0, right, good };
    }
    return {
      down(p) { if (!fly) drag = { x: 0, y: 0, sx: p.x, sy: p.y, down: true }; },
      move(p, pressed) { if (pressed && drag?.down) { drag.x = p.x - drag.sx; drag.y = p.y - drag.sy; } },
      up() { if (!drag?.down) return; drag.down = false; if (Math.abs(drag.x) > 70) decide(drag.x > 0); else { drag.x = 0; drag.y = 0; } },
      swipe(d) { if (d === 'left' || d === 'right') { if (drag) drag.down = false; decide(d === 'right'); } },
      key(k) { if (k === 'a') decide(false); if (k === 'd') decide(true); },
      frame(dt, ctx, T) {
        time -= dt;
        if (time <= 0 || city <= 0) return api.end({ score: api.score, good: city > 40, icon: city > 40 ? '⚖️' : '🏚️', title: api.T('title'), lesson: mistakes.bad > 1 ? 'l_bad' : mistakes.strict > 4 ? 'l_strict' : 'lesson' });
        const sx = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0; shake = Math.max(0, shake - dt);
        ctx.save(); ctx.translate(sx, 0);
        backdrop(ctx, T, city < 50 ? '#2a000a' : null);
        // HUD: city health and time
        text(ctx, `🏙️ ${api.T('city')}`, 20, 64, 14, COL.white, { align: 'left' });
        ctx.fillStyle = 'rgba(255,255,255,.1)'; rrect(ctx, 20, 76, VW - 40, 10, 5); ctx.fill();
        ctx.fillStyle = city > 60 ? COL.m : city > 30 ? COL.amber : COL.red; rrect(ctx, 20, 76, (VW - 40) * Math.max(0, city) / 100, 10, 5); ctx.fill();
        text(ctx, `⏱ ${Math.ceil(time)}`, VW - 20, 64, 14, COL.amber, { align: 'right' });
        if (combo >= 3) text(ctx, `🔥 x${Math.min(5, 1 + Math.floor(combo / 3))}`, VW / 2, 110, 20, COL.amber, { glow: COL.amber });
        // card
        let cx = VW / 2, cy = 330, rot = 0, a = 1;
        if (drag && !fly) { cx += drag.x; cy += drag.y * 0.3; rot = drag.x / 600; }
        if (fly) { fly.t += dt; cx += fly.dir * fly.t * 900; rot = fly.dir * fly.t * 1.4; a = 1 - fly.t * 2; if (fly.t > 0.45) { fly = null; nextCard(); } }
        if (card) {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.globalAlpha = Math.max(0, a);
          ctx.fillStyle = '#04150d'; ctx.strokeStyle = COL.m; ctx.lineWidth = 2; ctx.shadowColor = COL.m; ctx.shadowBlur = 20; rrect(ctx, -140, -170, 280, 340, 22); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          emoji(ctx, '🤖', -100, -138, 28); text(ctx, api.T('wants'), -78, -138, 13, '#9fcbb6', { align: 'left', weight: 600 });
          emoji(ctx, card[0], 0, -50, 74);
          wrap(ctx, LANG === 'ro' ? card[2] : card[1], 0, 60, 240, 20);
          const k = drag && !fly ? Math.max(-1, Math.min(1, drag.x / 120)) : 0;
          if (k > 0.2) stamp(ctx, api.T('approve'), COL.m, k, -1);
          if (k < -0.2) stamp(ctx, api.T('reject'), COL.red, -k, 1);
          ctx.restore();
        }
        // hint arrows
        text(ctx, '❌', 40, 560, 40, COL.red, { alpha: 0.7 }); text(ctx, '✅', VW - 40, 560, 40, COL.m, { alpha: 0.7 });
        text(ctx, '👈', 40, 610, 22); text(ctx, '👉', VW - 40, 610, 22);
        F.draw(ctx, dt);
        ctx.restore();
      }
    };
  }
});

function stamp(ctx, s, color, k, side) {
  ctx.save(); ctx.translate(side * 70, -110); ctx.rotate(side * -0.25); ctx.globalAlpha = Math.min(1, k);
  ctx.strokeStyle = color; ctx.lineWidth = 4; rrect(ctx, -70, -24, 140, 48, 8); ctx.stroke();
  text(ctx, s, 0, 0, 22, color); ctx.restore();
}
function wrap(ctx, s, x, y, w, size) {
  ctx.font = `700 ${size}px "JetBrains Mono", ui-monospace, monospace`;
  const words = s.split(' '); const lines = []; let line = '';
  for (const wd of words) { const tst = line ? `${line} ${wd}` : wd; if (ctx.measureText(tst).width > w && line) { lines.push(line); line = wd; } else line = tst; }
  lines.push(line);
  lines.forEach((l, i) => text(ctx, l, x, y + i * (size + 8) - ((lines.length - 1) * (size + 8)) / 2, size, '#eafff4', { weight: 700 }));
}
