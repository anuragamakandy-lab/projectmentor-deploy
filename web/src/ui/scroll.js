/**
 * Scrolls to the start of the part of the page the user is working on (a step card, the question panel),
 * just below the sticky navbar, instead of the very top or wherever the old scroll position was.
 */
export function scrollToAnchor(name, { smooth = true, offset = 84 } = {}) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-anchor="${name}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  });
}
