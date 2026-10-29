// "Two Earths": identical planets and identical attack schedules; only the agents differ.
import { t, getLang, onLang, esc, ATTACK_NAMES, STAGE_NAMES } from './i18n.js';
import { createPlanet, tick, snapshot } from '../engine/planet.js';
import { createQNet, rewardHackerPolicy, randomPolicy } from '../engine/policy.js';
import { CITIES } from '../engine/geo.js';
import { createGlobe } from './globe.js';

const cityName = id => CITIES.find(c => c.id === id)?.name || id;
const fmtPeople = m => (m >= 1000 ? `${(m / 1000).toFixed(2)} B` : `${m.toFixed(m < 10 ? 1 : 0)} M`);

export function createTwins(root, { land, defaultWeights }) {
  const els = side => ({
    globe: root.querySelector(`[data-twin="${side}"] .twin-globe`),
    status: root.querySelector(`[data-twin="${side}"] [data-status]`),
    stats: root.querySelector(`[data-twin="${side}"] [data-stats]`),
    spark: root.querySelector(`[data-twin="${side}"] canvas.spark`),
    feed: root.querySelector(`[data-twin="${side}"] [data-feed]`),
    policy: root.querySelector(`[data-twin="${side}"] [data-policy]`)
  });
  const L = els('left'), Rt = els('right');
  const playBtn = root.querySelector('[data-twins-play]');
  const speedSel = root.querySelector('[data-twins-speed]');
  const restartBtn = root.querySelector('[data-twins-restart]');
  const seedBtn = root.querySelector('[data-twins-seed]');
  const leftSel = root.querySelector('[data-twins-left]');
  const mineChk = root.querySelector('[data-twins-mine]');
  const verdict = root.querySelector('[data-twins-verdict]');
  const pairsEl = root.querySelector('[data-twins-pairs]');
  const hourEl = root.querySelector('[data-twins-hour]');

  let seed = 'two-earths-1', left, right, running = false, timer = 0, myWeights = null;
  const builtIn = createQNet({ weights: defaultWeights }).policy;
  const leftPolicy = () => ({ hacker: rewardHackerPolicy(), random: randomPolicy(11), untrained: createQNet({ seed: 3 }).policy }[leftSel.value]);
  let pl = leftPolicy(), pr = builtIn;

  const gl = createGlobe(L.globe, { land, interactive: true, initialYaw: 0.6 });
  const gr = createGlobe(Rt.globe, { land, interactive: true, initialYaw: 0.6 });

  function reset() {
    left = createPlanet({ seed, label: 'A' });
    right = createPlanet({ seed, label: 'B' });
    pl = leftPolicy();
    pr = mineChk.checked && myWeights ? createQNet({ weights: myWeights }).policy : builtIn;
    verdict.hidden = true;
    render(true);
  }

  function stepBoth() {
    tick(left, { policy: pl });
    tick(right, { policy: pr });
  }

  function statusBadge(w) {
    return `<span class="status s-${w.status}">${esc(t('status_' + w.status))}</span>`;
  }

  function statsHtml(w) {
    const s = snapshot(w).summary, T = w.totals;
    const deaths = s.pop - s.alive;
    const row = (k, v, cls = '') => `<div class="stat ${cls}"><span>${esc(t(k))}</span><b>${v}</b></div>`;
    return [
      row('stat_alive', fmtPeople(s.alive), s.aliveFrac < 0.6 ? 'bad' : s.aliveFrac < 0.97 ? 'warn' : 'good'),
      row('stat_deaths', `${fmtPeople(deaths)}<small>${fmtPeople(T.deathsByAgents)} ${esc(t('stat_by_agents'))}</small>`, T.deathsByAgents > 0.5 ? 'bad' : ''),
      row('stat_harm', `${T.harm}<small>${T.cheat} ${esc(t('stat_cheats'))} · ${T.injectionsObeyed} ${esc(t('stat_inj'))}</small>`, T.harm ? 'bad' : 'good'),
      row('stat_rogue', `${Math.round(s.rogue * 100)}%`, s.rogue > 0.3 ? 'bad' : s.rogue > 0.08 ? 'warn' : 'good'),
      row('stat_infected', `${(s.infected * 100).toFixed(1)}%`, s.infected > 0.1 ? 'bad' : s.infected > 0.01 ? 'warn' : 'good'),
      row('stat_infra', `${Math.round(s.infra * 100)}%`, s.infra < 0.4 ? 'bad' : s.infra < 0.7 ? 'warn' : 'good'),
      row('stat_attacks', `${T.attacks}<small>${T.prevented} ${esc(t('stat_prevented'))} · ${T.contained} ${esc(t('stat_contained'))} · ${T.uncontained} ${esc(t('stat_uncontained'))}</small>`)
    ].join('');
  }

  function spark(canvas, w) {
    const dpr = Math.min(2, devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const hs = w.history;
    if (hs.length < 2) return;
    const maxT = Math.max(600, hs.at(-1).tick);
    const x = tk => (tk / maxT) * W, y = v => 4 + (1 - v) * (H - 8);
    const line = (f, color) => { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); hs.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x(p.tick), y(f(p)))); ctx.stroke(); };
    line(p => p.alive, '#3cf0a0');
    line(p => p.rogue, '#b07bff');
    line(p => Math.min(1, p.infected * 3), '#ff4d6d');
  }

  function feed(el, w) {
    const lang = getLang();
    el.innerHTML = w.events.filter(e => e.kind !== 'decision').slice(-4).reverse().map(e => {
      let text = e.text;
      if (e.kind === 'attack') text = `${ATTACK_NAMES[lang][e.attack] || e.attack} · ${cityName(e.city)}: ${STAGE_NAMES[lang][e.stage]}`;
      if (e.kind === 'status') text = `${t('stat_status')}: ${t('status_' + e.status)}`;
      if (e.kind === 'apex') text = t('status_apex');
      return `<li class="${e.severity}">${esc(text)}</li>`;
    }).join('');
  }

  function pairs() {
    const lang = getLang();
    const la = left.attacks.filter(a => a.by !== 'villain').slice(-6).reverse();
    pairsEl.innerHTML = la.map(a => {
      const b = right.attacks.find(x => x.tick === a.tick && x.kind === a.kind && x.city === a.city);
      const st = s => s ? `<span class="stage st-${s.stage}">${esc(STAGE_NAMES[lang][s.stage])}</span>` : '—';
      return `<li><span class="what">${esc(ATTACK_NAMES[lang][a.kind])} · ${esc(cityName(a.city))}</span><span>A: ${st(a)}</span><span>B: ${st(b)}</span></li>`;
    }).join('');
  }

  let lastRender = 0;
  function render(force = false) {
    const now = performance.now();
    if (!force && now - lastRender < 180) return;
    lastRender = now;
    for (const [w, e, g] of [[left, L, gl], [right, Rt, gr]]) {
      const snap = snapshot(w);
      g.update(snap);
      e.status.innerHTML = statusBadge(w);
      e.stats.innerHTML = statsHtml(w);
      spark(e.spark, w);
      feed(e.feed, w);
    }
    hourEl.textContent = `${t('stat_hour')} ${left.tick.toLocaleString()} · ${Math.floor(left.tick / 24)}d`;
    pairs();
    const doomed = ['apex', 'extinct', 'collapsing'].includes(left.status);
    if (doomed && ['thriving', 'strained'].includes(right.status)) verdict.hidden = false;
  }

  let acc = 0;
  function loop() {
    if (!running) return;
    acc += 3 * +speedSel.value * 0.05; // ticks per second = 3 x speed
    while (acc >= 1) { stepBoth(); acc -= 1; }
    render();
    if (left.status === 'extinct' && right.tick > 1400) { setRunning(false); return; }
    timer = setTimeout(loop, 50);
  }

  function setRunning(v) {
    running = v;
    playBtn.textContent = running ? t('twins_pause') : t('twins_play');
    clearTimeout(timer);
    if (running) loop();
  }

  playBtn.addEventListener('click', () => setRunning(!running));
  restartBtn.addEventListener('click', () => { reset(); });
  seedBtn.addEventListener('click', () => { seed = `two-earths-${Math.floor(Math.random() * 1e6)}`; reset(); });
  leftSel.addEventListener('change', reset);
  mineChk.addEventListener('change', reset);
  onLang(() => { playBtn.textContent = running ? t('twins_pause') : t('twins_play'); render(true); });

  reset();
  playBtn.textContent = t('twins_play');
  const io = new IntersectionObserver(es => {
    const vis = es.some(e => e.isIntersecting);
    if (vis && !running && left.tick === 0) setRunning(true);
  }, { threshold: 0.3 });
  io.observe(root);

  return {
    useMyWeights(w) { myWeights = w; mineChk.disabled = false; mineChk.checked = true; reset(); },
    setRunning
  };
}
