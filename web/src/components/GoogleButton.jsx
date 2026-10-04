import { useEffect, useRef, useState } from 'react';
import { authConfig, googleSignIn } from '../api/projectMentorApi';

/**
 * "Sign in with Google" using Google Identity Services. Shown only when the server has a Google client id
 * (GOOGLE_CLIENT_IDS in appsettings). On success it hands the ProjectMentor session to onSession,
 * or the raw Google ID token to onCredential (used by Create account).
 */
export default function GoogleButton({ onSession, onCredential, onError, onFailure, text = 'continue_with', first = false }) {
  const ref = useRef(null);
  const handlers = useRef({ onSession, onCredential, onError, onFailure });
  handlers.current = { onSession, onCredential, onError, onFailure };
  const [clientId, setClientId] = useState(null);

  useEffect(() => { authConfig().then(c => setClientId(c?.googleClientId || null)).catch(() => {}); }, []);

  useEffect(() => {
    if (!clientId || !ref.current) return undefined;
    let cancelled = false;
    const init = () => {
      if (cancelled || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          // Create account hands the raw Google token to the page (it still needs a password); sign in exchanges it for a session.
          if (handlers.current.onCredential) { handlers.current.onCredential(credential); return; }
          try { handlers.current.onSession(await googleSignIn(credential)); }
          catch (e) { if (handlers.current.onFailure) handlers.current.onFailure(e); else handlers.current.onError?.(e.message); }
        },
      });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text, width: ref.current.clientWidth || 320, locale: 'en' });
    };
    if (window.google?.accounts?.id) init();
    else {
      let script = document.getElementById('gsi-client');
      if (!script) {
        script = document.createElement('script');
        script.id = 'gsi-client';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', init);
    }
    return () => { cancelled = true; };
  }, [clientId, text]);

  if (!clientId) return null;
  return (
    <div className={`google-wrap${first ? ' first' : ''}`}>
      {!first && <div className="auth-or"><span>or</span></div>}
      <div ref={ref} className="google-btn" />
      {first && <div className="auth-or"><span>or use your email</span></div>}
    </div>
  );
}
