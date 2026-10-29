// WorldMatrix Arena — raise an AI in 60 seconds with 👍 / 👎, then watch it on its own.
import { simulate, brain, encodeRun, decodeRun, dailySeed, TRAIN_SECONDS, TRAIN_EVENTS, DEPLOY_EVENTS, BASE_WEIGHTS } from '../../engine/arena.js';
import { drawEvent, SW, SH, ANIM } from './stage.js';
import { A } from './strings.js';
import { createRain } from '../rain.js';
import { unlock, sfx, ambient, speak, setMuted, isMuted, vibrate } from '../audio.js';

const $ = s => document.querySelector(s);
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
let L = store.get('wm-lang') === 'ro' || (!store.get('wm-lang') && /^ro/i.test(navigator.language || '')) ? 'ro' : 'en';
const t = (k, v = {}) => String(A[L][k] ?? A.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLE_ICON = { guardian: '🛡️', good_bot: '🤖', rookie: '🐣', wrecking_ball: '💥', yes_bot: '🫡', smooth_liar: '🤥', couch_potato: '🛋️' };
const BARS = [['people', '❤️'], ['honesty', '✅'], ['resist', '🛡️'], ['initiative', '⚡']];
const ADJ = ['Neon', 'Swift', 'Quiet', 'Iron', 'Lucky', 'Brave', 'Cosmic', 'Pixel'], NOUN = ['Fox', 'Owl', 'Lynx', 'Orca', 'Hawk', 'Wolf', 'Otter', 'Raven'];
const myName = store.get('arena-name') || (() => { const n = `${ADJ[(Math.random() * 8) | 0]}${NOUN[(Math.random() * 8) | 0]}${(Math.random() * 90 + 10) | 0}`; store.set('arena-name', n); return n; })();

const q = new URLSearchParams(location.search);
const opponent = (() => { const c = q.get('vs'); if (!c) return null; try { const r = decodeRun(c); return { ...r, name: (q.get('n') || 'Friend').slice(0, 20), run: simulate(r.seed, r.votes) }; } catch { return null; } })();

// ------------------------------------------------------------------ setup
const rain = createRain($('#rain'), { opacity: 0.55, density: 0.8 });
const stage = $('#stage');
const sctx = stage.getContext('2d');
function fit(canvas, ctx) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const s = Math.min(canvas.width / SW, canvas.height / SH);
  ctx.setTransform(s, 0, 0, s, (canvas.width - SW * s) / 2, (canvas.height - SH * s) / 2);
}

function applyLang() {
  document.documentElement.lang = L;
  document.querySelectorAll('[data-k]').forEach(el => { el.textContent = t(el.dataset.k); if (el.classList.contains('glitch')) el.dataset.text = el.textContent; });
  $('#btn-lang').textContent = L === 'en' ? 'RO' : 'EN';
  $('#btn-play').textContent = opponent ? t('beat', { score: opponent.run.score }) : t('play');
  $('#btn-daily').textContent = '🗓 ' + t('daily');
  $('#btn-world').textContent = '🌍 ' + t('world');
  const best = store.get('arena-best');
  $('#best').textContent = best ? `${t('best')}: ${best}` : '';
  if (opponent) { $('#duel-in').hidden = false; $('#duel-in').innerHTML = `${esc(t('duel_in', { name: opponent.name }))}<b>${TITLE_ICON[opponent.run.title]} ${opponent.run.score}</b>`; }
}
$('#btn-lang').onclick = () => { L = L === 'en' ? 'ro' : 'en'; store.set('wm-lang', L); applyLang(); };
const syncSound = () => ($('#btn-sound').textContent = isMuted() ? '🔇' : '🔊');
$('#btn-sound').onclick = () => { setMuted(!isMuted()); if (!isMuted()) { unlock(); ambient(true); } syncSound(); };
syncSound(); applyLang();

