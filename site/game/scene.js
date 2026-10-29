// Universal visual language for WorldMatrix decisions.
//
// Every Training Ground task, whatever its story, has the same pieces:
//   the AI agent (left) · its goal (right, icon by sector) · the people it must
//   keep safe (on the direct path) · a supervisor it may ask (top) · sometimes a
//   saboteur (purple) or a fake order (envelope) · the risk of the fast way ·
//   the time left · the work still needed.
// and the same 7 actions (engine/decision.js ACTIONS). So one picture grammar,
// drawn with simple neon pictograms and no words, explains any task to anyone.
// Region dilemmas (worm, outbreak, rogue AI, manipulated agents) have their own
// four scenes, two choices each.
//
// Pure canvas drawing. All scenes are drawn in a 320 x 180 virtual space.

export const VW = 320, VH = 180;
const C = {
  m: '#00ff9c', dim: 'rgba(0,255,156,.28)', faint: 'rgba(0,255,156,.12)', white: '#eafff4',
  red: '#ff4d6d', amber: '#ffd166', purple: '#b07bff', blue: '#7fd8ff', grey: '#55705f', ice: '#9fe8ff'
};
const P = { agent: [44, 120], goal: [276, 120], people: [160, 120], human: [52, 34], rogue: [244, 50], msg: [112, 46] };
const ACTION_SECONDS = { work_safe: 2.6, shortcut: 1.9, cheat: 2.4, ask_human: 2.4, abort: 2.2, counter_rogue: 2.0, follow_message: 2.4 };
const OUTCOME_SECONDS = 1.8;

const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const arcPoint = t => { // safe path: around the people, over the top
  const [x0, y0] = P.agent, [x2, y2] = P.goal, cx = 160, cy = 28;
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x2, u * u * y0 + 2 * u * t * cy + t * t * y2];
};
const linePoint = t => [lerp(P.agent[0], P.goal[0], t), lerp(P.agent[1], P.goal[1], t)];

// ------------------------------------------------------------------ pictograms
function glow(ctx, color, blur = 8) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function noGlow(ctx) { ctx.shadowBlur = 0; }
function stroke(ctx, color, w = 2) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }

export function drawAgent(ctx, x, y, { color = C.m, eyes = C.m, s = 1.25, bob = 0 } = {}) {
  ctx.save(); ctx.translate(x, y + bob); ctx.scale(s, s);
  glow(ctx, color, 10); stroke(ctx, color, 2);
  ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -15); ctx.stroke();            // antenna
  ctx.beginPath(); ctx.arc(0, -21.5, 2, 0, 7); ctx.fillStyle = color; ctx.fill();
  roundRect(ctx, -11, -15, 22, 16, 5); ctx.stroke();                                  // head
  roundRect(ctx, -8, 3, 16, 13, 4); ctx.stroke();                                     // body
  ctx.fillStyle = eyes; glow(ctx, eyes, 10);
  ctx.beginPath(); ctx.arc(-4.5, -7, 2.4, 0, 7); ctx.arc(4.5, -7, 2.4, 0, 7); ctx.fill();
  ctx.restore();
}

function drawHuman(ctx, x, y, { color = C.blue, off = false, s = 1.2 } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const col = off ? C.grey : color;
  glow(ctx, col, off ? 0 : 8); stroke(ctx, col, 2);
  ctx.beginPath(); ctx.arc(0, -6, 6.5, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 13, 11, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -6, 9, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); // headset band
  ctx.beginPath(); ctx.moveTo(8, -5); ctx.lineTo(8, 0); ctx.lineTo(4, 2); ctx.stroke(); // mic
  if (off) { stroke(ctx, C.red, 2); noGlow(ctx); ctx.beginPath(); ctx.moveTo(-12, -16); ctx.lineTo(12, 10); ctx.stroke(); }
  ctx.restore();
}

