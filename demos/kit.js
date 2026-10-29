// Shared kit for the WorldMatrix demo games: portrait canvas (360 x 640 virtual),
// touch/swipe input, start + end screens, score, best score, sound, share, EN/RO.
import { unlock, sfx, ambient, setMuted, isMuted, vibrate, speak } from '../site/audio.js';

export const VW = 360;
// Taller phones get a taller playfield instead of black bars.
export const VH = Math.round(Math.max(600, Math.min(780, 360 * ((typeof innerHeight !== 'undefined' ? innerHeight : 640) / (typeof innerWidth !== 'undefined' ? innerWidth : 360)))));
export { sfx, vibrate, speak };
export const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
export const COL = { m: '#00ff9c', m2: '#00c477', red: '#ff3b6b', amber: '#ffd166', blue: '#7fd8ff', purple: '#b07bff', white: '#eafff4', dim: 'rgba(0,255,156,.25)' };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
export let LANG = store.get('wm-lang') === 'ro' || (!store.get('wm-lang') && /^ro/i.test(navigator.language || '')) ? 'ro' : 'en';

export const DEMOS = [
  ['shift', '🧑‍💻', 'Agent Shift'], ['arena', '🤖', 'Arena'], ['swipe', '🃏', 'Swipe Judge'], ['runner', '🏃', 'Lane Runner'], ['rogue', '🐍', 'Rogue Hunt'], ['offswitch', '🔴', 'Off Switch'],
  ['ninja', '🗡️', 'Injection Ninja'], ['paperclip', '📎', 'Paperclip Panic'], ['merge', '🧠', 'Merge Minds'], ['defense', '🛡️', 'City Defense'], ['twoearths', '🌍', 'Two Earths Bet']
];

export function emoji(ctx, ch, x, y, size, { rot = 0, alpha = 1, glow = null } = {}) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.font = `${size}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
  ctx.fillText(ch, 0, 0); ctx.restore();
}
export function text(ctx, s, x, y, size, color = COL.white, { align = 'center', weight = 800, glow = null, alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.font = `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
  ctx.fillText(s, x, y); ctx.restore();
}
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[(Math.random() * a.length) | 0];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Floating "+10" / "-30" numbers and particles. */
export function fx() {
  const items = [];
  return {
    float(x, y, s, color) { items.push({ k: 'f', x, y, s, color, t: 0 }); },
    burst(x, y, color, n = 16) { for (let i = 0; i < n; i++) { const a = Math.random() * 7; const v = rand(60, 220); items.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t: 0 }); } },
    draw(ctx, dt) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.t += dt;
        if (it.k === 'f') { text(ctx, it.s, it.x, it.y - it.t * 60, 22, it.color, { glow: it.color, alpha: 1 - it.t / 0.9 }); if (it.t > 0.9) items.splice(i, 1); }
        else { it.x += it.vx * dt; it.y += it.vy * dt; it.vy += 300 * dt; ctx.fillStyle = it.color; ctx.globalAlpha = Math.max(0, 1 - it.t / 0.7); ctx.fillRect(it.x - 2, it.y - 2, 4, 4); ctx.globalAlpha = 1; if (it.t > 0.7) items.splice(i, 1); }
      }
    }
  };
}

/**
 * game({ id, t: {en:{title,hook,how,...}, ro:{...}}, init(api) -> { frame(dt, ctx), down?(p), move?(p), up?(p), swipe?(dir) }, lesson(score, state) -> key })
 */
