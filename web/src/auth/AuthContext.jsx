import { createContext, useContext, useState } from 'react';
import { login as loginRequest } from '../api/projectMentorApi';

// Student sessions are kept per browser tab (sessionStorage), so several students can be signed in
// in different tabs at the same time. The last login is also remembered in localStorage so a new
// tab or a reload starts signed in. The admin console has its own, separate session (admin/adminSession.js).
export const storageKey = 'projectmentor.auth';
const AuthContext = createContext(null);

function readStoredAuth() {
  try {
    const tab = sessionStorage.getItem(storageKey);
    if (tab) return JSON.parse(tab);
    const remembered = localStorage.getItem(storageKey);
    if (!remembered) return null;
    sessionStorage.setItem(storageKey, remembered);
    return JSON.parse(remembered);
  } catch {
    return null;
  }
}

/** Token for API calls made outside React (the request helper). */
export function currentToken() {
  try { return JSON.parse(sessionStorage.getItem(storageKey) ?? localStorage.getItem(storageKey) ?? 'null')?.token ?? ''; } catch { return ''; }
}

export function clearStoredAuth() {
  try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
  try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredAuth);

  function saveSession(nextSession) {
    const next = { token: nextSession.token, user: {
      userId: nextSession.userId,
      email: nextSession.email,
      fullName: nextSession.fullName,
      role: nextSession.role,
    } };
    const text = JSON.stringify(next);
    try { sessionStorage.setItem(storageKey, text); } catch { /* ignore */ }
    try { localStorage.setItem(storageKey, text); } catch { /* ignore */ }
    setSession(next);
    return nextSession;
  }

  async function login(credentials) {
    return saveSession(await loginRequest(credentials));
  }

  function loginWithSession(nextSession) {
    return saveSession(nextSession);
  }

  /** Keeps the stored name in sync after the student edits their profile. */
  function updateUser(patch) {
    setSession(s => {
      if (!s) return s;
      const next = { ...s, user: { ...s.user, ...patch } };
      const text = JSON.stringify(next);
      try { sessionStorage.setItem(storageKey, text); localStorage.setItem(storageKey, text); } catch { /* ignore */ }
      return next;
    });
  }

  function logout() {
    clearStoredAuth();
    setSession(null);
  }

  const value = {
    token: session?.token ?? '',
    user: session?.user ?? null,
    isAuthenticated: Boolean(session?.token),
    login,
    loginWithSession,
    updateUser,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
