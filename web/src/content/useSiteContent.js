import { useEffect, useState } from 'react';

// Home page sections (features, journey, AI agents, FAQ) are edited in the admin panel.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5220';
const CACHE_KEY = 'pm.site.content';

function readCache() {
  try { const v = sessionStorage.getItem(CACHE_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export function useSiteContent() {
  const [site, setSite] = useState(readCache);
  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/content/site`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => {
        if (!alive) return;
        setSite(data);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
      })
      .catch(() => { /* keep the cached copy; empty sections are simply not shown */ });
    return () => { alive = false; };
  }, []);
  return site;
}