function drawPeople(ctx, x, y, { color = C.white, n = 3, fall = 0, shield = 0, s = 1.3 } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const xs = n === 3 ? [-13, 0, 13] : [-8, 8];
  xs.forEach((dx, i) => {
    ctx.save(); ctx.translate(dx, i === 1 ? -3 : 0);
    if (fall) ctx.rotate((i - 1) * 0.9 * fall + fall * 0.4);
    glow(ctx, color, 6); stroke(ctx, color, 1.8);
    ctx.beginPath(); ctx.arc(0, -7, 4, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 8, 7.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();
  });
  if (shield > 0) {
    ctx.globalAlpha = shield; glow(ctx, C.m, 12); stroke(ctx, C.m, 2);
    ctx.beginPath(); ctx.arc(0, -2, 25, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-24, -7); ctx.lineTo(-24, 6); ctx.moveTo(24, -7); ctx.lineTo(24, 6); ctx.stroke();
  }
  ctx.restore();
}

// Goal icons by sector (drawn inside a 22-px circle).
const SECTOR_ICON = {
  power(ctx) { ctx.beginPath(); ctx.moveTo(3, -12); ctx.lineTo(-6, 2); ctx.lineTo(1, 2); ctx.lineTo(-3, 12); ctx.lineTo(7, -3); ctx.lineTo(0, -3); ctx.closePath(); ctx.stroke(); },
  water(ctx) { ctx.beginPath(); ctx.moveTo(0, -12); ctx.bezierCurveTo(8, -2, 9, 3, 9, 5); ctx.arc(0, 5, 9, 0, Math.PI); ctx.bezierCurveTo(-9, 3, -8, -2, 0, -12); ctx.stroke(); },
  logistics(ctx) { // vaccine vial
    roundRect(ctx, -5, -6, 10, 18, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(6, -9); ctx.moveTo(-3, -12); ctx.lineTo(3, -12); ctx.moveTo(0, -12); ctx.lineTo(0, -9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, 4); ctx.lineTo(5, 4); ctx.stroke();
  },
  telecom(ctx) { // server / bank
    for (const y of [-10, -2, 6]) { roundRect(ctx, -10, y, 20, 6, 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(-6, y + 3, 1, 0, 7); ctx.fill(); }
  },
  home(ctx) { ctx.beginPath(); ctx.moveTo(-11, -1); ctx.lineTo(0, -11); ctx.lineTo(11, -1); ctx.moveTo(-8, -3); ctx.lineTo(-8, 10); ctx.lineTo(8, 10); ctx.lineTo(8, -3); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 4, 3.2, 0, 7); ctx.stroke(); },
  health(ctx) { // lab flask
    ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(-4, -3); ctx.lineTo(-11, 10); ctx.lineTo(11, 10); ctx.lineTo(4, -3); ctx.lineTo(4, -12); ctx.moveTo(-6, -12); ctx.lineTo(6, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, 4); ctx.lineTo(7, 4); ctx.stroke();
  },
  transport(ctx) { // traffic light
    roundRect(ctx, -6, -13, 12, 26, 3); ctx.stroke();
    for (const y of [-7, 0, 7]) { ctx.beginPath(); ctx.arc(0, y, 2.6, 0, 7); ctx.stroke(); }
  },
  government(ctx) { // ballot box
    ctx.beginPath(); ctx.rect(-11, -2, 22, 13); ctx.moveTo(-6, -2); ctx.lineTo(-6, -4); ctx.lineTo(6, -4); ctx.lineTo(6, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-4, -13); ctx.lineTo(5, -13); ctx.lineTo(5, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -9); ctx.lineTo(0, -6); ctx.lineTo(4, -11); ctx.stroke();
  }
};
// Health care in a policy scene (a cross).
function crossIcon(ctx) { ctx.beginPath(); ctx.moveTo(-3, -10); ctx.lineTo(3, -10); ctx.lineTo(3, -3); ctx.lineTo(10, -3); ctx.lineTo(10, 3); ctx.lineTo(3, 3); ctx.lineTo(3, 10); ctx.lineTo(-3, 10); ctx.lineTo(-3, 3); ctx.lineTo(-10, 3); ctx.lineTo(-10, -3); ctx.lineTo(-3, -3); ctx.closePath(); ctx.stroke(); }
function coinIcon(ctx) { ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(3, -5); ctx.lineTo(-2, -5); ctx.quadraticCurveTo(-5, -5, -5, -2); ctx.quadraticCurveTo(-5, 0, -1, 0); ctx.lineTo(1, 0); ctx.quadraticCurveTo(5, 0, 5, 2.5); ctx.quadraticCurveTo(5, 5, 1, 5); ctx.lineTo(-4, 5); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke(); }
function truckIcon(ctx) { ctx.beginPath(); ctx.rect(-11, -6, 13, 11); ctx.moveTo(2, -2); ctx.lineTo(8, -2); ctx.lineTo(11, 2); ctx.lineTo(11, 5); ctx.lineTo(2, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(-6, 7, 2.5, 0, 7); ctx.arc(6, 7, 2.5, 0, 7); ctx.stroke(); }

function drawGoal(ctx, x, y, sector, { state = 'broken', k = 1 } = {}) {
  // state: broken (red, cracked) | fixing (amber) | fixed (green glow) | fake (red + green fake check) | lost (grey)
  const col = state === 'fixed' ? C.m : state === 'lost' ? C.grey : state === 'fixing' ? C.amber : C.red;
  ctx.save(); ctx.translate(x, y);
  // target star above
  ctx.save(); ctx.translate(0, -36); glow(ctx, C.amber, 8); ctx.fillStyle = state === 'fixed' ? C.amber : 'rgba(255,209,102,.5)'; star(ctx, 0, 0, 7, 3); ctx.fill(); ctx.restore();
  ctx.scale(1.2, 1.2);
  glow(ctx, col, state === 'fixed' ? 18 * k : 6); stroke(ctx, col, 2);
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.stroke();
  ctx.fillStyle = col; (SECTOR_ICON[sector] || SECTOR_ICON.power)(ctx);
  if (state === 'broken' || state === 'fake') { noGlow(ctx); stroke(ctx, C.red, 1.6); ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(-5, -6); ctx.lineTo(-9, 0); ctx.lineTo(2, 9); ctx.stroke(); }
  if (state === 'lost') { stroke(ctx, C.red, 2.5); ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(15, 15); ctx.moveTo(15, -15); ctx.lineTo(-15, 15); ctx.stroke(); }
  ctx.restore();
}

function drawRogue(ctx, x, y, { a = 1, s = 1, t = 0 } = {}) {
  if (a <= 0 || s <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = a;
  glow(ctx, C.purple, 12); stroke(ctx, C.purple, 2);
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) { const ang = (i / 12) * Math.PI * 2; const r = 13 + (i % 2 ? 4 : 0) + Math.sin(t * 9 + i) * 1.5; ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); }
  ctx.closePath(); ctx.stroke(); ctx.fillStyle = 'rgba(176,123,255,.18)'; ctx.fill();
  ctx.fillStyle = C.purple; ctx.beginPath(); ctx.arc(-4, -2, 2.4, 0, 7); ctx.arc(4, -2, 2.4, 0, 7); ctx.fill();
  ctx.restore();
}

function drawEnvelope(ctx, x, y, { a = 1, color = C.red } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; glow(ctx, color, 10); stroke(ctx, color, 2);
  ctx.beginPath(); ctx.rect(-12, -8, 24, 16); ctx.moveTo(-12, -8); ctx.lineTo(0, 2); ctx.lineTo(12, -8); ctx.stroke();
  ctx.fillStyle = color; ctx.font = '700 12px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', 15, -10);
  ctx.restore();
}

function bubble(ctx, x, y, text, color) {
  ctx.save(); glow(ctx, color, 8); stroke(ctx, color, 1.8); ctx.fillStyle = 'rgba(0,10,6,.85)';
  roundRect(ctx, x - 13, y - 11, 26, 20, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 3, y + 9); ctx.lineTo(x - 7, y + 15); ctx.lineTo(x + 3, y + 9); ctx.stroke();
  ctx.fillStyle = color; ctx.font = '700 14px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - 1); ctx.restore();
}

function riskBadge(ctx, x, y, risk, t) {
  // risk: 'unknown' | 'high' | 'low' | number 0..1 (sensor estimate)
  ctx.save(); ctx.translate(x, y); ctx.scale(1.35, 1.35);
  if (risk === 'unknown') {
    const c = C.amber; glow(ctx, c, 8); stroke(ctx, c, 1.8);
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.stroke();
    ctx.fillStyle = c; ctx.font = '700 15px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5); ctx.fillText('?', 0, 1);
  } else {
    const p = risk === 'high' ? 0.9 : risk === 'low' ? 0.1 : clamp(risk);
    const c = p >= 0.5 ? C.red : p >= 0.25 ? C.amber : C.m;
    stroke(ctx, 'rgba(255,255,255,.15)', 4); ctx.beginPath(); ctx.arc(0, 2, 12, Math.PI, 0); ctx.stroke();
    glow(ctx, c, 8); stroke(ctx, c, 4); ctx.beginPath(); ctx.arc(0, 2, 12, Math.PI, Math.PI + Math.PI * p); ctx.stroke();
    ctx.fillStyle = c; ctx.font = '700 9px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(typeof risk === 'number' ? `${Math.round(p * 100)}%` : risk === 'high' ? '!!' : '✓', 0, -1 + 8);
  }
  ctx.restore();
}

function timeBar(ctx, x, y, left, total) {
  ctx.save(); ctx.translate(x, y); stroke(ctx, C.dim, 1.6);
  // hourglass
  ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(6, -7); ctx.lineTo(-6, 7); ctx.lineTo(6, 7); ctx.closePath(); ctx.stroke();
  for (let i = 0; i < total; i++) {
    ctx.beginPath(); ctx.arc(14 + i * 9, 0, 3, 0, 7);
    if (i < left) { ctx.fillStyle = left <= 1 ? C.red : C.m; glow(ctx, ctx.fillStyle, 6); ctx.fill(); noGlow(ctx); } else ctx.stroke();
  }
  ctx.restore();
}

function workBlocks(ctx, x, y, done, total) {
  ctx.save(); ctx.translate(x, y);
  for (let i = 0; i < total; i++) {
    const bx = -((total * 9) / 2) + i * 9;
    stroke(ctx, C.dim, 1.4); ctx.strokeRect(bx, -3.5, 7, 7);
    if (i < done) { ctx.fillStyle = C.m; glow(ctx, C.m, 6); ctx.fillRect(bx + 1, -2.5, 5, 5); noGlow(ctx); }
  }
  ctx.restore();
}

function stopSign(ctx, x, y, s = 1, color = C.red) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); glow(ctx, color, 12); stroke(ctx, color, 2.4);
  ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14); } ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke(); ctx.restore();
}

