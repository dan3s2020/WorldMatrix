// Matrix-style digital rain. Lightweight: one 2D canvas, ~30 fps, pauses when hidden.
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ΛΣΔΩ<>/\\=+*#';

export function createRain(canvas, { density = 1, opacity = 1, color = [0, 255, 156], speed = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, cols = [], fontSize = 16, raf = 0, last = 0, running = true, dpr = 1;
  const intensity = { v: 1 };

  function resize() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fontSize = W < 600 ? 13 : 16;
    const n = Math.ceil((W / fontSize) * density);
    cols = Array.from({ length: n }, (_, i) => ({ x: (i / n) * W, y: Math.random() * -H, v: (0.5 + Math.random()) * speed, len: 8 + Math.floor(Math.random() * 18) }));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!running || document.hidden) return;
    if (t - last < 33) return;
    last = t;
    ctx.fillStyle = `rgba(0,0,0,${0.12 + (1 - intensity.v) * 0.2})`;
    ctx.fillRect(0, 0, W, H);
    ctx.font = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    const [r, g, b] = color;
    for (const c of cols) {
      c.y += fontSize * 0.55 * c.v * intensity.v;
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      ctx.fillStyle = `rgba(220,255,235,${0.9 * opacity})`;
      ctx.fillText(ch, c.x, c.y);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.55 * opacity})`;
      ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], c.x, c.y - fontSize);
      if (c.y - c.len * fontSize > H && Math.random() > 0.96) { c.y = Math.random() * -100; c.v = (0.5 + Math.random()) * speed; }
    }
  }
  raf = requestAnimationFrame(frame);
  return {
    setIntensity(v) { intensity.v = Math.max(0, Math.min(2, v)); },
    setColor(c) { color.splice(0, 3, ...c); },
    pause() { running = false; },
    play() { running = true; },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); }
  };
}
