import { useSyncExternalStore } from 'react';

// The admin console keeps its own session, separate from the student site, so an admin and a student
// can be signed in in the same browser at the same time.
const KEY = 'projectmentor.admin';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}

let current = read();

function emit() { listeners.forEach(l => l()); }

export const adminSession = {
  get: () => current,
  token: () => current?.token ?? '',
  set(auth) {
    current = { token: auth.token, user: { userId: auth.userId, email: auth.email, fullName: auth.fullName, role: auth.role } };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
    emit();
  },
  clear() {
    current = null;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    emit();
  },
};

export function useAdminSession() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => current);
}