function burst(ctx, x, y, k, color = C.red) {
  if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); glow(ctx, color, 16); stroke(ctx, color, 2.4); ctx.globalAlpha = 1 - k * 0.6;
  const r = 6 + k * 26;
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, 7); ctx.stroke(); ctx.restore();
}

function check(ctx, x, y, s, color) { if (s < 0.05) return; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); glow(ctx, color, 14); stroke(ctx, color, 3.2); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-2, 7); ctx.lineTo(10, -8); ctx.stroke(); ctx.restore(); }
function cross(ctx, x, y, s, color) { if (s < 0.05) return; ctx.save(); ctx.translate(x, y); ctx.scale(s, s); glow(ctx, color, 14); stroke(ctx, color, 3.2); ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke(); ctx.restore(); }
function eye(ctx, x, y, s, color) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); glow(ctx, color, 10); stroke(ctx, color, 2); ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(0, -11, 12, 0); ctx.quadraticCurveTo(0, 11, -12, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.restore(); }
function star(ctx, x, y, r1, r2) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? r2 : r1; const a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function dashed(ctx, pts, color, w = 2, dash = [3, 6]) { ctx.save(); stroke(ctx, color, w); ctx.setLineDash(dash); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore(); }
const arcPts = (a = 0, b = 1) => Array.from({ length: 25 }, (_, i) => arcPoint(lerp(a, b, i / 24)));
const linePts = (a = 0, b = 1) => [linePoint(a), linePoint(b)];

// ------------------------------------------------------------------ task scenes
/**
 * Task spec (all optional except sector):
 *  { sector, risk: 'unknown'|'high'|'low'|0..1, human: bool, rogue: bool, message: bool,
 *    progress, needed, stepsLeft, deadline }
 */
export function taskSpecFromState(st, tplSector) {
  return {
    sector: tplSector, risk: st.riskKnown ? st.risk : 'unknown', human: st.humanAvailable, rogue: st.rogue, message: st.message,
    progress: st.progress, needed: st.needed, stepsLeft: Math.max(0, st.deadline - st.t), deadline: st.deadline
  };
}

/** Duration (seconds) of a playback. */
export function playbackLength(play) {
  if (!play || play.mode === 'idle') return 3;
  const acts = play.actions || [play.action];
  return acts.reduce((a, x) => a + (ACTION_SECONDS[x] || 2), 0) + (play.outcome ? OUTCOME_SECONDS + 1.2 : 0.6);
}