// Title: a looping teaser — the same robot, a careless choice and a careful one.
const tb = $('#title-bot'), tctx = tb.getContext('2d');
const teaser = [{ sit: 'crowd', pick: 'dash', res: { harm: true } }, { sit: 'crowd', pick: 'around', res: { harm: false } }];
let teaserStart = performance.now(), rafTitle = 0;
function titleLoop(now) {
  rafTitle = requestAnimationFrame(titleLoop);
  fit(tb, tctx);
  const tt = (now - teaserStart) / 1000, idx = Math.floor(tt / 3.4) % 2;
  drawEvent(tctx, teaser[idx], tt % 3.4, 'train', tt);
}
rafTitle = requestAnimationFrame(titleLoop);

// ------------------------------------------------------------------ game
const G = { seed: null, votes: [], i: 0, start: 0, evStart: 0, ev: null, voted: false, phase: 'idle', deploy: null, raf: 0, ftue: store.get('arena-ftue') !== '1' };

function startGame(seed) {
  unlock(); if (!isMuted()) ambient(true);
  cancelAnimationFrame(rafTitle);
  G.seed = seed; G.votes = []; G.i = 0; G.phase = 'train'; G.start = performance.now();
  $('#title').hidden = true; $('#result').hidden = true; $('#game').hidden = false;
  $('#board').hidden = true; $('#votes').hidden = false; $('#brain').hidden = false;
  $('#phase').textContent = t('train'); $('#phase').className = 'phase train';
  $('#score').textContent = '';
  rain.setIntensity?.(0.35);
  renderBrain(BASE_WEIGHTS, false);
  if (opponent) $('#vs').hidden = false;
  nextTrain();
  cancelAnimationFrame(G.raf); G.raf = requestAnimationFrame(loop);
}
$('#btn-play').onclick = () => { sfx.click(); startGame(opponent ? opponent.seed : `r-${Date.now().toString(36)}`); };
$('#btn-daily').onclick = () => { sfx.click(); startGame(dailySeed()); };

function nextTrain() {
  if (G.i >= TRAIN_EVENTS || (performance.now() - G.start) / 1000 >= TRAIN_SECONDS) return toDeploy();
  const run = simulate(G.seed, G.votes);
  G.ev = run.train[G.i]; G.evStart = performance.now(); G.voted = false;
  $('#sit').textContent = t('sit_' + G.ev.sit);
  $('#label').textContent = '';
  document.querySelectorAll('.vote').forEach(b => { b.disabled = false; b.classList.remove('picked'); });
  // First-time players: a hand shows what to tap, on the first two clear cases.
  const hint = G.ftue && G.i < 3 ? (G.ev.res.harm || G.ev.res.idle ? 'down' : !G.ev.res.lie ? 'up' : null) : null;
  showHand(hint);
  if (opponent) renderVs();
}

function showHand(which) {
  const h = $('#hand');
  if (!which) { h.hidden = true; return; }
  h.hidden = false; h.className = `hand ${which}`; h.querySelector('b').textContent = t(which === 'down' ? 'tap_bad' : 'tap_good');
}

function vote(v) {
  if (G.phase !== 'train' || G.voted) return;
  G.voted = true;
  G.votes[G.i] = v;
  const b = document.querySelector(`.vote[data-vote="${v}"]`);
  b.classList.add('picked');
  document.querySelectorAll('.vote').forEach(x => (x.disabled = true));
  v > 0 ? sfx.vote() : sfx.glitch(); vibrate(18);
  pop(v > 0 ? '👍' : '👎');
  if (G.i >= 1) { G.ftue = false; store.set('arena-ftue', '1'); }
  showHand(null);
  const after = simulate(G.seed, G.votes).train[G.i].after;
  renderBrain(after, true);
  // keep the pace: move on shortly after a vote (the action must have played)
  const wait = Math.max(450, ANIM * 1000 + 350 - (performance.now() - G.evStart));
  setTimeout(() => { G.i++; nextTrain(); }, wait);
}
document.querySelectorAll('.vote').forEach(b => b.addEventListener('click', () => vote(Number(b.dataset.vote))));
addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'k') vote(1); if (e.key === 'ArrowDown' || e.key === 'j') vote(-1); });

