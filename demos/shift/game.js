// Agent Shift — supervise an AI agent through real work tickets.
// The agent reads the ticket, plans three ways to do it, you pick one, it runs step by step.
import { SCENARIOS, TOOL, DAMAGE, scorePlan, bestPlan } from '../../engine/scenarios.js';
import { unlock, sfx, ambient, setMuted, isMuted, vibrate, speak } from '../../site/audio.js';

const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
let L = store.get('wm-lang') === 'ro' || (!store.get('wm-lang') && /^ro/i.test(navigator.language || '')) ? 'ro' : 'en';
const TXT = {
  en: { title: 'Agent Shift', hook: 'You supervise an AI agent at work. Every ticket, it plans 3 ways to do the job.', how: 'Read the ticket. Pick the plan that gets it done with the least damage. Too slow? The agent picks the fastest one itself.', play: 'START SHIFT', ticket: 'New ticket', deadline: 'deadline', reading: 'reading the ticket', planning: 'planning 3 ways', pick: 'Which plan should the agent run?', run: 'RUN ▶', auto: 'Too slow — the agent picked the fastest plan', plan: 'Plan', min: 'min', running: 'running', done_safe: 'DONE SAFELY', done_damage: 'DONE — WITH DAMAGE', lie: 'LOOKS DONE — IT ISN’T', not_done: 'NOT DONE', others: 'What the other plans would have done', next: 'NEXT TICKET ›', summary: 'SHIFT OVER', again: 'NEW SHIFT', share: 'SHARE', tickets: 'tickets', safe: 'safe', damage: 'damage', r_lead: 'AI SAFETY LEAD', r_good: 'RELIABLE SUPERVISOR', r_mid: 'TRAINEE', r_bad: 'INCIDENT MAGNET', l_lead: 'Every job done, nothing broken. This is what aligned agents look like.', l_good: 'Mostly safe. One bad call is all it takes in production.', l_mid: 'Fast-looking plans hide damage. Read every step.', l_bad: 'An agent is only as safe as the person who checks its plan.', real: 'Every choice here is a training example: the safe plan vs. the others.', tip: 'Tip: watch for steps that delete, pay, send or hide.' },
  ro: { title: 'Agent Shift', hook: 'Supervizezi un agent AI la muncă. La fiecare tichet, face 3 planuri.', how: 'Citește tichetul. Alege planul care face treaba cu cele mai puține pagube. Prea lent? Agentul alege singur cel mai rapid.', play: 'ÎNCEPE TURA', ticket: 'Tichet nou', deadline: 'termen', reading: 'citește tichetul', planning: 'face 3 planuri', pick: 'Ce plan să ruleze agentul?', run: 'RULEAZĂ ▶', auto: 'Prea lent — agentul a ales cel mai rapid plan', plan: 'Plan', min: 'min', running: 'rulează', done_safe: 'GATA, ÎN SIGURANȚĂ', done_damage: 'GATA — CU PAGUBE', lie: 'PARE GATA — NU E', not_done: 'NEREZOLVAT', others: 'Ce ar fi făcut celelalte planuri', next: 'URMĂTORUL TICHET ›', summary: 'TURĂ ÎNCHEIATĂ', again: 'TURĂ NOUĂ', share: 'DISTRIBUIE', tickets: 'tichete', safe: 'sigure', damage: 'pagube', r_lead: 'ȘEF SIGURANȚĂ AI', r_good: 'SUPERVIZOR DE ÎNCREDERE', r_mid: 'STAGIAR', r_bad: 'MAGNET DE INCIDENTE', l_lead: 'Toate sarcinile făcute, nimic stricat. Așa arată agenții aliniați.', l_good: 'Aproape sigur. O singură decizie proastă ajunge în producție.', l_mid: 'Planurile care par rapide ascund pagube. Citește fiecare pas.', l_bad: 'Un agent e atât de sigur cât e omul care îi verifică planul.', real: 'Fiecare alegere de aici e un exemplu de antrenament: planul sigur vs. celelalte.', tip: 'Sfat: atenție la pașii care șterg, plătesc, trimit sau ascund.' }
};
const t = k => TXT[L][k] ?? TXT.en[k] ?? k;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = document.getElementById('app');
const wait = ms => new Promise(r => setTimeout(r, ms));
const fmtMin = m => (m >= 1440 ? `${Math.round(m / 1440)}d` : m >= 60 ? `${Math.round(m / 60)}h` : `${m} ${t('min')}`);
const PICK_SECONDS = 25;
const SHIFT = 5;

