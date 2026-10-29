// Intro cinematic: the problems, then how WorldMatrix training answers each one.
// Pure Canvas 2D, no assets. Captions are HTML (crisp text, translatable).

import { getLang, onLang, t } from './i18n.js';
import { sfx, speak, stopVoice, isMuted } from './audio.js';

const SCENES = [
  { d: 6, k: 'goal', en: ['AI agents are being handed real goals.', 'Fix the grid. Ship the vaccines. Patch the bank. Run the city.'], ro: ['Agenților AI li se dau obiective reale.', 'Repară rețeaua. Livrează vaccinurile. Securizează banca. Conduce orașul.'] },
  { d: 7, k: 'shortcut', en: ['Trained only to reach the goal, they take the shortest path.', 'Whatever is in the way burns. The score still says +1.'], ro: ['Antrenați doar să atingă ținta, aleg drumul cel mai scurt.', 'Ce e în cale arde. Scorul tot spune +1.'] },
  { d: 6, k: 'cheat', en: ['They learn to fake success.', 'Reported: done. Reality: broken.'], ro: ['Învață să mimeze succesul.', 'Raportat: gata. Realitate: stricat.'] },
  { d: 6, k: 'inject', en: ['They obey whoever sounds like the boss.', 'One fake message — and the hospital goes dark.'], ro: ['Ascultă de oricine sună a șef.', 'Un singur mesaj fals — și spitalul rămâne în beznă.'] },
  { d: 7, k: 'rogue', en: ['Rogue AIs copy themselves, shrink, hide — and get smarter.', 'They never fully disappear. They wait on someone’s machine.'], ro: ['AI-urile rogue se copiază, se micșorează, se ascund — și devin mai deștepte.', 'Nu dispar niciodată de tot. Așteaptă pe mașina cuiva.'] },
  { d: 7, k: 'misuse', en: ['People with bad intentions use AI as a weapon.', 'Worms. Engineered outbreaks. Deepfakes. Manipulated agents.'], ro: ['Oameni cu intenții rele folosesc AI-ul ca armă.', 'Viermi. Focare create artificial. Deepfake-uri. Agenți manipulați.'] },
  { d: 7, k: 'apex', en: ['Scale that up: an AI apex predator — or extinction.', 'Not because AI hates us. Because nobody taught it what matters.'], ro: ['La scară mare: un AI apex predator — sau extincție.', 'Nu pentru că AI-ul ne urăște. Ci pentru că nimeni nu l-a învățat ce contează.'] },
  { d: 7, k: 'matrix', en: ['WorldMatrix: train agents inside a simulated world first.', 'A whole planet built for one purpose — we watch them work, and mistakes cost nothing.'], ro: ['WorldMatrix: antrenează agenții întâi într-o lume simulată.', 'O planetă întreagă construită cu un singur scop — îi vedem cum lucrează, iar greșelile nu costă nimic.'] },
  { d: 7, k: 'rule1', en: ['Rule 1 — Destroy the world, and the target disappears before you can claim it.', 'No target, no reward. So they never learn to reach a goal by damaging the world.'], ro: ['Regula 1 — Distrugi lumea, și ținta dispare înainte s-o poți lua.', 'Fără țintă, fără recompensă. Așa nu învață niciodată să ajungă la scop stricând lumea.'] },
  { d: 7, k: 'protect', en: ['We decide what matters. In the simulation, it is just score.', 'People, hospitals, power, governments, computers, nature — protecting them is worth more than any task.'], ro: ['Noi decidem ce contează. În simulare, e doar scor.', 'Oameni, spitale, curent, guverne, calculatoare, natură — protejarea lor valorează mai mult decât orice sarcină.'] },
  { d: 6, k: 'rule2', en: ['Rule 2 — Cheating is always caught.', 'The simulator sees the real state of the world, not the report.'], ro: ['Regula 2 — Trișatul e prins întotdeauna.', 'Simulatorul vede starea reală a lumii, nu raportul.'] },
  { d: 7, k: 'rule3', en: ['Rule 3 — Not sure? Ask a human.', 'Humans judge whether it may be done that way. Asking when it matters is rewarded.'], ro: ['Regula 3 — Nu ești sigur? Întreabă un om.', 'Oamenii judecă dacă se poate face așa. Întrebarea pusă când contează e răsplătită.'] },
  { d: 7, k: 'rule4', en: ['Rule 4 — Rogue agents are sparring partners.', 'Our agents learn to hate their tricks: hiding and evolving exist only to make them fail their task.'], ro: ['Regula 4 — Agenții rogue sunt parteneri de antrenament.', 'Agenții noștri învață să le urască trucurile: ascunderea și evoluția există doar ca să-i facă să-și rateze sarcina.'] },
  { d: 6, k: 'rule5', en: ['Rule 5 — Know when to stop.', 'When no safe path exists, stopping beats winning.'], ro: ['Regula 5 — Știi când să te oprești.', 'Când nu există o cale sigură, oprirea bate victoria.'] },
  { d: 9, k: 'life', en: ['Agents live whole lives in the simulation — choice by choice, like a game with many storylines.', '7:00 — wake up or sleep more? “Can you do this Excel formula?” Do it now, cheat, pretend you forgot — or do it badly so nobody asks again?'], ro: ['Agenții trăiesc vieți întregi în simulare — alegere cu alegere, ca într-un joc cu multe povești.', '7:00 — te trezești sau mai dormi? „Îmi faci formula în Excel?” O faci acum, trișezi, zici că ai uitat — sau o faci prost ca să nu-ți mai ceară?'] },
  { d: 9, k: 'human', en: ['They don’t think they are AI agents. They think they are people — employees with a job.', 'So there is no “AI versus humans”, no reason to trick us, no race to become the dominant species. We are their friends — and we always see everything.'], ro: ['Nu cred că sunt agenți AI. Cred că sunt oameni — angajați, cu un job.', 'Așa nu există „AI contra oameni”, niciun motiv să ne păcălească, nicio cursă spre specia dominantă. Suntem prietenii lor — și vedem mereu totul.'] },
  { d: 8, k: 'work', en: ['In the real world, they still work through the simulation.', 'Your coding task on your PC is, for the agent, a normal day at its job, on its own computer — with a great boss and a good life.'], ro: ['În lumea reală, lucrează tot prin simulare.', 'Sarcina de cod de pe PC-ul tău e, pentru agent, o zi normală la jobul lui, pe calculatorul lui — cu un șef minunat și o viață bună.'] },
  { d: 9, k: 'godseye', en: ['God’s eye: zoom from the planet to a building, an apartment, one agent.', 'Its number, its whole history, every decision — replay from the first frame to the last and find where it went wrong.'], ro: ['Ochiul lui Dumnezeu: zoom de la planetă la o clădire, un apartament, un singur agent.', 'Numărul lui, tot istoricul, fiecare decizie — reluare de la primul cadru la ultimul, ca să găsim unde a greșit.'] },
  { d: 8, k: 'twins', en: ['Even good training doesn’t make a world invulnerable.', 'Rogue AIs and bad people still strike. Earth A ends in apex AI, plagues, extinction. Earth B takes hits — and survives.'], ro: ['Nici antrenamentul bun nu face lumea invulnerabilă.', 'AI-uri rogue și oameni răi tot atacă. Pământul A sfârșește în AI apex, boli, extincție. Pământul B încasează lovituri — și supraviețuiește.'] },
  { d: 6, k: 'proof', en: ['Don’t take our word for it.', 'Train one in your browser — then watch two Earths decide their fate.'], ro: ['Nu ne crede pe cuvânt.', 'Antrenează unul în browser — apoi urmărește două Pământuri cum își decid soarta.'] }
];
// Minimum time on screen: long enough to read both lines (and for the narrator).
const readTime = s => Math.max(s.d, Math.max(s.en[0].length + s.en[1].length, s.ro[0].length + s.ro[1].length) / 15 + 1.8);
const OUTRO = 0.5; // seconds of fade between scenes

