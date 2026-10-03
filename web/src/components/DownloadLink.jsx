import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../ui/feedback';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5220';

/**
 * A download button for templates and example files. Logged-out visitors can read every lesson but must log in
 * to download; signed-in users get the file through an authenticated request.
 */
export default function DownloadLink({ path, fileName, className, children }) {
  const { token, isAuthenticated } = useAuth();
  const { confirm, toast } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);

  async function download(e) {
    e.preventDefault();
    if (!isAuthenticated) {
      if (await confirm({ title: 'Log in to download', message: 'Lessons are free to read. Log in or create a free account to download templates and example files.', ok: 'Log in', cancel: 'Not now' }))
        navigate('/login', { state: { from: location.pathname + location.search } });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 401 ? 'Please log in again to download.' : 'Could not download this file.');
      const blob = await res.blob();
      const name = fileName || /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(res.headers.get('Content-Disposition') ?? '')?.[1] || 'download';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = decodeURIComponent(name);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <a href={`${API_URL}${path}`} className={className} onClick={download} aria-busy={busy} title={isAuthenticated ? undefined : 'Log in to download'}>
      {children}
    </a>
  );
}