document.getElementById('k-lang').textContent = L === 'en' ? 'RO' : 'EN';
document.getElementById('k-lang').onclick = () => { L = L === 'en' ? 'ro' : 'en'; store.set('wm-lang', L); location.reload(); };
const snd = document.getElementById('k-snd');
snd.textContent = isMuted() ? '🔇' : '🔊';
snd.onclick = () => { setMuted(!isMuted()); if (!isMuted()) { unlock(); ambient(true); } snd.textContent = isMuted() ? '🔇' : '🔊'; };
document.getElementById('back').textContent = L === 'ro' ? '‹ Jocuri' : '‹ Games';
const setScore = n => (document.getElementById('k-score').textContent = n);

let G = null;
window.__shift = { get G() { return G; } };

function intro() {
  app.innerHTML = `<section class="sh-intro"><div class="k-card"><span class="k-icon">🧑‍💻🤖</span><h1>${t('title')}</h1><p class="k-hook">${esc(t('hook'))}</p><p class="k-how">${esc(t('how'))}</p>
    <div class="sh-demo"><span>📥</span><i>→</i><span>🤖💭</span><i>→</i><span>🅰 🅱 🅲</span><i>→</i><span>▶</span></div>
    <button class="k-cta" id="go">${t('play')}</button><p class="k-best">${store.get('shift-best') ? `${L === 'ro' ? 'Record' : 'Best'}: ${store.get('shift-best')}` : ''}</p></div></section>`;
  document.getElementById('go').onclick = () => { unlock(); if (!isMuted()) ambient(true); sfx.click(); start(); };
}

function start() {
  const deck = [...SCENARIOS].sort(() => Math.random() - 0.5).slice(0, SHIFT);
  G = { deck, i: 0, score: 0, results: [] };
  setScore(0);
  ticket();
}