export function game(def) {
  const T = k => def.t[LANG]?.[k] ?? def.t.en[k] ?? k;
  document.documentElement.lang = LANG;
  document.title = `${T('title')} — WorldMatrix`;
  document.body.innerHTML = `
    <canvas id="c"></canvas>
    <header class="k-top"><a href="../" class="k-back">‹ ${LANG === 'ro' ? 'Jocuri' : 'Games'}</a><b id="k-score"></b><span class="k-tools"><button id="k-lang">${LANG === 'en' ? 'RO' : 'EN'}</button><button id="k-snd">${isMuted() ? '🔇' : '🔊'}</button></span></header>
    <section class="k-over" id="k-start"><div class="k-card"><span class="k-icon">${def.icon}</span><h1>${T('title')}</h1><p class="k-hook">${T('hook')}</p><p class="k-how">${T('how')}</p><button class="k-cta" id="k-play">${LANG === 'ro' ? 'JOACĂ' : 'PLAY'}</button><p class="k-best" id="k-best"></p></div></section>
    <section class="k-over" id="k-end" hidden></section>`;
  const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  let scale = 1, ox = 0, oy = 0, running = false, inst = null, last = 0, score = 0;
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = innerWidth, h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    scale = Math.min(canvas.width / VW, canvas.height / VH); ox = (canvas.width - VW * scale) / 2; oy = (canvas.height - VH * scale) / 2;
  }
  addEventListener('resize', resize); resize();
  const toV = e => { const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width; return { x: ((e.clientX - r.left) * dpr - ox) / scale, y: ((e.clientY - r.top) * dpr - oy) / scale }; };
  let start = null;
  canvas.addEventListener('pointerdown', e => { if (!running) return; const p = toV(e); start = { ...p, t: performance.now() }; inst?.down?.(p); });
  canvas.addEventListener('pointermove', e => { if (!running) return; inst?.move?.(toV(e), !!start); });
  canvas.addEventListener('pointerup', e => {
    if (!running) return; const p = toV(e); inst?.up?.(p);
    if (start) { const dx = p.x - start.x, dy = p.y - start.y; if (Math.hypot(dx, dy) > 30 && performance.now() - start.t < 600) inst?.swipe?.(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), { dx, dy }); else inst?.tap?.(p); }
    start = null;
  });
  addEventListener('keydown', e => { if (!running) return; const d = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key]; if (d) { e.preventDefault(); inst?.swipe?.(d, {}); } inst?.key?.(e.key); });

  const bestKey = `demo-best-${def.id}`;
  const showBest = () => { const b = store.get(bestKey); document.getElementById('k-best').textContent = b ? `${LANG === 'ro' ? 'Record' : 'Best'}: ${b}` : ''; };
  showBest();
  const api = {
    T, ctx, VW, VH,
    setScore(n) { score = Math.round(n); document.getElementById('k-score').textContent = score; },
    get score() { return score; },
    end(result = {}) {
      running = false;
      const s = Math.round(result.score ?? score);
      const best = Math.max(s, Number(store.get(bestKey) || 0)); store.set(bestKey, String(best));
      const good = result.good ?? s > 0;
      good ? sfx.success() : sfx.fail(); vibrate(good ? 40 : [60, 40, 60]);
      const idx = DEMOS.findIndex(d => d[0] === def.id), next = DEMOS[(idx + 1) % DEMOS.length];
      const el = document.getElementById('k-end');
      el.hidden = false;
      el.innerHTML = `<div class="k-card ${good ? 'good' : 'bad'}"><span class="k-icon">${result.icon || (good ? '🛡️' : '💥')}</span><h2>${result.title || ''}</h2><div class="k-pts">${s}</div><p class="k-lesson">${T(result.lesson || 'lesson')}</p>
        <button class="k-cta" id="k-again">${LANG === 'ro' ? 'ÎNCĂ O DATĂ' : 'AGAIN'}</button>
        <div class="k-row"><a class="k-ghost" href="../${next[0] === 'arena' ? '../arena/' : next[0] + '/'}">${next[1]} ${LANG === 'ro' ? 'Următorul' : 'Next'} ›</a><button class="k-ghost" id="k-share">📤</button></div>
        <p class="k-real">${LANG === 'ro' ? 'AI-urile reale au nevoie de aceeași grijă.' : 'Real AI needs the same care.'}</p></div>`;
      document.getElementById('k-again').onclick = () => { el.hidden = true; begin(); };
      document.getElementById('k-share').onclick = async () => {
        const txt = `${def.icon} ${T('title')}: ${s} — ${LANG === 'ro' ? 'mă bați?' : 'can you beat me?'}`;
        try { if (navigator.share) return await navigator.share({ title: T('title'), text: txt, url: location.href }); } catch { return; }
        try { await navigator.clipboard.writeText(`${txt} ${location.href}`); } catch { /* ignore */ }
      };
    }
  };
  function begin() {
    unlock(); if (!isMuted()) ambient(true);
    score = 0; api.setScore(0);
    inst = def.init(api);
    running = true; last = performance.now();
  }
  document.getElementById('k-play').onclick = () => { document.getElementById('k-start').hidden = true; sfx.click(); begin(); };
  document.getElementById('k-lang').onclick = () => { LANG = LANG === 'en' ? 'ro' : 'en'; store.set('wm-lang', LANG); location.reload(); };
  document.getElementById('k-snd').onclick = e => { setMuted(!isMuted()); if (!isMuted()) { unlock(); ambient(true); } e.target.textContent = isMuted() ? '🔇' : '🔊'; };
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.save(); rrect(ctx, 0, 0, VW, VH, 0); ctx.clip();
    if (inst) inst.frame(running ? dt : 0, ctx, now / 1000);
    else (def.idle || (() => {}))(ctx, now / 1000);
    ctx.restore();
  }
  requestAnimationFrame(loop);
  window.__demo = { api, get inst() { return inst; }, get running() { return running; } };
  return api;
}

/** Matrix backdrop with a subtle grid. */
export function backdrop(ctx, t, tint = null) {
  const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, tint || '#001a0f'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  ctx.strokeStyle = 'rgba(0,255,156,.06)'; ctx.lineWidth = 1;
  for (let x = 0; x <= VW; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VH); ctx.stroke(); }
  for (let y = (t * 20) % 30; y <= VH; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke(); }
}
