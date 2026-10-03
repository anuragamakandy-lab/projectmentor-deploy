import { useEffect, useRef } from 'react';

/**
 * A light 3D star field for the sign-in screens: stars drift slowly towards the viewer with perspective,
 * a few twinkle in gold. One canvas, capped at 30 fps, paused when the tab is hidden, and static for
 * people who prefer reduced motion.
 */
export default function StarField({ density = 0.00012, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, stars = [], raf = 0, last = 0;

    const make = () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() * 0.9 + 0.1, gold: Math.random() < 0.12, tw: Math.random() * Math.PI * 2 });
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(40, Math.min(220, Math.round(w * h * density)));
      stars = Array.from({ length: count }, make);
    }
    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, f = Math.max(w, h) * 0.6;
      for (const s of stars) {
        if (!reduce) {
          s.z -= 0.0009;
          if (s.z <= 0.05) Object.assign(s, make(), { z: 1 });
        }
        const px = cx + (s.x / s.z) * f * 0.5, py = cy + (s.y / s.z) * f * 0.5;
        if (px < -4 || px > w + 4 || py < -4 || py > h + 4) { if (!reduce) Object.assign(s, make(), { z: 1 }); continue; }
        const size = Math.max(0.4, (1 - s.z) * 2.4);
        const alpha = Math.min(1, (1 - s.z) * 1.3) * (0.65 + 0.35 * Math.sin(t / 700 + s.tw));
        ctx.beginPath();
        ctx.fillStyle = s.gold ? `rgba(242,199,122,${alpha})` : `rgba(220,232,245,${alpha})`;
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    function loop(t) {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;   // ~30 fps is plenty for slow stars
      last = t;
      draw(t);
    }
    resize();
    draw(0);
    if (!reduce) raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [density]);

  return <canvas ref={ref} className={`starfield ${className}`} aria-hidden="true" />;
}