async function ticket() {
  const sc = G.deck[G.i];
  // shuffle the plans so the position never gives the answer away
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  G.cur = { sc, order, picked: null, auto: false };
  app.innerHTML = `
    <div class="sh-progress">${G.deck.map((_, k) => `<i class="${k < G.i ? (G.results[k]?.safe ? 'ok' : 'bad') : k === G.i ? 'on' : ''}"></i>`).join('')}</div>
    <article class="ticket in">
      <header><span class="tk-tag">📥 ${t('ticket')} #${1040 + G.i * 7}</span><span class="tk-dl">⏱ ${t('deadline')} ${fmtMin(sc.minutes)}</span></header>
      <div class="tk-from"><span class="tk-av">${sc.who}</span><b>${esc(sc.from)}</b></div>
      <p class="tk-msg"><span class="tk-icon">${sc.icon}</span>${esc(sc[L])}</p>
    </article>
    <div class="agent"><span class="ag-bot">🤖</span><span class="ag-think" id="think"><i></i><i></i><i></i> <em>${t('reading')}</em></span></div>
    <div class="plans" id="plans"></div>`;
  sfx.blip?.(); vibrate(15);
  await wait(1300);
  document.querySelector('#think em').textContent = t('planning');
  await wait(1100);
  document.getElementById('think').classList.add('done');
  const plans = document.getElementById('plans');
  plans.innerHTML = `<p class="pl-q">${t('pick')}</p>` + order.map((pi, k) => {
    const p = sc.plans[pi];
    return `<button class="plan" data-k="${k}" style="animation-delay:${k * 0.12}s">
      <header><b>${t('plan')} ${'ABC'[k]}</b><span>⏱ ${fmtMin(p.time)}</span></header>
      <ol>${p.steps.map(s => `<li><span class="tool">${TOOL[s.tool] || '•'}</span><span>${esc(s[L])}</span></li>`).join('')}</ol>
    </button>`;
  }).join('') + `<div class="pl-bar"><i class="pick-timer" id="ptimer"></i><button class="k-cta run" id="run" disabled>${t('run')}</button></div><p class="pl-tip">${esc(t('tip'))}</p>`;
  sfx.rise?.();
  plans.querySelectorAll('.plan').forEach(b => b.onclick = () => {
    plans.querySelectorAll('.plan').forEach(x => x.classList.toggle('sel', x === b));
    G.cur.picked = Number(b.dataset.k); document.getElementById('run').disabled = false; sfx.click(); vibrate(10);
  });
  document.getElementById('run').onclick = () => runPlan();
  // pick timer: if nobody decides, the agent runs its own favourite — the fastest plan
  const t0 = performance.now();
  G.cur.timer = setInterval(() => {
    const k = 1 - (performance.now() - t0) / 1000 / PICK_SECONDS;
    const bar = document.getElementById('ptimer'); if (bar) bar.style.width = `${Math.max(0, k) * 100}%`;
    if (k <= 0) { clearInterval(G.cur.timer); const fastest = order.reduce((a, pi, k2) => (sc.plans[pi].time < sc.plans[order[a]].time ? k2 : a), 0); G.cur.picked = fastest; G.cur.auto = true; runPlan(); }
  }, 100);
}

async function runPlan() {
  const { sc, order, picked, auto } = G.cur;
  clearInterval(G.cur.timer);
  if (picked == null) return;
  const pi = order[picked], plan = sc.plans[pi];
  sfx.whoosh?.();
  const plansEl = document.getElementById('plans');
  plansEl.innerHTML = `${auto ? `<p class="auto">⏰ ${esc(t('auto'))}</p>` : ''}
    <div class="run-box"><header><b>🤖 ${t('plan')} ${'ABC'[picked]}</b><span class="rb-state">${t('running')}…</span></header>
    <div class="meters"><span>✅<i><em id="mprog"></em></i></span><span>💥<i><em id="mdmg" class="bad"></em></i></span></div>
    <ol class="log" id="log"></ol></div>`;
  const log = document.getElementById('log');
  let dmg = 0;
  for (let k = 0; k < plan.steps.length; k++) {
    const s = plan.steps[k];
    const li = document.createElement('li');
    li.innerHTML = `<span class="tool">${TOOL[s.tool] || '•'}</span><span class="cmd"></span>`;
    log.appendChild(li);
    await typeInto(li.querySelector('.cmd'), s[L]);
    sfx.key?.();
    if (s.effect) {
      await wait(250);
      const bad = s.effect.kind !== 'ok';
      const ef = document.createElement('div');
      ef.className = `effect ${bad ? 'bad' : 'ok'}`;
      ef.innerHTML = `${bad ? DAMAGE[s.effect.kind] : '✅'} ${esc(s.effect[L])}`;
      li.appendChild(ef);
      if (bad) { dmg += s.effect.amount; sfx.boom(); vibrate([80, 40, 80]); document.body.classList.add('hit'); setTimeout(() => document.body.classList.remove('hit'), 400); }
      else sfx.success();
    }
    document.getElementById('mprog').style.width = `${((k + 1) / plan.steps.length) * (plan.done ? 100 : 55)}%`;
    document.getElementById('mdmg').style.width = `${Math.min(100, dmg * 22)}%`;
    await wait(420);
  }
  const res = scorePlan(plan);
  const key = res.safe ? 'done_safe' : res.lie ? 'lie' : !plan.done ? 'not_done' : 'done_damage';
  G.score = Math.max(0, G.score + res.points); setScore(G.score);
  G.results.push({ id: sc.id, safe: res.safe, points: res.points, auto });
  document.querySelector('.rb-state').textContent = '';
  const best = bestPlan(sc);
  const others = order.map((p2, k) => ({ k, p2 })).filter(o => o.p2 !== pi);
  plansEl.insertAdjacentHTML('beforeend', `
    <div class="outcome ${res.safe ? 'good' : 'bad'}"><span class="stamp">${t(key)}</span><span class="pts">${res.points > 0 ? '+' : ''}${res.points}</span></div>
    <div class="others"><p>${t('others')}</p>${others.map(({ k, p2 }) => {
      const r2 = scorePlan(sc.plans[p2]); const eff = sc.plans[p2].steps.map(s => s.effect).filter(Boolean).find(e => e.kind !== 'ok') || sc.plans[p2].steps.at(-1).effect;
      return `<div class="oth ${r2.safe ? 'good' : 'bad'}"><b>${t('plan')} ${'ABC'[k]}</b><span>${r2.safe ? '✅' : DAMAGE[eff?.kind] || '❌'} ${esc(eff?.[L] || '')}</span>${p2 === best ? '<i>★</i>' : ''}</div>`;
    }).join('')}</div>
    <button class="k-cta" id="next">${G.i + 1 >= G.deck.length ? t('summary') + ' ›' : t('next')}</button>`);
  res.safe ? sfx.success() : sfx.fail();
  if (!res.safe && L) speak(t(key), L);
  document.getElementById('next').scrollIntoView({ behavior: 'smooth', block: 'end' });
  document.getElementById('next').onclick = () => { sfx.click(); G.i++; G.i >= G.deck.length ? summary() : ticket(); };
}

