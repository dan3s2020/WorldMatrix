// Three.js globe used by "Two Earths" and the play mode.
import * as THREE from '../vendor/three/three.module.min.js';
import { CITIES, LINKS, SECTORS } from '../engine/geo.js';

const R = 100;
const cityById = Object.fromEntries(CITIES.map(c => [c.id, c]));

export function latLon(lat, lon, r = R) {
  const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b));
}

let landCache = null;
export async function loadLand(base = '') {
  if (landCache) return landCache;
  const res = await fetch(`${base}data/land-110m.json`);
  landCache = (await res.json()).rings;
  return landCache;
}

function earthTexture(land, size = 2048) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size / 2;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#000604'); grad.addColorStop(0.5, '#00140b'); grad.addColorStop(1, '#000604');
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(0,255,156,0.08)'; g.lineWidth = 1;
  for (let i = 0; i <= 36; i++) { const x = (i / 36) * c.width; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let i = 0; i <= 18; i++) { const y = (i / 18) * c.height; g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  const px = lon => ((lon + 180) / 360) * c.width, py = lat => ((90 - lat) / 180) * c.height;
  g.fillStyle = '#022916'; g.strokeStyle = 'rgba(0,255,156,0.7)'; g.lineWidth = 1.6;
  for (const ring of land) {
    g.beginPath();
    ring.forEach(([lon, lat], i) => (i ? g.lineTo(px(lon), py(lat)) : g.moveTo(px(lon), py(lat))));
    g.closePath(); g.fill(); g.stroke();
  }
  return c;
}

