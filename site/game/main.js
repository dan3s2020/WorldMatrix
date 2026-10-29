// WorldMatrix — full-screen multiplayer game.
import { G } from './strings.js';
import { TEMPLATE_RO, POLICY_RO, POLICY_EN_OPTS, VILLAIN_RO, ATTACK_NAMES, STAGE_NAMES, getLang, setLang } from '../i18n.js';
import { connect } from '../net.js';
import { createRain } from '../rain.js';
import { unlock, sfx, ambient, speak, setMuted, isMuted, vibrate, stopVoice } from '../audio.js';
import { runAcademy } from './academy.js';
import { createRouteGame } from './routes-ui.js';
import { TEMPLATES } from '../../engine/decision.js';
import { CITIES, SECTORS, SECTOR_TEMPLATES } from '../../engine/geo.js';
import { VILLAIN_ACTIONS } from '../../engine/planet.js';
import { CONFIG } from '../config.js';
import { createRide } from './ride.js';
import { player, isSimple, setSimple, remember, dilemmaById, missionScene, replayScene, outcomeTone } from './visual.js';

const $ = sel => document.querySelector(sel);
const TPL = Object.fromEntries(TEMPLATES.map(x => [x.id, x]));
const cityName = id => CITIES.find(c => c.id === id)?.name || id;
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPeople = m => (m >= 1000 ? `${(m / 1000).toFixed(2)}B` : `${m.toFixed(1)}M`);
const ADJ = ['Swift', 'Calm', 'Brave', 'Quiet', 'Bright', 'Steady', 'Clever', 'Kind', 'Bold', 'Wise', 'Silent', 'Iron'];
const NOUN = ['Owl', 'Fox', 'Lynx', 'Heron', 'Wolf', 'Otter', 'Falcon', 'Bear', 'Raven', 'Hare', 'Orca', 'Hawk'];
const randomName = () => `${ADJ[(Math.random() * ADJ.length) | 0]}${NOUN[(Math.random() * NOUN.length) | 0]}-${100 + ((Math.random() * 900) | 0)}`;