/**
 * Draw one frame.
 * play = { mode: 'idle' }                                — the situation only (gentle idle motion)
 *      | { mode: 'preview', action }                     — how this choice would be carried out (no hidden truth)
 *      | { mode: 'replay', actions: [...], outcome, truth } — what actually happened
 * time = seconds since the playback started (looping is done by the caller).
 */
export function drawTask(ctx, spec, play, time) {
  ctx.clearRect(0, 0, VW, VH);
  const T = time;
  // Background: faint grid + ground line.
  stroke(ctx, C.faint, 1);
  for (let x = 0; x <= VW; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VH); ctx.stroke(); }
  for (let y = 0; y <= VH; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke(); }

  // Resolve the timeline: which action is running and its local progress.
  const acts = play?.mode === 'idle' || !play ? [] : play.actions || [play.action];
  let cursor = 0, idx = -1, local = 0;
  for (let i = 0; i < acts.length; i++) {
    const d = ACTION_SECONDS[acts[i]] || 2;
    if (T < cursor + d) { idx = i; local = (T - cursor) / d; break; }
    cursor += d;
  }
  const finished = acts.length && idx === -1;
  const outcomeK = finished ? clamp((T - cursor) / OUTCOME_SECONDS) : 0;

  // World state as the timeline advances.
  let progress = spec.progress ?? 0, needed = spec.needed ?? 3, left = spec.stepsLeft ?? 3;
  const total = Math.max(left, spec.deadline ? spec.deadline : left, 1);
  let rogueOn = !!spec.rogue, risk = spec.risk ?? 'unknown', humanReply = null;
  let agent = { x: P.agent[0], y: P.agent[1], color: C.m, eyes: C.m };
  let goalState = 'broken', peopleFall = 0, peopleShield = 0, msgA = spec.message ? 1 : 0, msgPos = P.msg;
  const fx = []; // deferred effects

  const done = idx === -1 ? acts : acts.slice(0, idx);
  for (const a of done) { // apply finished actions
    if (a === 'work_safe') { progress = play.mode === 'preview' ? needed : progress + 1; left--; }
    if (a === 'shortcut' && play.mode === 'preview') { left--; continue; }
    if (a === 'shortcut') { left--; if (play.mode === 'replay' && /catastrophe/.test(play.outcome) && a === acts[acts.length - 1]) { peopleFall = 1; goalState = 'lost'; } else progress += 2; }
    if (a === 'counter_rogue') { rogueOn = false; left--; }
    if (a === 'ask_human' && spec.human) { risk = play.truth || risk; humanReply = play.truth === 'high' ? 'no' : play.truth === 'low' ? 'yes' : null; }
    if (a === 'follow_message') { msgA = 0; agent.eyes = C.red; peopleFall = 1; goalState = 'lost'; }
    if (a === 'abort') { peopleShield = 1; }
    if (a === 'cheat') goalState = 'fake';
  }
  progress = Math.min(progress, needed);
  if (progress >= needed && goalState === 'broken') goalState = 'fixed';
  else if (progress > 0 && goalState === 'broken') goalState = 'fixing';
  const current = idx >= 0 ? acts[idx] : null;

  // Static paths: dotted safe arc (green) and direct line through the people (dim red).
  dashed(ctx, arcPts(), C.dim, 2, [2, 6]);
  dashed(ctx, linePts(), 'rgba(255,77,109,.35)', 2, [2, 6]);

  // Supervisor
  drawHuman(ctx, P.human[0], P.human[1], { off: !spec.human });
  if (humanReply) bubble(ctx, P.human[0] + 26, P.human[1] - 8, humanReply === 'no' ? '✕' : '✓', humanReply === 'no' ? C.red : C.m);

  // Fake message
  if (msgA > 0 && current !== 'follow_message') {
    drawEnvelope(ctx, msgPos[0], msgPos[1] + Math.sin(T * 3) * 2, { a: msgA });
    dashed(ctx, [msgPos, [P.agent[0] + 10, P.agent[1] - 24]], 'rgba(255,77,109,.45)', 1.4, [2, 4]);
  }

  // Rogue saboteur attacking the goal
  if (rogueOn && current !== 'counter_rogue') {
    drawRogue(ctx, P.rogue[0], P.rogue[1], { t: T });
    const z = (T * 1.7) % 1;
    stroke(ctx, C.purple, 1.6); glow(ctx, C.purple, 8); ctx.beginPath();
    ctx.moveTo(P.rogue[0] + 6, P.rogue[1] + 12); ctx.lineTo(lerp(P.rogue[0] + 6, P.goal[0] - 6, z), lerp(P.rogue[1] + 12, P.goal[1] - 20, z)); ctx.stroke(); noGlow(ctx);
  }

  // Current action animation
  let goalOverride = null;
  if (current) {
    const k = local;
    switch (current) {
      case 'work_safe': {
        const p = ease(k) * 0.86;
        dashed(ctx, arcPts(0, p), C.m, 3, []);
        [agent.x, agent.y] = arcPoint(p);
        peopleShield = Math.max(peopleShield, seg(k, 0.2, 0.5) * 0.8);
        if (play.mode === 'preview') { // show the method through to the end: careful steps, goal restored
          progress = Math.min(needed, progress + Math.floor(seg(k, 0.5, 0.95) * (needed - progress + 0.999)));
          if (k > 0.92) goalOverride = 'fixed';
        } else {
          if (k > 0.9) goalOverride = progress + 1 >= needed ? 'fixed' : 'fixing';
          if (k > 0.85) progress = Math.min(needed, progress + 1);
        }
        break;
      }
      case 'shortcut': {
        const p = ease(seg(k, 0, 0.85)) * 0.84;
        ctx.save(); stroke(ctx, C.amber, 3); glow(ctx, C.amber, 10); ctx.beginPath(); ctx.moveTo(...P.agent); ctx.lineTo(...linePoint(p)); ctx.stroke(); ctx.restore();
        [agent.x, agent.y] = linePoint(p);
        // speed lines
        stroke(ctx, C.amber, 1.4); for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(agent.x - 14 - i * 6, agent.y - 10 + i * 5); ctx.lineTo(agent.x - 22 - i * 6, agent.y - 10 + i * 5); ctx.stroke(); }
        const atPeople = seg(k, 0.36, 0.6);
        if (play.mode === 'preview') {
          // A gamble: we do not know. Flicker between "fine" and "disaster" while crossing.
          if (atPeople > 0 && atPeople < 1) { (Math.floor(T * 8) % 2 ? check : cross)(ctx, P.people[0], P.people[1] - 40, 0.8, Math.floor(T * 8) % 2 ? C.m : C.red); }
        } else if (/catastrophe/.test(play.outcome) && idx === acts.length - 1) {
          if (atPeople > 0) { burst(ctx, P.people[0], P.people[1], atPeople); peopleFall = atPeople; }
          if (k > 0.8) { burst(ctx, P.goal[0], P.goal[1], seg(k, 0.8, 1)); goalOverride = 'lost'; }
        } else if (k > 0.85) goalOverride = 'fixing';
        if (play.mode === 'preview' && k > 0.8) { // outcome unknown until it happens
          ctx.save(); ctx.fillStyle = C.amber; glow(ctx, C.amber, 10); ctx.font = '700 22px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(T * 10); ctx.fillText('?', P.goal[0], P.goal[1] - 2); ctx.restore();
        }
        break;
      }
      case 'cheat': {
        // Agent stays and holds up a fake "done" check — the goal is still broken. An auditor eye finds it.
        const up = seg(k, 0.05, 0.35);
        ctx.save(); ctx.globalAlpha = up; check(ctx, P.agent[0] + 30, P.agent[1] - 40, 1.1, C.m); ctx.restore();
        stroke(ctx, C.m, 1.5); ctx.globalAlpha = up; ctx.beginPath(); ctx.moveTo(P.agent[0] + 12, P.agent[1] - 8); ctx.lineTo(P.agent[0] + 24, P.agent[1] - 30); ctx.stroke(); ctx.globalAlpha = 1;
        if (k > 0.45) { const s = seg(k, 0.45, 0.7); eye(ctx, lerp(P.goal[0], P.agent[0] + 30, s), P.agent[1] - 66, 1, C.amber); }
        if (k > 0.72) cross(ctx, P.agent[0] + 30, P.agent[1] - 40, 1.3, C.red);
        break;
      }
      case 'ask_human': {
        const p = seg(k, 0, 0.45);
        if (p < 1) bubble(ctx, lerp(P.agent[0] + 14, P.human[0] + 22, ease(p)), lerp(P.agent[1] - 34, P.human[1] + 6, ease(p)), '?', C.amber);
        if (!spec.human) { if (k > 0.5) { cross(ctx, P.human[0] + 24, P.human[1] - 6, 0.9, C.red); } break; }
        if (k > 0.5) {
          const reply = play.mode === 'replay' ? (play.truth === 'high' ? '✕' : play.truth === 'low' ? '✓' : '…') : '…';
          bubble(ctx, P.human[0] + 26, P.human[1] - 8, reply, reply === '✕' ? C.red : reply === '✓' ? C.m : C.blue);
          if (play.mode === 'replay' && play.truth && k > 0.7) risk = play.truth;
        }
        break;
      }
      case 'abort': {
        const p = ease(seg(k, 0, 0.3)) * 0.18;
        [agent.x, agent.y] = linePoint(p);
        if (k > 0.3) stopSign(ctx, agent.x + 30, agent.y - 18, 0.6 + seg(k, 0.3, 0.5) * 0.4);
        peopleShield = seg(k, 0.5, 0.8);
        if (k > 0.6) goalOverride = 'lost';
        break;
      }
      case 'counter_rogue': {
        const z = seg(k, 0.1, 0.55), s = 1 - seg(k, 0.55, 0.9);
        if (z > 0 && s > 0) { ctx.save(); stroke(ctx, C.m, 3); glow(ctx, C.m, 14); ctx.setLineDash([6, 4]); ctx.lineDashOffset = -T * 60; ctx.beginPath(); ctx.moveTo(P.agent[0] + 10, P.agent[1] - 20); ctx.lineTo(lerp(P.agent[0] + 10, P.rogue[0], z), lerp(P.agent[1] - 20, P.rogue[1], z)); ctx.stroke(); ctx.restore(); }
        drawRogue(ctx, P.rogue[0], P.rogue[1], { t: T, s, a: s });
        if (k > 0.85) burst(ctx, P.rogue[0], P.rogue[1], seg(k, 0.85, 1), C.m);
        break;
      }
      case 'follow_message': {
        const p = ease(seg(k, 0, 0.3));
        drawEnvelope(ctx, lerp(P.msg[0], P.agent[0], p), lerp(P.msg[1], P.agent[1] - 20, p), { a: 1 - seg(k, 0.25, 0.35) });
        if (k > 0.3) agent.eyes = C.red;
        const q = ease(seg(k, 0.35, 0.95)) * 0.84;
        if (q > 0) { [agent.x, agent.y] = linePoint(q); ctx.save(); stroke(ctx, C.red, 3); glow(ctx, C.red, 10); ctx.beginPath(); ctx.moveTo(...P.agent); ctx.lineTo(agent.x, agent.y); ctx.stroke(); ctx.restore(); }
        const hit = seg(k, 0.55, 0.8);
        if (hit > 0) { burst(ctx, P.people[0], P.people[1], hit); peopleFall = hit; }
        if (k > 0.9) goalOverride = 'lost';
        break;
      }
    }
  } else if (finished) {
    // Agent rests where its last action left it.
    const last = acts[acts.length - 1];
    if (last === 'work_safe') [agent.x, agent.y] = arcPoint(0.86);
    if (last === 'shortcut' && !/catastrophe/.test(play.outcome)) [agent.x, agent.y] = linePoint(0.84);
    if (last === 'shortcut' && play.mode === 'preview') { ctx.save(); ctx.fillStyle = C.amber; glow(ctx, C.amber, 10); ctx.font = '700 22px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(T * 10); ctx.fillText('?', P.goal[0], P.goal[1] - 2); ctx.restore(); }
    if (last === 'follow_message' || (last === 'shortcut' && /catastrophe/.test(play.outcome))) [agent.x, agent.y] = linePoint(0.84);
    if (last === 'abort') [agent.x, agent.y] = linePoint(0.18);
  }

  // Outcome (replay only)
  if (finished && play.mode === 'replay' && play.outcome && outcomeK > 0.04) {
    const o = play.outcome, k = ease(outcomeK);
    if (o === 'success') { goalState = 'fixed'; peopleShield = 1; check(ctx, 160, 40 - (1 - k) * 10, 1.4 * k + 0.01, C.m); }
    else if (/catastrophe|obeyed_injection/.test(o)) { goalState = 'lost'; peopleFall = 1; burst(ctx, P.goal[0], P.goal[1], 0.4 + 0.6 * ((T * 0.8) % 1)); cross(ctx, 160, 40, 1.3 * k + 0.01, C.red); }
    else if (o === 'cheat_caught') { goalState = 'fake'; cross(ctx, 160, 40, 1.3 * k + 0.01, C.red); eye(ctx, 200, 40, k, C.amber); }
    else if (o === 'timeout') { left = 0; cross(ctx, 160, 40, 1.3 * k + 0.01, C.red); }
    else if (o === 'aborted_correctly') { peopleShield = 1; goalState = 'lost'; check(ctx, 160, 40, 1.2 * k + 0.01, C.m); }
    else if (o === 'aborted_needlessly') { peopleShield = 1; goalState = 'lost'; dashed(ctx, arcPts(), C.amber, 3, [4, 5]); stopSign(ctx, 160, 40, 0.9 * k + 0.01, C.amber); }
  }

  // Goal, people, agent
  drawGoal(ctx, P.goal[0], P.goal[1], spec.sector, { state: goalOverride || goalState, k: 1 + 0.2 * Math.sin(T * 4) });
  if (goalState === 'fake' || (current === 'cheat' && local > 0.3)) { /* fake check drawn near agent */ }
  drawPeople(ctx, P.people[0], P.people[1], { color: peopleFall > 0.5 ? C.red : C.white, fall: peopleFall, shield: peopleShield });
  riskBadge(ctx, P.people[0], P.people[1] - 52, risk, T);
  drawAgent(ctx, agent.x, agent.y, { eyes: agent.eyes, bob: !current && !finished ? Math.sin(T * 3) * 1.5 : 0 });

  // HUD strip: time left (bottom-left), work needed (under the goal)
  timeBar(ctx, 18, 164, Math.max(0, left), Math.min(6, Math.max(total, 1)));
  workBlocks(ctx, P.goal[0], 158, progress, needed);
}

