import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** A new page always opens at its top (React Router keeps the old scroll position otherwise). Links to #sections are left alone. */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);
  return null;
}