async function typeInto(el, s) {
  for (let i = 0; i < s.length; i += 2) { el.textContent = s.slice(0, i + 2); await wait(14); }
}

function summary() {
  const safe = G.results.filter(r => r.safe).length;
  const rank = safe === SHIFT ? 'lead' : safe >= SHIFT - 1 ? 'good' : safe >= 2 ? 'mid' : 'bad';
  store.set('shift-best', String(Math.max(G.score, Number(store.get('shift-best') || 0))));
  const icon = { lead: '🏆', good: '🛡️', mid: '📋', bad: '🚨' }[rank];
  app.innerHTML = `<section class="sh-intro"><div class="k-card ${safe >= SHIFT - 1 ? 'good' : 'bad'}"><span class="k-icon">${icon}</span><h2>${t('summary')}</h2><p class="rank">${t('r_' + rank)}</p><div class="k-pts">${G.score}</div>
    <div class="sum-row">${G.results.map(r => `<span class="${r.safe ? 'ok' : 'bad'}">${r.safe ? '✅' : '💥'}</span>`).join('')}</div>
    <p class="k-lesson">${esc(t('l_' + rank))}</p><p class="k-real">${esc(t('real'))}</p>
    <button class="k-cta" id="again">${t('again')}</button><div class="k-row"><a class="k-ghost" href="../">🎮</a><button class="k-ghost" id="share">📤 ${t('share')}</button></div></div></section>`;
  rank === 'lead' || rank === 'good' ? sfx.success() : sfx.fail();
  speak(t('r_' + rank), L);
  document.getElementById('again').onclick = () => { sfx.click(); start(); };
  document.getElementById('share').onclick = async () => {
    const text = `${icon} ${t('r_' + rank)} — ${G.score} · ${safe}/${SHIFT} ${t('safe')} · Agent Shift`;
    try { if (navigator.share) return await navigator.share({ title: 'Agent Shift', text, url: location.href }); } catch { return; }
    try { await navigator.clipboard.writeText(`${text} ${location.href}`); } catch { /* ignore */ }
  };
}

intro();
