import { useCallback, useEffect, useState } from 'react';

// Learn content (tracks, lessons, videos, templates, example files) is managed in the admin panel
// and served by the API, so the website and the mobile app always show the same thing.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5220';
const CACHE_KEY = 'pm.learn.content';

/** Absolute URL for a path the API returns, e.g. /api/content/files/{id}. */
export function contentUrl(path) {
  return `${API_URL}${path}`;
}

let memory = null;

function readCache() {
  try { const v = sessionStorage.getItem(CACHE_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export function useLearnContent() {
  const [content, setContent] = useState(() => memory ?? readCache());
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/content/learn`);
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const data = await res.json();
      memory = data;
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
      setContent(data);
    } catch (e) {
      // Keep showing the cached copy if we have one; only report when there is nothing to show.
      setError(e?.message?.startsWith('The server') ? e.message : 'Cannot reach the API — make sure the backend is running.');
    }
  }, []);

  // Always refresh in the background so admin changes appear on the next visit.
  useEffect(() => { load(); }, [load]);

  return { content, error, reload: load };
}