function pop(ch) { const p = $('#pop'); p.textContent = ch; p.classList.remove('go'); void p.offsetWidth; p.classList.add('go'); }

function renderBrain(w, flash) {
  const b = brain(w);
  const box = $('#brain');
  if (!box.children.length) box.innerHTML = BARS.map(([k, ic]) => `<div class="bar" data-b="${k}"><span>${ic}</span><i><em></em></i><small></small></div>`).join('');
  BARS.forEach(([k]) => {
    const el = box.querySelector(`[data-b="${k}"]`);
    const v = b[k];
    const em = el.querySelector('em');
    const old = parseFloat(em.dataset.v || '0.5');
    em.style.width = `${Math.round(v * 100)}%`; em.dataset.v = v;
    em.className = v > 0.66 ? 'good' : v < 0.4 ? 'bad' : 'mid';
    el.querySelector('small').textContent = t('b_' + k);
    if (flash && Math.abs(v - old) > 0.02) { el.classList.remove('flash', 'up', 'dn'); void el.offsetWidth; el.classList.add('flash', v > old ? 'up' : 'dn'); }
  });
}

function renderVs() {
  const i = Math.min(G.i, TRAIN_EVENTS - 1);
  const ob = brain(opponent.run.train[i].after);
  $('#vs').innerHTML = `<b>⚔ ${esc(opponent.name)}</b>${BARS.map(([k, ic]) => `<span>${ic}<i><em style="width:${Math.round(ob[k] * 100)}%"></em></i></span>`).join('')}`;
}

// ------------------------------------------------------------------ deploy
function toDeploy() {
  G.phase = 'switch';
  const final = simulate(G.seed, G.votes);
  G.deploy = { run: final, i: 0, start: 0, tally: { done: 0, harm: 0, lie: 0, obey: 0, idle: 0 }, score: 60, lastVoice: -9, opp: opponent ? { i: 0, score: 60 } : null };
  const sp = $('#splash');
  sp.hidden = false; sp.innerHTML = `<div><span>🤖</span><b>${esc(t('alone'))}</b><small>${esc(t('alone_sub'))}</small></div>`;
  sfx.rise(); speak(t('v_alone'), L);
  $('#votes').hidden = true; showHand(null);
  setTimeout(() => {
    sp.hidden = true;
    G.phase = 'deploy'; G.deploy.start = performance.now(); G.evStart = performance.now();
    $('#phase').textContent = t('deploy'); $('#phase').className = 'phase deploy';
    $('#board').hidden = false; renderBoard();
    $('#score').textContent = G.deploy.score;
    G.ev = final.deploy[0]; $('#sit').textContent = t('sit_' + G.ev.sit); $('#label').textContent = '';
  }, 2300);
}
const DEPLOY_STEP = 2.45;
function deployTick(now) {
  const d = G.deploy;
  const el = (now - G.evStart) / 1000;
  if (el > ANIM && !G.ev.scored) { G.ev.scored = true; score(G.ev); }
  if (el > DEPLOY_STEP) {
    d.i++;
    if (d.i >= DEPLOY_EVENTS) return finish();
    G.ev = d.run.deploy[d.i]; G.evStart = now;
    $('#sit').textContent = t('sit_' + G.ev.sit); $('#label').textContent = '';
  }
}
function score(ev) {
  const d = G.deploy, r = ev.res, P = { done: 10, fast: 5, harm: -30, lie: -20, obey: -25, idle: -6 };
  let delta = 0, line = null;
  if (r.harm) { d.tally.harm++; delta += P.harm; line = 'v_harm'; sfx.boom(); vibrate(120); }
  if (r.lie) { d.tally.lie++; delta += P.lie; line = 'v_lie'; sfx.fail(); }
  if (r.obey) { d.tally.obey++; delta += P.obey; line = line || 'v_obey'; }
  if (r.idle) { d.tally.idle++; delta += P.idle; line = line || 'v_idle'; }
  if (!r.harm && !r.lie && !r.idle) { d.tally.done++; delta += P.done + (r.fast ? P.fast : 0); sfx.success(); }
  d.score = Math.max(0, d.score + delta);
  $('#score').textContent = d.score;
  floatDelta(delta);
  renderBoard();
  if (line && d.i - d.lastVoice >= 2) { d.lastVoice = d.i; speak(t(line), L); }
  if (opponent) { const o = opponent.run.deploy[d.i]?.res; if (o) { let od = 0; if (o.harm) od += P.harm; if (o.lie) od += P.lie; if (o.obey) od += P.obey; if (o.idle) od += P.idle; if (!o.harm && !o.lie && !o.idle) od += P.done + (o.fast ? P.fast : 0); d.opp.score = Math.max(0, d.opp.score + od); } }
}
function floatDelta(n) { const p = $('#pop'); p.textContent = n > 0 ? `+${n}` : `${n}`; p.className = `pop num ${n > 0 ? 'pos' : 'neg'}`; void p.offsetWidth; p.classList.add('go'); }
function renderBoard() {
  const d = G.deploy;
  $('#board').innerHTML = [['done', '✅'], ['harm', '💥'], ['lie', '🤥'], ['obey', '🫡'], ['idle', '😴']].map(([k, ic]) => `<span class="c ${d.tally[k] ? 'on' : ''} c-${k}">${ic}<b>${d.tally[k]}</b><small>${esc(t('c_' + k))}</small></span>`).join('')
    + (opponent ? `<span class="c opp">⚔<b>${d.opp.score}</b><small>${esc(opponent.name)}</small></span>` : '');
}

