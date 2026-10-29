// Page bootstrap: intro -> proof -> Two Earths -> play -> builders.
import { t, setLang, getLang, applyStatic, STRINGS, esc } from './i18n.js';
import { createIntro, introStoryboard } from './intro.js';
import { createProof } from './proof.js';
import { createChecklist } from './checklist.js';
import { unlock, ambient, setMuted, isMuted } from './audio.js';
import { createRain } from './rain.js';

const $ = s => document.querySelector(s);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function boot() {
  setLang(getLang());
  renderLists();

  const [land, ckpt] = await Promise.all([
    fetch('data/land-110m.json').then(r => r.json()).then(d => d.rings).catch(() => null),
    fetch('engine/checkpoints/default.json').then(r => r.json()).catch(() => null)
  ]);

  // Intro
  const introEl = $('#intro');
  const intro = createIntro(introEl, {
    land,
    onFinish: () => {
      document.body.classList.remove('intro-on');
      introEl.setAttribute('aria-hidden', 'true');
    }
  });
  // The intro opens on a start gate: browsers only allow sound after a tap.
  const gate = $('[data-intro-gate]');
  const gateRain = reduced ? null : createRain(gate.querySelector('.gate-rain'), { opacity: 0.7 });
  const startIntro = () => { document.body.classList.add('intro-on'); introEl.removeAttribute('aria-hidden'); window.scrollTo({ top: 0 }); gate.hidden = false; gateRain?.play(); };
  const play = silent => { unlock(); if (silent) setMuted(true); else if (isMuted()) setMuted(false); ambient(true); gate.hidden = true; gateRain?.pause(); intro.start(); };
  $('[data-intro-start]').addEventListener('click', () => play(false));
  $('[data-intro-start-silent]').addEventListener('click', () => play(true));
  $('[data-intro-skip-gate]').addEventListener('click', () => { gate.hidden = true; gateRain?.pause(); intro.skip(); });
  $('[data-intro-skip]').addEventListener('click', () => intro.skip());
  $('[data-intro-pause]').addEventListener('click', e => { e.currentTarget.textContent = intro.toggle() ? t('intro_pause') : t('intro_play'); });
  document.querySelectorAll('[data-intro-replay]').forEach(b => b.addEventListener('click', startIntro));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('intro-on')) intro.skip(); });
  if (reduced || new URLSearchParams(location.search).has('nointro') || location.hash.length > 1) {
    intro.skip();
    $('#storyboard').hidden = false;
  } else startIntro();

  // Proof
  let twins = null;
  const proof = createProof($('#proof'), {
    onTrained: ({ weights }) => { twins?.useMyWeights(weights); }
  });

  // Lazy-load the 3D parts (Three.js) when needed.
  const lazy = (el, fn) => {
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: '400px' });
    io.observe(el);
  };
  const ready = { twins: null, play: null };
  ready.twins = new Promise(res => lazy($('#twins'), async () => {
    if (!land || !ckpt) return;
    const { createTwins } = await import('./twins.js');
    twins = createTwins($('#twins'), { land, defaultWeights: ckpt.weights });
    if (proof.trained) twins.useMyWeights(proof.trained.exportWeights());
    res(twins);
  }));

  // Checklist + navigation targets ("Show me")
  const navigate = async target => {
    const go = id => $(id).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    switch (target) {
      case 'intro': startIntro(); break;
      case 'proof': go('#proof'); break;
      case 'twins': go('#twins'); break;
      case 'builders': go('#builders'); break;
      case 'checklist': checklist.open(); break;
      default: location.href = 'play/';
    }
  };
  const checklist = await createChecklist($('#checklist'), { navigate });
  document.querySelectorAll('[data-open-checklist]').forEach(b => b.addEventListener('click', () => checklist.open()));
  $('#checklist [data-close]').addEventListener('click', () => $('#checklist').close());
  document.querySelectorAll('[data-nav]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.nav); }));

  $('[data-lang]').addEventListener('click', () => { setLang(getLang() === 'en' ? 'ro' : 'en'); renderLists(); });

  // Copy buttons in code samples
  document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
    const code = b.closest('.code').querySelector('code').innerText;
    navigator.clipboard?.writeText(code).then(() => { b.textContent = '✓'; setTimeout(() => (b.textContent = 'Copy'), 1200); }).catch(() => {});
  }));
  document.querySelectorAll('[data-code-tab]').forEach(b => b.addEventListener('click', () => {
    const box = b.closest('.code-tabs');
    box.querySelectorAll('[data-code-tab]').forEach(x => x.classList.toggle('on', x === b));
    box.querySelectorAll('.code').forEach(x => (x.hidden = x.dataset.code !== b.dataset.codeTab));
  }));

  // Matrix rain behind the hero.
  const heroRain = document.querySelector('.hero-rain');
  if (heroRain && !reduced) createRain(heroRain, { opacity: 0.55, density: 0.7 });

  // Header state
  const header = $('.site-header');
  window.addEventListener('scroll', () => header.classList.toggle('solid', window.scrollY > 40), { passive: true });
}

function renderLists() {
  const lang = getLang();
  $('#honest-real').innerHTML = STRINGS[lang].honest_real.map(s => `<li>${esc(s)}</li>`).join('');
  $('#honest-not').innerHTML = STRINGS[lang].honest_not.map(s => `<li>${esc(s)}</li>`).join('');
  $('#storyboard ol').innerHTML = introStoryboard(lang);
  $('[data-lang]').textContent = t('lang');
  applyStatic();
}

boot();
