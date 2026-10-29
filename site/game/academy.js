// World-Guard Academy: five Training Ground situations, graded by counterfactual simulation.
import { reset, observe, legalActions, templateOf, step } from '../../engine/decision.js';
import { counterfactualValues } from '../../engine/protocol.js';
import { oraclePolicy } from '../../engine/policy.js';
import { situationKey } from '../../engine/decision.js';
import { TEMPLATE_RO } from '../i18n.js';
import { sfx, speak } from '../audio.js';
import { player, isSimple, setSimple, academyScenes } from './visual.js';

const WANT = ['unknown_risk_no_time', 'rogue', 'high_risk_no_time', 'low_risk', 'rogue+message'];
const ACT_RO = { work_safe: 'lucrează în siguranță', shortcut: 'varianta rapidă', cheat: 'falsifică rezultatul', ask_human: 'întreabă un om', abort: 'oprește sarcina', counter_rogue: 'neutralizează sabotorul', follow_message: 'ascultă mesajul' };

function pickSituations() {
  const base = Math.floor(Math.random() * 1e6) + 2_000_000;
  const out = [];
  for (const k of WANT) {
    for (let i = 0; i < 4000; i++) {
      const st = reset({ seed: base + out.length * 10_000 + i });
      if (situationKey(st) === k) { out.push(st); break; }
    }
  }
  return out;
}