function landMask(land) {
  const c = document.createElement('canvas');
  c.width = 720; c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 720, 360); g.fillStyle = '#fff';
  for (const ring of land) {
    g.beginPath();
    ring.forEach(([lon, lat], i) => { const x = ((lon + 180) / 360) * 720, y = ((90 - lat) / 180) * 360; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.fill();
  }
  const data = g.getImageData(0, 0, 720, 360).data;
  return (lat, lon) => {
    const x = Math.min(719, Math.max(0, Math.floor(((lon + 180) / 360) * 720)));
    const y = Math.min(359, Math.max(0, Math.floor(((90 - lat) / 180) * 360)));
    return data[(y * 720 + x) * 4] > 128;
  };
}

const ATMO_VERT = `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const ATMO_FRAG = `uniform vec3 color; uniform float power; varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(normalize(-vP), vN)), power); gl_FragColor = vec4(color, f * 0.9); }`;

const healthColor = (v, out = new THREE.Color()) => {
  // red (0) -> amber (0.5) -> cyan (1)
  // red (0) -> amber (0.5) -> matrix green (1)
  if (v < 0.5) return out.setRGB(1, 0.25 + v * 1.3, 0.3);
  return out.setRGB(1 - (v - 0.5) * 2, 0.9 + (v - 0.5) * 0.2, 0.3 + (v - 0.5) * 0.6);
};

export function createGlobe(container, { land, interactive = true, autoRotate = true, onPickCity = null, initialYaw = 0.4 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.classList.add('globe-canvas');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
  scene.add(new THREE.AmbientLight(0x9fb8ff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(300, 200, 400);
  scene.add(sun);

  const world = new THREE.Group();
  scene.add(world);

  const tex = new THREE.CanvasTexture(earthTexture(land));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.1, emissive: new THREE.Color(0x002a14), emissiveIntensity: 0.7 }));
  world.add(earth);

  // Digital land dots (Fibonacci sphere filtered by the land mask).
  const isLand = landMask(land);
  const pts = [];
  const N = 14000;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
    const lat = (Math.asin(y) * 180) / Math.PI, lon = ((((th * 180) / Math.PI) % 360) + 360) % 360 - 180;
    if (isLand(lat, lon)) { const v = latLon(lat, lon, R * 1.004); pts.push(v.x, v.y, v.z); }
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const dotMat = new THREE.PointsMaterial({ color: 0x00ff9c, size: 0.75, transparent: true, opacity: 0.75, depthWrite: false });
  world.add(new THREE.Points(dotGeo, dotMat));

  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, uniforms: { color: { value: new THREE.Color(0x00ff9c) }, power: { value: 2.4 } },
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 64, 48), atmoMat));

  // Network links.
  const linkMat = new THREE.LineBasicMaterial({ color: 0x00ff9c, transparent: true, opacity: 0.2 });
  const arcPoints = (a, b, lift = 0.18) => {
    const v1 = latLon(a.lat, a.lon, R * 1.01), v2 = latLon(b.lat, b.lon, R * 1.01);
    const mid = v1.clone().add(v2).multiplyScalar(0.5);
    mid.setLength(R * (1.01 + lift * (v1.distanceTo(v2) / R)));
    return new THREE.QuadraticBezierCurve3(v1, mid, v2);
  };
  for (const [a, b] of LINKS) {
    const curve = arcPoints(cityById[a], cityById[b]);
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), linkMat));
  }

  // City markers.
  const markers = new Map();
  const up = new THREE.Vector3(0, 1, 0);
  for (const c of CITIES) {
    const g = new THREE.Group();
    const n = latLon(c.lat, c.lon, 1).normalize();
    g.position.copy(n.clone().multiplyScalar(R));
    g.quaternion.setFromUnitVectors(up, n);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.9 });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 10), beamMat);
    beam.userData.city = c.id;
    g.add(beam);
    const base = new THREE.Mesh(new THREE.RingGeometry(1.3, 2.2, 28), new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.3; base.userData.city = c.id;
    g.add(base);
    const rogue = new THREE.Mesh(new THREE.TorusGeometry(3, 0.35, 8, 32), new THREE.MeshBasicMaterial({ color: 0xb07bff, transparent: true, opacity: 0 }));
    rogue.rotation.x = Math.PI / 2; rogue.position.y = 1.2;
    g.add(rogue);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.2;
    g.add(halo);
    const lin = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshBasicMaterial({ color: 0xb07bff, transparent: true, opacity: 0 }));
    lin.position.y = 14;
    g.add(lin);
    // Pick target (bigger invisible sphere)
    const hit = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.city = c.id;
    g.add(hit);
    world.add(g);
    markers.set(c.id, { g, beam, base, rogue, halo, lin, hit, alive: 1 });
  }
  const pickables = [...markers.values()].map(m => m.hit);

  // District (city close-up), built lazily for the focused city.
  const district = new THREE.Group();
  district.visible = false;
  world.add(district);
  const BLD = 64;
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const bMesh = new THREE.InstancedMesh(bGeo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 }), BLD);
  district.add(bMesh);
  const aMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0x00ff9c }), 24);
  district.add(aMesh);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48), new THREE.MeshBasicMaterial({ color: 0x021a0e, transparent: true, opacity: 0.92 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.05;
  district.add(ground);
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const layout = [];
  for (let i = 0; i < BLD; i++) {
    const gx = (i % 8) - 3.5, gz = Math.floor(i / 8) - 3.5;
    if (Math.hypot(gx, gz) > 4.2) { layout.push(null); continue; }
    layout.push({ x: gx * 1.5, z: gz * 1.5, h: 0.6 + ((i * 37) % 11) / 4, sector: SECTORS[i % SECTORS.length] });
  }
  let districtCity = null;

  function placeDistrict(id) {
    const c = cityById[id];
    const n = latLon(c.lat, c.lon, 1).normalize();
    district.position.copy(n.clone().multiplyScalar(R * 1.0005));
    district.quaternion.setFromUnitVectors(up, n);
    districtCity = id;
  }

  // Effects (attack pulses / spread arcs).
  const effects = [];
  const seenAttacks = new Set();
  function pulse(cityId, color, big = 1) {
    const m = markers.get(cityId);
    if (!m) return;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.6, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.5;
    m.g.add(ring);
    effects.push({ obj: ring, parent: m.g, t: 0, life: 1.6, kind: 'pulse', big });
  }
  function spreadArc(from, to, color) {
    const curve = arcPoints(cityById[from], cityById[to], 0.3);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 }));
    geo.setDrawRange(0, 0);
    world.add(line);
    effects.push({ obj: line, parent: world, t: 0, life: 2.2, kind: 'arc' });
  }

  // Camera & interaction.
  let yaw = initialYaw, pitch = 0.35, dist = 330, targetDist = 330, targetYaw = null, targetPitch = null, focus = null;
  let dragging = false, lastX = 0, lastY = 0, idle = 0, pinch = null, moved = 0;
  const pointers = new Map();
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const el = renderer.domElement;
  el.style.touchAction = interactive ? 'none' : 'pan-y';

  if (interactive) {
    el.addEventListener('pointerdown', e => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      dragging = true; lastX = e.clientX; lastY = e.clientY; moved = 0;
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: targetDist }; }
      targetYaw = targetPitch = null;
    });
    el.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        targetDist = clampDist(pinch.dist * (pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))));
        moved += 10;
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      const k = 0.005 * (dist / 330);
      yaw -= dx * k; pitch = Math.max(-1.35, Math.min(1.35, pitch + dy * k));
      lastX = e.clientX; lastY = e.clientY; idle = 0;
    });
    const end = e => {
      const wasClick = pointers.size === 1 && moved < 6;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) dragging = false;
      if (wasClick && e.type === 'pointerup') pick(e);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('wheel', e => { e.preventDefault(); targetDist = clampDist(targetDist * Math.exp(e.deltaY * 0.0012)); idle = 0; }, { passive: false });
  }
  const clampDist = d => Math.max(R * 1.08, Math.min(R * 5.2, d));

  function pick(e) {
    const r = el.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(pickables, false);
    if (hits.length) onPickCity?.(hits[0].object.userData.city);
  }

  function focusCity(id, close = true) {
    const c = cityById[id];
    if (!c) return;
    const v = latLon(c.lat, c.lon, 1).normalize();
    // account for world rotation (none) -> camera direction equals city normal
    targetYaw = Math.atan2(v.x, v.z);
    targetPitch = Math.asin(v.y);
    focus = id;
    placeDistrict(id);
    if (close) targetDist = R * 1.22;
  }
  function zoomOut() { targetDist = 330; focus = null; }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Fit the whole globe on narrow viewports.
    const fitDist = (R * 1.25) / Math.sin(((camera.fov / 2) * Math.PI) / 180) / Math.min(1, camera.aspect);
    if (!focus && targetDist > R * 2.2) targetDist = clampDist(fitDist);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let snapshot = null;
  const statusColor = new THREE.Color(0x00ff9c);
  function update(snap) {
    snapshot = snap;
    if (!snap) return;
    const aliveFrac = snap.summary.aliveFrac;
    const danger = Math.max(1 - aliveFrac, snap.summary.rogue * 1.4, snap.status === 'apex' ? 1 : 0);
    statusColor.setRGB(danger, 1 - danger * 0.75, 0.61 - danger * 0.25);
    atmoMat.uniforms.color.value.copy(statusColor);
    dotMat.color.setRGB(danger, 1 - danger * 0.7, 0.61 - danger * 0.3);
    dotMat.opacity = 0.35 + aliveFrac * 0.45;
    for (const c of snap.cities) {
      const m = markers.get(c.id);
      const health = Math.min(...Object.values(c.s));
      const alive = c.alive / c.pop;
      m.alive = alive;
      const h = 2 + alive * 10;
      m.beam.scale.set(1, h, 1); m.beam.position.y = h / 2;
      healthColor(alive < 0.05 ? 0 : health, m.beam.material.color);
      m.beam.material.opacity = 0.25 + alive * 0.7;
      healthColor(health, m.base.material.color);
      m.rogue.material.opacity = Math.min(0.95, c.rogue * 1.6);
      m.rogue.scale.setScalar(0.6 + c.rogue * 1.8);
      m.halo.material.opacity = Math.min(0.55, c.infected * 2.5);
      m.halo.scale.setScalar(2 + c.infected * 16);
    }
    for (const l of snap.lineages || []) {
      const m = markers.get(l.city);
      if (!m) continue;
      m.lin.material.opacity = l.active ? 0.95 : 0.18;
      m.lin.scale.setScalar(0.4 + l.cap * 2.2);
    }
    for (const a of snap.attacks || []) {
      const key = `${a.id}:${a.tick}`;
      if (seenAttacks.has(key)) continue;
      seenAttacks.add(key);
      if (seenAttacks.size > 400) seenAttacks.delete(seenAttacks.values().next().value);
      const col = a.stage === 'prevented' ? 0x3cf0a0 : a.stage === 'contained' ? 0xffb547 : 0xff4d6d;
      pulse(a.city, col, a.stage === 'uncontained' ? 1.6 : 1);
      if (a.stage !== 'prevented' && (a.kind === 'worm' || a.kind === 'outbreak' || a.kind === 'rogue_breakout')) {
        for (const [x, y] of LINKS) if (x === a.city || y === a.city) spreadArc(a.city, x === a.city ? y : x, a.kind === 'rogue_breakout' ? 0xb07bff : 0xff4d6d);
      }
    }
    if (districtCity) paintDistrict();
  }

  function paintDistrict() {
    const c = snapshot?.cities.find(x => x.id === districtCity);
    if (!c) return;
    const alive = c.alive / c.pop;
    layout.forEach((b, i) => {
      if (!b) { tmpM.makeScale(0, 0, 0); bMesh.setMatrixAt(i, tmpM); return; }
      const hlt = c.s[b.sector];
      tmpS.set(0.9, b.h * (0.35 + hlt * 0.65), 0.9);
      tmpP.set(b.x, 0, b.z);
      tmpM.compose(tmpP, tmpQ.identity(), tmpS);
      bMesh.setMatrixAt(i, tmpM);
      healthColor(alive < 0.05 ? 0 : hlt, tmpC).multiplyScalar(0.55);
      bMesh.setColorAt(i, tmpC);
    });
    bMesh.instanceMatrix.needsUpdate = true;
    if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
  }

  let active = true, raf = 0, last = 0, clock = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!active) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now; clock += dt; idle += dt;
    if (targetYaw !== null) {
      let d = targetYaw - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * 3.2); pitch += (targetPitch - pitch) * Math.min(1, dt * 3.2);
      if (Math.abs(d) < 0.002 && Math.abs(targetPitch - pitch) < 0.002) targetYaw = targetPitch = null;
    } else if (autoRotate && !dragging && idle > 2.5 && !focus) yaw += dt * 0.06;
    dist += (targetDist - dist) * Math.min(1, dt * 4);
    const cp = Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * cp * dist, Math.sin(pitch) * dist, Math.cos(yaw) * cp * dist);
    // Look slightly toward the focused city when very close.
    const close = Math.max(0, Math.min(1, (R * 1.7 - dist) / (R * 0.5)));
    if (focus && close > 0) {
      const c = cityById[focus];
      const tgt = latLon(c.lat, c.lon, R).multiplyScalar(close);
      camera.lookAt(tgt);
    } else camera.lookAt(0, 0, 0);
    camera.near = dist < R * 1.4 ? 0.05 : 1;
    camera.updateProjectionMatrix();
    district.visible = !!focus && dist < R * 1.75;
    if (district.visible) {
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = clock * (0.25 + (i % 5) * 0.07) + i * 1.7, rr = 1.5 + (i % 4) * 1.5;
        tmpP.set(Math.cos(a) * rr, 0.25, Math.sin(a) * rr);
        tmpM.makeTranslation(tmpP.x, tmpP.y, tmpP.z);
        aMesh.setMatrixAt(i, tmpM);
      }
      aMesh.instanceMatrix.needsUpdate = true;
    }
    for (const m of markers.values()) { m.rogue.rotation.z += dt * 0.8; m.lin.rotation.y += dt * 1.2; m.lin.position.y = 14 + Math.sin(clock * 2 + m.g.position.x) * 1.2; }
    for (let i = effects.length - 1; i >= 0; i--) {
      const ef = effects[i];
      ef.t += dt;
      const k = ef.t / ef.life;
      if (ef.kind === 'pulse') { ef.obj.scale.setScalar(1 + k * 6 * ef.big); ef.obj.material.opacity = Math.max(0, 0.95 * (1 - k)); }
      else { ef.obj.geometry.setDrawRange(0, Math.floor(Math.min(1, k * 1.6) * 49)); ef.obj.material.opacity = Math.max(0, 1 - Math.max(0, k - 0.5) * 2); }
      if (k >= 1) { ef.parent.remove(ef.obj); ef.obj.geometry.dispose(); ef.obj.material.dispose(); effects.splice(i, 1); }
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // Pause rendering when off-screen.
  const io = new IntersectionObserver(es => { active = es.some(e => e.isIntersecting); }, { threshold: 0.01 });
  io.observe(container);

  function cityScreen(id) {
    const c = cityById[id];
    const v = latLon(c.lat, c.lon, R * 1.02).project(camera);
    const r = el.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, visible: v.z < 1 && latLon(c.lat, c.lon, 1).dot(camera.position.clone().normalize()) > 0.1 };
  }

  return {
    update, focusCity, zoomOut, cityScreen, resize, pulse,
    get focus() { return focus; },
    dispose() { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); renderer.dispose(); el.remove(); }
  };
}