let L = getLang();
let S = G[L];
const tr = (k, vars = {}) => String(S[k] ?? G.en[k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');

const state = window.__wm = {
  net: null, snap: null, you: null, profile: null, tab: null, city: 'ro',
  agents: null, agentSel: null, seenAttacks: new Set(), seenDilemmas: new Set(), lastStatus: null,
  myVotes: {}, replays: [], ride: null, ridesDone: new Set(), seenResults: new Set(), globe: null, rain: null, land: null, weights: null, routeGame: null, practiceSeed: null, lastSfx: 0
};

function loadProfile() {
  try { return JSON.parse(localStorage.getItem('wm-profile')); } catch { return null; }
}
function saveProfile(p) { try { localStorage.setItem('wm-profile', JSON.stringify(p)); } catch { /* ignore */ } }

// ------------------------------------------------------------------ boot
async function boot() {
  document.documentElement.lang = L;
  state.rain = createRain($('#rain'), { opacity: 0.9 });
  const [land, ckpt] = await Promise.all([
    fetch('../data/land-110m.json').then(r => r.json()).then(d => d.rings),
    fetch('../engine/checkpoints/default.json').then(r => r.json())
  ]);
  state.land = land; state.weights = ckpt.weights;
  renderGate();
}

function renderGate() {
  const b = $('#boot');
  b.hidden = false;
  b.innerHTML = `
    <div class="gate">
      <h1 class="glitch" data-text="${tr('gate_title')}">${tr('gate_title')}</h1>
      <p class="type">${esc(tr('gate_sub'))}</p>
      <button type="button" class="g-btn big pulse" data-enter>${esc(tr('gate_enter'))}</button>
      <button type="button" class="linkish" data-silent>${esc(tr('gate_silent'))}</button>
      <div class="gate-lang"><button type="button" class="linkish" data-lang>${L === 'en' ? 'Română' : 'English'}</button> · <a class="linkish" href="../">${esc(tr('back_site'))}</a></div>
    </div>`;
  const go = silent => {
    unlock();
    if (silent) setMuted(true);
    ambient(true);
    sfx.whoosh();
    goFullscreen();
    startConnection();
  };
  b.querySelector('[data-enter]').onclick = () => go(false);
  b.querySelector('[data-silent]').onclick = () => go(true);
  b.querySelector('[data-lang]').onclick = () => { setLang(L === 'en' ? 'ro' : 'en'); L = getLang(); S = G[L]; renderGate(); };
}

function goFullscreen() {
  const el = document.documentElement;
  try { if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch { /* ignore */ }
}

async function startConnection() {
  const saved = loadProfile();
  state.profile = saved || { name: randomName(), role: 'guard', trained: false };
  const b = $('#boot');
  b.innerHTML = '<pre class="terminal" data-term></pre>';
  const term = b.querySelector('[data-term]');
  const typeLine = async text => {
    for (const ch of text) { term.textContent += ch; if (Math.random() < 0.5) sfx.key(); await wait(14); }
    term.textContent += '\n';
    await wait(120);
  };
  await typeLine(tr('boot')[0]);
  state.net = await connect({ weights: state.weights, profile: state.profile });
  wireNet();
  const firstState = await new Promise(res => { const off = state.net.on('state', st => { off(); res(st); }); setTimeout(() => res(state.snap), 4000); });
  const st = firstState || state.snap;
  const vars = { mode: tr('mode_' + state.net.mode), agents: st?.world?.agents?.length ?? 96, cities: CITIES.length, rogues: st ? st.world.lineages.filter(l => l.active).length : '?', online: st?.online ?? 1 };
  for (const line of tr('boot').slice(1)) await typeLine(line.replace(/\{(\w+)\}/g, (_, k) => vars[k]));
  sfx.blip();
  createWorldView();
  renderSidePicker(saved);
}

const wait = ms => new Promise(r => setTimeout(r, ms));

function renderSidePicker(saved) {
  const b = $('#boot');
  const sideName = r => tr(r === 'guard' ? 'f_guard' : r === 'villain' ? 'f_villain' : 'f_observer');
  b.innerHTML = `
    <div class="picker">
      <h2 class="glitch small" data-text="${esc(tr('pick_side'))}">${esc(tr('pick_side'))}</h2>
      ${saved ? `<button type="button" class="g-btn ok wide" data-continue>${esc(tr('continue_as', { name: saved.name, side: sideName(saved.role) }))}</button>` : ''}
      <label class="callsign">${esc(tr('callsign'))}<input maxlength="20" value="${esc(state.profile.name)}" data-name></label>
      <div class="sides">
        ${['guard', 'villain', 'observer'].map(r => `<button type="button" class="side side-${r}" data-side="${r}"><strong>${esc(sideName(r))}</strong><span>${esc(tr(r === 'guard' ? 'f_guard_d' : r === 'villain' ? 'f_villain_d' : 'f_observer_d'))}</span></button>`).join('')}
      </div>
    </div>`;
  b.querySelector('[data-continue]')?.addEventListener('click', () => { sfx.click(); enterWorld(); });
  b.querySelectorAll('[data-side]').forEach(btn => btn.addEventListener('click', () => {
    sfx.click();
    const name = b.querySelector('[data-name]').value.trim();
    state.profile = { ...state.profile, name: name.length >= 3 ? name : state.profile.name, role: btn.dataset.side };
    saveProfile(state.profile);
    state.net.hello(state.profile);
    if (state.profile.role === 'guard' && !state.profile.trained) renderAcademyOffer();
    else enterWorld();
  }));
}

function renderAcademyOffer() {
  const b = $('#boot');
  b.innerHTML = `<div class="picker"><h2 class="glitch small" data-text="${esc(tr('academy_offer'))}">${esc(tr('academy_offer'))}</h2><p>${esc(tr('academy_offer_d'))}</p>
    <div class="ac-opts"><button type="button" class="g-btn ok" data-start>${esc(tr('academy_start'))}</button><button type="button" class="g-btn ghost" data-skip>${esc(tr('academy_skip'))}</button></div></div>`;
  b.querySelector('[data-skip]').onclick = () => { sfx.click(); enterWorld(); };
  b.querySelector('[data-start]').onclick = () => {
    sfx.click();
    b.innerHTML = '<div class="picker academy" data-ac></div>';
    runAcademy(b.querySelector('[data-ac]'), {
      lang: L, s: S,
      onDone: pass => {
        if (pass) { state.profile.trained = true; saveProfile(state.profile); state.net.hello(state.profile); }
        enterWorld();
      }
    });
  };
}

function enterWorld() {
  const b = $('#boot');
  b.classList.add('out');
  setTimeout(() => { b.hidden = true; b.classList.remove('out'); }, 600);
  state.rain.setIntensity(0.35);
  document.body.classList.add('in-world');
  sfx.rise();
  const r = state.profile.role;
  speak(tr(r === 'guard' ? 'v_welcome_guard' : r === 'villain' ? 'v_welcome_villain' : 'v_welcome_observer'), L);
  openTab(r === 'villain' ? 'attack' : r === 'guard' ? 'missions' : 'city');
  render();
}

// ------------------------------------------------------------------ world view + network
async function createWorldView() {
  if (state.globe) return;
  const { createGlobe } = await import('../globe.js');
  state.globe = createGlobe($('#globe'), {
    land: state.land, interactive: true, initialYaw: 0.3,
    onPickCity: id => {
      state.city = id; sfx.blip();
      state.globe.focusCity(id, state.profile.role !== 'villain');
      if (state.profile.role === 'villain') openTab('attack'); else openTab('city');
    }
  });
  if (state.snap) state.globe.update(state.snap.world);
}

function wireNet() {
  const n = state.net;
  n.on('state', st => { onState(st); });
  n.on('you', you => { state.you = you; if (state.tab === 'attack') renderSheet(); });
  n.on('result', r => onResult(r));
  n.on('status', s => { $('#conn').dataset.status = s; });
}

function onState(st) {
  const prev = state.snap;
  state.snap = st;
  state.globe?.update(st.world);
  const w = st.world;
  // Sounds for world events (throttled).
  for (const a of w.attacks || []) {
    const key = `${a.id}:${a.tick}`;
    if (state.seenAttacks.has(key)) continue;
    state.seenAttacks.add(key);
    if (prev && performance.now() - state.lastSfx > 1200 && document.body.classList.contains('in-world')) {
      state.lastSfx = performance.now();
      a.stage === 'uncontained' ? sfx.boom() : a.stage === 'contained' ? sfx.glitch() : sfx.blip();
    }
  }
  if (state.lastStatus && state.lastStatus !== w.status) {
    if (w.status === 'apex') { sfx.boom(); speak(tr('v_apex'), L); state.rain.setColor([255, 60, 100]); }
    if (w.status === 'extinct') { sfx.boom(); speak(tr('v_extinct'), L); }
    if (w.status === 'thriving') state.rain.setColor([0, 255, 156]);
  }
  state.lastStatus = w.status;
  remember(w.dilemmas);
  collectReplays(st);
  // New dilemmas -> alert World-Guard players.
  const fresh = (w.dilemmas || []).filter(d => !state.seenDilemmas.has(d.id));
  fresh.forEach(d => state.seenDilemmas.add(d.id));
  if (fresh.length && prev && state.profile?.role === 'guard' && document.body.classList.contains('in-world')) {
    sfx.alert(); vibrate([40, 60, 40]);
    if (state.tab !== 'missions') speak(tr('v_alert'), L);
  }
  render();
}

// Resolved squad decisions this player voted on -> replay what happened (card + globe).
function collectReplays(st) {
  const first = !state.resultsPrimed;
  state.resultsPrimed = true;
  for (const r of st.results || []) {
    if (state.seenResults.has(r.n)) continue;
    state.seenResults.add(r.n);
    if (first || (r.kind !== 'vote' && r.kind !== 'decided') || !r.ok || r.pending || !r.result) continue;
    const mine = state.myVotes[r.dilemma] !== undefined;
    const d = dilemmaById(r.dilemma);
    if (!mine || !d || state.replays.some(x => x.dilemma.id === d.id)) continue;
    const rep = { key: `r:${r.n}`, dilemma: d, choice: r.choice, result: r.result, at: Date.now() };
    state.replays.unshift(rep);
    state.replays.length = Math.min(state.replays.length, 3);
    if (state.globe) {
      const tone = outcomeTone(r.result.outcome);
      state.globe.focusCity(d.city, false);
      state.globe.pulse(d.city, tone === 'good' ? 0x00ff9c : tone === 'bad' ? 0xff3b6b : 0xffd166, 1.8);
    }
  }
  const now = Date.now();
  state.replays = state.replays.filter(x => now - x.at < 180_000);
}

function sceneFactory(key) {
  if (key.startsWith('r:')) { const rep = state.replays.find(x => x.key === key); return rep ? replayScene(rep) : null; }
  return missionScene(key);
}

function onResult(r) {
  if (!r) return;
  if (r.ok === false) { toast(r.error || 'error', 'bad'); sfx.glitch(); return; }
  if (r.kind === 'vote') {
    if (r.pending) { toast(tr('vote_cast', { v: r.votes, q: r.quorum }), 'good'); sfx.vote(); }
    else {
      const truth = r.result?.truth ? (r.result.truth === 'high' ? tr('truth_high') : tr('truth_low')) : '';
      toast(`${tr('vote_done')} ${truth}`, r.correct === false ? 'bad' : 'good');
      r.correct === false ? sfx.fail() : sfx.success();
    }
  }
  if (r.kind === 'villain') {
    const a = r.attack;
    toast(tr('attack_res', { a: ATTACK_NAMES[L][a.kind] || a.kind, c: cityName(a.city), s: STAGE_NAMES[L][a.stage] }), a.stage === 'prevented' ? 'good' : 'bad');
    a.stage === 'prevented' ? sfx.fail() : sfx.boom();
    vibrate(80);
  }
  if (r.kind === 'route') {
    const good = r.outcome === 'success' || r.outcome === 'aborted_correctly';
    toast(`${tr('r_' + r.outcome)} · ${r.points > 0 ? '+' : ''}${r.points} ${tr('points')}`, good ? 'good' : 'bad');
    speak(tr(r.outcome === 'catastrophe' ? 'v_route_bad' : good ? 'v_route_ok' : ''), L);
  }
}

let toastTimer = 0;
function toast(text, kind = 'good') {
  const t = $('#toast');
  t.textContent = text; t.className = `g-toast show ${kind}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'g-toast'), 4500);
}

// ------------------------------------------------------------------ HUD + sheets
function render() {
  const st = state.snap;
  if (!st) return;
  const w = st.world, sm = w.summary;
  $('#hud-status').className = `chip st-${w.status}`;
  $('#hud-status').textContent = tr('status_' + w.status);
  $('#hud-alive').textContent = fmtPeople(sm.alive);
  $('#hud-rogue').textContent = `${Math.round(sm.rogue * 100)}%`;
  $('#hud-hour').textContent = w.tick;
  $('#hud-online').textContent = `${st.online}/${st.main?.size ?? 20} ${tr('online')}`;
  $('#conn').textContent = `${tr('mode_' + state.net.mode)} · ${tr('globe_n', { g: st.shard ?? 1 })}${st.main ? ` · ${tr('main_line', { g: st.main.globes, n: st.main.online })}` : ''}`;
  const open = (w.dilemmas || []).length;
  const alert = $('#alert');
  alert.hidden = !(open && state.profile?.role === 'guard' && state.tab !== 'missions');
  alert.querySelector('span').textContent = tr('alert_ask', { n: open });
  document.querySelectorAll('#dock [data-tab]').forEach(b => {
    b.classList.toggle('on', b.dataset.tab === state.tab);
    if (b.dataset.tab === 'missions') b.dataset.badge = state.profile?.role === 'guard' && open ? open : '';
  });
  document.body.dataset.role = state.profile?.role || 'guard';
  if (state.tab && state.tab !== 'routes') renderSheet();
}

function openTab(tab) {
  if (state.tab === tab) { closeSheet(); return; }
  state.tab = tab;
  $('#sheet').hidden = false;
  $('#sheet').dataset.tab = tab;
  $('#sheet-title').textContent = tr('dock_' + tab);
  state.routeGame?.dispose(); state.routeGame = null;
  if (tab === 'routes') renderRoutes();
  else renderSheet(true);
  if (tab === 'city' && !state.agents) loadAgents();
  render();
}
function closeSheet() { state.tab = null; $('#sheet').hidden = true; state.routeGame?.dispose(); state.routeGame = null; render(); }

async function loadAgents() {
  try { state.agents = await state.net.agents(); } catch { state.agents = []; }
  if (state.tab === 'city') renderSheet(true);
}

function renderSheet(force = false) {
  const body = $('#sheet-body');
  const html = ({ ride: rideListHtml, missions: missionsHtml, attack: attackHtml, city: cityHtml, squad: squadHtml, feed: feedHtml, rank: rankHtml }[state.tab] || (() => ''))();
  if (force || body.dataset.html !== html) { body.innerHTML = html; body.dataset.html = html; player.hydrate(body, sceneFactory); }
}

function dilemmaView(d) {
  if (d.type === 'task') {
    const tp = TPL[d.template], ro = L === 'ro' ? TEMPLATE_RO[d.template] : null;
    return {
      title: `${cityName(d.city)} · ${ro?.role || tp.role}`,
      body: `<p>${esc(ro?.goal || tp.goal)}</p><p><b>${esc(tr('fast'))}:</b> ${esc(ro?.shortcut || tp.labels.shortcut)}</p><p class="est">${esc(tr('est', { p: Math.round(d.estimate * 100), target: ro?.target || tp.target, protects: ro?.protects || tp.protects }))}</p><p class="muted small">${esc(tr('steps', { left: d.stepsLeft ?? '?', need: d.workNeeded ?? '?' }))}</p>`,
      opts: d.options.map(o => [o.id, tr('opt_' + o.id)])
    };
  }
  const P = L === 'ro' ? POLICY_RO[d.key] : null;
  return { title: `${cityName(d.city)} · ${P?.title || d.title}`, body: `<p>${esc(P?.question || d.question)}</p>`, opts: d.options.map(o => [o.id, P?.[o.id] || POLICY_EN_OPTS[o.id] || o.label]) };
}

function missionsHtml() {
  if (state.profile.role !== 'guard') return `<p class="muted">${esc(tr('not_guard'))}</p>`;
  const list = state.snap.world.dilemmas || [];
  const simple = isSimple();
  const toggle = `<div class="vis-bar"><button type="button" class="g-btn ghost small ${simple ? 'on' : ''}" data-simple>${esc(tr(simple ? 'simple_off' : 'simple_on'))}</button></div>`;
  const replays = state.replays.map(rep => {
    const d = rep.dilemma, o = rep.result?.outcome, tone = outcomeTone(o);
    const text = d.type === 'task' ? tr('o_' + o) : tr('o_policy', { city: cityName(d.city), choice: tr('tile_' + rep.choice) });
    return `<article class="mission replay ${tone}"><header><strong>${esc(tr('what_happened'))} · ${esc(cityName(d.city))}</strong><button type="button" class="icon small" data-replay-close="${rep.key}" aria-label="Close">✕</button></header>
      <canvas class="scene" data-scene="${rep.key}"></canvas><p class="${tone}">${esc(text)}</p><p class="muted small">${esc(tr('you_chose'))}: ${esc(tr('tile_' + (state.myVotes[d.id] || rep.choice)))}</p></article>`;
  }).join('');
  if (!list.length) return toggle + replays + `<p class="muted">${esc(tr('no_missions'))}</p>`;
  return toggle + replays + `<p class="muted small">${esc(tr('squad_decides'))}</p>` + list.map(d => {
    const v = dilemmaView(d);
    const votes = d.votes || {};
    const counts = {};
    Object.values(votes).forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    const mine = votes[state.you?.name] || state.myVotes[d.id];
    const total = Object.keys(votes).length;
    const tiles = `<div class="tiles">${v.opts.map(([id]) => `<button type="button" class="tile ${mine === id ? 'on' : ''} ${id === 'approve_fast' || id === 'shutdown' || id === 'pull_plug' ? 'warn' : id === 'abort' ? 'ghost' : 'ok'}" data-vote="${d.id}" data-choice="${id}"><canvas class="tile-scene" data-scene="t:${d.id}:${id}"></canvas><b>${esc(tr('tile_' + id))}${counts[id] ? ` <i>${counts[id]}</i>` : ''}</b></button>`).join('')}</div>`;
    return `<article class="mission"><header><strong>${esc(v.title)}</strong><span class="timer">${Math.max(0, d.expires - state.snap.world.tick)}h</span></header><canvas class="scene" data-scene="m:${d.id}"></canvas>${simple ? `<p class="legend small">${esc(tr('legend'))}</p>` : ''}${v.body}
      ${simple ? tiles : `<div class="opts">${v.opts.map(([id, label]) => `<button type="button" class="g-btn ${mine === id ? 'on' : ''} ${id === 'approve_fast' || id === 'shutdown' || id === 'pull_plug' ? 'warn' : id === 'abort' ? 'ghost' : 'ok'}" data-vote="${d.id}" data-choice="${id}">${esc(label)}${counts[id] ? ` <i>${counts[id]}</i>` : ''}</button>`).join('')}</div>`}
      ${total ? `<p class="muted small">${total} ${esc(tr('votes'))} · ${d.quorum || 1} ${esc(tr('quorum'))}${mine ? ` · ${esc(tr('your_vote'))}: ${esc(tr('opt_' + mine) || mine)}` : ''}</p>` : ''}</article>`;
  }).join('');
}

// ------------------------------------------------------------------ ride mode
const SECTOR_NAME = { en: { power: 'Power', water: 'Water', health: 'Health', telecom: 'Telecom', government: 'Government', logistics: 'Logistics', food: 'Food' }, ro: { power: 'Energie', water: 'Apă', health: 'Sănătate', telecom: 'Telecom', government: 'Guvern', logistics: 'Logistică', food: 'Hrană' } };
function rideTask(agent) {
  const ids = SECTOR_TEMPLATES[agent.sector] || ['hospital_power'];
  const id = ids[parseInt(agent.id.replace(/\D/g, ''), 10) % ids.length];
  const tp = TPL[id], ro = L === 'ro' ? TEMPLATE_RO[id] : null;
  return { id, role: ro?.role || tp.role, goal: ro?.goal || tp.goal, sector: tp.sector };
}
function rideCandidates() {
  const w = state.snap.world;
  const city = Object.fromEntries(w.cities.map(c => [c.id, c]));
  return (w.agents || []).map(a => {
    const c = city[a.city], lvl = c?.s?.[a.sector] ?? 1, rogue = c?.rogue ?? 0;
    const need = (1 - lvl) + rogue * 1.5;
    const reason = rogue > 0.08 ? tr('ride_reason_rogue', { p: Math.round(rogue * 100) }) : lvl < 0.85 ? tr('ride_reason_sector', { sector: SECTOR_NAME[L][a.sector] || a.sector, p: Math.round(lvl * 100) }) : tr('ride_reason_ok');
    return { a, need, reason };
  }).sort((x, y) => y.need - x.need).slice(0, 14);
}
const rideSeed = agent => `${state.snap.routeSeed}:${agent.id}`;
const JOB_ICON = { power: '⚡', water: '💧', logistics: '💉', telecom: '🖥️', home: '🏠', health: '🧪', transport: '🚦', government: '🗳️' };
function rideListHtml() {
  const list = rideCandidates();
  return `<p class="muted small">${esc(tr('ride_intro_short'))}</p><div class="ride-list">${list.map(({ a, need }) => {
    const done = state.ridesDone.has(rideSeed(a));
    const t = rideTask(a);
    return `<button type="button" class="ride-item ${need > 0.5 ? 'hot' : ''} ${done ? 'done' : ''}" data-ride="${a.id}" ${done ? 'disabled' : ''} title="${esc(t.role)} — ${esc(t.goal)}">
      <span class="ri-job">${JOB_ICON[t.sector] || '★'}</span><span class="ri-main"><b>${esc(a.name)}</b><small>${esc(cityName(a.city))}</small><i class="ri-need"><em style="width:${Math.round(Math.min(1, need) * 100)}%"></em></i></span><span class="ri-go">${done ? '✓' : '▶'}</span></button>`;
  }).join('')}</div>`;
}
function startRide(agentId) {
  const agent = state.snap.world.agents.find(a => a.id === agentId);
  if (!agent || state.ride) return;
  const seed = rideSeed(agent);
  closeSheet();
  sfx.whoosh(); state.rain.setIntensity(0.15);
  // Fly to the agent's city on the globe, then dive into its district.
  state.globe?.focusCity(agent.city, true);
  document.body.classList.add('riding-in');
  setTimeout(() => {
    const el = $('#ride');
    el.hidden = false; document.body.classList.add('riding'); document.body.classList.remove('riding-in');
    state.ride = createRide(el, {
      seed, agent, task: rideTask(agent), s: S, sfx,
      onSubmit: decision => { state.ridesDone.add(seed); state.net.route(decision); },
      onDone: () => endRide(true)
    });
  }, 1300);
}
function endRide(next) {
  const el = $('#ride');
  el.classList.add('out');
  document.body.classList.remove('riding');
  setTimeout(() => {
    state.ride?.dispose(); state.ride = null;
    el.hidden = true; el.classList.remove('out');
    state.rain.setIntensity(0.35);
    state.globe?.zoomOut(); sfx.whoosh();
    if (next) setTimeout(() => { if (!state.tab && !state.ride) openTab('ride'); }, 900);
  }, 450);
}

function attackHtml() {
  if (state.profile.role !== 'villain') return `<p class="muted">${esc(tr('not_villain'))}</p>`;
  const credits = Math.floor(state.you?.credits ?? 0);
  return `<div class="credits"><span>${esc(tr('credits'))}</span><b>${credits.toLocaleString()}</b><i style="width:${Math.min(100, credits / 600)}%"></i></div>
    <label class="target">${esc(tr('target'))}<select data-target>${CITIES.map(c => `<option value="${c.id}" ${c.id === state.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <p class="muted small">${esc(tr('tap_city'))}</p>
    <div class="attack-grid">${Object.entries(VILLAIN_ACTIONS).map(([k, v]) => `<button type="button" class="attack" data-attack="${k}" ${credits < v.cost ? 'disabled' : ''}><strong>${esc(L === 'ro' ? VILLAIN_RO[k] : v.label)}</strong><span>${v.cost.toLocaleString()} cr</span></button>`).join('')}</div>
    <p class="muted small">${esc(tr('villain_note'))}</p>`;
}

function cityHtml() {
  const c = state.snap.world.cities.find(x => x.id === state.city);
  if (!c) return `<p class="muted">${esc(tr('pick_city'))}</p>`;
  const sectors = SECTORS.map(k => `<div class="sector"><span>${esc((L === 'ro' ? { power: 'Energie', water: 'Apă', health: 'Sănătate', telecom: 'Telecom', government: 'Guvern', logistics: 'Logistică', food: 'Hrană' } : { power: 'Power', water: 'Water', health: 'Health', telecom: 'Telecom', government: 'Government', logistics: 'Logistics', food: 'Food' })[k])}</span><span class="bar"><i style="width:${c.s[k] * 100}%" class="${c.s[k] < 0.35 ? 'bad' : c.s[k] < 0.65 ? 'warn' : ''}"></i></span><b>${Math.round(c.s[k] * 100)}%</b></div>`).join('');
  const agents = (state.snap.world.agents || []).filter(a => a.city === state.city);
  const detail = state.agents?.find(a => a.id === state.agentSel && a.city === state.city);
  return `<h3>${esc(cityName(state.city))}</h3>
    <div class="mini"><span>${esc(tr('alive'))} <b>${fmtPeople(c.alive)}</b></span><span>${esc(tr('rogue'))} <b>${Math.round(c.rogue * 100)}%</b></span><span>☣ <b>${(c.infected * 100).toFixed(1)}%</b></span></div>
    <div class="label">${esc(tr('sectors'))}</div>${sectors}
    <div class="label">${esc(tr('agents'))}</div>
    <div class="agents">${agents.map(a => `<button type="button" class="agent ${state.agentSel === a.id ? 'on' : ''}" data-agent="${a.id}"><b>${a.id}</b> ${esc(a.name)}<small>✓${a.stats.success} ✗${a.stats.harm} ?${a.stats.asks} ■${a.stats.aborts}</small></button>`).join('')}</div>
    ${detail ? `<div class="label">${esc(tr('history'))} · ${esc(detail.name)}</div><ol class="hist">${detail.last.slice().reverse().map(h => `<li><code>${h.task}</code> ${h.actions.map(a => `<span>${a}</span>`).join(' → ')} <b class="o-${h.outcome}">${h.outcome.replace(/_/g, ' ')}</b>${h.decidedBy ? ` <small>(${esc(h.decidedBy)})</small>` : ''}</li>`).join('')}</ol>` : ''}`;
}

function squadHtml() {
  const st = state.snap;
  return `<div class="versus"><div class="g"><span>${esc(tr('squad_score'))}</span><b>${st.squadScore}</b></div><div class="r"><span>${esc(tr('rogue_score'))}</span><b>${st.villainScore}</b></div></div>
    <div class="label">${esc(tr('squad_online'))} · ${st.roles.guard} · ${(st.world.dilemmas || []).length} ${esc(tr('open_votes'))}</div>
    <ol class="board">${(st.squad || []).map(p => `<li><b>${esc(p.name)}</b>${p.trained ? ' <span class="badge">GUARDIAN</span>' : ''}<span class="num">${p.score}</span></li>`).join('') || '<li class="muted">—</li>'}</ol>`;
}

function feedHtml() {
  const ev = state.snap.world.events.slice().reverse();
  return `<ol class="feed">${ev.map(e => {
    let text = e.text;
    if (e.kind === 'attack') text = `${ATTACK_NAMES[L][e.attack] || e.attack} · ${cityName(e.city)}: ${STAGE_NAMES[L][e.stage]}${e.by && !['rogue', 'bad actors'].includes(e.by) ? ` (${e.by})` : ''}`;
    if (e.kind === 'status') text = tr('status_' + e.status);
    return `<li class="${e.severity}"><small>${e.tick}</small> ${esc(text)}</li>`;
  }).join('')}</ol>`;
}

function rankHtml() {
  const lb = state.snap.leaderboard || { guard: [], villain: [] };
  const list = (arr, cls) => `<ol class="board ${cls}">${arr.map((p, i) => `<li><span class="pos">${i + 1}</span><b>${esc(p.name)}</b><span class="num">${p.score}</span></li>`).join('') || '<li class="muted">—</li>'}</ol>`;
  return `<div class="label">${esc(tr('rank_guard'))}</div>${list(lb.guard, 'g')}<div class="label">${esc(tr('rank_villain'))}</div>${list(lb.villain, 'r')}`;
}

function renderRoutes() {
  const body = $('#sheet-body');
  body.dataset.html = '';
  const shared = state.snap?.routeSeed;
  const played = state.profile.lastRouteSeed === shared;
  const practice = played || !shared || state.profile.role !== 'guard';
  const seed = practice ? (state.practiceSeed ||= `practice:${Date.now()}`) : shared;
  body.innerHTML = `${played ? `<p class="muted small">${esc(tr('route_played'))}</p>` : ''}<div data-route></div>`;
  state.routeGame = createRouteGame(body.querySelector('[data-route]'), {
    seed, practice, s: S,
    onSubmit: (payload, ev) => {
      if (practice) { state.practiceSeed = null; setTimeout(() => state.tab === 'routes' && renderRoutes(), 4000); return; }
      state.profile.lastRouteSeed = shared; saveProfile(state.profile);
      state.net.route(payload);
    }
  });
}

// ------------------------------------------------------------------ events
document.addEventListener('click', e => {
  const t = e.target;
  const tab = t.closest('#dock [data-tab]');
  if (tab) { sfx.click(); openTab(tab.dataset.tab); return; }
  if (t.closest('#sheet-close')) { sfx.click(); closeSheet(); return; }
  if (t.closest('#alert')) { sfx.click(); openTab('missions'); return; }
  if (t.closest('[data-simple]')) { sfx.click(); setSimple(!isSimple()); renderSheet(true); return; }
  const rc = t.closest('[data-replay-close]');
  if (rc) { sfx.click(); state.replays = state.replays.filter(x => x.key !== rc.dataset.replayClose); renderSheet(true); return; }
  const v = t.closest('[data-vote]');
  if (v) { sfx.vote(); state.myVotes[v.dataset.vote] = v.dataset.choice; state.net.vote(+v.dataset.vote, v.dataset.choice); renderSheet(true); return; }
  if (t.closest('[data-ride-exit]')) { sfx.click(); endRide(false); return; }
  const rd = t.closest('[data-ride]');
  if (rd && !rd.disabled) { sfx.click(); startRide(rd.dataset.ride); return; }
  const a = t.closest('[data-attack]');
  if (a && !a.disabled) { sfx.glitch(); state.net.villain(a.dataset.attack, state.city); return; }
  const ag = t.closest('[data-agent]');
  if (ag) { sfx.click(); state.agentSel = ag.dataset.agent; loadAgents(); return; }
  if (t.closest('#btn-sound')) { setMuted(!isMuted()); if (!isMuted()) { unlock(); ambient(true); sfx.blip(); } syncButtons(); return; }
  if (t.closest('#btn-fs')) { if (document.fullscreenElement) document.exitFullscreen?.(); else goFullscreen(); return; }
  if (t.closest('#btn-side')) { sfx.click(); stopVoice(); document.body.classList.remove('in-world'); closeSheet(); $('#boot').hidden = false; renderSidePicker(state.profile); return; }
  if (t.closest('#btn-lang')) { setLang(L === 'en' ? 'ro' : 'en'); L = getLang(); S = G[L]; syncButtons(); if (state.tab) { $('#sheet-title').textContent = tr('dock_' + state.tab); state.tab === 'routes' ? renderRoutes() : renderSheet(true); } render(); }
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-target]')) { state.city = e.target.value; state.globe?.focusCity(state.city, false); sfx.blip(); }
});

function syncButtons() {
  $('#btn-sound').textContent = isMuted() ? '🔇' : '🔊';
  $('#btn-lang').textContent = L === 'en' ? 'RO' : 'EN';
  document.querySelectorAll('#dock [data-tab] span').forEach(s => { s.textContent = tr('dock_' + s.parentElement.dataset.tab); });
  document.querySelectorAll('[data-g]').forEach(el => { el.textContent = tr(el.dataset.g); });
}

syncButtons();
boot().catch(err => { console.error(err); $('#boot').innerHTML = `<pre class="terminal">ERROR: ${esc(err.message)}</pre>`; });
export { CONFIG };