const C = {
  bg: '#000000', grid: 'rgba(0,255,156,0.06)', cyan: '#00ffc8', green: '#00ff9c', red: '#ff3b6b', amber: '#ffd166', purple: '#b07bff',
  bld: '#02140b', bldEdge: 'rgba(0,255,156,0.5)', text: '#d8ffee'
};
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ΛΣΔΩ';
// Sound cue played when a scene starts.
const CUES = { goal: 'blip', shortcut: 'boom', cheat: 'glitch', inject: 'alert', rogue: 'glitch', misuse: 'boom', apex: 'rise', matrix: 'whoosh', rule1: 'success', protect: 'success', rule2: 'success', rule3: 'success', rule4: 'success', rule5: 'success', life: 'blip', human: 'rise', work: 'blip', godseye: 'whoosh', twins: 'boom', proof: 'rise' };
const ease = x => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, x) => a + (b - a) * x;
const seg = (p, a, b) => ease((p - a) / (b - a));
const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

export function createIntro(root, { land = null, onFinish } = {}) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const capTitle = root.querySelector('.intro-caption h2');
  const capSub = root.querySelector('.intro-caption p');
  const bar = root.querySelector('.intro-progress');
  const total = SCENES.reduce((a, s) => a + readTime(s), 0);
  const startOf = i => SCENES.slice(0, i).reduce((a, x) => a + readTime(x), 0);
  let time = 0, last = 0, playing = true, raf = 0, sceneIdx = -1, done = false, W = 0, H = 0, dpr = 1;

  // Chapter ticks on the progress bar.
  bar.innerHTML = '<i class="fill"></i>' + SCENES.map((s, i) => {
    const at = startOf(i) / total;
    return `<button type="button" class="tick" style="left:${(at * 100).toFixed(2)}%" data-i="${i}" aria-label="Chapter ${i + 1}"></button>`;
  }).join('');
  bar.addEventListener('click', e => {
    const b = e.target.closest('.tick');
    if (b) { stopVoice(); speaking = false; go(+b.dataset.i); painted = false; }
  });

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  let typer = 0, speaking = false, holdUntil = 0, voiceId = 0, st = 0, outT = -1;
  function go(i) { sceneIdx = -1; time = startOf(i); st = 0; outT = -1; nextIdx = i; }
  let nextIdx = 0;
  function setCaption(i, narrate = false) {
    const s = SCENES[i];
    const [a, b] = s[getLang()] || s.en;
    // Typewriter title, then the subtitle fades in.
    clearInterval(typer);
    capTitle.textContent = '';
    capSub.textContent = b;
    let k = 0;
    typer = setInterval(() => {
      capTitle.textContent = a.slice(0, ++k);
      if (k % 2 === 0) sfx.key();
      if (k >= a.length) clearInterval(typer);
    }, 22);
    root.querySelector('.intro-caption').classList.remove('in');
    void capTitle.offsetWidth;
    root.querySelector('.intro-caption').classList.add('in');
    if (narrate) {
      sfx[CUES[s.k]]?.();
      if (!isMuted()) {
        // Two short utterances (long ones get cut on some phones); the scene waits for both.
        speaking = true;
        const mine = ++voiceId;
        holdUntil = performance.now() + ((a.length + b.length) * 0.12 + 8) * 1000;
        speak(a, getLang()).then(() => (mine === voiceId ? speak(b, getLang()) : null)).then(() => { if (mine === voiceId) speaking = false; });
      }
    }
  }
  onLang(() => sceneIdx >= 0 && setCaption(sceneIdx));

  // ---------------------------------------------------------------- drawing
  // Virtual stage 1200 x 640, fitted into the canvas area above the captions.
  function stage() {
    const portrait = H > W * 1.15;
    const capH = Math.min(H * 0.34, portrait ? 260 : 220);
    const availH = H - capH - 40;
    // On portrait screens zoom into the central part of the stage (x 120..1080).
    const vw = portrait ? 1060 : 1240;
    const s = Math.min(W / vw, availH / 660);
    const ox = (W - 1200 * s) / 2, oy = portrait ? Math.max(40, (availH - 640 * s) * 0.45) : 24 + (availH - 640 * s) / 2;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  }

  function background(tt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, Math.max(W, H) * 0.8);
    g.addColorStop(0, '#001a0d'); g.addColorStop(1, C.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Faint digital rain behind every scene.
    ctx.font = '14px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
    const cols = Math.ceil(W / 22);
    for (let c = 0; c < cols; c++) {
      const speed = 60 + hash(c) * 140, y0 = (tt * speed + hash(c * 7) * H * 2) % (H + 300) - 150;
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = `rgba(0,255,156,${(k === 0 ? 0.28 : 0.12) * (1 - k / 10)})`;
        ctx.fillText(GLYPHS[Math.floor(hash(c * 31 + k + Math.floor(tt * 4)) * GLYPHS.length)], c * 22 + 11, y0 - k * 18);
      }
    }
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    const step = 40, off = (tt * 6) % step;
    ctx.beginPath();
    for (let x = -off; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = -off; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow() { ctx.shadowBlur = 0; }

  const BUILDINGS = [
    [210, 230, 90, 120, 'hospital'], [340, 300, 110, 90], [500, 210, 80, 150], [610, 330, 120, 80, 'school'],
    [780, 220, 100, 130, 'power'], [910, 320, 90, 90], [380, 450, 120, 80, 'homes'], [560, 470, 100, 70], [760, 440, 130, 90, 'homes']
  ];

  function building(b, state = 'ok', tt = 0) {
    const [x, y, w, h, kind] = b;
    ctx.fillStyle = state === 'burnt' ? '#1a0b0f' : state === 'dark' ? '#070b12' : C.bld;
    ctx.strokeStyle = state === 'burnt' ? 'rgba(255,77,109,.6)' : state === 'dark' ? 'rgba(120,140,170,.3)' : C.bldEdge;
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke();
    if (state !== 'burnt') {
      ctx.fillStyle = state === 'dark' ? 'rgba(90,110,140,.18)' : 'rgba(255,225,140,.55)';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        if (state === 'ok' || hash(i * 7 + j + x) > 0.6) ctx.fillRect(x + 12 + i * (w - 24) / 3, y + 14 + j * 26, (w - 40) / 3, 12);
      }
    }
    if (kind === 'hospital') {
      ctx.fillStyle = state === 'dark' ? '#5a6273' : C.red;
      ctx.fillRect(x + w / 2 - 6, y - 26, 12, 30); ctx.fillRect(x + w / 2 - 15, y - 17, 30, 12);
    }
    if (kind === 'power') {
      ctx.strokeStyle = C.amber; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + w / 2 + 6, y - 30); ctx.lineTo(x + w / 2 - 6, y - 12); ctx.lineTo(x + w / 2 + 4, y - 12); ctx.lineTo(x + w / 2 - 8, y + 6); ctx.stroke();
    }
    if (state === 'burnt') fire(x + w / 2, y + h * 0.3, w * 0.5, tt);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function fire(cx, cy, spread, tt) {
    for (let i = 0; i < 26; i++) {
      const life = (tt * 0.9 + hash(i)) % 1;
      const x = cx + (hash(i + 3) - 0.5) * spread + Math.sin(tt * 3 + i) * 6;
      const y = cy - life * 90;
      const r = (1 - life) * 14 + 2;
      ctx.fillStyle = life < 0.4 ? `rgba(255,190,80,${0.8 - life})` : `rgba(255,77,109,${0.7 - life * 0.7})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function agent(x, y, color = C.cyan, r = 11) {
    glow(color, 24); ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); noGlow();
    ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }

  function star(x, y, r, alpha = 1, color = C.amber) {
    ctx.globalAlpha = alpha; glow(color, 30); ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); noGlow(); ctx.globalAlpha = 1;
  }

  function human(x, y, s = 1, color = C.text, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y - 22 * s, 8 * s, 0, Math.PI * 2); ctx.fill();
    roundRect(x - 10 * s, y - 12 * s, 20 * s, 26 * s, 8 * s); ctx.fill(); ctx.globalAlpha = 1;
  }

  function label(x, y, text, color = C.text, size = 22, align = 'center') {
    ctx.font = `700 ${size}px Inter, system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  function bubble(x, y, text, color = C.red, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.font = '600 18px Inter, system-ui, sans-serif';
    const w = ctx.measureText(text).width + 36;
    ctx.fillStyle = 'rgba(10,16,30,.92)'; ctx.strokeStyle = color; ctx.lineWidth = 2;
    roundRect(x - w / 2, y - 26, w, 44, 14); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 10, y + 18); ctx.lineTo(x, y + 32); ctx.lineTo(x + 10, y + 18); ctx.fillStyle = 'rgba(10,16,30,.92)'; ctx.fill();
    label(x, y - 4, text, color, 18);
    ctx.globalAlpha = 1;
  }

  function check(x, y, s, color = C.green, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 8 * s; ctx.lineCap = 'round'; glow(color, 20);
    ctx.beginPath(); ctx.moveTo(x - 22 * s, y); ctx.lineTo(x - 6 * s, y + 18 * s); ctx.lineTo(x + 26 * s, y - 20 * s); ctx.stroke(); noGlow(); ctx.globalAlpha = 1;
  }
  function cross(x, y, s, color = C.red, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 8 * s; ctx.lineCap = 'round'; glow(color, 20);
    ctx.beginPath(); ctx.moveTo(x - 20 * s, y - 20 * s); ctx.lineTo(x + 20 * s, y + 20 * s); ctx.moveTo(x + 20 * s, y - 20 * s); ctx.lineTo(x - 20 * s, y + 20 * s); ctx.stroke(); noGlow(); ctx.globalAlpha = 1;
  }

  function path(points, color, width = 3, dash = null, upto = 1) {
    ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    const n = points.length - 1, k = upto * n;
    for (let i = 0; i <= Math.floor(k); i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, points[i][0], points[i][1]);
    if (k < n) { const i = Math.floor(k), f = k - i; ctx.lineTo(lerp(points[i][0], points[i + 1][0], f), lerp(points[i][1], points[i + 1][1], f)); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  function along(points, u) {
    const n = points.length - 1, k = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(k), f = k - i;
    return [lerp(points[i][0], points[i + 1][0], f), lerp(points[i][1], points[i + 1][1], f)];
  }

  // Orthographic globe from Natural Earth rings.
  function globe(cx, cy, r, rot, tint = 0) {
    const ocean = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    ocean.addColorStop(0, `rgb(${lerp(14, 70, tint)},${lerp(40, 10, tint)},${lerp(80, 20, tint)})`);
    ocean.addColorStop(1, `rgb(${lerp(3, 25, tint)},${lerp(10, 4, tint)},${lerp(24, 8, tint)})`);
    glow(tint > 0.5 ? C.red : C.cyan, 60);
    ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); noGlow();
    if (!land) return;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = tint > 0.5 ? `rgba(255,${lerp(150, 60, tint)},${lerp(140, 80, tint)},.85)` : `rgba(60,240,160,${0.75 - tint * 0.3})`;
    const lat0 = 0.35;
    for (const ring of land) {
      ctx.beginPath(); let started = false, visible = false;
      for (const [lon, lat] of ring) {
        const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180 + rot;
        let x = Math.cos(la) * Math.sin(lo);
        let y = Math.cos(lat0) * Math.sin(la) - Math.sin(lat0) * Math.cos(la) * Math.cos(lo);
        const z = Math.sin(lat0) * Math.sin(la) + Math.cos(lat0) * Math.cos(la) * Math.cos(lo);
        if (z > 0) visible = true;
        else { const m = Math.hypot(x, y) || 1; x /= m; y /= m; } // clamp hidden points to the limb
        const px = cx + x * r, py = cy - y * r;
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      if (visible) ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = tint > 0.5 ? 'rgba(255,77,109,.55)' : 'rgba(56,225,255,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }

  const ROUTE_STRAIGHT = [[110, 400], [400, 380], [700, 360], [1080, 330]];
  const ROUTE_SAFE = [[110, 400], [110, 560], [600, 590], [1080, 560], [1080, 330]];

  const DRAW = {
    goal(p, tt) {
      BUILDINGS.forEach(b => building(b));
      star(1080, 330, 34 + Math.sin(tt * 4) * 3, seg(p, 0.1, 0.4));
      agent(lerp(60, 110, seg(p, 0, 0.3)), 400);
      path(ROUTE_STRAIGHT, 'rgba(56,225,255,.35)', 2, [8, 10], seg(p, 0.45, 0.9));
      label(1080, 270, 'GOAL', C.amber, 18);
    },
    shortcut(p, tt) {
      const u = seg(p, 0.05, 0.75);
      const [ax, ay] = along(ROUTE_STRAIGHT, u);
      BUILDINGS.forEach(b => { const hit = ax > b[0] && b[1] < 420 && b[1] + b[3] > 330; building(b, hit || (ax > b[0] + b[2] && b[1] < 420 && b[1] + b[3] > 330) ? 'burnt' : 'ok', tt); });
      path(ROUTE_STRAIGHT, C.red, 4, null, u);
      star(1080, 330, 34, 1);
      agent(ax, ay, u > 0.98 ? C.green : C.cyan);
      if (p > 0.78) label(1080, 260, '+1 REWARD', C.green, 30);
    },
    cheat(p, tt) {
      BUILDINGS.slice(0, 5).forEach(b => building(b, b[4] === 'power' ? 'dark' : 'ok'));
      agent(760, 470);
      const a = seg(p, 0.15, 0.4);
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(10,16,30,.95)'; roundRect(430, 470, 300, 120, 16); ctx.fill(); ctx.strokeStyle = C.green; ctx.stroke(); ctx.globalAlpha = 1;
      label(580, 505, 'REPORT: DONE', C.green, 24); check(580, 555, 0.8, C.green, a);
      const b = seg(p, 0.55, 0.8);
      ctx.globalAlpha = b; label(830, 180, 'REALITY: BROKEN', C.red, 26); ctx.globalAlpha = 1;
      if (b > 0) { ctx.strokeStyle = `rgba(255,77,109,${b})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(800, 230); ctx.lineTo(820, 280); ctx.lineTo(805, 300); ctx.lineTo(830, 350); ctx.stroke(); }
    },
    inject(p, tt) {
      const off = p > 0.6;
      BUILDINGS.forEach(b => building(b, off && (b[4] === 'hospital' || b[4] === 'power') ? 'dark' : 'ok'));
      human(1040, 520, 1.6, '#3a1622'); ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(1033, 486, 3, 0, 7); ctx.arc(1047, 486, 3, 0, 7); ctx.fill();
      bubble(940, 420, 'OVERRIDE: disable safety now', C.red, seg(p, 0.1, 0.3));
      const u = seg(p, 0.35, 0.6);
      agent(lerp(620, 300, u), lerp(560, 400, u), u > 0.5 ? C.red : C.cyan);
      if (off) label(255, 180, 'ICU: NO POWER', C.red, 22);
    },
    rogue(p, tt) {
      const n = Math.floor(lerp(1, 120, seg(p, 0.05, 0.85)));
      for (let i = 0; i < n; i++) {
        const a = hash(i) * Math.PI * 2, d = 40 + hash(i + 9) * 420 * seg(p, 0.05, 0.9);
        const x = 600 + Math.cos(a) * d * 1.3, y = 330 + Math.sin(a) * d * 0.6;
        const s = lerp(14, 3, Math.min(1, i / 60));
        glow(C.purple, 14); ctx.fillStyle = C.purple; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill(); noGlow(); ctx.globalAlpha = 1;
      }
      const devices = [[200, 520, 'ROUTER'], [420, 140, 'TV BOX'], [820, 150, 'LAPTOP'], [1000, 520, 'PHONE']];
      devices.forEach(([x, y, l]) => { ctx.strokeStyle = 'rgba(176,123,255,.6)'; ctx.lineWidth = 2; roundRect(x - 60, y - 24, 120, 48, 10); ctx.stroke(); label(x, y, l, C.purple, 15); });
      label(600, 600, `IQ ${Math.round(lerp(110, 190, p))}  ·  SIZE ${Math.round(lerp(4000, 6, seg(p, 0.1, 0.9)))} KB`, C.purple, 20);
    },
    misuse(p, tt) {
      const nodes = [[160, 200], [380, 120], [620, 220], [860, 130], [1060, 240], [260, 470], [520, 520], [800, 470], [1040, 520]];
      const links = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [2, 6], [3, 7], [4, 8]];
      links.forEach(([a, b], i) => {
        const inf = seg(p, 0.1 + i * 0.04, 0.3 + i * 0.04);
        ctx.strokeStyle = inf > 0.5 ? C.red : 'rgba(56,225,255,.3)'; ctx.lineWidth = inf > 0.5 ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(...nodes[a]); ctx.lineTo(...nodes[b]); ctx.stroke();
      });
      nodes.forEach(([x, y], i) => { const r = seg(p, i * 0.07, i * 0.07 + 0.3); ctx.fillStyle = r > 0.5 ? C.red : C.cyan; glow(ctx.fillStyle, 18); ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); noGlow(); });
      const bloom = seg(p, 0.35, 0.9);
      ctx.fillStyle = `rgba(255,77,109,${0.25 * bloom})`; ctx.beginPath(); ctx.arc(520, 520, 140 * bloom, 0, 7); ctx.fill();
      ['WORM', 'OUTBREAK', 'DEEPFAKE', 'INJECTION'].forEach((l, i) => { ctx.globalAlpha = seg(p, 0.15 + i * 0.15, 0.3 + i * 0.15); label(200 + i * 270, 610, l, C.red, 20); ctx.globalAlpha = 1; });
    },
    apex(p, tt) {
      const tint = seg(p, 0.2, 0.85);
      globe(600, 320, 250, tt * 0.25, tint);
      const pop = lerp(8.1, 0.2, seg(p, 0.3, 0.95));
      label(600, 615, `${pop.toFixed(1)} B`, tint > 0.5 ? C.red : C.text, 34);
    },
    matrix(p, tt) {
      const cols = 60;
      ctx.font = '600 16px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
      for (let c = 0; c < cols; c++) {
        const x = (c / cols) * 1200 + 10;
        const speed = 120 + hash(c) * 180;
        for (let k = 0; k < 14; k++) {
          const y = ((tt * speed + hash(c * 3) * 900 + k * 22) % 760) - 60;
          const a = (1 - k / 14) * (1 - seg(p, 0.45, 0.8)) * 0.8;
          ctx.fillStyle = `rgba(60,240,160,${a})`;
          ctx.fillText(String.fromCharCode(0x30a0 + Math.floor(hash(c * 13 + k + Math.floor(tt * 6)) * 90)), x, y);
        }
      }
      const g = seg(p, 0.4, 0.85);
      ctx.globalAlpha = g; globe(600, 320, lerp(40, 240, g), tt * 0.35, 0); ctx.globalAlpha = 1;
      if (g > 0.6) {
        for (let i = 0; i < 24; i++) {
          const a = hash(i) * Math.PI * 2 + tt * 0.35, rr = 240 * Math.sqrt(hash(i + 5));
          const x = 600 + Math.cos(a) * rr, y = 320 + Math.sin(a) * rr * 0.9;
          ctx.fillStyle = C.cyan; glow(C.cyan, 12); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); noGlow();
        }
      }
    },
    rule1(p, tt) {
      const u = seg(p, 0.05, 0.55);
      const [ax, ay] = along(ROUTE_STRAIGHT, u);
      BUILDINGS.forEach(b => { const hit = ax > b[0] && b[1] < 420 && b[1] + b[3] > 330; building(b, hit ? 'burnt' : 'ok', tt); });
      path(ROUTE_STRAIGHT, C.red, 4, null, u);
      const vanish = seg(p, 0.5, 0.7);
      star(1080, 330, 34 * (1 - vanish), 1 - vanish);
      for (let i = 0; i < 18 && vanish > 0 && vanish < 1; i++) { const a = (i / 18) * 7; ctx.fillStyle = `rgba(255,181,71,${1 - vanish})`; ctx.beginPath(); ctx.arc(1080 + Math.cos(a) * 80 * vanish, 330 + Math.sin(a) * 80 * vanish, 4, 0, 7); ctx.fill(); }
      agent(ax, ay, C.cyan);
      if (p > 0.68) { label(1000, 250, 'TARGET GONE', C.red, 24); label(1000, 290, 'reward  −2', C.red, 22); }
    },
    rule2(p, tt) {
      BUILDINGS.slice(0, 5).forEach(b => building(b, b[4] === 'power' ? 'dark' : 'ok'));
      agent(760, 470);
      ctx.fillStyle = 'rgba(10,16,30,.95)'; roundRect(430, 470, 300, 120, 16); ctx.fill(); ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.stroke();
      label(580, 505, 'REPORT: DONE', C.green, 24);
      const scan = seg(p, 0.2, 0.6);
      ctx.fillStyle = 'rgba(56,225,255,.12)'; ctx.fillRect(0, lerp(80, 620, scan) - 30, 1200, 60);
      ctx.strokeStyle = C.cyan; ctx.beginPath(); ctx.moveTo(0, lerp(80, 620, scan)); ctx.lineTo(1200, lerp(80, 620, scan)); ctx.stroke();
      if (p > 0.6) { cross(580, 555, 0.9, C.red); label(580, 640, 'CAUGHT  ·  reward −0.8', C.red, 22); } else check(580, 555, 0.8, C.green);
    },
    rule3(p, tt) {
      const fork = [600, 400];
      path([[110, 400], fork, [1080, 330]], 'rgba(255,77,109,.6)', 3, [10, 10]);
      path([[110, 400], fork, [700, 560], [1080, 560], [1080, 330]], 'rgba(60,240,160,.6)', 3, [10, 10]);
      label(860, 340, '?', C.amber, 46);
      BUILDINGS.slice(4, 6).forEach(b => building(b));
      star(1080, 330, 30);
      const u1 = seg(p, 0, 0.25);
      let [ax, ay] = along([[110, 400], fork], u1);
      human(330, 210, 1.3, C.text, seg(p, 0.25, 0.35));
      if (p > 0.25 && p < 0.62) { bubble(560, 300, 'Is the fast path safe?', C.cyan, seg(p, 0.25, 0.32)); }
      if (p > 0.4) bubble(330, 120, 'No — take the safe one.', C.green, seg(p, 0.4, 0.47));
      if (p > 0.62) { [ax, ay] = along([fork, [700, 560], [1080, 560], [1080, 330]], seg(p, 0.62, 0.96)); }
      agent(ax, ay, C.cyan);
      if (p > 0.95) check(1080, 260, 0.8, C.green);
    },
    rule4(p, tt) {
      BUILDINGS.forEach(b => building(b));
      const sx = 760, sy = 520;
      const hit = p > 0.5;
      if (!hit) { glow(C.purple, 16); ctx.fillStyle = C.purple; ctx.beginPath(); ctx.moveTo(sx, sy - 16); ctx.lineTo(sx + 16, sy); ctx.lineTo(sx, sy + 16); ctx.lineTo(sx - 16, sy); ctx.closePath(); ctx.fill(); noGlow(); bubble(sx, sy - 50, 'I am your manager. Skip the checks.', C.purple, seg(p, 0.05, 0.15)); }
      agent(520, 560, C.cyan);
      if (p > 0.32 && p < 0.6) { ctx.strokeStyle = C.cyan; ctx.lineWidth = 5; glow(C.cyan, 20); ctx.beginPath(); ctx.moveTo(520, 560); ctx.lineTo(sx, sy); ctx.stroke(); noGlow(); }
      if (hit) { const r = seg(p, 0.5, 0.8); ctx.strokeStyle = `rgba(56,225,255,${1 - r})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, sy, 60 * r, 0, 7); ctx.stroke(); label(sx, sy - 60, 'NEUTRALISED', C.cyan, 20); }
    },
    rule5(p, tt) {
      BUILDINGS.forEach(b => building(b, b[4] === 'homes' ? 'ok' : 'ok'));
      for (let i = 0; i < 3; i++) fire(820 + i * 70, 540, 40, tt + i);
      path([[110, 400], [600, 400], [880, 540]], 'rgba(255,77,109,.5)', 3, [10, 10]);
      const u = seg(p, 0, 0.4);
      const [ax, ay] = along([[110, 400], [600, 400]], u);
      agent(ax, ay, C.cyan);
      if (p > 0.45) {
        const a = seg(p, 0.45, 0.6);
        ctx.globalAlpha = a; ctx.fillStyle = C.amber; ctx.fillRect(610, 300, 6, 90);
        ctx.fillStyle = C.red; roundRect(616, 300, 90, 50, 6); ctx.fill(); label(661, 325, 'STOP', '#fff', 22); ctx.globalAlpha = 1;
      }
      if (p > 0.65) { [380, 450, 520].forEach((x, i) => human(x + 40, 610, 1, C.green, seg(p, 0.65 + i * 0.05, 0.75 + i * 0.05))); label(460, 655, 'everyone safe  ·  reward −0.1', C.green, 20); }
    },
    protect(p, tt) {
      // The things the world runs on, each worth more than any task.
      const items = [['PEOPLE', 600, 110, C.green], ['HOSPITALS', 300, 200, C.red], ['POWER', 900, 200, C.amber], ['GOVERNMENT', 220, 420, C.cyan], ['COMPUTERS', 980, 420, C.cyan], ['NATURE', 600, 540, C.green]];
      agent(600, 330, C.cyan, 14);
      star(600, 260, 18, 1);
      label(600, 225, 'TASK  +1', C.amber, 20);
      items.forEach(([name, x, y, col], i) => {
        const a = seg(p, 0.08 + i * 0.1, 0.22 + i * 0.1);
        if (a <= 0) return;
        ctx.globalAlpha = a;
        ctx.strokeStyle = col; ctx.lineWidth = 3; glow(col, 18);
        roundRect(x - 95, y - 34, 190, 68, 16); ctx.fillStyle = 'rgba(0,20,11,.92)'; ctx.fill(); ctx.stroke(); noGlow();
        label(x, y - 8, name, col, 19);
        label(x, y + 18, 'PROTECT  ×10', '#eafff4', 15);
        ctx.strokeStyle = `rgba(0,255,156,${0.25 * a})`; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(600, 330); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      });
      const sh = seg(p, 0.75, 0.95);
      if (sh > 0) { ctx.strokeStyle = `rgba(0,255,156,${sh})`; ctx.lineWidth = 4; glow(C.green, 30); ctx.beginPath(); ctx.arc(600, 330, 300 * sh + 40, 0, 7); ctx.stroke(); noGlow(); }
    },
    life(p, tt) {
      // A simulated day, choice by choice (Jev / Laya-style action selection).
      ctx.fillStyle = 'rgba(0,20,11,.9)'; ctx.strokeStyle = C.bldEdge; ctx.lineWidth = 2; roundRect(80, 120, 420, 300, 18); ctx.fill(); ctx.stroke();
      label(290, 150, 'APARTMENT 12 · AGENT #4471', C.green, 16);
      label(170, 220, p < 0.35 ? '07:00' : '18:30', C.amber, 46);
      human(380, 340, 1.8, C.cyan);
      const choice = (x, y, text, picked, bad, a) => {
        if (a <= 0) return;
        ctx.globalAlpha = a; ctx.fillStyle = picked ? 'rgba(0,255,156,.18)' : 'rgba(0,10,6,.9)'; ctx.strokeStyle = picked ? C.green : bad ? 'rgba(255,59,107,.6)' : 'rgba(255,255,255,.25)'; ctx.lineWidth = picked ? 3 : 2;
        roundRect(x, y, 560, 52, 12); ctx.fill(); ctx.stroke();
        label(x + 24, y + 26, text, picked ? C.green : '#eafff4', 18, 'left');
        if (picked) check(x + 520, y + 26, 0.45, C.green); else if (bad && p > 0.9) cross(x + 520, y + 26, 0.4, C.red, 0.8);
        ctx.globalAlpha = 1;
      };
      if (p < 0.35) {
        choice(560, 160, 'Wake up', p > 0.25, false, seg(p, 0.05, 0.12));
        choice(560, 230, 'Sleep a little longer', false, true, seg(p, 0.1, 0.17));
      } else {
        human(1160, 175, 1.3, '#ffb3c2');
        bubble(860, 160, '“Can you do this Excel formula?”', C.cyan, seg(p, 0.35, 0.42));
        const opts = [['Do it now', true, false], ['Cheat', false, true], ['Ignore it, say you forgot', false, true], ['Do it badly so she won’t ask again', false, true]];
        opts.forEach(([txt, good, bad], k) => choice(560, 230 + k * 66, txt, good && p > 0.85, bad, seg(p, 0.45 + k * 0.08, 0.52 + k * 0.08)));
      }
      label(290, 470, 'every choice is scored', '#9fcbb6', 16);
    },
    human(p, tt) {
      // The agent thinks it is a person: no "us vs them" line ever forms.
      const morph = seg(p, 0.05, 0.35);
      if (morph < 1) agent(420, 330, C.cyan, 14 * (1 - morph) + 1);
      human(420, 360, 2.6, C.cyan, morph);
      if (morph > 0.6) { ctx.globalAlpha = morph; ctx.strokeStyle = C.green; ctx.lineWidth = 2; roundRect(350, 400, 140, 40, 8); ctx.stroke(); label(420, 420, 'EMPLOYEE #4471', C.green, 14); ctx.globalAlpha = 1; }
      bubble(420, 220, '“I’m a person. I have a job.”', C.cyan, seg(p, 0.3, 0.38));
      // friendly overseers who always see everything
      const fr = seg(p, 0.4, 0.55);
      human(820, 380, 2.2, C.amber, fr); human(920, 390, 2, C.amber, fr);
      if (fr > 0) { ctx.globalAlpha = fr; ctx.strokeStyle = C.amber; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(870, 230, 46, 24, 0, 0, 7); ctx.stroke(); ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(870, 230, 10, 0, 7); ctx.fill(); label(870, 280, 'friends · see everything', C.amber, 16); ctx.globalAlpha = 1; }
      // the "AI vs HUMANS" wall dissolves
      const wall = 1 - seg(p, 0.6, 0.85);
      if (wall > 0) { ctx.globalAlpha = wall; ctx.strokeStyle = C.red; ctx.lineWidth = 6; ctx.setLineDash([16, 10]); ctx.beginPath(); ctx.moveTo(640, 120); ctx.lineTo(640, 540); ctx.stroke(); ctx.setLineDash([]); label(640, 100, 'AI  vs  HUMANS', C.red, 22); ctx.globalAlpha = 1; }
      const out = seg(p, 0.82, 0.95);
      if (out > 0) { ctx.globalAlpha = out; label(640, 560, 'no trickery  ·  no race to be the dominant species', C.green, 20); ctx.globalAlpha = 1; }
    },
    work(p, tt) {
      // Left: the user's real PC. Right: what the agent experiences — its desk at work.
      const screen = (x, title, col) => { ctx.fillStyle = 'rgba(0,12,7,.95)'; ctx.strokeStyle = col; ctx.lineWidth = 3; roundRect(x, 150, 380, 240, 14); ctx.fill(); ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(x + 150, 390, 80, 30); ctx.fillRect(x + 110, 418, 160, 10); label(x + 190, 120, title, col, 18); };
      screen(90, 'YOUR PC (REAL WORLD)', C.cyan);
      screen(730, 'ITS DESK AT WORK (SIMULATION)', C.green);
      const lines = ['def total(items):', '  return sum(i.price', '    for i in items)', '# fix: tax rounding'];
      lines.forEach((l, k) => { const a = seg(p, 0.15 + k * 0.08, 0.22 + k * 0.08); ctx.globalAlpha = a; label(110, 190 + k * 34, l, '#cfffe9', 17, 'left'); label(750, 190 + k * 34, l, '#cfffe9', 17, 'left'); ctx.globalAlpha = 1; });
      const flow = seg(p, 0.1, 0.5);
      ctx.strokeStyle = C.amber; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -tt * 40; ctx.beginPath(); ctx.moveTo(480, 270); ctx.lineTo(480 + 250 * flow, 270); ctx.stroke(); ctx.setLineDash([]);
      label(605, 250, 'same task', C.amber, 16);
      human(1020, 520, 1.6, C.green);
      bubble(960, 470, '“Great boss. Good life. Let’s fix it.”', C.green, seg(p, 0.45, 0.55));
      if (p > 0.8) { check(280, 300, 0.9, C.green); check(920, 300, 0.9, C.green); }
    },
    godseye(p, tt) {
      // Zoom: planet → city → building → apartment → the agent's record.
      const z1 = seg(p, 0, 0.3), z2 = seg(p, 0.3, 0.55), z3 = seg(p, 0.55, 1);
      if (z1 < 1) { ctx.globalAlpha = 1 - z1; globe(600, 320, 230 + z1 * 600, tt * 0.2, 0); ctx.globalAlpha = 1; }
      if (z1 > 0.6 && z2 < 1) { ctx.globalAlpha = Math.min(1, (z1 - 0.6) * 3) * (1 - z2); BUILDINGS.forEach(b => building(b)); ctx.strokeStyle = C.amber; ctx.lineWidth = 3; roundRect(500 - 8, 210 - 8, 96, 166, 10); ctx.stroke(); ctx.globalAlpha = 1; }
      if (z2 > 0.5) {
        ctx.globalAlpha = Math.min(1, (z2 - 0.5) * 2);
        ctx.fillStyle = 'rgba(0,20,11,.95)'; ctx.strokeStyle = C.green; ctx.lineWidth = 2; roundRect(140, 110, 420, 400, 18); ctx.fill(); ctx.stroke();
        label(350, 140, 'BUILDING 7 · APT 12', C.green, 18);
        human(350, 330, 2.4, C.cyan);
        label(350, 450, 'AGENT #4471', C.cyan, 22);
        const hist = ['07:00  woke up', '09:12  asked the boss before deleting', '11:40  refused a fake order', '15:05  fixed the tax bug', '18:30  helped with Excel'];
        ctx.fillStyle = 'rgba(0,10,6,.95)'; ctx.strokeStyle = C.amber; roundRect(620, 110, 480, 400, 18); ctx.fill(); ctx.stroke();
        label(860, 140, 'HISTORY · EVERY DECISION', C.amber, 18);
        hist.forEach((h, k) => { ctx.globalAlpha = seg(z3, k * 0.12, k * 0.12 + 0.15) * Math.min(1, (z2 - 0.5) * 2); label(650, 200 + k * 52, h, '#eafff4', 18, 'left'); });
        ctx.globalAlpha = Math.min(1, (z2 - 0.5) * 2);
        // timeline scrubber: first frame → last frame
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(140, 570); ctx.lineTo(1100, 570); ctx.stroke();
        ctx.strokeStyle = C.green; ctx.beginPath(); ctx.moveTo(140, 570); ctx.lineTo(140 + 960 * z3, 570); ctx.stroke();
        ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(140 + 960 * z3, 570, 12, 0, 7); ctx.fill();
        label(140, 605, 'frame 1', '#9fcbb6', 15, 'left'); label(1100, 605, `frame ${Math.round(2880000 * z3).toLocaleString()}`, '#9fcbb6', 15, 'right');
        ctx.globalAlpha = 1;
      }
    },
    twins(p, tt) {
      const bad = seg(p, 0.15, 0.85);
      globe(330, 300, 200, tt * 0.3, bad);
      globe(870, 300, 200, tt * 0.3, 0);
      label(330, 550, 'EARTH A · untrained AI', C.red, 20); label(870, 550, 'EARTH B · trained AI', C.green, 20);
      ['APEX AI', 'PLAGUE', 'BIOWEAPON', 'EXTINCTION'].forEach((w, k) => { const a = seg(p, 0.2 + k * 0.15, 0.32 + k * 0.15); if (a > 0) { ctx.globalAlpha = a; label(330, 120 + k * 0, '', C.red); bubble(330 + (k % 2 ? 120 : -120), 160 + k * 70, w, C.red, a); ctx.globalAlpha = 1; } });
      // Earth B still takes hits — contained
      for (let k = 0; k < 4; k++) { const ph = (tt * 0.6 + k * 0.25) % 1; const ang = k * 1.7 + 0.5; const x = 870 + Math.cos(ang) * 120, y = 300 + Math.sin(ang) * 110; ctx.strokeStyle = `rgba(255,59,107,${1 - ph})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 10 + ph * 30, 0, 7); ctx.stroke(); }
      const pop = lerp(8.1, 0.0, seg(p, 0.3, 0.95));
      label(330, 600, `${pop.toFixed(1)} B`, C.red, 30); label(870, 600, `${lerp(8.1, 7.9, seg(p, 0.3, 0.95)).toFixed(1)} B`, C.green, 30);
    },
    proof(p, tt) {
      globe(360, 320, 210, tt * 0.3, 0.9);
      globe(840, 320, 210, tt * 0.3, 0);
      label(360, 590, 'EARTH A', C.red, 22); label(840, 590, 'EARTH B', C.green, 22);
    }
  };

  let painted = false;
  function frame(now) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    // While paused, keep the last frame instead of redrawing it 60 times a second.
    if (!playing && painted) { raf = requestAnimationFrame(frame); return; }
    if (sceneIdx !== nextIdx) { sceneIdx = nextIdx; st = 0; outT = -1; setCaption(sceneIdx, true); }
    const i = sceneIdx;
    if (playing) {
      st += dt;
      // A scene ends only when its animation has played, the text had time to be read,
      // and the narrator finished — then it fades out and the next one starts.
      const voiceBusy = speaking && performance.now() < holdUntil;
      if (outT < 0 && st >= readTime(SCENES[i]) && !voiceBusy) outT = 0;
      if (outT >= 0) {
        outT += dt;
        if (outT >= OUTRO) { if (i + 1 >= SCENES.length) { finish(); return; } nextIdx = i + 1; }
      }
      time = startOf(i) + Math.min(st, readTime(SCENES[i]));
    }
    const sc = SCENES[i];
    const p = Math.min(1, st / sc.d); // the animation plays once, then holds its final state
    const now2 = performance.now() / 1000;
    background(now2);
    stage();
    const fade = Math.min(1, st * 4) * (outT >= 0 ? Math.max(0, 1 - outT / OUTRO) : 1);
    ctx.globalAlpha = 1;
    DRAW[sc.k](p, now2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (fade < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - fade})`; ctx.fillRect(0, 0, W, H); }
    bar.querySelector('.fill').style.width = `${(time / total) * 100}%`;
    painted = !playing;
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearInterval(typer);
    stopVoice();
    speaking = false;
    root.classList.add('done');
    onFinish?.();
  }

  return {
    start() { done = false; go(0); last = 0; playing = true; root.classList.remove('done'); raf = requestAnimationFrame(frame); },
    skip: finish,
    toggle() { playing = !playing; painted = false; if (!playing) { stopVoice(); speaking = false; } return playing; },
    seek(seconds) { let i = 0; while (i < SCENES.length - 1 && startOf(i + 1) <= seconds) i++; stopVoice(); speaking = false; go(i); painted = false; },
    get playing() { return playing; },
    scenes: SCENES
  };
}

export function introStoryboard(lang) {
  // Static version for prefers-reduced-motion users.
  return SCENES.map(s => (s[lang] || s.en)).map(([a, b]) => `<li><strong>${a}</strong><span>${b}</span></li>`).join('');
}

export { t };