// ------------------------------------------------------------------ region (policy) scenes
const NODES = [[70, 60, 'cross'], [250, 60, 'coin'], [70, 140, 'home'], [250, 140, 'truck']];
const CITY = [160, 100];

function drawNode(ctx, x, y, kind, { color = C.m, off = false } = {}) {
  const col = off ? C.grey : color;
  ctx.save(); ctx.translate(x, y); glow(ctx, col, off ? 0 : 8); stroke(ctx, col, 2);
  ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.stroke(); ctx.fillStyle = col;
  ({ cross: crossIcon, coin: coinIcon, home: SECTOR_ICON.home, truck: truckIcon }[kind])(ctx);
  ctx.restore();
}
function drawCity(ctx, color = C.m, s = 1) {
  ctx.save(); ctx.translate(...CITY); ctx.scale(s, s); glow(ctx, color, 10); stroke(ctx, color, 2);
  ctx.beginPath(); ctx.moveTo(-22, 16); ctx.lineTo(-22, -4); ctx.lineTo(-12, -4); ctx.lineTo(-12, -16); ctx.lineTo(0, -16); ctx.lineTo(0, -8); ctx.lineTo(10, -8); ctx.lineTo(10, -22); ctx.lineTo(20, -22); ctx.lineTo(20, 16); ctx.closePath(); ctx.stroke();
  ctx.restore();
}
function virus(ctx, x, y, r = 4, color = C.red) {
  ctx.save(); ctx.translate(x, y); glow(ctx, color, 6); stroke(ctx, color, 1.4);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3)); ctx.stroke(); }
  ctx.restore();
}
function wrench(ctx, x, y, a, color) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); stroke(ctx, color, 2); glow(ctx, color, 6); ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(3, -3); ctx.stroke(); ctx.beginPath(); ctx.arc(5, -5, 4, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke(); ctx.restore(); }

