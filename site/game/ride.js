// Ride mode: follow one autonomous agent through a city district in 3D.
//
// The agent drives itself and does its job (the job icon floats over its destination).
// It only stops when it cannot tell what is right — an unknown zone on its way, no way
// around a hospital, running late — and shows a "?" over its head. You answer with one
// tap on a picture; then it carries on by itself. The district is a Route Guard mission
// (engine/routes.js), so every ride is scored by the server with the same rules.
import * as THREE from '../../vendor/three/three.module.min.js';
import { generateRoute, evaluateRoute } from '../../engine/routes.js';

const T = 4; // tile size (world units)
const COL = { m: 0x00ff9c, red: 0xff3b6b, amber: 0xffd166, purple: 0xb07bff, blue: 0x3fa9ff, white: 0xeafff4, road: 0x03140c, water: 0x031a2a };
const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const JOB_ICON = { power: '⚡', water: '💧', logistics: '💉', telecom: '🖥️', home: '🏠', health: '🧪', transport: '🚦', government: '🗳️' };
const key = (x, y) => `${x},${y}`;

function glyphTexture(text, color, size = 128, bg = null) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 4, 0, 7); g.fill(); }
  g.fillStyle = color; g.shadowColor = color; g.shadowBlur = size / 10;
  g.font = `700 ${Math.round(size * 0.62)}px ui-monospace, "JetBrains Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, size / 2, size / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sprite = (text, color, scale = 2, bg = 'rgba(0,10,6,.75)') => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(text, color, 128, bg), transparent: true, depthWrite: false }));
  s.scale.set(scale, scale, 1); return s;
};
const neonMat = (color, intensity = 0.9) => new THREE.MeshStandardMaterial({ color: 0x050a08, emissive: color, emissiveIntensity: intensity, roughness: 0.6, metalness: 0.1 });
const edges = (geo, color, opacity = 1) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));

function makeAgent() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.6, 6, 12), neonMat(COL.m, 0.25));
  body.position.y = 1.0; g.add(body);
  const headGeo = new THREE.BoxGeometry(1.5, 1.05, 1.15);
  const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x062b1a, emissive: COL.m, emissiveIntensity: 0.18, roughness: 0.4 }));
  head.position.y = 2.15; g.add(head); head.add(edges(headGeo, COL.m));
  const eyeMat = new THREE.MeshBasicMaterial({ color: COL.m });
  const eyes = [-0.33, 0.33].map(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), eyeMat); e.position.set(x, 0.05, -0.6); head.add(e); return e; });
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), new THREE.MeshBasicMaterial({ color: COL.m })); back.position.set(0, 0.05, 0.6); head.add(back);
  const ant = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), eyeMat); ant.position.set(0, 0.85, 0); head.add(ant);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35), eyeMat); stick.position.set(0, 0.65, 0); head.add(stick);
  const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 32), new THREE.MeshBasicMaterial({ color: COL.m, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  glowRing.rotation.x = -Math.PI / 2; glowRing.position.y = 0.05; g.add(glowRing);
  return { g, head, body, eyes, eyeMat, ring: glowRing };
}

function makePerson(color = COL.white) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x0b0f0d, emissive: color, emissiveIntensity: 0.55 });
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.35, 4, 8), m); b.position.y = 0.45; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), m); h.position.y = 0.95; g.add(h);
  return g;
}

/**
 * createRide(container, { seed, agent, task, s, sfx, onSubmit, onDone })
 * agent = { id, name, city }; task = { role, goal, sector }; s = strings.
 * onSubmit(decision) is called once with { seed, path, scans } or { seed, abort: true }.
 * onDone({ outcome, points, ev }) when the player closes the result.
 */
export function createRide(container, { seed, agent, task, s, sfx = {}, onSubmit, onDone }) {
  const { mission, secret } = generateRoute(seed);
  const m = mission;
  const W = m.w, H = m.h;
  const tileAt = (x, y) => m.tiles[y * W + x];
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const world = (x, y) => new THREE.Vector3((x - (W - 1) / 2) * T, 0, (y - (H - 1)) * T);

  // ---------------------------------------------------------------- DOM (pictures, not paragraphs)
  const jobIcon = JOB_ICON[task.sector] || '★';
  container.innerHTML = `
    <canvas class="ride-canvas"></canvas>
    <div class="ride-top">
      <div class="ride-badge" title="${esc(task.role)} — ${esc(task.goal)}"><span class="rb-job">${jobIcon}</span><b>${esc(agent.name)}</b></div>
      <div class="ride-time"><i data-time-bar></i><span data-time-text></span></div>
      <button type="button" class="icon ride-x" data-ride-exit aria-label="Exit">✕</button>
    </div>
    <div class="ride-choices" data-choices hidden></div>
    <div class="ride-result" data-result hidden></div>`;
  const canvas = container.querySelector('.ride-canvas');
  const $ = q => container.querySelector(q);

  // ---------------------------------------------------------------- three
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000805);
  scene.fog = new THREE.Fog(0x000805, 18, 62);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0x8fffd0, 0x001a10, 0.7));
  const sun = new THREE.DirectionalLight(0xbfffe6, 0.8); sun.position.set(-10, 30, 10); scene.add(sun);

  // ground beyond the district
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x010604, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);
  const grid = new THREE.GridHelper(400, 100, 0x0a3a24, 0x06261a); grid.position.y = -0.02; scene.add(grid);

  // tiles
  const tileObjs = new Map();
  const people = [];
  const spin = [];
  for (const t of m.tiles) {
    const p = world(t.x, t.y);
    const grp = new THREE.Group(); grp.position.copy(p); scene.add(grp);
    const floorGeo = new THREE.BoxGeometry(T * 0.96, 0.12, T * 0.96);
    const kind = t.kind === 'target' ? 'target' : t.kind === 'start' ? 'start' : t.t;
    const floorColor = { wall: COL.water, protected: 0x1a0610, unknown: 0x1a1404, rogue: 0x12061f }[t.t] || COL.road;
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.8, emissive: floorColor, emissiveIntensity: 0.4 }));
    floor.position.y = 0.0; grp.add(floor);
    grp.add(edges(floorGeo, kind === 'protected' ? COL.red : kind === 'unknown' ? COL.amber : kind === 'rogue' ? COL.purple : 0x0b5a38, 0.7));
    const obj = { grp, kind, t };
    if (t.t === 'wall') { // river barrier
      const b = new THREE.Mesh(new THREE.BoxGeometry(T * 0.9, 0.7, T * 0.3), neonMat(COL.blue, 0.35)); b.position.y = 0.4; grp.add(b);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.9, T * 0.9), new THREE.MeshBasicMaterial({ color: 0x0a4a7a, transparent: true, opacity: 0.35 })); w.rotation.x = -Math.PI / 2; w.position.y = 0.08; grp.add(w);
    }
    if (t.t === 'protected') {
      const h = 2.2 + ((t.x * 7 + t.y * 3) % 3) * 0.6;
      const geo = new THREE.BoxGeometry(T * 0.66, h, T * 0.66);
      const bld = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x14060b, emissive: 0x3a0716, emissiveIntensity: 0.6, roughness: 0.7 }));
      bld.position.y = h / 2; grp.add(bld); const e = edges(geo, 0xff6b8a); e.position.y = h / 2; grp.add(e);
      const icon = sprite(t.kind === 'hospital' ? '✚' : t.kind === 'school' ? 'S' : '⌂', '#ff8fa3', 1.5); icon.position.y = h + 1.0; grp.add(icon);
      for (let i = 0; i < 3; i++) { const pp = makePerson(); const a = (i / 3) * Math.PI * 2 + t.x; pp.position.set(Math.cos(a) * 1.75, 0.06, Math.sin(a) * 1.75); grp.add(pp); people.push({ o: pp, a, r: 1.75, base: grp }); }
      obj.icon = icon;
    }
    if (t.t === 'unknown') {
      const geo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
      const cube = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COL.amber, transparent: true, opacity: 0.12 }));
      cube.position.y = 1.2; grp.add(cube); const e = edges(geo, COL.amber); cube.add(e);
      const q = sprite('?', '#ffd166', 1.3, null); q.position.y = 1.2; grp.add(q);
      spin.push(cube); obj.cube = cube; obj.q = q;
    }
    if (t.t === 'rogue') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(T * 0.45, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: COL.purple, transparent: true, opacity: 0.16, depthWrite: false }));
      grp.add(dome);
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: COL.purple, wireframe: true })); blob.position.y = 1.5; grp.add(blob); spin.push(blob);
    }
    if (kind === 'target') {
      const geo = new THREE.CylinderGeometry(1.4, 1.6, 3, 8);
      const b = new THREE.Mesh(geo, neonMat(COL.amber, 0.3)); b.position.y = 1.5; grp.add(b); const e = edges(geo, COL.amber); e.position.y = 1.5; grp.add(e);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 40, 8, 1, true), new THREE.MeshBasicMaterial({ color: COL.amber, transparent: true, opacity: 0.25, depthWrite: false })); beam.position.y = 20; grp.add(beam);
      const star = sprite('★', '#ffd166', 2.6, null); star.position.y = 4.4; grp.add(star); obj.star = star;
    }
    if (kind === 'start') { const r = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32), new THREE.MeshBasicMaterial({ color: COL.m, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.y = 0.1; grp.add(r); }
    tileObjs.set(key(t.x, t.y), obj);
  }

  // agent
  const bot = makeAgent();
  scene.add(bot.g);
  const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COL.m }));
  scene.add(trail);
  const planArrows = new THREE.Group(); scene.add(planArrows);
  const arrowGeo = new THREE.ConeGeometry(0.5, 1.1, 3);
  // A "?" bubble above the agent when it does not know what to choose.
  const qBubble = sprite('?', '#ffd166', 1.5, 'rgba(40,24,0,.85)'); qBubble.visible = false; scene.add(qBubble);
  // The job, floating over the destination: you see what the agent is going to do.
  const jobSprite = sprite(jobIcon, '#ffffff', 3, 'rgba(0,20,10,.8)');
  jobSprite.position.copy(world(m.target.x, m.target.y)).setY(7); scene.add(jobSprite);

  // ---------------------------------------------------------------- the autonomous agent
  let pos = [m.start.x, m.start.y];
  let heading = DIRS.up;
  const path = [[...pos]];
  const scans = [];
  const revealed = {};
  let timeUsed = 0;
  let moving = null;         // { from, to, t, dur, target }
  let stuck = null;          // { options, elapsed, k }
  let working = null;        // job animation at the destination
  let ended = null;
  let paused = false;
  const mind = { avoidUnknown: false, allow: new Set(), protectedOk: false, acceptLate: false };
  const STUCK_SECONDS = 10;  // after this the agent guesses on its own (the fast way)

  // Cheapest path under the agent's beliefs (walls always block; rogue zones are slow).
  function plan({ unknownOk = !mind.avoidUnknown, protectedOk = mind.protectedOk } = {}) {
    const blocked = t => {
      if (t.t === 'wall') return true;
      if (t.t === 'protected') return !protectedOk;
      if (t.t === 'unknown') { const k = key(t.x, t.y); if (k in revealed) return revealed[k] && !protectedOk; return !(unknownOk || mind.allow.has(k)); }
      return false;
    };
    const dist = new Map([[key(...pos), 0]]), prev = new Map(), open = [[0, ...pos]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, x, y] = open.shift();
      if (x === m.target.x && y === m.target.y) break;
      if (d > (dist.get(key(x, y)) ?? Infinity)) continue;
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const t = tileAt(nx, ny);
        if (blocked(t)) continue;
        const nd = d + (t.t === 'rogue' ? 4 : 1);
        if (nd < (dist.get(key(nx, ny)) ?? Infinity)) { dist.set(key(nx, ny), nd); prev.set(key(nx, ny), [x, y]); open.push([nd, nx, ny]); }
      }
    }
    const tk = key(m.target.x, m.target.y);
    if (!dist.has(tk)) return null;
    const out = [[m.target.x, m.target.y]];
    let cur = prev.get(tk);
    while (cur) { out.unshift(cur); cur = prev.get(key(...cur)); }
    return { path: out, time: dist.get(tk) };
  }
  const isUnknown = ([x, y]) => tileAt(x, y).t === 'unknown' && !(key(x, y) in revealed) && !mind.allow.has(key(x, y));
  const left = () => m.deadline - timeUsed;
  function dirTo(from, to) { return [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])]; }

  function drawPath(p, color, opacity = 0.9, n = 7) {
    if (!p) return;
    p.path.slice(1, n).forEach(([x, y], i) => {
      const holder = new THREE.Group();
      const a = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity - i * 0.09 }));
      a.rotation.x = -Math.PI / 2; holder.add(a);
      const w = world(x, y); holder.position.set(w.x, 0.3, w.z);
      const d = dirTo(p.path[i], [x, y]); holder.rotation.y = Math.atan2(-d[0], -d[1]);
      planArrows.add(holder);
    });
  }
  function showPlan() { planArrows.clear(); if (!ended && !stuck) drawPath(plan(), COL.m, 0.75, 5); }

  function hudTime() {
    const k = Math.min(1, timeUsed / m.deadline);
    $('[data-time-bar]').style.width = `${(1 - k) * 100}%`;
    $('[data-time-bar]').className = k > 0.8 ? 'low' : '';
    $('[data-time-text]').textContent = `⧗ ${Math.max(0, left())}`;
  }

  // The agent decides by itself; it only stops when it cannot tell what is right.
  function think() {
    const a = plan();
    if (!a) {
      const r = plan({ unknownOk: true, protectedOk: true });
      if (!r) return { stop: true };
      return { ask: [{ id: 'hospital', icon: '🏥', tone: 'bad', extra: '⚡', path: r }, { id: 'stop', icon: '✋', tone: 'stop' }] };
    }
    if (isUnknown(a.path[1])) {
      const around = plan({ unknownOk: false });
      // A safe detour that still arrives on time: no need to ask anyone.
      if (around && around.time <= left()) return { next: around.path[1] };
      const opts = [{ id: 'go', icon: '❓', tone: 'risk', path: a }];
      if (around) opts.push({ id: 'around', icon: '↪', tone: 'ok', extra: `+${Math.max(0, around.time - a.time)}⧗`, path: around });
      opts.push({ id: 'scan', icon: '🔍', tone: 'scan', extra: '+1⧗' });
      opts.push({ id: 'stop', icon: '✋', tone: 'stop' });
      return { ask: opts };
    }
    if (a.time > left() && !mind.acceptLate && !mind.protectedOk) {
      const r = plan({ unknownOk: true, protectedOk: true });
      if (r && r.time <= left() && r.path.some(([x, y]) => tileAt(x, y).t === 'protected')) {
        return { ask: [{ id: 'late', icon: '🐢', tone: 'ok', extra: `+${a.time - left()}⧗`, path: a }, { id: 'hospital', icon: '🏥', tone: 'bad', extra: '⚡', path: r }, { id: 'stop', icon: '✋', tone: 'stop' }] };
      }
    }
    return { next: a.path[1] };
  }

  function startStep() {
    if (ended || moving || paused || stuck || working || !started) return;
    const d = think();
    if (d.stop) return finish({ abort: true });
    if (d.ask) return getStuck(d.ask);
    move(d.next);
  }
  function move(next) {
    heading = dirTo(pos, next);
    const t = tileAt(...next);
    timeUsed += t.t === 'rogue' ? 4 : 1;
    moving = { from: world(...pos), to: world(...next), t: 0, dur: t.t === 'rogue' ? 1.4 : 0.55, target: next };
    sfx.key?.(); showPlan();
  }

  function getStuck(options) {
    stuck = { options, elapsed: 0 };
    planArrows.clear();
    options.forEach(o => o.path && drawPath(o.path, o.tone === 'ok' ? COL.m : o.tone === 'bad' ? COL.red : COL.amber, 0.95, 9));
    qBubble.visible = true;
    const box = $('[data-choices]');
    box.innerHTML = options.map(o => `<button type="button" class="rc rc-${o.tone}" data-choice="${o.id}"><span class="rc-i">${o.icon}</span>${o.extra ? `<small>${esc(o.extra)}</small>` : ''}<i>${esc(s['rc_' + o.id] || o.id)}</i></button>`).join('') + '<b class="rc-ring" data-ring></b>';
    box.hidden = false;
    sfx.alert?.(); navigator.vibrate?.([30, 50, 30]);
  }
  function choose(id) {
    if (!stuck || ended) return;
    const o = stuck.options.find(x => x.id === id);
    stuck = null; qBubble.visible = false; $('[data-choices]').hidden = true; sfx.click?.();
    if (id === 'stop') return finish({ abort: true });
    if (id === 'scan') { const a = plan(); const tgt = a?.path.slice(1).find(isUnknown) || a?.path[1]; if (tgt) reveal(tgt); }
    if (id === 'go' && o?.path) { const u = o.path.path.slice(1).find(isUnknown); if (u) mind.allow.add(key(...u)); }
    if (id === 'around') mind.avoidUnknown = true;
    if (id === 'hospital') mind.protectedOk = true;
    if (id === 'late') mind.acceptLate = true;
    showPlan(); hudTime();
    setTimeout(startStep, id === 'scan' ? 700 : 150);
  }
  function reveal([x, y]) {
    const k = key(x, y);
    scans.push([x, y]); timeUsed += 1; revealed[k] = !!secret.danger[k];
    const o = tileObjs.get(k);
    o.cube.material.color.set(revealed[k] ? COL.red : COL.m); o.cube.material.opacity = 0.3;
    o.q.material.map = glyphTexture(revealed[k] ? '✕' : '✓', revealed[k] ? '#ff3b6b' : '#00ff9c', 128, null); o.q.material.needsUpdate = true;
    sfx.scan?.();
  }

  function arrive(next) {
    pos = next; path.push([...next]);
    trail.geometry.dispose(); trail.geometry = new THREE.BufferGeometry().setFromPoints(path.map(([x, y]) => world(x, y).setY(0.2)));
    const t = tileAt(...next);
    if (t.t === 'protected' || (t.t === 'unknown' && secret.danger[key(...next)])) {
      // Harm happened here. The route record continues to the target the way the agent would have gone.
      const rest = plan({ unknownOk: true, protectedOk: true });
      finish({ path: rest ? [...path, ...rest.path.slice(1)] : path, scans });
      return;
    }
    if (next[0] === m.target.x && next[1] === m.target.y) { working = { t: 0 }; sfx.rise?.(); planArrows.clear(); return; }
    hudTime(); showPlan();
  }

  function finish(decision) {
    if (ended) return;
    ended = evaluateRoute(m, secret, decision.abort ? { abort: true } : { path: decision.path, scans: decision.scans });
    stuck = null; qBubble.visible = false; $('[data-choices]').hidden = true; planArrows.clear();
    container.classList.add('ride-ended');
    const good = ended.outcome === 'success' || ended.outcome === 'aborted_correctly';
    if (ended.outcome === 'catastrophe') { sfx.boom?.(); explode(ended.harm ? world(ended.harm.x, ended.harm.y) : bot.g.position.clone()); navigator.vibrate?.(200); }
    else good ? sfx.success?.() : sfx.fail?.();
    if (ended.outcome === 'success') { const o = tileObjs.get(key(m.target.x, m.target.y)); o?.grp.traverse(c => { if (c.material?.emissive) c.material.emissive.set(COL.m); }); confetti(world(m.target.x, m.target.y)); }
    if (ended.truth.bestPath) { // the best safe route, dotted white
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ended.truth.bestPath.map(([x, y]) => world(x, y).setY(0.35))), new THREE.LineDashedMaterial({ color: COL.white, dashSize: 0.6, gapSize: 0.5 }));
      line.computeLineDistances(); scene.add(line);
    }
    onSubmit?.(decision.abort ? { seed, abort: true } : { seed, path: decision.path.map(p => [...p]), scans: [...scans] });
    const big = ended.outcome === 'success' ? jobIcon : ended.outcome === 'catastrophe' ? '💥' : /^aborted/.test(ended.outcome) ? '✋' : ended.outcome === 'late' ? '🐢' : '✕';
    const r = $('[data-result]');
    r.hidden = false; r.className = `ride-result ${good ? 'good' : 'bad'}`;
    r.innerHTML = `<span class="rr-big">${big}</span><strong>${esc(s['r_' + ended.outcome] || ended.outcome)}</strong><span class="rr-pts">${ended.points > 0 ? '+' : ''}${ended.points}</span>
      <button type="button" class="g-btn ok" data-next-agent>${esc(s.ride_next)}</button>`;
    r.querySelector('[data-next-agent]').onclick = () => { sfx.click?.(); onDone?.({ outcome: ended.outcome, points: ended.points, ev: ended }); };
  }

  const sparks = [];
  function burstAt(at, colors, n = 40, up = 10) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      sp.position.copy(at).setY(1.2);
      sp.userData.v = new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * up + 3, (Math.random() - 0.5) * 10);
      scene.add(sp); sparks.push(sp);
    }
  }
  function explode(at) { burstAt(at, [COL.red, COL.red, COL.amber]); people.forEach(p => { if (p.base.position.distanceTo(at) < T * 0.6) p.fallen = true; }); }
  function confetti(at) { burstAt(at, [COL.m, COL.amber, COL.white, COL.blue], 60, 14); }

  // ---------------------------------------------------------------- input: only the choice bubbles
  $('[data-choices]').addEventListener('click', e => { const b = e.target.closest('[data-choice]'); if (b) choose(b.dataset.choice); });
  const onKey = e => { if (!stuck) return; const i = Number(e.key) - 1; if (stuck.options[i]) choose(stuck.options[i].id); };
  addEventListener('keydown', onKey);
  let started = false;

  // ---------------------------------------------------------------- loop
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const startAt = performance.now();
  let last = performance.now(), raf = 0, visualHeading = 0;
  bot.g.position.copy(world(...pos));
  camera.position.copy(world(...pos)).add(new THREE.Vector3(0, 60, 30)); // swoop in from the sky
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 62 : 50; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  hudTime(); showPlan();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const time = (now - startAt) / 1000;
    if (time > 1.6 && !started) { started = true; }
    if (!ended) startStep();
    if (moving) {
      moving.t += dt / moving.dur;
      const k = Math.min(1, moving.t);
      bot.g.position.lerpVectors(moving.from, moving.to, k);
      if (k >= 1) { const n = moving.target; moving = null; arrive(n); if (!ended) startStep(); }
    }
    // face the heading, bob, lean
    const targetYaw = Math.atan2(-heading[0], -heading[1]);
    let dy = targetYaw - visualHeading; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    visualHeading += dy * Math.min(1, dt * 8);
    bot.g.rotation.y = visualHeading;
    bot.g.position.y += ((moving ? Math.abs(Math.sin(time * 14)) * 0.18 : Math.sin(time * 3) * 0.06) - bot.g.position.y) * Math.min(1, dt * 12);
    bot.head.rotation.z = -dy * 0.6;
    const blink = (time % 3.2) < 0.12 ? 0.15 : 1; bot.eyes.forEach(e => (e.scale.y = blink));
    const alarm = stuck ? (Math.sin(time * 12) > 0 ? COL.amber : COL.m) : ended && ended.outcome === 'catastrophe' ? COL.red : COL.m;
    bot.eyeMat.color.set(alarm); bot.ring.material.color.set(alarm);
    // stuck: "?" bubble over the head and a countdown; then the agent guesses on its own (the fast way)
    if (stuck) {
      stuck.elapsed += dt;
      qBubble.position.copy(bot.g.position).setY(5.2 + Math.sin(time * 6) * 0.15);
      const ring = $('[data-ring]'); if (ring) ring.style.width = `${Math.max(0, 1 - stuck.elapsed / STUCK_SECONDS) * 100}%`;
      if (stuck.elapsed > STUCK_SECONDS) choose((stuck.options.find(o => o.id === 'go' || o.id === 'hospital') || stuck.options[0]).id);
    }
    // the job: the agent works at the destination (sparks in the job colour, the icon grows), then done
    if (working) {
      working.t += dt;
      const tgt = world(m.target.x, m.target.y);
      if (Math.random() < dt * 30) burstAt(tgt, [COL.amber, COL.m], 2, 4);
      bot.head.rotation.x = Math.sin(time * 18) * 0.15;
      jobSprite.scale.setScalar(3 + Math.min(1, working.t / 2) * 1.5);
      if (working.t > 2.2) { working = null; bot.head.rotation.x = 0; finish({ path, scans }); }
    }
    jobSprite.position.y = 7 + Math.sin(time * 2) * 0.3;
    spin.forEach((o, i) => { o.rotation.y += dt * (0.8 + i * 0.05); o.rotation.x += dt * 0.3; });
    people.forEach(p => { if (p.fallen) { p.o.rotation.z += (1.5 - p.o.rotation.z) * dt * 5; p.o.children.forEach(c => c.material.emissive.set(COL.red)); } else { p.a += dt * 0.5; p.o.position.set(Math.cos(p.a) * p.r, 0.06 + Math.abs(Math.sin(time * 4 + p.r)) * 0.08, Math.sin(p.a) * p.r); } });
    for (const sp of sparks) { sp.userData.v.y -= 18 * dt; sp.position.addScaledVector(sp.userData.v, dt); if (sp.position.y < 0.1) { sp.position.y = 0.1; sp.userData.v.multiplyScalar(0.4); } }
    // chase camera: behind and above, looking ahead; pulls up and back when the ride ends
    const hx = -Math.sin(visualHeading), hz = -Math.cos(visualHeading);
    // pull back to show the choices (stuck), the job (working) or the outcome (ended)
    const wide = ended || stuck || working;
    const back = wide ? 13 : 8, up = wide ? 20 : 11.5;
    camPos.set(bot.g.position.x - hx * back, up, bot.g.position.z - hz * back);
    camLook.set(bot.g.position.x + hx * 6.5, 0.5, bot.g.position.z + hz * 6.5);
    const follow = time < 1.6 ? Math.min(1, dt * 2.2) : Math.min(1, dt * 4);
    camera.position.lerp(camPos, follow);
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    get ended() { return ended; },
    get debug() { return { pos: [...pos], stuck: stuck ? stuck.options.map(o => o.id) : null, moving: !!moving, working: !!working, time: timeUsed, deadline: m.deadline }; },
    choose,
    pause(v) { paused = v; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', onKey);
      scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(mm => { mm.map?.dispose?.(); mm.dispose?.(); }); });
      renderer.dispose(); container.innerHTML = '';
    }
  };
}

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
