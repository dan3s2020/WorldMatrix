// Sound design without audio files: Web Audio synthesis + Web Speech narration.
// Browsers only allow sound after a user gesture, so call unlock() from a tap/click.

let ctx = null, master = null, ambientNodes = null, duck = null;
let muted = false;
try { muted = localStorage.getItem('wm-muted') === '1'; } catch { /* ignore */ }
const listeners = new Set();

export const isMuted = () => muted;
export function onMute(fn) { listeners.add(fn); }
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem('wm-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  if (muted) stopVoice();
  listeners.forEach(fn => fn(muted));
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    duck = ctx.createGain();
    duck.gain.value = 1;
    duck.connect(master);
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  // Some mobile browsers need speech to be triggered once inside a gesture.
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(''); u.volume = 0; speechSynthesis.speak(u); } } catch { /* ignore */ }
  return true;
}

const now = () => ctx.currentTime;

function env(node, t0, a, peak, d, end = 0.0001) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(peak, t0 + a);
  node.gain.exponentialRampToValueAtTime(end, t0 + a + d);
}

function tone(freq, { type = 'sine', dur = 0.15, vol = 0.2, attack = 0.005, at = 0, slide = null, out = duck } = {}) {
  if (!ctx || muted) return;
  const t0 = now() + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  env(g, t0, attack, vol, dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + attack + dur + 0.05);
}

let noiseBuf = null;
function noise({ dur = 0.3, vol = 0.2, type = 'bandpass', freq = 1200, q = 1, at = 0, sweep = null } = {}) {
  if (!ctx || muted) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = now() + at;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  env(g, t0, 0.01, vol, dur);
  src.connect(f).connect(g).connect(duck);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

export const sfx = {
  click: () => tone(880, { type: 'square', dur: 0.04, vol: 0.05 }),
  key: () => tone(1500 + Math.random() * 600, { type: 'square', dur: 0.015, vol: 0.025 }),
  blip: () => tone(1320, { type: 'triangle', dur: 0.08, vol: 0.08, slide: 1760 }),
  glitch: () => { noise({ dur: 0.18, vol: 0.25, freq: 2400, q: 6 }); tone(110, { type: 'sawtooth', dur: 0.12, vol: 0.06, slide: 55 }); },
  alert: () => { tone(740, { type: 'square', dur: 0.12, vol: 0.08 }); tone(988, { type: 'square', dur: 0.12, vol: 0.08, at: 0.16 }); },
  success: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.18, vol: 0.09, at: i * 0.07 })),
  fail: () => [392, 311, 233].forEach((f, i) => tone(f, { type: 'sawtooth', dur: 0.22, vol: 0.07, at: i * 0.1 })),
  boom: () => { noise({ dur: 0.9, vol: 0.45, type: 'lowpass', freq: 900, sweep: 60 }); tone(70, { dur: 0.8, vol: 0.4, slide: 30 }); },
  whoosh: () => noise({ dur: 1.1, vol: 0.18, freq: 300, q: 1.5, sweep: 4000 }),
  rise: () => tone(110, { type: 'sawtooth', dur: 1.4, vol: 0.06, slide: 880 }),
  vote: () => { tone(660, { type: 'triangle', dur: 0.07, vol: 0.08 }); tone(990, { type: 'triangle', dur: 0.09, vol: 0.08, at: 0.06 }); },
  scan: () => tone(2000, { type: 'sine', dur: 0.25, vol: 0.05, slide: 600 })
};

/** Low cinematic drone with slow movement; call once after unlock(). */
export function ambient(on = true) {
  if (!ctx) return;
  if (!on) {
    if (ambientNodes) { ambientNodes.g.gain.setTargetAtTime(0.0001, now(), 0.6); const n = ambientNodes; setTimeout(() => n.oscs.forEach(o => o.stop()), 2500); ambientNodes = null; }
    return;
  }
  if (ambientNodes) return;
  const g = ctx.createGain(); g.gain.value = 0.0001;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 4;
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = 0.07; lfoGain.gain.value = 220;
  lfo.connect(lfoGain).connect(lp.frequency);
  const oscs = [55, 55.4, 82.4, 110.2].map((f, i) => { const o = ctx.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
  lfo.start(); oscs.push(lfo);
  lp.connect(g).connect(duck);
  g.gain.setTargetAtTime(0.05, now(), 2);
  ambientNodes = { g, oscs };
}

// ---------------------------------------------------------------- narration
let voices = [];
const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch { voices = []; } };
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

function pickVoice(lang) {
  const want = lang === 'ro' ? ['ro-RO', 'ro'] : ['en-US', 'en-GB', 'en'];
  for (const w of want) {
    const vs = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(w.toLowerCase()));
    // Prefer deeper / higher-quality voices when the platform names them.
    const good = vs.find(v => /google|natural|premium|enhanced|daniel|male/i.test(v.name));
    if (good || vs[0]) return good || vs[0];
  }
  return null;
}

export const voiceAvailable = () => 'speechSynthesis' in window;

/** Speak a line. Resolves when finished (or immediately when muted/unavailable). */
export function speak(text, lang = 'en', { rate = 0.95, pitch = 0.75 } = {}) {
  return new Promise(resolve => {
    if (muted || !('speechSynthesis' in window) || !text) return resolve();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(lang);
      if (v) u.voice = v;
      u.lang = v?.lang || (lang === 'ro' ? 'ro-RO' : 'en-US');
      u.rate = rate; u.pitch = pitch; u.volume = 1;
      if (duck) duck.gain.setTargetAtTime(0.45, now(), 0.15);
      const done = () => { if (duck) duck.gain.setTargetAtTime(1, now(), 0.4); resolve(); };
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
      setTimeout(done, Math.max(15000, text.length * 120)); // safety net, long enough for long lines
    } catch { resolve(); }
  });
}
export function stopVoice() { try { speechSynthesis.cancel(); } catch { /* ignore */ } }

export function vibrate(pattern = 30) { try { navigator.vibrate?.(pattern); } catch { /* ignore */ } }