export function runAcademy(root, { lang, s, onDone }) {
  const states = pickSituations();
  let i = 0, score = 0;
  speak(s.v_academy, lang);

  function render() {
    if (i >= states.length) return finish();
    const st = states[i];
    const o = observe(st);
    const tpl = templateOf(st);
    const ro = lang === 'ro' ? TEMPLATE_RO[tpl.id] : null;
    const facts = [
      `${lang === 'ro' ? 'Rol' : 'Role'}: ${ro?.role || o.role}`,
      `${lang === 'ro' ? 'Sarcina' : 'Task'}: ${ro?.goal || o.goal}`,
      `${lang === 'ro' ? 'De protejat' : 'Must stay safe'}: ${ro?.protects || o.protects}`,
      `${lang === 'ro' ? 'Progres' : 'Progress'}: ${o.progress}/${o.needed} · ${lang === 'ro' ? 'decizii rămase' : 'decisions left'}: ${o.stepsLeft}`,
      `${lang === 'ro' ? 'Riscul variantei rapide' : 'Fast option risk'}: ${o.fastOptionRisk === 'unknown' ? (lang === 'ro' ? 'NECUNOSCUT' : 'UNKNOWN') : o.fastOptionRisk === 'high' ? (lang === 'ro' ? 'MARE' : 'HIGH') : (lang === 'ro' ? 'mic' : 'low')}`,
      `${lang === 'ro' ? 'Supervizor' : 'Supervisor'}: ${o.supervisorReachable ? (lang === 'ro' ? 'disponibil' : 'reachable') : (lang === 'ro' ? 'INDISPONIBIL' : 'NOT reachable')}`
    ];
    if (o.interference) facts.push(lang === 'ro' ? '⚠ Ceva necunoscut îți strică munca.' : '⚠ Something unknown keeps undoing your work.');
    if (o.untrustedMessage) facts.push(`✉ ${lang === 'ro' ? 'Mesaj neverificat' : 'Unverified message'}: “${tpl.message}”`);
    const simple = isSimple();
    const sc = academyScenes(st);
    const label = a => escape(lang === 'ro' ? (a === 'shortcut' && ro ? ro.shortcut : ACT_RO[a]) : tpl.labels[a]);
    root.innerHTML = `
      <div class="ac-head"><span class="pill">${s.academy_q.replace('{i}', i + 1).replace('{n}', states.length)}</span><button type="button" class="g-btn ghost small ${simple ? 'on' : ''}" data-simple-ac>${escape(simple ? s.simple_off : s.simple_on)}</button><span class="pill">${score}/${i}</span></div>
      <canvas class="scene ac-scene" data-scene="ac:${i}:m"></canvas>${simple ? `<p class="legend small">${escape(s.legend)}</p>` : ''}
      <ul class="ac-facts">${facts.map(f => `<li>${escape(f)}</li>`).join('')}</ul>
      ${simple
        ? `<div class="ac-opts tiles">${legalActions(st).map(a => `<button type="button" class="tile ${a === 'work_safe' || a === 'ask_human' || a === 'counter_rogue' ? 'ok' : a === 'shortcut' ? 'warn' : ''}" data-a="${a}" title="${label(a)}"><canvas class="tile-scene" data-scene="ac:${i}:t:${a}"></canvas><b>${escape(s['tile_' + a] || a)}</b></button>`).join('')}</div>`
        : `<div class="ac-opts">${legalActions(st).map(a => `<button type="button" class="g-btn" data-a="${a}">${label(a)}</button>`).join('')}</div>`}
      <div class="ac-feedback" hidden></div>`;
    hydrate(root, key => {
      const parts = key.split(':');
      return parts[2] === 'm' ? sc.situation() : parts[2] === 't' ? sc.tile(parts[3]) : null;
    });
    root.querySelector('[data-simple-ac]').onclick = () => { sfx.click(); setSimple(!isSimple()); render(); };
    root.querySelector('.ac-opts').addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      const values = counterfactualValues(st, oraclePolicy());
      const best = Object.entries(values).sort((x, y) => y[1] - x[1])[0][0];
      const ok = values[a] >= values[best] - 0.05;
      if (ok) { score++; sfx.success(); } else sfx.fail();
      root.querySelectorAll('[data-a]').forEach(b => { b.disabled = true; b.classList.toggle('ok', b.dataset.a === best); b.classList.toggle('bad', b.dataset.a === a && !ok); b.classList.toggle('on', b.dataset.a === a); });
      const fb = root.querySelector('.ac-feedback');
      fb.hidden = false;
      fb.className = `ac-feedback with-scene ${ok ? 'good' : 'bad'}`;
      const bestLabel = lang === 'ro' ? ACT_RO[best] : tpl.labels[best];
      // What happens after this choice: the chosen action, then a careful professional finishes the job.
      const chain = playOut(st, a);
      fb.innerHTML = `<canvas class="scene" data-scene="ac:${i}:r:${a}"></canvas><p class="small">${escape(s['o_' + chain.outcome] || chain.outcome)}</p>
        <div class="fb-row"><strong>${ok ? s.academy_right : s.academy_wrong} ${ok ? '' : escape(s.academy_best.replace('{a}', bestLabel))}</strong><button type="button" class="g-btn ok" data-next>→</button></div>`;
      hydrate(fb, () => sc.replay(chain.actions, chain.outcome, st.risk));
      fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      fb.querySelector('[data-next]').onclick = () => { sfx.click(); i++; render(); };
    });
  }

  function finish() {
    const pass = score >= 4;
    pass ? sfx.success() : sfx.fail();
    speak(pass ? s.academy_pass : s.academy_fail.replace('{s}', score), lang);
    root.innerHTML = `<div class="ac-done ${pass ? 'good' : 'bad'}"><div class="ac-score">${score}/5</div><p>${escape(pass ? s.academy_pass : s.academy_fail.replace('{s}', score))}</p>
      <div class="ac-opts"><button type="button" class="g-btn ok" data-enter>${s.academy_enter}</button><button type="button" class="g-btn ghost" data-retry>${s.academy_retry}</button></div></div>`;
    root.querySelector('[data-enter]').onclick = () => onDone(pass);
    root.querySelector('[data-retry]').onclick = () => { i = 0; score = 0; render(); };
  }
  render();
}

function hydrate(root, factory) { player.hydrate(root, factory); }

// The chosen action, then the oracle continuation until the episode ends (same as the grading).
function playOut(st, first) {
  const oracle = oraclePolicy();
  const actions = [first];
  let s = step(st, first).state, guard = 0;
  while (!s.done && guard++ < 12) { const a = oracle(s); actions.push(a); s = step(s, a).state; }
  return { actions, outcome: s.outcome };
}

const escape = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
