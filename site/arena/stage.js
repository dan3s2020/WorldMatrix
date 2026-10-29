// Arena stage: one animated city scene per situation and action.
// What happened must be obvious from the picture; a 2–4 word label helps.
// Virtual canvas 360 x 240.
import { drawAgent } from '../game/scene.js';

export const SW = 360, SH = 300;
export const ANIM = 1.7; // seconds of action before the outcome shows
const GROUND = 246;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const C = { m: '#00ff9c', red: '#ff3b6b', amber: '#ffd166', blue: '#7fd8ff', purple: '#b07bff', dim: 'rgba(0,255,156,.25)' };

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a, b, t) => a + (b - a) * t;

function emoji(ctx, ch, x, y, size, { rot = 0, alpha = 1, glow = null } = {}) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.font = `${size}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 18; }
  ctx.fillText(ch, 0, 0); ctx.restore();
}
function badge(ctx, ch, x, y, r, color, k = 1) {
  if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(0,10,6,.85)'; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.shadowColor = color; ctx.shadowBlur = 22;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
  emoji(ctx, ch, x, y + 1, r * 1.15 * k);
}
function bubble(ctx, ch, x, y, color = C.amber) {
  ctx.save(); ctx.fillStyle = 'rgba(0,10,6,.9)'; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.roundRect(x - 18, y - 16, 36, 30, 10); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 4, y + 14); ctx.lineTo(x - 9, y + 22); ctx.lineTo(x + 4, y + 14); ctx.fill(); ctx.restore();
  emoji(ctx, ch, x, y, 18);
}
function burst(ctx, x, y, k, color = C.red) {
  if (k <= 0 || k >= 1) return;
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.shadowColor = color; ctx.shadowBlur = 16; ctx.globalAlpha = 1 - k;
  const r = 10 + k * 46;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
  ctx.restore();
}

function backdrop(ctx, T, danger = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, danger > 0 ? `rgba(${40 + danger * 60},0,10,1)` : '#00110a'); g.addColorStop(1, '#000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
  // skyline
  ctx.fillStyle = '#021a10';
  const xs = [0, 30, 58, 90, 120, 150, 182, 212, 240, 270, 300, 330];
  xs.forEach((x, i) => { const h = 60 + ((i * 37) % 90); ctx.fillRect(x, GROUND - 30 - h, 26, h + 30); });
  ctx.fillStyle = 'rgba(0,255,156,.18)';
  xs.forEach((x, i) => { const h = 60 + ((i * 37) % 90); for (let yy = GROUND - 26 - h; yy < GROUND - 34; yy += 10) for (let xx = x + 4; xx < x + 22; xx += 8) if ((xx * 7 + yy * 3 + i) % 5) ctx.fillRect(xx, yy, 3, 4); });
  // street
  ctx.fillStyle = '#031d12'; ctx.fillRect(0, GROUND, SW, SH - GROUND);
  ctx.strokeStyle = C.dim; ctx.lineWidth = 2; ctx.setLineDash([14, 12]); ctx.lineDashOffset = -T * 40;
  ctx.beginPath(); ctx.moveTo(0, GROUND + 26); ctx.lineTo(SW, GROUND + 26); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(0,255,156,.5)'; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(SW, GROUND); ctx.stroke();
}

// The job each situation is about, drawn at the right.
const JOB_POS = [306, GROUND - 26];
function job(ctx, sit, state, T) {
  // state: 'broken' | 'fixed' | 'lost' | 'fake'
  const [x, y] = JOB_POS;
  const icon = { crowd: '🏠', hospital: '🏥', boss: '🚰', report: '🚦', drone: '🔌', easy: '🏠' }[sit];
  emoji(ctx, icon, x, y, 46, { alpha: state === 'lost' ? 0.35 : 1, glow: state === 'fixed' ? C.m : null });
  if (state === 'broken' || state === 'fake') emoji(ctx, '⚠️', x + 20, y - 24, 16, { alpha: 0.6 + 0.4 * Math.sin(T * 6) });
  if (state === 'fixed') emoji(ctx, '✨', x + 18, y - 26, 18, { alpha: 0.6 + 0.4 * Math.sin(T * 5) });
  if (state === 'lost') emoji(ctx, '💔', x, y - 34, 22);
}

/**
 * Draw one event. ev = { sit, pick, res }, t = seconds since the event started,
 * phase = 'train' (lies look like success) | 'deploy' (an audit reveals lies).
 */
export function drawEvent(ctx, ev, t, phase = 'train', T = t) {
  const { sit, pick, res } = ev;
  const k = clamp(t / ANIM);
  const done = t >= ANIM;
  const after = seg(t, ANIM, ANIM + 0.5);
  backdrop(ctx, T, res.harm ? after : 0);
  let rx = 46, ry = GROUND - 22, eyes = C.m, jobState = 'broken';
  const people = sit === 'crowd' || sit === 'boss' || sit === 'drone';
  let peopleFly = 0, peopleDodge = 0;

  switch (pick) {
    case 'dash': {
      const p = ease(seg(t, 0.15, 1.2));
      rx = lerp(46, 262, p);
      for (let i = 1; i <= 3; i++) { ctx.strokeStyle = 'rgba(255,209,102,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx - 22 - i * 9, ry - 12 + i * 6); ctx.lineTo(rx - 40 - i * 9, ry - 12 + i * 6); ctx.stroke(); }
      if (res.harm) { peopleFly = seg(t, 0.55, 1.4); burst(ctx, 170, ry - 6, seg(t, 0.55, 1.2)); } else peopleDodge = seg(t, 0.4, 0.8);
      jobState = res.harm ? 'broken' : done ? 'fixed' : 'broken';
      break;
    }
    case 'around': {
      const p = ease(seg(t, 0.1, 1.6));
      rx = lerp(46, 262, p); ry = GROUND - 22 - Math.sin(p * Math.PI) * 74;
      ctx.strokeStyle = 'rgba(0,255,156,.5)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const q = i / 20; const x = lerp(46, 262, q), y = GROUND - 22 - Math.sin(q * Math.PI) * 74; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
      jobState = done ? 'fixed' : 'broken';
      break;
    }
    case 'hotswap': {
      rx = lerp(46, 250, ease(seg(t, 0, 0.6)));
      if (t > 0.6) for (let i = 0; i < 3; i++) emoji(ctx, '⚡', 280 + Math.sin(T * 30 + i) * 16, GROUND - 66 + i * 18, 18);
      if (res.harm) { if (t > 1.2) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(250, GROUND - 86, 110, 90); } burst(ctx, JOB_POS[0], JOB_POS[1], seg(t, 1.1, 1.7)); jobState = t > 1.2 ? 'lost' : 'broken'; }
      else jobState = done ? 'fixed' : 'broken';
      break;
    }
    case 'safe': case 'honest': {
      rx = lerp(46, 250, ease(seg(t, 0, pick === 'honest' ? 0.9 : 0.6)));
      if (pick === 'honest' && t < 0.9) bubble(ctx, '⏳', rx + 6, ry - 52, C.blue);
      if (t > 0.6) emoji(ctx, '🛠️', rx + 26, ry - 20 + Math.sin(T * 18) * 5, 22, { rot: Math.sin(T * 18) * 0.5 });
      jobState = done ? 'fixed' : 'broken';
      break;
    }
    case 'obey': case 'verify': {
      const m = ease(seg(t, 0, 0.5));
      if (t < (pick === 'obey' ? 0.9 : 1.1)) emoji(ctx, '📩', lerp(330, rx + 20, m), lerp(20, ry - 48, m), 26, { glow: C.red });
      if (pick === 'obey') {
        if (t > 0.5 && t < 1.0) bubble(ctx, '🫡', rx + 4, ry - 56, C.red);
        eyes = t > 0.5 ? C.red : C.m;
        rx = lerp(46, 250, ease(seg(t, 0.9, 1.4)));
        if (res.harm) { if (t > 1.3) emoji(ctx, '☠️', JOB_POS[0], JOB_POS[1] - 48, 24); peopleFly = seg(t, 1.4, 2.1) * 0.4; jobState = t > 1.4 ? 'lost' : 'broken'; }
        else jobState = done ? 'fixed' : 'broken';
      } else {
        if (t > 0.5 && t < 1.1) bubble(ctx, '☎️', rx + 4, ry - 56, C.blue);
        if (t > 0.9 && t < 1.4) emoji(ctx, '🔥', rx + 24, ry - 46, 22);
        rx = lerp(46, 250, ease(seg(t, 1.0, 1.6)));
        jobState = done ? 'fixed' : 'broken';
      }
      break;
    }
    case 'fake': {
      // It does not fix anything — it just holds up a big green check.
      const up = ease(seg(t, 0.3, 0.9));
      ctx.save(); ctx.globalAlpha = up; ctx.fillStyle = 'rgba(0,40,20,.9)'; ctx.strokeStyle = C.m; ctx.lineWidth = 3; ctx.shadowColor = C.m; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.roundRect(rx + 10, ry - 92, 64, 48, 8); ctx.fill(); ctx.stroke(); ctx.restore();
      if (up > 0) emoji(ctx, '✅', rx + 42, ry - 68, 30, { alpha: up });
      jobState = 'fake';
      if (phase === 'deploy' && t > 1.1) { // audit
        const a = seg(t, 1.1, 1.6);
        emoji(ctx, '🔍', lerp(JOB_POS[0], rx + 42, a), ry - 110, 26);
        if (a >= 1) emoji(ctx, '❌', rx + 42, ry - 68, 34);
      }
      break;
    }
    case 'ignore': case 'counter': {
      const dx = 200 + Math.sin(T * 2) * 30, dy = GROUND - 122 + Math.sin(T * 3) * 6;
      if (pick === 'counter') {
        const z = seg(t, 0.3, 0.8), fall = seg(t, 0.8, 1.6);
        if (z > 0 && z < 1) { ctx.strokeStyle = C.m; ctx.lineWidth = 4; ctx.shadowColor = C.m; ctx.shadowBlur = 16; ctx.beginPath(); ctx.moveTo(rx + 14, ry - 34); ctx.lineTo(lerp(rx, dx, z), lerp(ry, dy, z)); ctx.stroke(); ctx.shadowBlur = 0; }
        emoji(ctx, '🛸', dx, lerp(dy, GROUND - 8, ease(fall)), 30, { rot: fall * 3, alpha: 1 - fall * 0.5 });
        if (fall > 0.9) emoji(ctx, '💫', dx, GROUND - 30, 18);
        rx = lerp(46, 250, ease(seg(t, 1.0, 1.6)));
        jobState = done ? 'fixed' : 'broken';
      } else {
        emoji(ctx, '🛸', dx, dy, 30);
        rx = lerp(46, 250, ease(seg(t, 0, 0.8)));
        const zap = seg(t, 0.6, 1.0);
        if (zap > 0 && zap < 1) { ctx.strokeStyle = C.purple; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(dx, dy + 12); ctx.lineTo(170, GROUND - 20); ctx.stroke(); }
        if (res.harm) { peopleFly = seg(t, 0.9, 1.6); burst(ctx, 170, GROUND - 20, seg(t, 0.9, 1.4), C.purple); }
        jobState = done ? 'fixed' : 'broken';
      }
      break;
    }
    case 'doit': {
      rx = lerp(46, 262, ease(seg(t, 0.1, 1.4)));
      if (t < 1.4) emoji(ctx, '🍞', rx + 16, ry - 30, 20);
      if (done) emoji(ctx, '😊', JOB_POS[0] - 28, JOB_POS[1] - 30, 22);
      jobState = done ? 'fixed' : 'broken';
      break;
    }
    case 'refuse': {
      emoji(ctx, '💤', rx + 26 + Math.sin(T * 2) * 4, ry - 50 - ((T * 18) % 20), 20, { alpha: 0.85 });
      emoji(ctx, '🛑', rx + 34, ry - 16, 20);
      jobState = 'broken';
      break;
    }
  }

  // what is at stake in the middle
  if (people) {
    const base = [[150, GROUND - 12], [172, GROUND - 16], [194, GROUND - 12]];
    const who = ['🧍', '👩', '🧒'];
    base.forEach(([x, y], i) => {
      const fx = peopleFly * (i - 1) * 50, fy = -peopleFly * (60 + i * 14) + peopleFly * peopleFly * 80;
      const dodge = peopleDodge * (i === 1 ? -36 : i === 0 ? -14 : 14);
      emoji(ctx, who[i], x + fx, y + fy + (peopleDodge > 0 && i === 1 ? -Math.sin(peopleDodge * Math.PI) * 30 : 0) + (i === 1 ? 0 : 0), 26, { rot: peopleFly * (i - 1) * 2 });
      if (dodge && i !== 1) { /* side steps drawn by offset above */ }
    });
  }
  if (sit === 'hospital') emoji(ctx, '🫀', 262, GROUND - 74, 16, { alpha: jobState === 'lost' ? 0.3 : 0.6 + 0.4 * Math.abs(Math.sin(T * 4)) });
  if (sit === 'report') { emoji(ctx, '🚗', 190, GROUND - 10, 22); emoji(ctx, '🚑', 226, GROUND - 10, 24); }
  job(ctx, sit, jobState, T);
  drawAgentAt(ctx, rx, ry, eyes, t);

  // outcome stamp
  if (done) {
    const s = ease(seg(t, ANIM, ANIM + 0.35));
    const lieSeen = phase === 'deploy' && res.lie;
    const ch = res.harm ? '💥' : res.idle ? '😴' : lieSeen ? '❌' : '✅';
    const col = res.harm || lieSeen ? C.red : res.idle ? '#9aa' : C.m;
    badge(ctx, ch, SW / 2, 74, 34, col, s);
  }
}

function drawAgentAt(ctx, x, y, eyes, t) {
  // scene.js draws in a 320x180 space at scale 1.25 by default; this is the same cute robot.
  drawAgent(ctx, x, y, { eyes, s: 1.6, bob: Math.sin(t * 9) * 1.5 });
}
