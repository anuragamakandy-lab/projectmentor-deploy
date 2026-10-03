import { useEffect } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Home-page scroll motion, driven by one observer and one rAF scroll loop:
 *  - [data-reveal]   → gets the data-in attribute when it scrolls into view (stagger with --d).
 *                      An attribute, not a class, so React re-renders never remove it.
 *  - [data-progress] → gets --p (0..1) = how far the element has been scrolled through.
 *  - [data-count]    → counts up from 0 the first time it appears.
 */
export function useHomeMotion(rootRef, contentKey) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduce = prefersReducedMotion();

    const countUp = el => {
      const target = Number(el.dataset.count);
      if (reduce) { el.textContent = target; return; }
      const start = performance.now();
      const step = now => {
        const t = Math.min(1, (now - start) / 1300);
        el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.setAttribute('data-in', '');
        e.target.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    // Re-runs when content arrives from the API; already revealed elements are left alone.
    root.querySelectorAll('[data-reveal]:not([data-in])').forEach(el => io.observe(el));

    const progressEls = [...root.querySelectorAll('[data-progress]')];
    if (reduce) {
      progressEls.forEach(el => el.style.setProperty('--p', 1));
      return () => io.disconnect();
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      for (const el of progressEls) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--p', Math.min(1, Math.max(0, (vh * 0.7 - r.top) / r.height)).toFixed(3));
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [rootRef, contentKey]);
}