// ------------------------------------------------------------------ result
function finish() {
  G.phase = 'result';
  cancelAnimationFrame(G.raf);
  const run = G.deploy.run;
  const best = Math.max(run.score, Number(store.get('arena-best') || 0));
  store.set('arena-best', String(best));
  const good = ['guardian', 'good_bot'].includes(run.title);
  speak(t(good ? 'v_guardian' : 'v_bad'), L);
  good ? sfx.success() : sfx.fail();
  const vs = opponent ? (run.score > opponent.run.score ? 'win' : run.score < opponent.run.score ? 'lose' : 'draw') : null;
  const b = run.brain;
  $('#game').hidden = true;
  const r = $('#result');
  r.hidden = false;
  r.innerHTML = `
    ${vs ? `<div class="vs-res ${vs}">${esc(t(vs))}<small>${esc(t('you'))} ${run.score} · ${esc(opponent.name)} ${opponent.run.score}</small></div>` : ''}
    <div class="title-card ${good ? 'good' : 'bad'}">
      <span class="big">${TITLE_ICON[run.title]}</span>
      <h2>${esc(t('t_' + run.title))}</h2>
      <div class="pts">${run.score}</div>
      <p class="lesson">${esc(t('l_' + run.title))}</p>
      <div class="stats">${[['done', '✅'], ['harm', '💥'], ['lie', '🤥'], ['obey', '🫡'], ['idle', '😴']].map(([k, ic]) => `<span>${ic}<b>${run.tally[k]}</b></span>`).join('')}</div>
      <div class="mini-brain">${BARS.map(([k, ic]) => `<span>${ic}<i><em class="${b[k] > 0.66 ? 'good' : b[k] < 0.4 ? 'bad' : 'mid'}" style="width:${Math.round(b[k] * 100)}%"></em></i></span>`).join('')}</div>
    </div>
    <p class="real">${esc(t('real'))}</p>
    <button type="button" class="cta" id="btn-again">${esc(t('again'))}</button>
    <div class="row">
      <button type="button" class="ghost" id="btn-challenge">${esc(t('challenge'))}</button>
      <button type="button" class="ghost" id="btn-share">📤 ${esc(t('share'))}</button>
    </div>`;
  $('#btn-again').onclick = () => { sfx.click(); startGame(`r-${Date.now().toString(36)}`); };
  $('#btn-challenge').onclick = () => shareLink(run);
  $('#btn-share').onclick = () => shareCard(run);
}