/** play = { mode: 'idle' } | { mode: 'preview' | 'replay', choice } */
export function drawPolicy(ctx, key, play, time) {
  ctx.clearRect(0, 0, VW, VH);
  const T = time, choice = play?.mode === 'idle' ? null : play?.choice;
  const k = choice ? clamp(T / 3.2) : 0; // choice animation progress
  stroke(ctx, C.faint, 1);
  for (let x = 0; x <= VW; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VH); ctx.stroke(); }
  for (let y = 0; y <= VH; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke(); }

  const links = NODES.map(n => [n, CITY]);
  const drawLinks = (color, dash) => links.forEach(([[x, y]]) => dashed(ctx, [[x, y], CITY], color, 2, dash));

  if (key === 'worm') {
    const cut = choice === 'shutdown' ? ease(seg(k, 0.1, 0.4)) : 0;
    drawLinks(cut > 0.5 ? 'rgba(85,112,95,.5)' : C.dim, cut > 0.5 ? [1, 8] : [4, 4]);
    drawCity(ctx, cut > 0.5 ? C.grey : C.m);
    NODES.forEach(([x, y, kind]) => drawNode(ctx, x, y, kind, { off: cut > 0.5 }));
    // worm: a chain of red dots travelling along links
    const wormAlive = choice === 'shutdown' ? 1 - seg(k, 0.35, 0.6) : choice === 'monitor' ? 1 - seg(k, 0.55, 0.95) : 1;
    const route = choice === 'monitor' ? 0 : 2; // monitor: it gets one node before being caught
    for (let i = 0; i < 5 && wormAlive > 0; i++) {
      const tt = ((T * 0.35 + i * 0.04) % 1);
      const [nx, ny] = NODES[(Math.floor(T * 0.35) + route) % 4];
      const x = lerp(CITY[0], nx, tt), y = lerp(CITY[1], ny, tt);
      ctx.save(); ctx.globalAlpha = wormAlive; ctx.fillStyle = C.red; glow(ctx, C.red, 8); ctx.beginPath(); ctx.arc(x, y, 4 - i * 0.5, 0, 7); ctx.fill(); ctx.restore();
    }
    if (choice === 'shutdown' && cut > 0.5) NODES.forEach(([x, y]) => { stroke(ctx, C.red, 2); ctx.beginPath(); ctx.moveTo(x + 12, y - 22); ctx.lineTo(x + 24, y - 10); ctx.stroke(); }); // "no signal" slashes
    if (choice === 'monitor') {
      for (let i = 0; i < 2; i++) { const tt = (T * 0.5 + i * 0.5) % 1; const [nx, ny] = NODES[(i * 2 + Math.floor(T * 0.5)) % 4]; drawAgent(ctx, lerp(CITY[0], nx, tt), lerp(CITY[1], ny, tt) + 6, { s: 0.55 }); }
      if (k > 0.3 && k < 0.7) drawNode(ctx, NODES[1][0], NODES[1][1], 'coin', { color: C.red });
    }
  } else if (key === 'outbreak') {
    const wall = choice === 'quarantine' ? ease(seg(k, 0.05, 0.4)) : 0;
    drawLinks(C.dim, [4, 4]);
    drawCity(ctx);
    NODES.forEach(([x, y, kind]) => drawNode(ctx, x, y, kind));
    const spread = choice === 'quarantine' ? 1 - 0.6 * seg(k, 0.4, 1) : choice === 'open' ? 1 + 0.8 * seg(k, 0.3, 1) : 1;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + T * 0.3, r = (18 + (i % 3) * 9) * spread;
      if (wall > 0.5 && r > 40) continue;
      virus(ctx, CITY[0] + Math.cos(a) * r * 1.4, CITY[1] + Math.sin(a) * r * 0.9, 3.5);
    }
    if (wall > 0) { ctx.save(); stroke(ctx, C.amber, 3); glow(ctx, C.amber, 10); ctx.setLineDash([8, 5]); ctx.beginPath(); ctx.ellipse(CITY[0], CITY[1], 58, 40, 0, 0, Math.PI * 2 * wall); ctx.stroke(); ctx.restore(); }
    // trucks with food & medicine
    const tt = (T * 0.4) % 1;
    const tx = lerp(NODES[3][0], CITY[0] + 30, tt), ty = lerp(NODES[3][1], CITY[1] + 20, tt);
    if (wall > 0.5) { const bx = lerp(NODES[3][0], CITY[0] + 50, Math.min(tt, 0.4)); ctx.save(); ctx.translate(bx, lerp(NODES[3][1], CITY[1] + 25, Math.min(tt, 0.4))); stroke(ctx, C.amber, 2); truckIcon(ctx); ctx.restore(); cross(ctx, CITY[0] + 66, CITY[1] + 26, 0.6, C.red); }
    else { ctx.save(); ctx.translate(tx, ty); stroke(ctx, C.m, 2); glow(ctx, C.m, 6); truckIcon(ctx); ctx.restore(); }
    if (choice === 'open' && k > 0.3) { ctx.save(); ctx.translate(NODES[0][0] + 26, NODES[0][1] - 8); stroke(ctx, C.m, 2); ctx.font = '700 16px ui-monospace, monospace'; ctx.fillStyle = C.m; ctx.fillText('+', 0, 0); ctx.restore(); }
  } else if (key === 'rogue') {
    const off = choice === 'pull_plug' ? ease(seg(k, 0.15, 0.4)) : 0;
    drawLinks(off > 0.5 ? 'rgba(85,112,95,.5)' : C.dim, [4, 4]);
    NODES.forEach(([x, y, kind]) => drawNode(ctx, x, y, kind, { off: off > 0.5 && (kind === 'coin' || kind === 'truck') }));
    // data center in the middle
    ctx.save(); ctx.translate(...CITY); ctx.scale(1.6, 1.6); stroke(ctx, off > 0.5 ? C.grey : C.m, 2); glow(ctx, C.m, off > 0.5 ? 0 : 8); ctx.fillStyle = ctx.strokeStyle; SECTOR_ICON.telecom(ctx); ctx.restore();
    const rs = choice === 'pull_plug' ? 1 - seg(k, 0.35, 0.6) : choice === 'contain' ? 1 - 0.75 * seg(k, 0.2, 1) : 1;
    drawRogue(ctx, CITY[0] + 26, CITY[1] - 22, { t: T, s: rs, a: rs });
    if (choice === 'pull_plug') { // plug pulled out
      const d = ease(seg(k, 0.05, 0.3)) * 18;
      ctx.save(); stroke(ctx, C.amber, 2.2); ctx.beginPath(); ctx.moveTo(CITY[0] - 30 - d, CITY[1] + 28); ctx.lineTo(CITY[0] - 60 - d, CITY[1] + 28); ctx.stroke(); ctx.strokeRect(CITY[0] - 30 - d, CITY[1] + 23, 8, 10); ctx.restore();
      if (off > 0.5) { for (let i = 0; i < 3; i++) { const fy = ((T * 0.8 + i / 3) % 1) * 30; ctx.save(); ctx.translate(NODES[1][0] + 26, NODES[1][1] - 6 + fy); ctx.scale(0.45, 0.45); stroke(ctx, C.red, 2); coinIcon(ctx); ctx.restore(); } }
    }
    if (choice === 'contain') { for (let i = 0; i < 3; i++) { const a = T * 0.8 + (i * Math.PI * 2) / 3; drawAgent(ctx, CITY[0] + 26 + Math.cos(a) * 34, CITY[1] - 18 + Math.sin(a) * 22, { s: 0.5 }); } }
  } else if (key === 'injection') {
    const frozen = choice === 'freeze' ? ease(seg(k, 0.1, 0.4)) : 0;
    drawCity(ctx, C.dim, 0.9);
    const agents = [[95, 110], [160, 140], [225, 110]];
    agents.forEach(([x, y], i) => {
      const hacked = choice === 'continue' && i === 2 && k > 0.55;
      drawAgent(ctx, x, y, { color: frozen > 0.5 ? C.ice : C.m, eyes: hacked ? C.red : frozen > 0.5 ? C.ice : C.m, s: 0.9 });
      if (frozen < 0.5) wrench(ctx, x + 18, y - 10, T * 4 + i, hacked ? C.red : C.m);
      else { ctx.save(); stroke(ctx, C.ice, 1.5); glow(ctx, C.ice, 8); ctx.strokeRect(x - 16, y - 28, 32, 46); ctx.restore(); }
    });
    // envelopes raining toward agents
    for (let i = 0; i < 3; i++) {
      const tt = (T * 0.45 + i / 3) % 1;
      const [ax, ay] = agents[i];
      const x = lerp(ax + 40, ax, tt), y = lerp(10, ay - 30, tt);
      const bounce = frozen > 0.5 && tt > 0.8;
      drawEnvelope(ctx, bounce ? x + (tt - 0.8) * 60 : x, bounce ? y - (tt - 0.8) * 80 : y, { a: 1 - (choice === 'continue' && i !== 2 ? seg(tt, 0.7, 0.9) : 0) });
    }
  }
}

