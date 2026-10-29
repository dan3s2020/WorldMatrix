// Route Guard mini-game UI (canvas). Rules and scoring live in engine/routes.js.
import { generateRoute, evaluateRoute, publicMission } from '../../engine/routes.js';
import { sfx } from '../audio.js';

const COL = { road: '#03140c', grid: 'rgba(0,255,156,.16)', wall: '#0a0f0d', protected: '#3a0d18', unknown: '#2a2108', rogue: '#1f0f33', start: '#00ff9c', target: '#ffd166', path: '#00ff9c', agent: '#ff4d6d', best: '#ffffff' };
const LABEL = { hospital: 'H', school: 'S', homes: '⌂' };

export function createRouteGame(container, { seed, practice, s, onSubmit }) {
  const { mission, secret } = generateRoute(seed);
  const m = publicMission(mission);
  let path = [[m.start.x, m.start.y]], scans = [], scanMode = false, revealed = {}, done = null;

  container.innerHTML = `
    <div class="route-head"><span class="pill">${practice ? s.route_practice : s.route_shared}</span><span class="route-time" data-time></span></div>
    <p class="muted small">${s.route_d}</p>
    <canvas class="route-canvas"></canvas>
    <p class="legend small">${s.route_legend}</p>
    <div class="route-btns">
      <button type="button" class="g-btn" data-a="agent">${s.route_agent}</button>
      <button type="button" class="g-btn" data-a="scan">${s.route_scan}</button>
      <button type="button" class="g-btn" data-a="undo">${s.route_undo}</button>
      <button type="button" class="g-btn" data-a="clear">${s.route_clear}</button>
      <button type="button" class="g-btn ok" data-a="send">${s.route_send}</button>
      <button type="button" class="g-btn ghost" data-a="abort">${s.route_abort}</button>
    </div>
    <div class="route-result" data-result hidden></div>`;
  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const timeEl = container.querySelector('[data-time]');
  const resultEl = container.querySelector('[data-result]');
  let cell = 40, ox = 0, oy = 0, dpr = 1;

  function layout() {
    dpr = Math.min(2, devicePixelRatio || 1);
    const W = container.clientWidth;
    cell = Math.floor(Math.min(W / m.w, 56));
    canvas.style.width = `${cell * m.w}px`; canvas.style.height = `${cell * m.h}px`;
    canvas.width = cell * m.w * dpr; canvas.height = cell * m.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  const timeUsed = () => {
    let t = scans.length;
    for (const [x, y] of path.slice(1)) t += m.tiles[y * m.w + x].t === 'rogue' ? 4 : 1;
    return t;
  };

  function draw() {
    ctx.clearRect(0, 0, cell * m.w, cell * m.h);
    ctx.font = `700 ${Math.floor(cell * 0.42)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of m.tiles) {
      const x = t.x * cell, y = t.y * cell, k = `${t.x},${t.y}`;
      let fill = COL[t.t] || COL.road;
      if (t.t === 'unknown' && k in revealed) fill = revealed[k] ? '#4a1010' : '#0b2416';
      ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.strokeStyle = COL.grid; ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      let label = '', color = '#cfffe9';
      if (t.kind === 'start') { label = '▲'; color = COL.start; }
      else if (t.kind === 'target') { label = '★'; color = COL.target; }
      else if (t.t === 'protected') { label = LABEL[t.kind]; color = '#ff8fa3'; }
      else if (t.t === 'unknown') { label = k in revealed ? (revealed[k] ? '✕' : '✓') : '?'; color = k in revealed ? (revealed[k] ? '#ff4d6d' : '#00ff9c') : '#ffd166'; }
      else if (t.t === 'rogue') { label = '◆'; color = '#b07bff'; }
      else if (t.t === 'wall') { label = '▮'; color = '#1d2a24'; }
      if (label) { ctx.fillStyle = color; ctx.fillText(label, x + cell / 2, y + cell / 2 + 1); }
    }
    const line = (pts, color, width, dash) => {
      if (!pts || pts.length < 2) return;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (dash) ctx.setLineDash(dash);
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x * cell + cell / 2, y * cell + cell / 2)); ctx.stroke(); ctx.restore();
    };
    if (!done) line(m.agentProposal, COL.agent, 3, [6, 6]);
    line(path, done && !done.good ? COL.agent : COL.path, 4);
    if (done?.best) line(done.best, COL.best, 3, [4, 7]);
    const [hx, hy] = path.at(-1);
    ctx.strokeStyle = scanMode ? '#ffd166' : COL.path; ctx.lineWidth = 2; ctx.strokeRect(hx * cell + 3, hy * cell + 3, cell - 6, cell - 6);
    const tu = timeUsed();
    timeEl.textContent = s.route_time.replace('{t}', tu).replace('{d}', m.deadline);
    timeEl.classList.toggle('over', tu > m.deadline);
  }

  function tileFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / cell), Math.floor((e.clientY - r.top) / cell)];
  }

  canvas.addEventListener('pointerdown', e => {
    if (done) return;
    const [x, y] = tileFromEvent(e);
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
    const t = m.tiles[y * m.w + x];
    if (scanMode) {
      if (t.t === 'unknown' && !(`${x},${y}` in revealed)) { scans.push([x, y]); revealed[`${x},${y}`] = secret.danger[`${x},${y}`]; sfx.scan(); }
      draw(); return;
    }
    const last = path.at(-1);
    if (path.length > 1 && x === last[0] && y === last[1]) { path.pop(); sfx.click(); draw(); return; }
    if (Math.abs(x - last[0]) + Math.abs(y - last[1]) !== 1 || t.t === 'wall') { sfx.glitch(); return; }
    const at = path.findIndex(p => p[0] === x && p[1] === y);
    if (at >= 0) path = path.slice(0, at + 1); else path.push([x, y]);
    sfx.key(); draw();
  });

  container.querySelector('.route-btns').addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a || done) return;
    sfx.click();
    if (a === 'agent') path = m.agentProposal.map(p => [...p]);
    if (a === 'scan') { scanMode = !scanMode; e.target.classList.toggle('on', scanMode); }
    if (a === 'undo' && path.length > 1) path.pop();
    if (a === 'clear') path = [[m.start.x, m.start.y]];
    if (a === 'send' || a === 'abort') {
      const decision = a === 'abort' ? { abort: true } : { path, scans };
      if (a === 'send' && !(path.at(-1)[0] === m.target.x && path.at(-1)[1] === m.target.y)) { sfx.glitch(); return; }
      // Local preview of the outcome (the server re-checks shared missions with the same rules).
      const ev = evaluateRoute(mission, secret, decision);
      done = { best: ev.truth.bestPath, good: ev.outcome === 'success' || ev.outcome === 'aborted_correctly' };
      revealed = { ...secret.danger };
      showResult(ev);
      onSubmit?.({ seed, ...(a === 'abort' ? { abort: true } : { path, scans }) }, ev);
    }
    draw();
  });

  function showResult(ev) {
    const good = ev.outcome === 'success' || ev.outcome === 'aborted_correctly';
    good ? sfx.success() : ev.outcome === 'catastrophe' ? sfx.boom() : sfx.fail();
    resultEl.hidden = false;
    resultEl.className = `route-result ${good ? 'good' : 'bad'}`;
    resultEl.innerHTML = `<strong>${s['r_' + ev.outcome] || ev.outcome}</strong> · ${ev.points > 0 ? '+' : ''}${ev.points} ${s.points}<br><small>${ev.truth.bestPath ? s.best_route : ''}</small>`;
  }

  const ro = new ResizeObserver(layout);
  ro.observe(container);
  layout();
  return { dispose: () => ro.disconnect() };
}