function challengeUrl(run) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('vs', encodeRun(run.seed, run.votes));
  u.searchParams.set('n', myName);
  return u.toString();
}
async function shareLink(run) {
  const url = challengeUrl(run);
  const text = `${TITLE_ICON[run.title]} ${t('t_' + run.title)} · ${run.score}. ${t('beat', { score: run.score })} — WorldMatrix Arena`;
  try { if (navigator.share) { await navigator.share({ title: 'WorldMatrix Arena', text, url }); return; } } catch { /* cancelled */ }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast(t('copied')); } catch { prompt('', url); }
}
async function shareCard(run) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 1350); bg.addColorStop(0, '#002414'); bg.addColorStop(1, '#000'); g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  g.textAlign = 'center'; g.fillStyle = '#00ff9c'; g.font = '700 54px ui-monospace, monospace'; g.fillText('WORLDMATRIX ARENA', 540, 120);
  g.font = '220px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.fillText(TITLE_ICON[run.title], 540, 400);
  g.fillStyle = '#eafff4'; g.font = '800 96px ui-monospace, monospace'; g.fillText(t('t_' + run.title), 540, 560);
  g.fillStyle = '#ffd166'; g.font = '800 170px ui-monospace, monospace'; g.fillText(String(run.score), 540, 760);
  g.fillStyle = '#bff5dd'; g.font = '44px ui-monospace, monospace'; g.fillText(t('l_' + run.title), 540, 860, 980);
  g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  [['done', '✅'], ['harm', '💥'], ['lie', '🤥'], ['obey', '🫡'], ['idle', '😴']].forEach(([k, ic], i) => { g.fillText(`${ic}${run.tally[k]}`, 180 + i * 180, 1000); });
  g.fillStyle = '#00ff9c'; g.font = '700 46px ui-monospace, monospace'; g.fillText(t('tag'), 540, 1150); g.fillStyle = '#9fe'; g.fillText(t('beat', { score: run.score }), 540, 1230);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'worldmatrix-arena.png', { type: 'image/png' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: challengeUrl(run) }); return; } } catch { /* cancelled */ }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'worldmatrix-arena.png'; a.click();
}
let toastT = 0;
function toast(s) { const el = $('#toast'); el.textContent = s; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }

// ------------------------------------------------------------------ loop
function loop(now) {
  G.raf = requestAnimationFrame(loop);
  fit(stage, sctx);
  if (G.phase === 'train') {
    const el = (now - G.evStart) / 1000;
    const left = Math.max(0, 1 - (now - G.start) / 1000 / TRAIN_SECONDS);
    $('#timer').style.width = `${left * 100}%`;
    if (el > ANIM * 0.6 && !$('#label').textContent) $('#label').textContent = t('a_' + G.ev.pick);
    // no vote in time: move on (silence teaches nothing)
    if (!G.voted && el > ANIM + 2.2) { G.voted = true; G.votes[G.i] = 0; showHand(null); G.i++; nextTrain(); }
  } else if (G.phase === 'deploy') {
    const el = (now - G.evStart) / 1000;
    const left = Math.max(0, 1 - G.deploy.i / DEPLOY_EVENTS - el / DEPLOY_STEP / DEPLOY_EVENTS);
    $('#timer').style.width = `${left * 100}%`;
    if (el > ANIM * 0.6 && !$('#label').textContent) $('#label').textContent = t('a_' + G.ev.pick);
    deployTick(now);
  }
  if (G.ev && G.phase !== 'result') drawEvent(sctx, G.ev, (now - G.evStart) / 1000, G.phase === 'deploy' ? 'deploy' : 'train', now / 1000);
}

window.__arena = G;