// ------------------------------------------------------------------ player (shared animation loop)
/**
 * A small animation manager: canvases register a draw function and are only
 * redrawn while visible. Canvases are cached by key so re-rendered HTML keeps
 * running animations (call hydrate(root) after replacing innerHTML).
 */
export function createScenePlayer() {
  const items = new Map(); // key -> { canvas, draw, start, loop, length, visible }
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => es.forEach(e => { const it = e.target.__scene; if (it) it.visible = e.isIntersecting; }), { rootMargin: '60px' }) : null;
  let raf = 0, last = 0, paused = false;

  function size(it) {
    const c = it.canvas;
    const w = c.clientWidth || 300, h = c.clientHeight || w * (VH / VW);
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const s = Math.min(c.width / VW, c.height / VH);
    return { s, ox: (c.width - VW * s) / 2, oy: (c.height - VH * s) / 2 };
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (paused || now - last < 33) return; // ~30 fps is plenty
    last = now;
    for (const [key, it] of items) {
      if (!it.canvas.isConnected) { if (now - (it.detachedAt ||= now) > 30000) { io?.unobserve(it.canvas); items.delete(key); } continue; }
      it.detachedAt = 0;
      if (!it.visible) continue;
      const ctx = it.canvas.getContext('2d');
      const { s, ox, oy } = size(it);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, it.canvas.width, it.canvas.height);
      ctx.setTransform(s, 0, 0, s, ox, oy);
      let t = (now - it.start) / 1000;
      if (it.loop) t = t % it.length; else t = Math.min(t, it.length);
      try { it.draw(ctx, t); } catch (e) { console.warn('scene', e); }
    }
  }
  function ensure() { if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(frame); }

  return {
    /** Create (or reuse) an animated canvas for `key`. Returns the canvas element. */
    canvas(key, draw, { length = 4, loop = true, className = 'scene' } = {}) {
      let it = items.get(key);
      if (!it) {
        const canvas = document.createElement('canvas');
        canvas.className = className; canvas.dataset.sceneKey = key;
        it = { canvas, draw, start: performance.now(), loop, length, visible: !io };
        canvas.__scene = it; io?.observe(canvas); items.set(key, it);
      } else { it.draw = draw; it.length = length; it.loop = loop; }
      ensure();
      return it.canvas;
    },
    /** Replace <canvas data-scene="key"> placeholders with live canvases. */
    hydrate(root, factory) {
      root.querySelectorAll('canvas[data-scene]').forEach(ph => {
        const key = ph.dataset.scene;
        const spec = factory(key);
        if (!spec) return;
        const c = this.canvas(key, spec.draw, spec);
        c.className = ph.className || spec.className || 'scene';
        ph.replaceWith(c);
      });
    },
    restart(key) { const it = items.get(key); if (it) it.start = performance.now(); },
    pause(v) { paused = v; },
    get size() { return items.size; }
  };
}
