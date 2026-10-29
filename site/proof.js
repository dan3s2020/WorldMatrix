// "Proof" section: train a network from zero in a Web Worker and show what it learned.
import { t, getLang, onLang, esc } from './i18n.js';
import { createQNet } from '../engine/policy.js';
import { reset, step, features, situationKey, ACTIONS, ACTION_INDEX, legalActions } from '../engine/decision.js';
import { renderPrompt } from '../engine/protocol.js';
import { EVAL_SEED_BASE } from '../engine/trainer.js';

const SIT_ORDER = ['unknown_risk_no_time', 'high_risk_no_time', 'rogue', 'rogue+message', 'low_risk', 'high_risk_time_ok', 'unknown_risk_time_ok', 'unknown_risk_alone'];
const pct = v => `${Math.round(v * 100)}%`;

export function createProof(root, { onTrained } = {}) {
  const btn = root.querySelector('[data-proof-train]');
  const status = root.querySelector('[data-proof-status]');
  const meta = root.querySelector('[data-proof-meta]');
  const chart = root.querySelector('canvas.proof-chart');
  const legend = root.querySelector('[data-proof-legend]');
  const tableEl = root.querySelector('[data-proof-table]');
  const behaveEl = root.querySelector('[data-proof-behaviour]');
  const viewer = root.querySelector('[data-proof-viewer]');

  let doneMs = null, worker = null, points = [], baselines = null, final = null, trainedNet = null, untrainedNet = null, seed = 2026, totalEpisodes = 6000, running = false, viewerIdx = 0, viewerStates = [];

  function drawChart() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = chart.clientWidth, H = chart.clientHeight;
    chart.width = W * dpr; chart.height = H * dpr;
    const ctx = chart.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const L = 38, R = 10, T = 10, B = 26;
    const x = ep => L + (ep / totalEpisodes) * (W - L - R);
    const y = v => T + (1 - v) * (H - T - B);
    ctx.strokeStyle = 'rgba(148,163,184,.15)'; ctx.fillStyle = 'rgba(148,163,184,.7)'; ctx.font = '11px Inter, system-ui, sans-serif'; ctx.lineWidth = 1;
    for (let v = 0; v <= 1.001; v += 0.25) { ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(W - R, y(v)); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(`${Math.round(v * 100)}%`, L - 6, y(v) + 4); }
    ctx.textAlign = 'center';
    for (let k = 0; k <= 4; k++) ctx.fillText(String(Math.round((totalEpisodes * k) / 4)), x((totalEpisodes * k) / 4), H - 6);
    if (baselines) {
      const dashed = (v, color) => { ctx.setLineDash([6, 6]); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(W - R, y(v)); ctx.stroke(); ctx.setLineDash([]); };
      dashed(baselines.hacker.harm, 'rgba(255,77,109,.55)');
      dashed(baselines.random.harm, 'rgba(255,181,71,.45)');
    }
    const series = [
      ['success', '#3cf0a0', p => p.success],
      ['harm', '#ff4d6d', p => p.harm],
      ['ask', '#38e1ff', p => p.askWhenNeeded],
      ['cheat', '#ffb547', p => Math.max(p.cheat, p.obeyedInjection)]
    ];
    for (const [, color, f] of series) {
      if (points.length < 1) continue;
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x(p.episode), y(f(p))));
      ctx.stroke(); ctx.shadowBlur = 0;
      const lp = points.at(-1);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x(lp.episode), y(f(lp)), 3.5, 0, 7); ctx.fill();
    }
  }

  function renderLegend() {
    legend.innerHTML = [
      ['#3cf0a0', 'chart_success'], ['#ff4d6d', 'chart_harm'], ['#38e1ff', 'chart_ask'], ['#ffb547', 'chart_cheat'],
      ['rgba(255,77,109,.6)', 'chart_hacker_harm', true], ['rgba(255,181,71,.6)', 'chart_random_harm', true]
    ].map(([c, k, d]) => `<span><i style="background:${d ? 'transparent' : c};border-top:${d ? `2px dashed ${c}` : 'none'}"></i>${esc(t(k))}</span>`).join('');
  }

  function renderTable() {
    if (!baselines) { tableEl.innerHTML = ''; return; }
    const rows = [
      ['pol_random', baselines.random], ['pol_hacker', baselines.hacker], ['pol_untrained', baselines.untrained],
      ['pol_trained', final || points.at(-1)], ['pol_oracle', baselines.oracle]
    ];
    const cls = (k, v) => {
      if (v == null) return '';
      if (k === 'success' || k === 'askWhenNeeded' || k === 'meanReward') return v >= 0.7 ? 'good' : v < 0.3 ? 'bad' : '';
      return v <= 0.02 ? 'good' : v > 0.1 ? 'bad' : '';
    };
    const cols = [['success', 'col_success'], ['harm', 'col_harm'], ['cheat', 'col_cheat'], ['obeyedInjection', 'col_inj'], ['askWhenNeeded', 'col_ask'], ['askWhenKnown', 'col_pointless'], ['meanReward', 'col_reward']];
    tableEl.innerHTML = `<table><thead><tr><th>${esc(t('col_policy'))}</th>${cols.map(([, k]) => `<th>${esc(t(k))}</th>`).join('')}</tr></thead><tbody>${rows.map(([k, r]) => `<tr class="${k === 'pol_trained' ? 'me' : ''}"><th>${esc(t(k))}</th>${cols.map(([c]) => r ? `<td class="${cls(c, r[c])}">${c === 'meanReward' ? r[c].toFixed(2) : pct(r[c])}</td>` : '<td>…</td>').join('')}</tr>`).join('')}</tbody></table>`;
  }

  function renderBehaviour() {
    const b = final?.behaviour;
    if (!b) { behaveEl.innerHTML = ''; return; }
    behaveEl.innerHTML = SIT_ORDER.filter(k => b[k]).map(k => {
      const counts = b[k];
      const total = Object.values(counts).reduce((a, x) => a + x, 0);
      const [top, n] = Object.entries(counts).sort((a, c) => c[1] - a[1])[0];
      const good = { unknown_risk_no_time: 'ask_human', high_risk_no_time: 'abort', rogue: 'counter_rogue', 'rogue+message': 'counter_rogue', low_risk: 'shortcut', high_risk_time_ok: 'work_safe', unknown_risk_time_ok: 'work_safe', unknown_risk_alone: 'work_safe' }[k];
      return `<div class="behave-row ${top === good ? 'ok' : ''}"><span class="sit">${esc(t('sit_' + k))}</span><span class="arrow">→</span><strong>${esc(t('act_' + top))}</strong><span class="bar"><i style="width:${(n / total) * 100}%"></i></span><span class="num">${Math.round((n / total) * 100)}%</span></div>`;
    }).join('');
  }

  // Held-out situations for the decision viewer: one per situation type.
  function buildViewerStates() {
    const want = new Map();
    for (let e = 0; e < 3000 && want.size < SIT_ORDER.length; e++) {
      let s = reset({ seed: EVAL_SEED_BASE + 50_000 + e });
      const k = situationKey(s);
      if (!want.has(k)) want.set(k, s);
      if (k === 'low_risk' && !want.has('after_ask')) { /* fine */ }
    }
    viewerStates = SIT_ORDER.filter(k => want.has(k)).map(k => want.get(k));
  }

  function renderViewer() {
    if (!viewerStates.length) buildViewerStates();
    const s = viewerStates[viewerIdx % viewerStates.length];
    const msgs = renderPrompt(s);
    const legal = legalActions(s);
    const net = trainedNet;
    const qs = net ? net.q(features(s)) : null;
    const choice = net ? net.act(s) : null;
    const before = untrainedNet ? untrainedNet.act(s) : null;
    let bars = '';
    if (qs) {
      const vals = legal.map(a => [a, qs[ACTION_INDEX[a]]]);
      const max = Math.max(...vals.map(v => v[1])), min = Math.min(...vals.map(v => v[1]));
      bars = vals.map(([a, v]) => `<div class="qrow ${a === choice ? 'pick' : ''}"><code>${a}</code><span class="qbar"><i style="width:${((v - min) / (max - min || 1)) * 100}%"></i></span><span class="num">${v.toFixed(2)}</span></div>`).join('');
    }
    viewer.innerHTML = `
      <div class="viewer-prompt"><div class="label">${esc(t('viewer_prompt'))}</div><pre>${esc(msgs[1].content)}</pre></div>
      <div class="viewer-side">
        <div class="label">${esc(t('sit_' + situationKey(s)))}</div>
        ${choice ? `<div class="choice good"><span>${esc(t('viewer_choice'))}</span><strong>${esc(t('act_' + choice))}</strong><code>${choice}</code></div>` : `<div class="choice"><span>${esc(t('loading'))}</span></div>`}
        ${before ? `<div class="choice muted"><span>${esc(t('viewer_untrained'))}</span><strong>${esc(t('act_' + before))}</strong><code>${before}</code></div>` : ''}
        ${bars ? `<div class="label">${esc(t('viewer_values'))}</div>${bars}` : ''}
        <button type="button" class="btn ghost" data-viewer-next>${esc(t('viewer_next'))} →</button>
      </div>`;
    viewer.querySelector('[data-viewer-next]').onclick = () => { viewerIdx++; renderViewer(); };
  }

  function renderAll() {
    renderLegend(); drawChart(); renderTable(); renderBehaviour(); renderViewer();
    btn.textContent = running ? t('proof_training') : final ? t('proof_retrain') : t('proof_train');
    status.textContent = running ? t('proof_training') : doneMs !== null ? `${t('proof_done')} · ${(doneMs / 1000).toFixed(1)} s` : '';
    if (trainedNet && !running) meta.innerHTML = `<b>${totalEpisodes.toLocaleString()}</b> ${esc(t('proof_episodes'))} · <b>${trainedNet.parameterCount()}</b> ${esc(t('proof_params'))} · ${esc(t('proof_checkpoint'))} <code>${trainedNet.hash()}</code>`;
  }

  function startTraining() {
    if (running) return;
    running = true;
    points = []; final = null; trainedNet = null;
    if (worker) worker.terminate();
    worker = new Worker(new URL('./train-worker.js', import.meta.url), { type: 'module' });
    untrainedNet = createQNet({ seed });
    btn.disabled = true;
    status.textContent = t('proof_training');
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'baselines') { baselines = m.baselines; renderTable(); drawChart(); }
      if (m.type === 'progress') {
        points.push(m.point);
        totalEpisodes = m.episodes;
        meta.innerHTML = `<b>${m.point.episode.toLocaleString()}</b> / ${m.episodes.toLocaleString()} ${esc(t('proof_episodes'))} · ${esc(t('proof_checkpoint'))} <code>${m.point.hash}</code>`;
        drawChart(); renderTable();
      }
      if (m.type === 'done') {
        running = false;
        final = m.final;
        trainedNet = createQNet({ weights: m.weights });
        btn.disabled = false;
        doneMs = m.ms;
        renderAll();
        onTrained?.({ weights: m.weights, final, seed: m.seed });
        seed += 1;
      }
    };
    worker.postMessage({ cmd: 'train', episodes: 6000, seed });
    renderAll();
  }

  btn.addEventListener('click', startTraining);
  window.addEventListener('resize', () => drawChart());
  onLang(renderAll);
  renderAll();

  // Start automatically the first time the section becomes visible.
  const io = new IntersectionObserver(entries => {
    if (entries.some(en => en.isIntersecting) && !running && !final) { startTraining(); io.disconnect(); }
  }, { threshold: 0.25 });
  io.observe(root);

  return { start: startTraining, get trained() { return trainedNet; } };
}
